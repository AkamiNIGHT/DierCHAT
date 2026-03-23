package push

import (
	"context"
	"encoding/json"
	"log"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"

	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/pkg/models"
)

type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type Service struct {
	db      *storage.PostgresStore
	vapidPublic  string
	vapidPrivate string
}

func NewService(db *storage.PostgresStore, vapidPublic, vapidPrivate string) *Service {
	return &Service{
		db:           db,
		vapidPublic:  vapidPublic,
		vapidPrivate: vapidPrivate,
	}
}

func (s *Service) IsEnabled() bool {
	return s.vapidPublic != "" && s.vapidPrivate != ""
}

func (s *Service) VAPIDPublicKey() string {
	return s.vapidPublic
}

func (s *Service) Register(ctx context.Context, userID uuid.UUID, sub *Subscription, userAgent string) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh_key = $3, auth_key = $4, user_agent = $5`,
		userID, sub.Endpoint, sub.Keys.P256DH, sub.Keys.Auth, userAgent,
	)
	return err
}

func (s *Service) GetSubscriptionsForUser(ctx context.Context, userID uuid.UUID) ([]*Subscription, error) {
	if s.db == nil {
		return nil, nil
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []*Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.Endpoint, &sub.Keys.P256DH, &sub.Keys.Auth); err != nil {
			continue
		}
		subs = append(subs, &sub)
	}
	return subs, rows.Err()
}

func (s *Service) SendToUser(ctx context.Context, userID uuid.UUID, title, body string, data map[string]string) {
	if !s.IsEnabled() {
		return
	}
	subs, err := s.GetSubscriptionsForUser(ctx, userID)
	if err != nil || len(subs) == 0 {
		return
	}
	for _, sub := range subs {
		s.sendOne(sub, title, body, data)
	}
}

func (s *Service) sendOne(sub *Subscription, title, body string, data map[string]string) {
	payload := map[string]string{
		"title": title,
		"body":  body,
	}
	for k, v := range data {
		payload[k] = v
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	subDecoded := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.Keys.P256DH,
			Auth:   sub.Keys.Auth,
		},
	}

	resp, err := webpush.SendNotification(payloadBytes, subDecoded, &webpush.Options{
		Subscriber:      "mailto:support@dierchat.local",
		VAPIDPublicKey:  s.vapidPublic,
		VAPIDPrivateKey: s.vapidPrivate,
		TTL:             60,
	})
	if err != nil {
		log.Printf("[Push] send error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("[Push] status %d for endpoint %s", resp.StatusCode, sub.Endpoint[:min(50, len(sub.Endpoint))])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// NotifyNewMessage sends push to user about a new chat message (when they're not online via WS)
func (s *Service) NotifyNewMessage(ctx context.Context, userID uuid.UUID, msg *models.Message, sender *models.User, chatTitle string) {
	if !s.IsEnabled() || msg == nil {
		return
	}
	title := "DierCHAT"
	if chatTitle != "" {
		title = chatTitle
	}
	senderName := "Кто-то"
	if sender != nil && sender.DisplayName != "" {
		senderName = sender.DisplayName
	}
	body := senderName + ": "
	switch msg.Type {
	case models.MessageTypePhoto:
		body += "📷 Фото"
	case models.MessageTypeVideo:
		body += "🎬 Видео"
	case models.MessageTypeVoice:
		body += "🎤 Голосовое"
	case models.MessageTypeAudio:
		body += "🎵 Аудио"
	case models.MessageTypeFile:
		body += "📎 Файл"
	default:
		if len(msg.Text) > 100 {
			body += msg.Text[:100] + "..."
		} else {
			body += msg.Text
		}
	}
	data := map[string]string{
		"chat_id": msg.ChatID.String(),
		"msg_id":  msg.ID.String(),
	}
	s.SendToUser(ctx, userID, title, body, data)
}
