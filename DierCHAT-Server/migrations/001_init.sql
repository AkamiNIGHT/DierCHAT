-- DierCHAT Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE,
    display_name VARCHAR(128) NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    online BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    device VARCHAR(256) DEFAULT '',
    ip VARCHAR(64) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);

-- Chats: 0=private, 1=group, 2=channel, 3=saved
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type SMALLINT NOT NULL DEFAULT 0,
    title VARCHAR(256) DEFAULT '',
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    owner_id UUID REFERENCES users(id),
    is_public BOOLEAN DEFAULT FALSE,
    invite_link VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_chats_owner ON chats(owner_id);
CREATE INDEX idx_chats_invite ON chats(invite_link) WHERE invite_link IS NOT NULL;

-- Chat members: role 0=member, 1=admin, 2=owner
CREATE TABLE chat_members (
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role SMALLINT NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    muted_at TIMESTAMPTZ,
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX idx_members_user ON chat_members(user_id);

-- Messages: type 0=text,1=photo,2=video,3=file,4=voice,5=sticker,6=system,7=forward
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    type SMALLINT NOT NULL DEFAULT 0,
    text TEXT DEFAULT '',
    reply_to_id UUID REFERENCES messages(id),
    forward_id UUID REFERENCES messages(id),
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_chat ON messages(chat_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_chat_recent ON messages(chat_id, created_at DESC) WHERE deleted_at IS NULL;

-- Attachments
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL,
    url TEXT NOT NULL,
    file_name VARCHAR(512) DEFAULT '',
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(128) DEFAULT '',
    width INT DEFAULT 0,
    height INT DEFAULT 0,
    duration DOUBLE PRECISION DEFAULT 0,
    thumbnail TEXT DEFAULT ''
);

CREATE INDEX idx_attachments_message ON attachments(message_id);

-- Read receipts
CREATE TABLE read_receipts (
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);

-- Contacts
CREATE TABLE contacts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, contact_id)
);

-- Bots
CREATE TABLE bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id),
    username VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    token TEXT UNIQUE NOT NULL,
    webhook_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    is_inline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mini apps
CREATE TABLE mini_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Typing indicators stored in Redis, not in DB
-- Online presence stored in Redis, not in DB
