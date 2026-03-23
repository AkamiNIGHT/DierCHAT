# ТЗ §46 — текст сообщений (raw)

**ВАЖНО:** текст сообщений хранится и передаётся как **raw string**.  
**НЕ ПРИМЕНЯТЬ** `trim()`, `String.prototype.normalize()` для сжатия пробелов, `replace(/\s+/g, ' ')` и т.п. при записи/отправке на клиенте.  
**Отображение:** CSS `white-space: pre-wrap` (см. `MessageBubble.css`, поле ввода `MessageInput.css`).

Реализация на клиенте: `DierCHAT-Desktop/src/lib/messageText.ts`  
Опциональная авто-разметка (Markdown-подобный синтаксис): настройка «Разметка в сообщениях», по умолчанию **выключена**.

Бэкенд (**DierCHAT-Server**): `internal/messagetext` + комментарии в `messaging.SendMessage` / `EditMessage`; без `TrimSpace` текста сообщения. Подписи историй (`stories`) — без `TrimSpace` у caption. См. `DierCHAT-Server/README.md`.
