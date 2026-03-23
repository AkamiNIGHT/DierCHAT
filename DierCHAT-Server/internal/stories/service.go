package stories

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/dierchat/server/internal/messagetext"
	"github.com/dierchat/server/internal/storage"
)

var (
	ErrDBUnavailable = errors.New("database unavailable")
	ErrNotFound      = errors.New("story not found")
	ErrForbidden     = errors.New("forbidden")
)

const ttl = 24 * time.Hour

// Service хранит истории и просмотры.
type Service struct {
	db *storage.PostgresStore
}

func NewService(db *storage.PostgresStore) *Service {
	return &Service{db: db}
}

// Story — ответ API ленты / создания.
type Story struct {
	ID              uuid.UUID `json:"id"`
	UserID          uuid.UUID `json:"user_id"`
	AuthorName      string    `json:"author_name"`
	AuthorAvatarURL string    `json:"author_avatar_url"`
	MediaURL        string    `json:"media_url"`
	MediaKind       int16     `json:"media_kind"`
	Caption         string    `json:"caption,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	ExpiresAt       time.Time `json:"expires_at"`
	ViewCount       int       `json:"view_count"`
	ViewerIDs       []string  `json:"viewer_ids,omitempty"`
}

// Create добавляет историю текущего пользователя.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, mediaURL string, mediaKind int, caption string) (*Story, error) {
	if s.db == nil || s.db.Pool == nil {
		return nil, ErrDBUnavailable
	}
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return nil, errors.New("empty media_url")
	}
	if mediaKind != 0 && mediaKind != 1 {
		return nil, errors.New("invalid media_kind")
	}
	// ТЗ §46: подпись к медиа — без TrimSpace; только невидимый мусор
	caption = messagetext.StripInvisibleGarbage(caption)
	if len([]rune(caption)) > 280 {
		return nil, errors.New("caption too long")
	}

	expires := time.Now().UTC().Add(ttl)
	var id uuid.UUID
	var createdAt time.Time
	err := s.db.Pool.QueryRow(ctx, `
		INSERT INTO stories (user_id, media_url, media_kind, caption, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at`,
		userID, mediaURL, int16(mediaKind), caption, expires,
	).Scan(&id, &createdAt)
	if err != nil {
		return nil, err
	}

	var authorName, avatar string
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT display_name, COALESCE(avatar_url, '') FROM users WHERE id = $1`,
		userID,
	).Scan(&authorName, &avatar)

	return &Story{
		ID:              id,
		UserID:          userID,
		AuthorName:      authorName,
		AuthorAvatarURL: avatar,
		MediaURL:        mediaURL,
		MediaKind:       int16(mediaKind),
		Caption:         caption,
		CreatedAt:       createdAt,
		ExpiresAt:       expires,
		ViewCount:       0,
		ViewerIDs:       nil,
	}, nil
}

// ListFeed — истории себя и принятых друзей (friendships.status = 1), не истекшие.
func (s *Service) ListFeed(ctx context.Context, viewerID uuid.UUID) ([]Story, error) {
	if s.db == nil || s.db.Pool == nil {
		return nil, nil
	}

	const q = `
WITH friend_uids AS (
  SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS uid
  FROM friendships
  WHERE status = 1 AND (requester_id = $1 OR addressee_id = $1)
),
authors AS (
  SELECT $1::uuid AS uid
  UNION
  SELECT uid FROM friend_uids
)
SELECT s.id, s.user_id, u.display_name, COALESCE(u.avatar_url, ''),
       s.media_url, s.media_kind, s.caption, s.created_at, s.expires_at,
       (SELECT COUNT(*)::int FROM story_views sv WHERE sv.story_id = s.id)
FROM stories s
JOIN users u ON u.id = s.user_id
WHERE s.expires_at > NOW() AND s.user_id IN (SELECT uid FROM authors)
ORDER BY s.user_id, s.created_at DESC`

	rows, err := s.db.Pool.Query(ctx, q, viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Story
	for rows.Next() {
		var st Story
		if err := rows.Scan(
			&st.ID, &st.UserID, &st.AuthorName, &st.AuthorAvatarURL,
			&st.MediaURL, &st.MediaKind, &st.Caption, &st.CreatedAt, &st.ExpiresAt, &st.ViewCount,
		); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var myStoryIDs []uuid.UUID
	for _, st := range out {
		if st.UserID == viewerID {
			myStoryIDs = append(myStoryIDs, st.ID)
		}
	}
	if len(myStoryIDs) == 0 {
		return out, nil
	}

	vrows, err := s.db.Pool.Query(ctx,
		`SELECT story_id, viewer_id::text FROM story_views WHERE story_id = ANY($1::uuid[])`,
		myStoryIDs,
	)
	if err != nil {
		return out, nil
	}
	defer vrows.Close()

	byStory := make(map[uuid.UUID][]string)
	for vrows.Next() {
		var sid uuid.UUID
		var vid string
		if err := vrows.Scan(&sid, &vid); err != nil {
			continue
		}
		byStory[sid] = append(byStory[sid], vid)
	}
	for i := range out {
		if out[i].UserID == viewerID {
			out[i].ViewerIDs = byStory[out[i].ID]
		}
	}
	return out, nil
}

// RecordView фиксирует просмотр (не для автора; только если вы в друзьях).
func (s *Service) RecordView(ctx context.Context, storyID, viewerID uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}

	var authorID uuid.UUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT user_id FROM stories WHERE id = $1 AND expires_at > NOW()`,
		storyID,
	).Scan(&authorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if authorID == viewerID {
		return nil
	}

	var allowed bool
	err = s.db.Pool.QueryRow(ctx, `
SELECT EXISTS (
  SELECT 1 FROM friendships
  WHERE status = 1
    AND (
      (requester_id = $1 AND addressee_id = $2)
      OR (requester_id = $2 AND addressee_id = $1)
    )
)`, viewerID, authorID).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrForbidden
	}

	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		storyID, viewerID,
	)
	return err
}
