-- §26.6: именованные наборы стикеров (паки) + связь user_stickers.pack_id

CREATE TABLE IF NOT EXISTS user_sticker_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Мои стикеры',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sticker_packs_user ON user_sticker_packs(user_id, created_at DESC);

ALTER TABLE user_stickers ADD COLUMN IF NOT EXISTS pack_id UUID;

-- Пак «Мои стикеры» для каждого пользователя, у кого уже есть стикеры (идемпотентно)
INSERT INTO user_sticker_packs (user_id, title)
SELECT us.user_id, 'Мои стикеры'
FROM (SELECT DISTINCT user_id FROM user_stickers) us
WHERE NOT EXISTS (SELECT 1 FROM user_sticker_packs p WHERE p.user_id = us.user_id);

UPDATE user_stickers us
SET pack_id = (
    SELECT p.id FROM user_sticker_packs p
    WHERE p.user_id = us.user_id
    ORDER BY p.created_at ASC
    LIMIT 1
)
WHERE us.pack_id IS NULL;

ALTER TABLE user_stickers ALTER COLUMN pack_id SET NOT NULL;

ALTER TABLE user_stickers
    ADD CONSTRAINT user_stickers_pack_id_fkey
    FOREIGN KEY (pack_id) REFERENCES user_sticker_packs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_stickers_pack ON user_stickers(pack_id, created_at DESC);
