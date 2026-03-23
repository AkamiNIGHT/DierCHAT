package friends

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/dierchat/server/internal/storage"
)

var (
	ErrDBUnavailable = errors.New("database unavailable")
	ErrNotFound      = errors.New("not found")
	ErrBlocked       = errors.New("user blocked")
	ErrSelf          = errors.New("cannot add yourself")
	ErrExists        = errors.New("request already exists")
	ErrAlready       = errors.New("already friends")
)

type Service struct {
	db *storage.PostgresStore
}

func NewService(db *storage.PostgresStore) *Service {
	return &Service{db: db}
}

// Profile — карточка для списков друзей / заявок.
type Profile struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Username    string `json:"username"`
	AvatarURL   string `json:"avatar_url"`
}

func (s *Service) isBlocked(ctx context.Context, a, b uuid.UUID) (bool, error) {
	var n int
	err := s.db.Pool.QueryRow(ctx, `
SELECT COUNT(*)::int FROM blocked_users
WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
		a, b,
	).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// ListAccepted — взаимные друзья (status = 1).
func (s *Service) ListAccepted(ctx context.Context, userID uuid.UUID) ([]Profile, error) {
	if s.db == nil || s.db.Pool == nil {
		return nil, ErrDBUnavailable
	}
	rows, err := s.db.Pool.Query(ctx, `
WITH peer AS (
  SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS uid
  FROM friendships
  WHERE status = 1 AND (requester_id = $1 OR addressee_id = $1)
)
SELECT u.id::text, u.display_name, COALESCE(u.username, ''), COALESCE(u.avatar_url, '')
FROM peer p
JOIN users u ON u.id = p.uid
ORDER BY u.display_name`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.Username, &p.AvatarURL); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListIncoming — входящие заявки (я addressee, status pending).
func (s *Service) ListIncoming(ctx context.Context, userID uuid.UUID) ([]Profile, error) {
	if s.db == nil || s.db.Pool == nil {
		return nil, ErrDBUnavailable
	}
	rows, err := s.db.Pool.Query(ctx, `
SELECT u.id::text, u.display_name, COALESCE(u.username, ''), COALESCE(u.avatar_url, '')
FROM friendships f
JOIN users u ON u.id = f.requester_id
WHERE f.addressee_id = $1 AND f.status = 0
ORDER BY f.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.Username, &p.AvatarURL); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListOutgoing — исходящие заявки (я requester, pending).
func (s *Service) ListOutgoing(ctx context.Context, userID uuid.UUID) ([]Profile, error) {
	if s.db == nil || s.db.Pool == nil {
		return nil, ErrDBUnavailable
	}
	rows, err := s.db.Pool.Query(ctx, `
SELECT u.id::text, u.display_name, COALESCE(u.username, ''), COALESCE(u.avatar_url, '')
FROM friendships f
JOIN users u ON u.id = f.addressee_id
WHERE f.requester_id = $1 AND f.status = 0
ORDER BY f.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.DisplayName, &p.Username, &p.AvatarURL); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SendRequest — заявка в друзья; если друг уже слал заявку — автопринятие.
func (s *Service) SendRequest(ctx context.Context, me, other uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}
	if me == other {
		return ErrSelf
	}
	blocked, err := s.isBlocked(ctx, me, other)
	if err != nil {
		return err
	}
	if blocked {
		return ErrBlocked
	}

	var reciprocal int
	err = s.db.Pool.QueryRow(ctx, `
SELECT COUNT(*)::int FROM friendships
WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`,
		other, me,
	).Scan(&reciprocal)
	if err != nil {
		return err
	}
	if reciprocal > 0 {
		ct, err := s.db.Pool.Exec(ctx, `
UPDATE friendships SET status = 1 WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`,
			other, me,
		)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}

	var accepted int
	_ = s.db.Pool.QueryRow(ctx, `
SELECT COUNT(*)::int FROM friendships
WHERE status = 1 AND (
  (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
)`, me, other).Scan(&accepted)
	if accepted > 0 {
		return ErrAlready
	}

	var pendingOut int
	_ = s.db.Pool.QueryRow(ctx, `
SELECT COUNT(*)::int FROM friendships
WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`, me, other).Scan(&pendingOut)
	if pendingOut > 0 {
		return ErrExists
	}

	_, err = s.db.Pool.Exec(ctx, `
INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 0)`,
		me, other,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrExists
		}
		return err
	}
	return nil
}

// Accept — принять заявку от requester.
func (s *Service) Accept(ctx context.Context, me uuid.UUID, requester uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}
	ct, err := s.db.Pool.Exec(ctx, `
UPDATE friendships SET status = 1
WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`,
		requester, me,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Decline — отклонить входящую заявку.
func (s *Service) Decline(ctx context.Context, me uuid.UUID, requester uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}
	ct, err := s.db.Pool.Exec(ctx, `
DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`,
		requester, me,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CancelOutgoing — отозвать исходящую заявку.
func (s *Service) CancelOutgoing(ctx context.Context, me uuid.UUID, addressee uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}
	ct, err := s.db.Pool.Exec(ctx, `
DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = 0`,
		me, addressee,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Remove — удалить дружбу (любой из пары).
func (s *Service) Remove(ctx context.Context, me, other uuid.UUID) error {
	if s.db == nil || s.db.Pool == nil {
		return ErrDBUnavailable
	}
	ct, err := s.db.Pool.Exec(ctx, `
DELETE FROM friendships
WHERE status = 1 AND (
  (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
)`, me, other)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
