package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID          uuid.UUID  `json:"id"`
	Phone       string     `json:"phone"`
	Email       string     `json:"email"`
	Username    string     `json:"username,omitempty"`
	DisplayName string     `json:"display_name"`
	AvatarURL   string     `json:"avatar_url,omitempty"`
	Bio         string     `json:"bio,omitempty"`
	LastSeen    time.Time  `json:"last_seen"`
	Online      bool       `json:"online"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

type ChatType int

const (
	ChatTypePrivate ChatType = iota
	ChatTypeGroup
	ChatTypeChannel
	ChatTypeSavedMessages
)

type Chat struct {
	ID                 uuid.UUID  `json:"id"`
	Type               ChatType   `json:"type"`
	Title              string     `json:"title,omitempty"`
	Description        string     `json:"description,omitempty"`
	AvatarURL          string     `json:"avatar_url,omitempty"`
	OwnerID            uuid.UUID  `json:"owner_id"`
	IsPublic           bool       `json:"is_public"`
	InviteLink         string     `json:"invite_link,omitempty"`
	DiscussionChatID   *uuid.UUID `json:"discussion_chat_id,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	DeletedAt          *time.Time `json:"deleted_at,omitempty"`
}

type MemberRole int

const (
	MemberRoleMember MemberRole = iota
	MemberRoleAdmin
	MemberRoleOwner
)

type ChatMember struct {
	ChatID   uuid.UUID  `json:"chat_id"`
	UserID   uuid.UUID  `json:"user_id"`
	Role     MemberRole `json:"role"`
	JoinedAt time.Time  `json:"joined_at"`
	MutedAt  *time.Time `json:"muted_at,omitempty"`
}

type MessageType int

const (
	MessageTypeText MessageType = iota
	MessageTypePhoto
	MessageTypeVideo
	MessageTypeFile
	MessageTypeVoice
	MessageTypeSticker
	MessageTypeSystem
	MessageTypeForward
	MessageTypePoll
	// MessageTypeVideoNote — круглое видеосообщение (кружок), не путать с обычным видео (§26.4)
	MessageTypeVideoNote
	// MessageTypeAudio — музыкальный файл (mp3, m4a…), не голосовое (§26.7)
	MessageTypeAudio
)

type Message struct {
	ID        uuid.UUID   `json:"id"`
	ChatID    uuid.UUID   `json:"chat_id"`
	SenderID  uuid.UUID   `json:"sender_id"`
	Type      MessageType `json:"type"`
	Text      string      `json:"text,omitempty"`
	ReplyToID *uuid.UUID  `json:"reply_to_id,omitempty"`
	ForwardID *uuid.UUID  `json:"forward_id,omitempty"`
	// Имя автора оригинала при пересылке с подписью (если forward_id задан)
	ForwardFromName string `json:"forward_from_name,omitempty"`
	EditedAt  *time.Time  `json:"edited_at,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	DeletedAt *time.Time  `json:"deleted_at,omitempty"`

	Attachments []Attachment `json:"attachments,omitempty"`
	ReadBy      []uuid.UUID  `json:"read_by,omitempty"`
	Poll        *Poll        `json:"poll,omitempty"`
}

type Attachment struct {
	ID        uuid.UUID `json:"id"`
	MessageID uuid.UUID `json:"message_id"`
	Type      string    `json:"type"`
	URL       string    `json:"url"`
	FileName  string    `json:"file_name"`
	FileSize  int64     `json:"file_size"`
	MimeType  string    `json:"mime_type"`
	Width     int       `json:"width,omitempty"`
	Height    int       `json:"height,omitempty"`
	Duration  float64   `json:"duration,omitempty"`
	Thumbnail string    `json:"thumbnail,omitempty"`
}

type Session struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Token     string    `json:"token"`
	Device    string    `json:"device"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

type AuthCode struct {
	Phone     string    `json:"phone"`
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expires_at"`
	Attempts  int       `json:"attempts"`
}

type Bot struct {
	ID          uuid.UUID `json:"id"`
	OwnerID     uuid.UUID `json:"owner_id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	Token       string    `json:"token"`
	WebhookURL  string    `json:"webhook_url,omitempty"`
	Description string    `json:"description,omitempty"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	IsInline    bool      `json:"is_inline"`
	CreatedAt   time.Time `json:"created_at"`
}

type MiniApp struct {
	ID          uuid.UUID `json:"id"`
	BotID       uuid.UUID `json:"bot_id"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Description string    `json:"description,omitempty"`
	IconURL     string    `json:"icon_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type ReadReceipt struct {
	ChatID    uuid.UUID `json:"chat_id"`
	UserID    uuid.UUID `json:"user_id"`
	MessageID uuid.UUID `json:"message_id"`
	ReadAt    time.Time `json:"read_at"`
}

type Poll struct {
	ID             uuid.UUID    `json:"id"`
	MessageID      uuid.UUID    `json:"message_id"`
	Question       string       `json:"question"`
	AllowsMultiple bool         `json:"allows_multiple"`
	Options        []PollOption `json:"options"`
	CreatedAt      time.Time    `json:"created_at"`
}

type PollOption struct {
	ID       uuid.UUID `json:"id"`
	PollID   uuid.UUID `json:"poll_id"`
	Text     string    `json:"text"`
	VoteCount int      `json:"vote_count"`
	SortOrder int      `json:"sort_order"`
}
