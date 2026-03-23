package messaging

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/dierchat/server/internal/messagetext"
	"github.com/dierchat/server/internal/storage"
	"github.com/dierchat/server/pkg/models"
)

type Service struct {
	db    *storage.PostgresStore
	redis *storage.RedisStore
}

func NewService(db *storage.PostgresStore, redis *storage.RedisStore) *Service {
	return &Service{db: db, redis: redis}
}

func (s *Service) DB() *storage.PostgresStore { return s.db }

func (s *Service) CreatePrivateChat(ctx context.Context, userA, userB uuid.UUID) (*models.Chat, error) {
	existing, err := s.findPrivateChat(ctx, userA, userB)
	if err == nil {
		return existing, nil
	}

	chat := &models.Chat{
		ID:        uuid.New(),
		Type:      models.ChatTypePrivate,
		OwnerID:   userA,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
		chat.ID, chat.Type, chat.OwnerID, chat.CreatedAt, chat.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	for _, uid := range []uuid.UUID{userA, userB} {
		_, err = tx.Exec(ctx,
			`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
			chat.ID, uid, models.MemberRoleMember,
		)
		if err != nil {
			return nil, err
		}
	}

	return chat, tx.Commit(ctx)
}

func (s *Service) CreateGroup(ctx context.Context, ownerID uuid.UUID, title, description string, memberIDs []uuid.UUID) (*models.Chat, error) {
	chat := &models.Chat{
		ID:          uuid.New(),
		Type:        models.ChatTypeGroup,
		Title:       title,
		Description: description,
		OwnerID:     ownerID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, title, description, owner_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		chat.ID, chat.Type, chat.Title, chat.Description, chat.OwnerID, chat.CreatedAt, chat.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
		chat.ID, ownerID, models.MemberRoleOwner,
	)
	if err != nil {
		return nil, err
	}

	for _, uid := range memberIDs {
		if uid == ownerID {
			continue
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
			chat.ID, uid, models.MemberRoleMember,
		)
		if err != nil {
			return nil, err
		}
	}

	return chat, tx.Commit(ctx)
}

// createChannelMinimal — канал без чата обсуждения (старые БД без discussion_chat_id или сбой §26.3).
func (s *Service) createChannelMinimal(ctx context.Context, ownerID uuid.UUID, title, description string, isPublic bool) (*models.Chat, error) {
	now := time.Now()
	chat := &models.Chat{
		ID:          uuid.New(),
		Type:        models.ChatTypeChannel,
		Title:       title,
		Description: description,
		OwnerID:     ownerID,
		IsPublic:    isPublic,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, title, description, owner_id, is_public, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		chat.ID, chat.Type, chat.Title, chat.Description, chat.OwnerID, chat.IsPublic, chat.CreatedAt, chat.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
		chat.ID, ownerID, models.MemberRoleOwner,
	)
	if err != nil {
		return nil, err
	}
	return chat, tx.Commit(ctx)
}

func (s *Service) createChannelWithDiscussion(ctx context.Context, ownerID uuid.UUID, title, description string, isPublic bool) (*models.Chat, error) {
	now := time.Now()
	discID := uuid.New()
	discTitle := "Обсуждение: " + title
	if len([]rune(discTitle)) > 240 {
		discTitle = string([]rune(discTitle)[:240])
	}
	discDesc := fmt.Sprintf("Комментарии к каналу «%s»", title)
	if len([]rune(discDesc)) > 512 {
		discDesc = string([]rune(discDesc)[:512])
	}

	chat := &models.Chat{
		ID:               uuid.New(),
		Type:             models.ChatTypeChannel,
		Title:            title,
		Description:      description,
		OwnerID:          ownerID,
		IsPublic:         isPublic,
		DiscussionChatID: &discID,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Сначала группа обсуждения (§26.3)
	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, title, description, owner_id, is_public, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		discID, models.ChatTypeGroup, discTitle, discDesc, ownerID, false, now, now,
	)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
		discID, ownerID, models.MemberRoleOwner,
	)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, title, description, owner_id, is_public, discussion_chat_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		chat.ID, chat.Type, chat.Title, chat.Description, chat.OwnerID, chat.IsPublic, discID, chat.CreatedAt, chat.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
		chat.ID, ownerID, models.MemberRoleOwner,
	)
	if err != nil {
		return nil, err
	}

	return chat, tx.Commit(ctx)
}

// CreateChannel — сначала канал + обсуждение; при ошибке (часто нет колонки discussion_chat_id) — простой канал.
func (s *Service) CreateChannel(ctx context.Context, ownerID uuid.UUID, title, description string, isPublic bool) (*models.Chat, error) {
	chat, err := s.createChannelWithDiscussion(ctx, ownerID, title, description, isPublic)
	if err == nil {
		return chat, nil
	}
	chat2, err2 := s.createChannelMinimal(ctx, ownerID, title, description, isPublic)
	if err2 != nil {
		return nil, fmt.Errorf("канал с обсуждением: %w; упрощённый канал: %v", err, err2)
	}
	return chat2, nil
}

// SendMessage сохраняет text в БД как есть (utf8), без strings.TrimSpace и нормализации пробелов (ТЗ §46).
// Удаляются только невидимые «мусорные» символы — см. internal/messagetext.
func (s *Service) SendMessage(ctx context.Context, chatID, senderID uuid.UUID, msgType models.MessageType, text string, replyTo *uuid.UUID) (*models.Message, error) {
	text = messagetext.StripInvisibleGarbage(text)
	msg := &models.Message{
		ID:        uuid.New(),
		ChatID:    chatID,
		SenderID:  senderID,
		Type:      msgType,
		Text:      text,
		ReplyToID: replyTo,
		CreatedAt: time.Now(),
	}

	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO messages (id, chat_id, sender_id, type, text, reply_to_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		msg.ID, msg.ChatID, msg.SenderID, msg.Type, msg.Text, msg.ReplyToID, msg.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert message: %w", err)
	}

	return msg, nil
}

func (s *Service) EditMessage(ctx context.Context, msgID, senderID uuid.UUID, newText string) error {
	newText = messagetext.StripInvisibleGarbage(newText)
	result, err := s.db.Pool.Exec(ctx,
		`UPDATE messages SET text = $2, edited_at = NOW() WHERE id = $1 AND sender_id = $3 AND deleted_at IS NULL`,
		msgID, newText, senderID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("message not found or not owned by user")
	}
	return nil
}

func (s *Service) DeleteMessage(ctx context.Context, msgID, userID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND (sender_id = $2 OR
		  chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = $2 AND role >= 1))`,
		msgID, userID,
	)
	return err
}

func (s *Service) GetMessages(ctx context.Context, chatID uuid.UUID, before time.Time, limit int) ([]models.Message, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, COALESCE(m.text,''), m.reply_to_id,
		        m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 WHERE m.chat_id = $1 AND m.created_at < $2 AND m.deleted_at IS NULL
		 ORDER BY m.created_at DESC
		 LIMIT $3`,
		chatID, before, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.SenderID, &m.Type, &m.Text,
			&m.ReplyToID, &m.ForwardID, &m.ForwardFromName, &m.EditedAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func (s *Service) GetUserChats(ctx context.Context, userID uuid.UUID) ([]models.Chat, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT c.id, c.type, COALESCE(c.title,''), COALESCE(c.description,''),
		        COALESCE(c.avatar_url,''), c.owner_id, c.is_public, COALESCE(c.invite_link,''),
		        c.discussion_chat_id, c.created_at, c.updated_at
		 FROM chats c
		 JOIN chat_members cm ON cm.chat_id = c.id
		 WHERE cm.user_id = $1 AND c.deleted_at IS NULL
		 ORDER BY c.updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chats []models.Chat
	for rows.Next() {
		var c models.Chat
		var discNull uuid.NullUUID
		if err := rows.Scan(&c.ID, &c.Type, &c.Title, &c.Description,
			&c.AvatarURL, &c.OwnerID, &c.IsPublic, &c.InviteLink,
			&discNull, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if discNull.Valid {
			u := discNull.UUID
			c.DiscussionChatID = &u
		}
		chats = append(chats, c)
	}
	return chats, nil
}

func (s *Service) GetChat(ctx context.Context, chatID uuid.UUID) (*models.Chat, error) {
	var c models.Chat
	var discNull uuid.NullUUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, type, COALESCE(title,''), COALESCE(description,''),
		        COALESCE(avatar_url,''), owner_id, is_public, COALESCE(invite_link,''),
		        discussion_chat_id, created_at, updated_at
		 FROM chats WHERE id = $1 AND deleted_at IS NULL`,
		chatID,
	).Scan(&c.ID, &c.Type, &c.Title, &c.Description,
		&c.AvatarURL, &c.OwnerID, &c.IsPublic, &c.InviteLink,
		&discNull, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if discNull.Valid {
		u := discNull.UUID
		c.DiscussionChatID = &u
	}
	return &c, nil
}

func (s *Service) GetChatMembers(ctx context.Context, chatID uuid.UUID) ([]models.ChatMember, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT chat_id, user_id, role, joined_at FROM chat_members WHERE chat_id = $1`,
		chatID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []models.ChatMember
	for rows.Next() {
		var m models.ChatMember
		if err := rows.Scan(&m.ChatID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (s *Service) AddMember(ctx context.Context, chatID, userID uuid.UUID, role models.MemberRole) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (chat_id, user_id) DO NOTHING`,
		chatID, userID, role,
	)
	if err != nil {
		return err
	}
	return s.syncMemberToChannelDiscussion(ctx, chatID, userID, role)
}

func (s *Service) syncMemberToChannelDiscussion(ctx context.Context, primaryChatID, userID uuid.UUID, role models.MemberRole) error {
	var typ int
	var discNull uuid.NullUUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT type, discussion_chat_id FROM chats WHERE id = $1 AND deleted_at IS NULL`,
		primaryChatID,
	).Scan(&typ, &discNull)
	if err != nil || typ != int(models.ChatTypeChannel) || !discNull.Valid {
		return nil
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (chat_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		discNull.UUID, userID, int(role),
	)
	return err
}

func (s *Service) RemoveMember(ctx context.Context, chatID, userID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID,
	)
	if err != nil {
		return err
	}
	var typ int
	var discNull uuid.NullUUID
	err = s.db.Pool.QueryRow(ctx,
		`SELECT type, discussion_chat_id FROM chats WHERE id = $1 AND deleted_at IS NULL`,
		chatID,
	).Scan(&typ, &discNull)
	if err == nil && typ == int(models.ChatTypeChannel) && discNull.Valid {
		_, _ = s.db.Pool.Exec(ctx,
			`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
			discNull.UUID, userID,
		)
	}
	return nil
}

