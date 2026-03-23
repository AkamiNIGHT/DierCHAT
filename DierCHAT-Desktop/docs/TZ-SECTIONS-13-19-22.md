# ТЗ: §13 Уведомления, §19 Производительность, §20–22

## §13 — Уведомления
- Системные уведомления: заголовок из `sender.display_name`, иконка через `notificationIconUrl(sender.avatar_url)`.
- Чаты из **Настройки → Уведомления → Исключения** не показывают push и не дают звук «входящего» (store `notificationMutedChatIds`).
- Вкладка активна и открыт этот чат — уведомление не показывается; звук входящего не играет (как и раньше).
- Service Worker: `notificationclick` фокусирует открытое окно или открывает `/`.

## §19 — Производительность
- `api.getChats()` — кэш **5 с** (`invalidateChatsCache` после создания чата / join по invite).
- Изображения перед загрузкой: `compressImageFileIfNeeded` в `MessageInput`.

## §22 — Бэкенд
- `GET /api/health` — JSON `{ ok, service, ts }` без авторизации.

## §21 — Админка / модерация
- **Настройки → Модерация**: статус `health` и список жалоб (`GET /api/reports`, если бэкенд отдаёт).

## §14 — Истории
- Локально (localStorage): кольца в списке чатов, просмотр на весь экран, тапы влево/вправо, прогресс-бар с анимацией.
- Публикация: фото или видео, подпись в модалке, срок жизни 24 ч.
- Реакции ❤️/👍, счётчики; просмотревшие (локальные id), панель по кнопке «глаз».

## §16 — PWA и офлайн
- `manifest.webmanifest`: `id`, `scope`, `lang`, `categories`, `display_override`, иконка; `index.html` — `apple-touch-icon`.
- Очередь офлайна: `lib/offlineQueue.ts`, сброс при `online`, `dierchat:ws_connected`, `dierchat:flush_outbox` (из SW `sync` / postMessage).
- SW: `sync` → `DIERCHAT_FLUSH_OUTBOX` клиентам.

## §19 — виртуализация чата
- Список сообщений на `react-virtuoso` (`MessageList`): подгрузка старых через `startReached`, «вниз» плавающая кнопка.

## §20 — Спецфишки
- См. существующие модули проекта; отдельные пункты ТЗ не дублируются здесь.
