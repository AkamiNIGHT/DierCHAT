package userstickers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dierchat/server/internal/storage"
)

var (
	ErrDBUnavailable    = errors.New("database unavailable")
	ErrNothingToImport  = errors.New("nothing to import")
	ErrAlreadyInLibrary = errors.New("already in library")
	ErrOwnPack          = errors.New("own pack")
	ErrOwnLibrary       = errors.New("own library")
)

const (
	maxStickersPerUser = 200
	maxPacksPerUser    = 50
)

// Pack — именованный набор стикеров (автор = user_id).
type Pack struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Title     string    `json:"title"`
	CreatedAt string    `json:"created_at"`
}

// Sticker — одна картинка в наборе.
type Sticker struct {
	ID        uuid.UUID `json:"id"`
	PackID    uuid.UUID `json:"pack_id"`
	UserID    uuid.UUID `json:"user_id"`
	MediaURL  string    `json:"media_url"`
	CreatedAt string    `json:"created_at"`
}

// PackWithStickers — набор с вложенными стикерами (для API).
type PackWithStickers struct {
	Pack
	Stickers []Sticker `json:"stickers"`
}

type Service struct {
	db *storage.PostgresStore
}

func NewService(db *storage.PostgresStore) *Service {
	return &Service{db: db}
}

func (s *Service) pool() *pgxpool.Pool {
	if s.db == nil || s.db.Pool == nil {
		return nil
	}
	return s.db.Pool
}

