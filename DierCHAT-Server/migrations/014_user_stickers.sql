-- §26.6: пользовательские стикеры на сервере (URL после /api/upload)

CREATE TABLE IF NOT EXISTS user_stickers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stickers_user ON user_stickers(user_id, created_at DESC);
