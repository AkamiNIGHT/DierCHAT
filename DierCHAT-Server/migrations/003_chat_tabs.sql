-- Избранные сообщения (bookmarks) для вкладки "Избранное"
CREATE TABLE IF NOT EXISTS message_bookmarks (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_bookmarks_user ON message_bookmarks(user_id);
