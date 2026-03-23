-- ТЗ §48.4: подпись «переслано от …» (имя автора оригинала)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_name VARCHAR(256);
