-- §26.3: чат обсуждения для канала (группа type=1)

ALTER TABLE chats ADD COLUMN IF NOT EXISTS discussion_chat_id UUID REFERENCES chats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chats_discussion_chat ON chats(discussion_chat_id) WHERE discussion_chat_id IS NOT NULL;
