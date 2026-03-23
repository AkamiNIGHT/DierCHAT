package bots

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/pkg/models"
)

type Service struct {
	db *storage.PostgresStore
}

func NewService(db *storage.PostgresStore) *Service {
	return &Service{db: db}
}

func (s *Service) CreateBot(ctx context.Context, ownerID uuid.UUID, username, displayName, description string) (*models.Bot, error) {
	token, err := generateBotToken()
	if err != nil {
		return nil, err
	}

	bot := &models.Bot{
		ID:          uuid.New(),
		OwnerID:     ownerID,
		Username:    username,
		DisplayName: displayName,
		Token:       token,
		Description: description,
		CreatedAt:   time.Now(),
	}

	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO bots (id, owner_id, username, display_name, token, description, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		bot.ID, bot.OwnerID, bot.Username, bot.DisplayName, bot.Token, bot.Description, bot.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create bot: %w", err)
	}

	return bot, nil
}

func (s *Service) GetBot(ctx context.Context, botID uuid.UUID) (*models.Bot, error) {
	var bot models.Bot
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, owner_id, username, display_name, token, COALESCE(webhook_url,''),
		        COALESCE(description,''), COALESCE(avatar_url,''), is_inline, created_at
		 FROM bots WHERE id = $1`,
		botID,
	).Scan(&bot.ID, &bot.OwnerID, &bot.Username, &bot.DisplayName, &bot.Token,
		&bot.WebhookURL, &bot.Description, &bot.AvatarURL, &bot.IsInline, &bot.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &bot, nil
}

func (s *Service) GetBotByToken(ctx context.Context, token string) (*models.Bot, error) {
	var bot models.Bot
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, owner_id, username, display_name, token, COALESCE(webhook_url,''),
		        COALESCE(description,''), COALESCE(avatar_url,''), is_inline, created_at
		 FROM bots WHERE token = $1`,
		token,
	).Scan(&bot.ID, &bot.OwnerID, &bot.Username, &bot.DisplayName, &bot.Token,
		&bot.WebhookURL, &bot.Description, &bot.AvatarURL, &bot.IsInline, &bot.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &bot, nil
}

func (s *Service) SetWebhook(ctx context.Context, botID uuid.UUID, url string) error {
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE bots SET webhook_url = $2 WHERE id = $1`,
		botID, url,
	)
	return err
}

func (s *Service) ListBotsByOwner(ctx context.Context, ownerID uuid.UUID) ([]models.Bot, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, owner_id, username, display_name, token, COALESCE(webhook_url,''),
		        COALESCE(description,''), COALESCE(avatar_url,''), is_inline, created_at
		 FROM bots WHERE owner_id = $1 ORDER BY created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bots []models.Bot
	for rows.Next() {
		var b models.Bot
		if err := rows.Scan(&b.ID, &b.OwnerID, &b.Username, &b.DisplayName, &b.Token,
			&b.WebhookURL, &b.Description, &b.AvatarURL, &b.IsInline, &b.CreatedAt); err != nil {
			return nil, err
		}
		bots = append(bots, b)
	}
	return bots, nil
}

func (s *Service) DeleteBot(ctx context.Context, botID, ownerID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM bots WHERE id = $1 AND owner_id = $2`,
		botID, ownerID,
	)
	return err
}

func (s *Service) CreateMiniApp(ctx context.Context, botID uuid.UUID, title, url, description string) (*models.MiniApp, error) {
	app := &models.MiniApp{
		ID:          uuid.New(),
		BotID:       botID,
		Title:       title,
		URL:         url,
		Description: description,
		CreatedAt:   time.Now(),
	}

	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO mini_apps (id, bot_id, title, url, description, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		app.ID, app.BotID, app.Title, app.URL, app.Description, app.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return app, nil
}

func (s *Service) GetMiniApps(ctx context.Context, botID uuid.UUID) ([]models.MiniApp, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, bot_id, title, url, COALESCE(description,''), COALESCE(icon_url,''), created_at
		 FROM mini_apps WHERE bot_id = $1`,
		botID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []models.MiniApp
	for rows.Next() {
		var a models.MiniApp
		if err := rows.Scan(&a.ID, &a.BotID, &a.Title, &a.URL, &a.Description, &a.IconURL, &a.CreatedAt); err != nil {
			return nil, err
		}
		apps = append(apps, a)
	}
	return apps, nil
}

func generateBotToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