// EnsureDefaultPack — первый набор «Мои стикеры» или создание.
func (s *Service) EnsureDefaultPack(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	p := s.pool()
	if p == nil {
		return uuid.Nil, ErrDBUnavailable
	}
	var id uuid.UUID
	err := p.QueryRow(ctx,
		`SELECT id FROM user_sticker_packs WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
		userID,
	).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	err = p.QueryRow(ctx,
		`INSERT INTO user_sticker_packs (user_id, title) VALUES ($1, 'Мои стикеры') RETURNING id`,
		userID,
	).Scan(&id)
	return id, err
}

func (s *Service) countUserStickers(ctx context.Context, userID uuid.UUID) (int, error) {
	p := s.pool()
	if p == nil {
		return 0, ErrDBUnavailable
	}
	var n int
	err := p.QueryRow(ctx, `SELECT COUNT(*)::int FROM user_stickers WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (s *Service) userHasMediaURL(ctx context.Context, userID uuid.UUID, mediaURL string) (bool, error) {
	p := s.pool()
	if p == nil {
		return false, ErrDBUnavailable
	}
	mediaURL = strings.TrimSpace(mediaURL)
	var n int
	err := p.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM user_stickers WHERE user_id = $1 AND trim(media_url) = $2`,
		userID, mediaURL,
	).Scan(&n)
	return n > 0, err
}

// ListMine — все наборы текущего пользователя со стикерами.
func (s *Service) ListMine(ctx context.Context, userID uuid.UUID) ([]PackWithStickers, error) {
	return s.listPacksWithStickersForUser(ctx, userID)
}

// ListByUserID — наборы другого пользователя (просмотр / импорт).
func (s *Service) ListByUserID(ctx context.Context, targetUserID uuid.UUID) ([]PackWithStickers, error) {
	return s.listPacksWithStickersForUser(ctx, targetUserID)
}

func (s *Service) listPacksWithStickersForUser(ctx context.Context, userID uuid.UUID) ([]PackWithStickers, error) {
	p := s.pool()
	if p == nil {
		return nil, nil
	}
	rows, err := p.Query(ctx,
		`SELECT id, user_id, title, created_at FROM user_sticker_packs WHERE user_id = $1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packs []Pack
	for rows.Next() {
		var pk Pack
		var created time.Time
		if err := rows.Scan(&pk.ID, &pk.UserID, &pk.Title, &created); err != nil {
			return nil, err
		}
		pk.CreatedAt = created.UTC().Format(time.RFC3339)
		packs = append(packs, pk)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]PackWithStickers, 0, len(packs))
	for _, pk := range packs {
		stickers, err := s.listStickersInPack(ctx, pk.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, PackWithStickers{Pack: pk, Stickers: stickers})
	}
	return out, nil
}

func (s *Service) listStickersInPack(ctx context.Context, packID uuid.UUID) ([]Sticker, error) {
	p := s.pool()
	if p == nil {
		return nil, nil
	}
	rows, err := p.Query(ctx,
		`SELECT id, pack_id, user_id, media_url, created_at FROM user_stickers WHERE pack_id = $1 ORDER BY created_at DESC LIMIT 200`,
		packID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStickers(rows)
}

func scanStickers(rows pgx.Rows) ([]Sticker, error) {
	var out []Sticker
	for rows.Next() {
		var st Sticker
		var created time.Time
		if err := rows.Scan(&st.ID, &st.PackID, &st.UserID, &st.MediaURL, &created); err != nil {
			return nil, err
		}
		st.CreatedAt = created.UTC().Format(time.RFC3339)
		out = append(out, st)
	}
	return out, rows.Err()
}

// CreatePack — пустой набор.
func (s *Service) CreatePack(ctx context.Context, userID uuid.UUID, title string) (*Pack, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("empty title")
	}
	var n int
	if err := p.QueryRow(ctx, `SELECT COUNT(*)::int FROM user_sticker_packs WHERE user_id = $1`, userID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= maxPacksPerUser {
		return nil, fmt.Errorf("pack limit %d", maxPacksPerUser)
	}
	var pk Pack
	var created time.Time
	err := p.QueryRow(ctx,
		`INSERT INTO user_sticker_packs (user_id, title) VALUES ($1, $2) RETURNING id, user_id, title, created_at`,
		userID, title,
	).Scan(&pk.ID, &pk.UserID, &pk.Title, &created)
	if err != nil {
		return nil, err
	}
	pk.CreatedAt = created.UTC().Format(time.RFC3339)
	return &pk, nil
}

// UpdatePackTitle переименование набора.
func (s *Service) UpdatePackTitle(ctx context.Context, userID, packID uuid.UUID, title string) error {
	p := s.pool()
	if p == nil {
		return ErrDBUnavailable
	}
	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("empty title")
	}
	cmd, err := p.Exec(ctx,
		`UPDATE user_sticker_packs SET title = $1 WHERE id = $2 AND user_id = $3`,
		title, packID, userID,
	)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// DeletePack удаляет набор и все стикеры (CASCADE).
func (s *Service) DeletePack(ctx context.Context, userID, packID uuid.UUID) error {
	p := s.pool()
	if p == nil {
		return ErrDBUnavailable
	}
	cmd, err := p.Exec(ctx, `DELETE FROM user_sticker_packs WHERE id = $1 AND user_id = $2`, packID, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// GetPack проверка владельца.
func (s *Service) GetPackOwned(ctx context.Context, userID, packID uuid.UUID) (*Pack, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	var pk Pack
	var created time.Time
	err := p.QueryRow(ctx,
		`SELECT id, user_id, title, created_at FROM user_sticker_packs WHERE id = $1 AND user_id = $2`,
		packID, userID,
	).Scan(&pk.ID, &pk.UserID, &pk.Title, &created)
	if err != nil {
		return nil, err
	}
	pk.CreatedAt = created.UTC().Format(time.RFC3339)
	return &pk, nil
}

// GetPackByID любой существующий набор (для импорта).
func (s *Service) GetPackByID(ctx context.Context, packID uuid.UUID) (*Pack, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	var pk Pack
	var created time.Time
	err := p.QueryRow(ctx,
		`SELECT id, user_id, title, created_at FROM user_sticker_packs WHERE id = $1`,
		packID,
	).Scan(&pk.ID, &pk.UserID, &pk.Title, &created)
	if err != nil {
		return nil, err
	}
	pk.CreatedAt = created.UTC().Format(time.RFC3339)
	return &pk, nil
}

// GetByID стикер по id.
func (s *Service) GetByID(ctx context.Context, stickerID uuid.UUID) (*Sticker, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	var st Sticker
	var created time.Time
	err := p.QueryRow(ctx,
		`SELECT id, pack_id, user_id, media_url, created_at FROM user_stickers WHERE id = $1`,
		stickerID,
	).Scan(&st.ID, &st.PackID, &st.UserID, &st.MediaURL, &created)
	if err != nil {
		return nil, err
	}
	st.CreatedAt = created.UTC().Format(time.RFC3339)
	return &st, nil
}

// ResolveMany URL для списка id.
func (s *Service) ResolveMany(ctx context.Context, ids []uuid.UUID) ([]Sticker, error) {
	p := s.pool()
	if p == nil {
		return nil, nil
	}
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := p.Query(ctx,
		`SELECT id, pack_id, user_id, media_url, created_at FROM user_stickers WHERE id = ANY($1::uuid[])`,
		ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStickers(rows)
}

// Create добавляет стикер в набор (packID nil → «Мои стикеры»).
func (s *Service) Create(ctx context.Context, userID uuid.UUID, packID *uuid.UUID, mediaURL string) (*Sticker, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return nil, errors.New("empty media_url")
	}
	n, err := s.countUserStickers(ctx, userID)
	if err != nil {
		return nil, err
	}
	if n >= maxStickersPerUser {
		return nil, fmt.Errorf("sticker limit %d", maxStickersPerUser)
	}

	var targetPack uuid.UUID
	if packID != nil && *packID != uuid.Nil {
		_, err := s.GetPackOwned(ctx, userID, *packID)
		if err != nil {
			return nil, err
		}
		targetPack = *packID
	} else {
		targetPack, err = s.EnsureDefaultPack(ctx, userID)
		if err != nil {
			return nil, err
		}
	}

	var st Sticker
	var created time.Time
	err = p.QueryRow(ctx,
		`INSERT INTO user_stickers (user_id, pack_id, media_url) VALUES ($1, $2, $3) RETURNING id, pack_id, user_id, media_url, created_at`,
		userID, targetPack, mediaURL,
	).Scan(&st.ID, &st.PackID, &st.UserID, &st.MediaURL, &created)
	if err != nil {
		return nil, err
	}
	st.CreatedAt = created.UTC().Format(time.RFC3339)
	return &st, nil
}

// Delete стикер.
func (s *Service) Delete(ctx context.Context, userID, stickerID uuid.UUID) error {
	p := s.pool()
	if p == nil {
		return ErrDBUnavailable
	}
	cmd, err := p.Exec(ctx,
		`DELETE FROM user_stickers WHERE id = $1 AND user_id = $2`,
		stickerID, userID,
	)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ImportSticker копия в набор по умолчанию (без дубликата media_url).
func (s *Service) ImportSticker(ctx context.Context, currentUserID, sourceStickerID uuid.UUID) (*Sticker, error) {
	src, err := s.GetByID(ctx, sourceStickerID)
	if err != nil {
		return nil, err
	}
	dup, err := s.userHasMediaURL(ctx, currentUserID, src.MediaURL)
	if err != nil {
		return nil, err
	}
	if dup {
		return nil, ErrAlreadyInLibrary
	}
	return s.Create(ctx, currentUserID, nil, src.MediaURL)
}

// ImportPack копирует весь набор: новый пак у получателя + стикеры без дубликатов по media_url.
func (s *Service) ImportPack(ctx context.Context, currentUserID, sourcePackID uuid.UUID) (*PackWithStickers, error) {
	p := s.pool()
	if p == nil {
		return nil, ErrDBUnavailable
	}
	srcPack, err := s.GetPackByID(ctx, sourcePackID)
	if err != nil {
		return nil, err
	}
	if srcPack.UserID == currentUserID {
		return nil, ErrOwnPack
	}
	stickers, err := s.listStickersInPack(ctx, sourcePackID)
	if err != nil {
		return nil, err
	}

	var packCount int
	if err := p.QueryRow(ctx, `SELECT COUNT(*)::int FROM user_sticker_packs WHERE user_id = $1`, currentUserID).Scan(&packCount); err != nil {
		return nil, err
	}
	if packCount >= maxPacksPerUser {
		return nil, fmt.Errorf("pack limit %d", maxPacksPerUser)
	}

	tx, err := p.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	title := srcPack.Title + " (копия)"
	var newPack Pack
	var created time.Time
	err = tx.QueryRow(ctx,
		`INSERT INTO user_sticker_packs (user_id, title) VALUES ($1, $2) RETURNING id, user_id, title, created_at`,
		currentUserID, title,
	).Scan(&newPack.ID, &newPack.UserID, &newPack.Title, &created)
	if err != nil {
		return nil, err
	}
	newPack.CreatedAt = created.UTC().Format(time.RFC3339)

	var imported []Sticker
	for _, st := range stickers {
		n, err := s.countUserStickersTx(ctx, tx, currentUserID)
		if err != nil {
			return nil, err
		}
		if n >= maxStickersPerUser {
			break
		}
		has, err := s.userHasMediaURLTx(ctx, tx, currentUserID, st.MediaURL)
		if err != nil {
			return nil, err
		}
		if has {
			continue
		}
		var ins Sticker
		var cr time.Time
		err = tx.QueryRow(ctx,
			`INSERT INTO user_stickers (user_id, pack_id, media_url) VALUES ($1, $2, $3) RETURNING id, pack_id, user_id, media_url, created_at`,
			currentUserID, newPack.ID, strings.TrimSpace(st.MediaURL),
		).Scan(&ins.ID, &ins.PackID, &ins.UserID, &ins.MediaURL, &cr)
		if err != nil {
			return nil, err
		}
		ins.CreatedAt = cr.UTC().Format(time.RFC3339)
		imported = append(imported, ins)
	}

	if len(imported) == 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM user_sticker_packs WHERE id = $1`, newPack.ID); err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return nil, ErrNothingToImport
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &PackWithStickers{Pack: newPack, Stickers: imported}, nil
}

func (s *Service) countUserStickersTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM user_stickers WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (s *Service) userHasMediaURLTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID, mediaURL string) (bool, error) {
	mediaURL = strings.TrimSpace(mediaURL)
	var n int
	err := tx.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM user_stickers WHERE user_id = $1 AND trim(media_url) = $2`,
		userID, mediaURL,
	).Scan(&n)
	return n > 0, err
}

// ImportAllFromUser импортирует все наборы пользователя (новые паки-копии), без дубликатов media.
func (s *Service) ImportAllFromUser(ctx context.Context, currentUserID, sourceUserID uuid.UUID) ([]PackWithStickers, error) {
	packs, err := s.listPacksWithStickersForUser(ctx, sourceUserID)
	if err != nil {
		return nil, err
	}
	if sourceUserID == currentUserID {
		return nil, ErrOwnLibrary
	}
	var out []PackWithStickers
	for _, pk := range packs {
		pw, err := s.ImportPack(ctx, currentUserID, pk.ID)
		if errors.Is(err, ErrNothingToImport) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if pw != nil && len(pw.Stickers) > 0 {
			out = append(out, *pw)
		}
	}
	return out, nil
}