func (s *Service) MarkRead(ctx context.Context, chatID, userID, messageID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO read_receipts (chat_id, user_id, message_id, read_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (chat_id, user_id) DO UPDATE SET message_id = $3, read_at = NOW()`,
		chatID, userID, messageID,
	)
	return err
}

func (s *Service) SearchMessages(ctx context.Context, userID uuid.UUID, query string, limit int) ([]models.Message, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
		        m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
		 WHERE m.text ILIKE $2 AND m.deleted_at IS NULL
		 ORDER BY m.created_at DESC LIMIT $3`,
		userID, "%"+query+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.SenderID, &m.Type, &m.Text,
			&m.ReplyToID, &m.ForwardID, &m.ForwardFromName, &m.EditedAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, nil
}

func (s *Service) SetTyping(ctx context.Context, chatID, userID string) error {
	return s.redis.SetTyping(ctx, chatID, userID)
}

type ChatEnriched struct {
	models.Chat
	LastMessage      *models.Message `json:"last_message,omitempty"`
	UnreadCount      int             `json:"unread_count"`
	IsPinned         bool            `json:"is_pinned"`
	IsMuted          bool            `json:"is_muted"`
	IsArchived       bool            `json:"is_archived"`
	MemberCount      int             `json:"member_count"`
	SlowModeSeconds  int             `json:"slow_mode_seconds"`
	PeerDisplayName  string          `json:"peer_display_name,omitempty"` // для личных чатов (type=0)
	PeerUserID       *uuid.UUID      `json:"peer_user_id,omitempty"`     // для личных чатов — id собеседника
	PeerAvatarURL    string          `json:"peer_avatar_url,omitempty"` // аватар собеседника (личка)
}

func (s *Service) GetOrCreateSavedMessagesChat(ctx context.Context, userID uuid.UUID) (*ChatEnriched, error) {
	var chatID uuid.UUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id FROM chats WHERE type = $1 AND owner_id = $2 AND deleted_at IS NULL LIMIT 1`,
		models.ChatTypeSavedMessages, userID,
	).Scan(&chatID)
	if err == nil {
		return s.getSavedMessagesEnriched(ctx, chatID, userID)
	}
	chatID = uuid.New()
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO chats (id, type, title, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
		chatID, models.ChatTypeSavedMessages, "Избранное", userID,
	)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)`,
		chatID, userID, models.MemberRoleOwner,
	)
	if err != nil {
		return nil, err
	}
	return s.getSavedMessagesEnriched(ctx, chatID, userID)
}

