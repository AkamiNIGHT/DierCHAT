package news

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/dierchat/server/internal/storage"
)

type Service struct {
	db *storage.PostgresStore
}

func NewService(db *storage.PostgresStore) *Service {
	return &Service{db: db}
}

// Subscribe adds user to news subscriptions for a chat.
func (s *Service) Subscribe(ctx context.Context, userID uuid.UUID, chatID uuid.UUID) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO news_subscriptions (user_id, chat_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, chat_id) DO NOTHING`,
		userID, chatID,
	)
	return err
}

// Unsubscribe removes subscription.
func (s *Service) Unsubscribe(ctx context.Context, userID uuid.UUID, chatID uuid.UUID) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM news_subscriptions WHERE user_id = $1 AND chat_id = $2`,
		userID, chatID,
	)
	return err
}

// IsSubscribed returns whether user is subscribed to chat.
func (s *Service) IsSubscribed(ctx context.Context, userID, chatID uuid.UUID) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var exists bool
	err := s.db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM news_subscriptions WHERE user_id = $1 AND chat_id = $2)`,
		userID, chatID,
	).Scan(&exists)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	return exists, err
}