func (s *Service) getSavedMessagesEnriched(ctx context.Context, chatID, userID uuid.UUID) (*ChatEnriched, error) {
	var ce ChatEnriched
	var lmID, lmSenderID *uuid.UUID
	var lmType *int
	var lmText *string
	var lmCreatedAt *time.Time
	var discSaved uuid.NullUUID
	err := s.db.Pool.QueryRow(ctx,
		`SELECT c.id, c.type, COALESCE(c.title,''), COALESCE(c.description,''),
		        COALESCE(c.avatar_url,''), c.owner_id, c.is_public, COALESCE(c.invite_link,''),
		        c.created_at, c.updated_at, c.discussion_chat_id,
		        COALESCE(cm.is_pinned, false), cm.muted_at IS NOT NULL, COALESCE(cm.is_archived, false),
		        1,
		        lm.id, lm.sender_id, lm.type, COALESCE(lm.text,''), lm.created_at,
		        0
		 FROM chats c
		 JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
		 LEFT JOIN LATERAL (
		   SELECT m.id, m.sender_id, m.type, m.text, m.created_at
		   FROM messages m WHERE m.chat_id = c.id AND m.deleted_at IS NULL
		   ORDER BY m.created_at DESC LIMIT 1
		 ) lm ON true
		 WHERE c.id = $2 AND c.deleted_at IS NULL`,
		userID, chatID,
	).Scan(
		&ce.ID, &ce.Type, &ce.Title, &ce.Description,
		&ce.AvatarURL, &ce.OwnerID, &ce.IsPublic, &ce.InviteLink,
		&ce.CreatedAt, &ce.UpdatedAt, &discSaved,
		&ce.IsPinned, &ce.IsMuted, &ce.IsArchived, &ce.MemberCount,
		&lmID, &lmSenderID, &lmType, &lmText, &lmCreatedAt,
		&ce.UnreadCount,
	)
	if err != nil {
		return nil, err
	}
	if discSaved.Valid {
		u := discSaved.UUID
		ce.DiscussionChatID = &u
	}
	if lmID != nil {
		text := ""
		if lmText != nil {
			text = *lmText
		}
		ce.LastMessage = &models.Message{
			ID:        *lmID,
			ChatID:    ce.ID,
			SenderID:  *lmSenderID,
			Type:      models.MessageType(*lmType),
			Text:      text,
			CreatedAt: *lmCreatedAt,
		}
	}
	return &ce, nil
}

func (s *Service) GetUserChatsEnriched(ctx context.Context, userID uuid.UUID) ([]ChatEnriched, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT c.id, c.type, COALESCE(c.title,''), COALESCE(c.description,''),
		        COALESCE(c.avatar_url,''), c.owner_id, c.is_public, COALESCE(c.invite_link,''),
		        c.created_at, c.updated_at, c.discussion_chat_id,
		        COALESCE(cm.is_pinned, false), cm.muted_at IS NOT NULL, COALESCE(cm.is_archived, false),
		        (SELECT COUNT(*) FROM chat_members cm2 WHERE cm2.chat_id = c.id),
		        COALESCE(c.slow_mode_seconds, 0),
		        lm.id, lm.sender_id, lm.type, COALESCE(lm.text,''), lm.created_at,
		        COALESCE((SELECT COUNT(*) FROM messages m2
		          WHERE m2.chat_id = c.id AND m2.deleted_at IS NULL
		            AND m2.sender_id <> $1
		            AND m2.created_at > COALESCE(
		              (SELECT rr.read_at FROM read_receipts rr WHERE rr.chat_id = c.id AND rr.user_id = $1), '1970-01-01'::timestamptz
		            )), 0),
		        (SELECT COALESCE(
		           NULLIF(BTRIM(u.display_name), ''),
		           NULLIF(BTRIM(u.username), ''),
		           'Участник'
		         ) FROM chat_members cm_peer
		         JOIN users u ON u.id = cm_peer.user_id
		         WHERE cm_peer.chat_id = c.id AND cm_peer.user_id != $1 AND c.type = 0
		         LIMIT 1),
		        (SELECT cm_peer.user_id FROM chat_members cm_peer
		         WHERE cm_peer.chat_id = c.id AND cm_peer.user_id != $1 AND c.type = 0
		         LIMIT 1),
		        (SELECT COALESCE(NULLIF(BTRIM(u.avatar_url), ''), '')
		         FROM chat_members cm_peer
		         JOIN users u ON u.id = cm_peer.user_id
		         WHERE cm_peer.chat_id = c.id AND cm_peer.user_id != $1 AND c.type = 0
		         LIMIT 1)
		 FROM chats c
		 JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
		 LEFT JOIN LATERAL (
		   SELECT m.id, m.sender_id, m.type, m.text, m.created_at
		   FROM messages m WHERE m.chat_id = c.id AND m.deleted_at IS NULL
		   ORDER BY m.created_at DESC LIMIT 1
		 ) lm ON true
		 WHERE c.deleted_at IS NULL
		 ORDER BY COALESCE(cm.is_pinned, false) DESC, COALESCE(lm.created_at, c.updated_at) DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chats []ChatEnriched
	for rows.Next() {
		var ce ChatEnriched
		var lmID, lmSenderID *uuid.UUID
		var lmType *int
		var lmText *string
		var lmCreatedAt *time.Time
		var peerDisplayName *string
		var peerUserID *uuid.UUID
		var peerAvatar *string
		var discNull uuid.NullUUID

		if err := rows.Scan(
			&ce.ID, &ce.Type, &ce.Title, &ce.Description,
			&ce.AvatarURL, &ce.OwnerID, &ce.IsPublic, &ce.InviteLink,
			&ce.CreatedAt, &ce.UpdatedAt, &discNull,
			&ce.IsPinned, &ce.IsMuted, &ce.IsArchived, &ce.MemberCount,
			&ce.SlowModeSeconds,
			&lmID, &lmSenderID, &lmType, &lmText, &lmCreatedAt,
			&ce.UnreadCount,
			&peerDisplayName,
			&peerUserID,
			&peerAvatar,
		); err != nil {
			return nil, err
		}
		if discNull.Valid {
			u := discNull.UUID
			ce.DiscussionChatID = &u
		}
		if peerDisplayName != nil && *peerDisplayName != "" {
			ce.PeerDisplayName = *peerDisplayName
		}
		ce.PeerUserID = peerUserID
		if peerAvatar != nil && *peerAvatar != "" {
			ce.PeerAvatarURL = *peerAvatar
		}

		if lmID != nil {
			ce.LastMessage = &models.Message{
				ID:        *lmID,
				ChatID:    ce.ID,
				SenderID:  *lmSenderID,
				Type:      models.MessageType(*lmType),
				Text:      *lmText,
				CreatedAt: *lmCreatedAt,
			}
		}
		chats = append(chats, ce)
	}
	return chats, nil
}

func (s *Service) PinChat(ctx context.Context, chatID, userID uuid.UUID, pin bool) error {
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE chat_members SET is_pinned = $3 WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID, pin,
	)
	return err
}

func (s *Service) MuteChat(ctx context.Context, chatID, userID uuid.UUID, mute bool) error {
	if mute {
		_, err := s.db.Pool.Exec(ctx,
			`UPDATE chat_members SET muted_at = NOW() WHERE chat_id = $1 AND user_id = $2`,
			chatID, userID,
		)
		return err
	}
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE chat_members SET muted_at = NULL WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID,
	)
	return err
}

func (s *Service) ArchiveChat(ctx context.Context, chatID, userID uuid.UUID, archive bool) error {
	_, err := s.db.Pool.Exec(ctx,
		`UPDATE chat_members SET is_archived = $3 WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID, archive,
	)
	return err
}

// UpdateChatTitle — переименование чата (только для групп/каналов, только админ/владелец)
func (s *Service) UpdateChatTitle(ctx context.Context, chatID, userID uuid.UUID, title string) error {
	if title == "" || len(title) > 256 {
		return fmt.Errorf("недопустимое название")
	}
	var role int
	err := s.db.Pool.QueryRow(ctx,
		`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
		chatID, userID,
	).Scan(&role)
	if err != nil {
		return err
	}
	if models.MemberRole(role) != models.MemberRoleOwner && models.MemberRole(role) != models.MemberRoleAdmin {
		return fmt.Errorf("недостаточно прав")
	}
	_, err = s.db.Pool.Exec(ctx,
		`UPDATE chats SET title = $2, updated_at = NOW() WHERE id = $1 AND type IN (1, 2)`,
		chatID, title,
	)
	return err
}

// GetChatMedia returns messages with photo/video/file (type 1,2,3)
func (s *Service) GetChatMedia(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, msgType string, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var types []int
	switch msgType {
	case "photo":
		types = []int{1}
	case "video":
		types = []int{2, 9}
	case "file":
		types = []int{3}
	default:
		types = []int{1, 2, 3, 9}
	}
	placeholders := ""
	args := []interface{}{chatID, userID, limit}
	for i, t := range types {
		if i > 0 {
			placeholders += ","
		}
		placeholders += fmt.Sprintf("$%d", len(args)+1)
		args = append(args, t)
	}
	query := fmt.Sprintf(`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
		m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		FROM messages m
		JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
		WHERE m.chat_id = $1 AND m.deleted_at IS NULL AND m.type IN (%s)
		ORDER BY m.created_at DESC LIMIT $3`, placeholders)
	rows, err := s.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetChatLinks returns messages containing http(s) URLs
func (s *Service) GetChatLinks(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
			m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
		 WHERE m.chat_id = $1 AND m.deleted_at IS NULL AND m.type = 0
		   AND (m.text LIKE '%http://%' OR m.text LIKE '%https://%')
		 ORDER BY m.created_at DESC LIMIT $3`,
		chatID, userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetChatVoices returns voice messages (type 4)
func (s *Service) GetChatVoices(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
			m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
		 WHERE m.chat_id = $1 AND m.deleted_at IS NULL AND m.type = 4
		 ORDER BY m.created_at DESC LIMIT $3`,
		chatID, userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetChatFavorites returns user's bookmarked messages in this chat
func (s *Service) GetChatFavorites(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
			m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 JOIN message_bookmarks mb ON mb.message_id = m.id AND mb.user_id = $2
		 JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
		 WHERE m.chat_id = $1 AND m.deleted_at IS NULL
		 ORDER BY mb.created_at DESC LIMIT $3`,
		chatID, userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

func (s *Service) AddBookmark(ctx context.Context, userID uuid.UUID, messageID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO message_bookmarks (user_id, message_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, message_id) DO NOTHING`,
		userID, messageID,
	)
	return err
}

func (s *Service) ForwardMessage(ctx context.Context, chatID, senderID uuid.UUID, origMessageID uuid.UUID, chatIDs []uuid.UUID, hideSignature bool) ([]*models.Message, error) {
	var orig models.Message
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, chat_id, sender_id, type, text, reply_to_id, forward_id, created_at
		 FROM messages WHERE id = $1 AND deleted_at IS NULL`,
		origMessageID,
	).Scan(&orig.ID, &orig.ChatID, &orig.SenderID, &orig.Type, &orig.Text,
		&orig.ReplyToID, &orig.ForwardID, &orig.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("original message not found: %w", err)
	}
	// Проверка доступа к исходному чату
	var ok int
	err = s.db.Pool.QueryRow(ctx,
		`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
		orig.ChatID, senderID,
	).Scan(&ok)
	if err != nil {
		return nil, fmt.Errorf("no access to original chat")
	}

	var authorLabel string
	if !hideSignature {
		_ = s.db.Pool.QueryRow(ctx,
			`SELECT COALESCE(NULLIF(TRIM(display_name),''), NULLIF(TRIM(username),''), 'Участник') FROM users WHERE id = $1`,
			orig.SenderID,
		).Scan(&authorLabel)
	}

	var result []*models.Message
	for _, cid := range chatIDs {
		var ok int
		err = s.db.Pool.QueryRow(ctx,
			`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
			cid, senderID,
		).Scan(&ok)
		if err != nil {
			continue
		}
		var fwdID *uuid.UUID
		var fwdName *string
		if !hideSignature {
			fwdID = &orig.ID
			if authorLabel != "" {
				fwdName = &authorLabel
			}
		}
		msg := &models.Message{
			ID:              uuid.New(),
			ChatID:          cid,
			SenderID:        senderID,
			Type:            orig.Type,
			Text:            orig.Text,
			ForwardID:       fwdID,
			ForwardFromName: "",
			CreatedAt:       time.Now(),
		}
		if fwdName != nil {
			msg.ForwardFromName = *fwdName
		}
		_, err = s.db.Pool.Exec(ctx,
			`INSERT INTO messages (id, chat_id, sender_id, type, text, forward_id, forward_from_name, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			msg.ID, msg.ChatID, msg.SenderID, msg.Type, msg.Text, msg.ForwardID, fwdName, msg.CreatedAt,
		)
		if err != nil {
			continue
		}
		s.db.Pool.Exec(ctx, `UPDATE chats SET updated_at = NOW() WHERE id = $1`, cid)
		result = append(result, msg)
	}
	return result, nil
}

func (s *Service) PinMessage(ctx context.Context, chatID, messageID, userID uuid.UUID) error {
	var ok int
	err := s.db.Pool.QueryRow(ctx,
		`SELECT 1 FROM chat_members cm JOIN messages m ON m.chat_id = cm.chat_id
		 WHERE cm.chat_id = $1 AND cm.user_id = $2 AND m.id = $3 AND m.deleted_at IS NULL`,
		chatID, userID, messageID,
	).Scan(&ok)
	if err != nil {
		return fmt.Errorf("no access")
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO pinned_messages (chat_id, message_id, pinned_by) VALUES ($1, $2, $3)
		 ON CONFLICT (chat_id, message_id) DO NOTHING`,
		chatID, messageID, userID,
	)
	return err
}

func (s *Service) UnpinMessage(ctx context.Context, chatID, messageID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM pinned_messages WHERE chat_id = $1 AND message_id = $2`,
		chatID, messageID,
	)
	return err
}

func (s *Service) GetPinnedMessages(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, COALESCE(m.text,''), m.reply_to_id,
		        m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM pinned_messages pm
		 JOIN messages m ON m.id = pm.message_id AND m.deleted_at IS NULL
		 JOIN chat_members cm ON cm.chat_id = pm.chat_id AND cm.user_id = $2
		 WHERE pm.chat_id = $1
		 ORDER BY pm.pinned_at DESC LIMIT $3`,
		chatID, userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

func (s *Service) GetMessageChatID(ctx context.Context, messageID uuid.UUID) (uuid.UUID, error) {
	var chatID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, `SELECT chat_id FROM messages WHERE id = $1 AND deleted_at IS NULL`, messageID).Scan(&chatID)
	return chatID, err
}

func (s *Service) AddReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	if emoji == "" {
		emoji = "👍"
	}
	_, err := s.db.Pool.Exec(ctx,
		`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
		 ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = $3`,
		messageID, userID, emoji,
	)
	return err
}

func (s *Service) RemoveReaction(ctx context.Context, messageID, userID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`,
		messageID, userID,
	)
	return err
}

type ReactionInfo struct {
	Emoji  string   `json:"emoji"`
	Count  int      `json:"count"`
	UserIDs []uuid.UUID `json:"user_ids"`
}

func (s *Service) GetMessageReactions(ctx context.Context, messageID uuid.UUID) ([]ReactionInfo, error) {
	rows, err := s.db.Pool.Query(ctx,
		`SELECT emoji, user_id FROM message_reactions WHERE message_id = $1`,
		messageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byEmoji := make(map[string][]uuid.UUID)
	for rows.Next() {
		var emoji string
		var uid uuid.UUID
		if err := rows.Scan(&emoji, &uid); err != nil {
			continue
		}
		byEmoji[emoji] = append(byEmoji[emoji], uid)
	}
	var out []ReactionInfo
	for e, uids := range byEmoji {
		out = append(out, ReactionInfo{Emoji: e, Count: len(uids), UserIDs: uids})
	}
	return out, nil
}

func (s *Service) SearchMessagesInChat(ctx context.Context, chatID uuid.UUID, userID uuid.UUID, query string, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT m.id, m.chat_id, m.sender_id, m.type, m.text, m.reply_to_id,
		        m.forward_id, COALESCE(m.forward_from_name,''), m.edited_at, m.created_at
		 FROM messages m
		 JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
		 WHERE m.chat_id = $1 AND m.text ILIKE $3 AND m.deleted_at IS NULL
		 ORDER BY m.created_at DESC LIMIT $4`,
		chatID, userID, "%"+query+"%", limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

func (s *Service) RemoveBookmark(ctx context.Context, userID uuid.UUID, messageID uuid.UUID) error {
	_, err := s.db.Pool.Exec(ctx,
		`DELETE FROM message_bookmarks WHERE user_id = $1 AND message_id = $2`,
		userID, messageID,
	)
	return err
}

// CreatePoll creates a poll message. Caller must be chat member.
func (s *Service) CreatePoll(ctx context.Context, chatID, senderID uuid.UUID, question string, options []string, allowsMultiple bool) (*models.Message, *models.Poll, error) {
	if len(options) < 2 || len(options) > 10 {
		return nil, nil, fmt.Errorf("poll must have 2-10 options")
	}
	msg := &models.Message{
		ID:        uuid.New(),
		ChatID:    chatID,
		SenderID:  senderID,
		Type:      models.MessageTypePoll,
		Text:      question,
		CreatedAt: time.Now(),
	}
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx,
		`INSERT INTO messages (id, chat_id, sender_id, type, text, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		msg.ID, msg.ChatID, msg.SenderID, msg.Type, msg.Text, msg.CreatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	pollID := uuid.New()
	_, err = tx.Exec(ctx,
		`INSERT INTO polls (id, message_id, question, allows_multiple) VALUES ($1, $2, $3, $4)`,
		pollID, msg.ID, question, allowsMultiple,
	)
	if err != nil {
		return nil, nil, err
	}
	for i, opt := range options {
		optID := uuid.New()
		_, err = tx.Exec(ctx, `INSERT INTO poll_options (id, poll_id, text, sort_order) VALUES ($1, $2, $3, $4)`,
			optID, pollID, opt, i,
		)
		if err != nil {
			return nil, nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	poll := &models.Poll{ID: pollID, MessageID: msg.ID, Question: question, AllowsMultiple: allowsMultiple}
	for i, opt := range options {
		poll.Options = append(poll.Options, models.PollOption{Text: opt, SortOrder: i})
	}
	return msg, poll, nil
}

// VotePoll records a vote. For single choice, replaces existing. For multiple, replaces all.
func (s *Service) VotePoll(ctx context.Context, messageID, userID uuid.UUID, optionIDs []uuid.UUID) error {
	var pollID uuid.UUID
	var allowsMultiple bool
	err := s.db.Pool.QueryRow(ctx,
		`SELECT p.id, p.allows_multiple FROM polls p WHERE p.message_id = $1`,
		messageID,
	).Scan(&pollID, &allowsMultiple)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("poll not found")
	}
	if err != nil {
		return err
	}
	if !allowsMultiple && len(optionIDs) != 1 {
		return fmt.Errorf("single choice poll requires exactly one option")
	}
	if allowsMultiple && len(optionIDs) > 10 {
		return fmt.Errorf("max 10 options for multiple choice")
	}
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, pollID, userID)
	if err != nil {
		return err
	}
	for _, optID := range optionIDs {
		_, err = tx.Exec(ctx,
			`INSERT INTO poll_votes (poll_id, option_id, user_id)
			 SELECT $1, $2, $3 FROM poll_options WHERE id = $2 AND poll_id = $1`,
			pollID, optID, userID,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// PollWithResults holds poll data with vote counts and user's selected option IDs
type PollWithResults struct {
	Poll         *models.Poll   `json:"poll"`
	OptionCounts []int          `json:"option_counts"`
	TotalVotes   int            `json:"total_votes"`
	UserVoteIDs  []uuid.UUID    `json:"user_vote_ids"`
}

// GetPollWithResults returns poll with results for a message.
func (s *Service) GetPollWithResults(ctx context.Context, messageID, userID uuid.UUID) (*PollWithResults, error) {
	var p models.Poll
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id, message_id, question, allows_multiple FROM polls WHERE message_id = $1`,
		messageID,
	).Scan(&p.ID, &p.MessageID, &p.Question, &p.AllowsMultiple)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	opts, err := s.db.Pool.Query(ctx,
		`SELECT id, text, sort_order FROM poll_options WHERE poll_id = $1 ORDER BY sort_order`,
		p.ID,
	)
	if err != nil {
		return nil, err
	}
	defer opts.Close()
	for opts.Next() {
		var o models.PollOption
		if err := opts.Scan(&o.ID, &o.Text, &o.SortOrder); err != nil {
			return nil, err
		}
		p.Options = append(p.Options, o)
	}
	counts := make([]int, len(p.Options))
	total := 0
	for i, o := range p.Options {
		err := s.db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM poll_votes WHERE option_id = $1`, o.ID,
		).Scan(&counts[i])
		if err != nil {
			return nil, err
		}
		total += counts[i]
	}
	var userVoteIDs []uuid.UUID
	uv, _ := s.db.Pool.Query(ctx,
		`SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2`,
		p.ID, userID,
	)
	if uv != nil {
		defer uv.Close()
		for uv.Next() {
			var vid uuid.UUID
			if err := uv.Scan(&vid); err != nil {
				return nil, err
			}
			userVoteIDs = append(userVoteIDs, vid)
		}
	}
	return &PollWithResults{Poll: &p, OptionCounts: counts, TotalVotes: total, UserVoteIDs: userVoteIDs}, nil
}

func scanMessages(rows pgx.Rows) ([]models.Message, error) {
	var msgs []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ChatID, &m.SenderID, &m.Type, &m.Text,
			&m.ReplyToID, &m.ForwardID, &m.ForwardFromName, &m.EditedAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// BroadcastResult holds per-chat result
type BroadcastResult struct {
	ChatID uuid.UUID       `json:"chat_id"`
	OK     bool            `json:"ok"`
	Err    string          `json:"error,omitempty"`
	Msg    *models.Message `json:"message,omitempty"`
}

// Broadcast sends a message to multiple chats. Caller must be owner or admin (role>=1) in each chat.
func (s *Service) Broadcast(ctx context.Context, senderID uuid.UUID, chatIDs []uuid.UUID, contentType string, text string) ([]BroadcastResult, error) {
	msgType := models.MessageTypeText
	var results []BroadcastResult
	for _, chatID := range chatIDs {
		var role int
		err := s.db.Pool.QueryRow(ctx,
			`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
			chatID, senderID,
		).Scan(&role)
		if err == pgx.ErrNoRows {
			results = append(results, BroadcastResult{ChatID: chatID, OK: false, Err: "not a member"})
			continue
		}
		if err != nil {
			results = append(results, BroadcastResult{ChatID: chatID, OK: false, Err: err.Error()})
			continue
		}
		if role < 1 {
			results = append(results, BroadcastResult{ChatID: chatID, OK: false, Err: "insufficient permissions"})
			continue
		}
		msg, err := s.SendMessage(ctx, chatID, senderID, msgType, text, nil)
		if err != nil {
			results = append(results, BroadcastResult{ChatID: chatID, OK: false, Err: err.Error()})
		} else {
			results = append(results, BroadcastResult{ChatID: chatID, OK: true, Msg: msg})
		}
	}
	return results, nil
}

// CreateReport creates a user report.
func (s *Service) CreateReport(ctx context.Context, reporterID uuid.UUID, targetType, targetID, reason string) error {
	tid, err := uuid.Parse(targetID)
	if err != nil {
		return fmt.Errorf("invalid target_id")
	}
	_, err = s.db.Pool.Exec(ctx,
		`INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)`,
		reporterID, targetType, tid, reason,
	)
	return err
}

// ReportRow is a report for moderator listing.
type ReportRow struct {
	ID         uuid.UUID `json:"id"`
	ReporterID uuid.UUID `json:"reporter_id"`
	TargetType string    `json:"target_type"`
	TargetID   uuid.UUID `json:"target_id"`
	Reason     string    `json:"reason"`
	CreatedAt  time.Time `json:"created_at"`
}

// ListReports returns reports for moderation (admin only).
func (s *Service) ListReports(ctx context.Context, limit int) ([]ReportRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Pool.Query(ctx,
		`SELECT id, reporter_id, target_type, target_id, reason, created_at
		 FROM reports ORDER BY created_at DESC LIMIT $1`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []ReportRow
	for rows.Next() {
		var r ReportRow
		if err := rows.Scan(&r.ID, &r.ReporterID, &r.TargetType, &r.TargetID, &r.Reason, &r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// EnsureChannelDiscussion создаёт группу обсуждения для канала без неё и копирует участников (§26.3).
func (s *Service) EnsureChannelDiscussion(ctx context.Context, channelID, userID uuid.UUID) (uuid.UUID, error) {
	var role int
	err := s.db.Pool.QueryRow(ctx,
		`SELECT cm.role FROM chat_members cm WHERE cm.chat_id = $1 AND cm.user_id = $2`,
		channelID, userID,
	).Scan(&role)
	if err != nil {
		return uuid.Nil, fmt.Errorf("нет доступа к каналу")
	}
	if models.MemberRole(role) != models.MemberRoleOwner && models.MemberRole(role) != models.MemberRoleAdmin {
		return uuid.Nil, fmt.Errorf("недостаточно прав")
	}

	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var chType int
	var title string
	var ownerID uuid.UUID
	var discNull uuid.NullUUID
	err = tx.QueryRow(ctx,
		`SELECT type, COALESCE(title,''), owner_id, discussion_chat_id FROM chats WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
		channelID,
	).Scan(&chType, &title, &ownerID, &discNull)
	if err != nil {
		return uuid.Nil, err
	}
	if chType != int(models.ChatTypeChannel) {
		return uuid.Nil, fmt.Errorf("не канал")
	}
	if discNull.Valid {
		if err := tx.Commit(ctx); err != nil {
			return uuid.Nil, err
		}
		return discNull.UUID, nil
	}

	discID := uuid.New()
	now := time.Now()
	discTitle := "Обсуждение: " + title
	if len([]rune(discTitle)) > 240 {
		discTitle = string([]rune(discTitle)[:240])
	}
	discDesc := fmt.Sprintf("Комментарии к каналу «%s»", title)
	if len([]rune(discDesc)) > 512 {
		discDesc = string([]rune(discDesc)[:512])
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO chats (id, type, title, description, owner_id, is_public, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
		discID, models.ChatTypeGroup, discTitle, discDesc, ownerID, now, now,
	)
	if err != nil {
		return uuid.Nil, err
	}
	_, err = tx.Exec(ctx,
		`UPDATE chats SET discussion_chat_id = $2, updated_at = NOW() WHERE id = $1`,
		channelID, discID,
	)
	if err != nil {
		return uuid.Nil, err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_members (chat_id, user_id, role)
		 SELECT $1, user_id, role FROM chat_members WHERE chat_id = $2
		 ON CONFLICT (chat_id, user_id) DO NOTHING`,
		discID, channelID,
	)
	if err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return discID, nil
}

func (s *Service) findPrivateChat(ctx context.Context, userA, userB uuid.UUID) (*models.Chat, error) {
	var chat models.Chat
	err := s.db.Pool.QueryRow(ctx,
		`SELECT c.id, c.type, c.owner_id, c.created_at, c.updated_at
		 FROM chats c
		 WHERE c.type = 0 AND c.deleted_at IS NULL
		   AND c.id IN (
		     SELECT cm1.chat_id FROM chat_members cm1
		     JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
		     WHERE cm1.user_id = $1 AND cm2.user_id = $2
		   )
		 LIMIT 1`,
		userA, userB,
	).Scan(&chat.ID, &chat.Type, &chat.OwnerID, &chat.CreatedAt, &chat.UpdatedAt)

	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("no private chat found")
	}
	return &chat, err
}
