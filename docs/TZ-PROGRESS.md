# Соответствие ТЗ (`тз.txt`) — прогресс

Документ **тз.txt** — большой roadmap (150+ пунктов). Ниже фиксируются **реализованные** блоки и последние доработки.

## Раздел 1 — Авторизация

| Пункт ТЗ | Статус |
|----------|--------|
| Вход только по email, без телефона | ✅ |
| Получить код, валидация email | ✅ |
| 6 полей кода, автофокус | ✅ |
| Таймер повторной отправки 30 сек | ✅ |
| Код в Redis 5 мин, блокировка после неверных попыток | ✅ **3 попытки** (константа `MaxVerifyAttempts`), затем пауза 10 мин |
| SMTP, тема «Код входа в Dier Chat» | ✅ (`pkg/email`) |
| Вставка кода из буфера (6 цифр) | ✅ `AuthScreen` |
| 2FA / сброс пароля | ✅ (экраны есть) |
| Активные сессии | ✅ `SettingsPanel` + API |

## Раздел 3 — WebSocket

| Пункт ТЗ | Статус |
|----------|--------|
| WS после входа | ✅ `App.tsx` / `wsClient` |
| Heartbeat ~30 с, обрыв при отсутствии pong ~10 с | ✅ `api/ws.ts` |
| События new_message, typing, read, … | ✅ частично в `WSClient` |
| Индикатор соединения | ✅ точка + баннер; **добавлен** учёт `navigator.onLine` |

## Раздел 4–5 — Список чатов и личные диалоги

| Пункт ТЗ | Статус |
|----------|--------|
| Имя собеседника в личке (не «N участников» в шапке) | ✅ `ChatView`: личка по `type === 0`; заголовок: `peer_display_name` → имя из участников → «Личный чат» |
| `peer_display_name` в API списка чатов | ✅ уже было в `GetUserChatsEnriched`; усилен fallback SQL → «Участник», если нет имени/username |
| Строка поиска: фильтры типов чатов | ✅ вкладки Все / Личные / Группы / Каналы + папки |
| Подсветка совпадений | ✅ в списке чатов и в результатах глобального поиска по сообщениям |
| Фильтр по дате (результаты по сообщениям) | ✅ поле даты при поиске ≥3 символов |
| Статус «онлайн» в списке | ✅ `GET /api/presence/peers` (кто из собеседников в личках с открытым WS) + слияние в `onlineUserIds`; сравнение UUID без учёта регистра |
| Pull-to-refresh списка чатов | ✅ на мобильной ширине `<768px` в `DialogList` |
| Поиск в чате — подсветка | ✅ `highlightQuery` при открытой панели поиска и запросе ≥2 символов |
| Подгрузка истории вверх | ✅ `startReached` + остановка при пустом ответе API (`olderDoneRef`), смена чата — `key` на `MessageList` |
| Список сообщений: без лишнего горизонтального скролла | ✅ `MessageList.css` (`overflow-x: hidden`, Virtuoso `[data-virtuoso-scroller]`); `ChatView.css` — `.chat-view__message-area` |
| Presence после переподключения WS | ✅ `App.tsx`: слушатель `dierchat:ws_connected` → `getPeersPresence` + `mergeOnlineUserIds` |

## Раздел 5 (продолжение) — статусы и хештеги

| Пункт ТЗ | Статус |
|----------|--------|
| §32 Галочки: отправка / доставлено / прочитано | ✅ одна серая при офлайн-очереди (`offline-…`), две серые «доставлено», две синие «прочитано» |
| §32 «Кто прочитал» в группах | ✅ клик по статусу своего сообщения — попап со списком (или текст «пока никто») |
| §38 Хештеги → поиск | ✅ клик по `#тег` в пузыре → событие → `ChatView` открывает поиск по чату с текстом тега |
| §26.5 / WS входящий звонок | ✅ разбор **нескольких JSON в одном WebSocket-фрейме** (`\\n`), иначе терялись события; payload `from_user_id` как строка + **`from_display_name`**, **`from_avatar_url`** с бэка |
| §26.1 Аватарки в списке и шапке | ✅ **`peer_avatar_url`** в `GetUserChatsEnriched` → `DialogList` + шапка `ChatView`; группы/каналы — `avatar_url` чата |
| Закреп: клик по баннеру | ✅ скролл к закреплённому сообщению (`scrollToMessageId`); крестик не всплывает |
| Избранное (saved) SQL | ✅ убран лишний столбец `NULL` в `getSavedMessagesEnriched` (совпадение числа колонок со `Scan`) |
| Модерация — утечка инфы о сервере | ✅ убран блок «Сервер» / `GET /api/health` из настроек модерации |

## Раздел 26 — Истории на сервере (§26.2)

| Пункт ТЗ | Статус |
|----------|--------|
| Таблицы `stories`, `story_views`, TTL 24 ч | ✅ миграция `012_stories.sql` |
| `POST /api/stories`, `GET /api/stories/feed`, `POST /api/stories/{id}/view` | ✅ `internal/stories/service.go` + `handlers.go` |
| Лента: вы + собеседники из **личных** чатов (`chats.type = 0`) | ✅ SQL `WITH authors AS …` |
| Клиент: загрузка через `upload` → `createStory`, лента с API, merge с локальными `s_*` | ✅ `StoriesStrip`, `stories.ts`, `api/client.ts` |
| Просмотры и список зрителей только у автора своей истории | ✅ API + UI (`StoryViewer`: счётчик только на своём кольце) |
| Реакции на серверных историях (локально в `localStorage`) | ✅ `bumpStoryReaction` / `mergeDisplayReactions` |

## Раздел 26.3 — Комментарии / обсуждение каналов (P1)

| Пункт ТЗ | Статус |
|----------|--------|
| Поле `discussion_chat_id` у канала | ✅ миграция `013_channel_discussion.sql`, модель `Chat` |
| Новый канал → автоматически группа «Обсуждение: …» | ✅ `CreateChannel` в `messaging/service.go` |
| Участник канала ↔ участник чата обсуждения | ✅ `AddMember` / `RemoveMember` синхронизируют связанную группу |
| Старые каналы без обсуждения | ✅ `POST /api/chats/{id}/ensure-discussion` (владелец/админ), `api.ensureChannelDiscussion` |
| UI: кнопка под постами канала | ✅ `MessageBubble` → «Обсуждение» |
| UI: инфо канала — открыть / создать обсуждение | ✅ `ChatInfoPanel` |

*Отдельный счётчик комментариев на каждый пост (как в ТЗ «(12)») не делался — одна общая группа на канал (MVP).*

## Раздел 26.4 — Видео и видеосообщения (кружки) (P1)

| Пункт ТЗ | Статус |
|----------|--------|
| Отдельный тип «обычное видео» vs «кружок» | ✅ тип **9** `MessageTypeVideoNote` на сервере; **2** = обычное видео |
| Видео из файла / галереи — прямоугольный плеер | ✅ `MessageBubble` + класс `mb-media-wrap--video-regular` |
| Запись с камеры (долгое нажатие в режиме видео) — кружок | ✅ `MessageInput` отправляет тип **9** |
| Круг, прогресс по обводке, клик по центру — play/pause, по кольцу — перемотка | ✅ `VideoNotePlayer.tsx` |
| Медиа в чате: видео включает type 2 и 9 | ✅ `GetChatMedia` |

## Раздел 26.6 — Стикеры на сервере (P2)

| Пункт ТЗ | Статус |
|----------|--------|
| Таблица `user_stickers`, API list / resolve / get / create / delete | ✅ миграция `014_user_stickers.sql`, `internal/userstickers`, маршруты `/api/stickers/*` |
| Формат в сообщении `sticker://u/<uuid>` | ✅ клиент: `encodeServerSticker`, `resolveStickerGlyph`, кэш + `POST /api/stickers/resolve` при загрузке истории |
| Панель «Мои»: облако + локальные | ✅ `StickerPanel`: загрузка через `upload` → `createSticker`, список с сервера, удаление из облака |
| Вёрстка: блок «Облако» не перекрывает вкладки наборов | ✅ шапка + `.st-panel__tabs` фиксированы, контент в `.st-panel__body` с вертикальным скроллом (`StickerPanel.css`) |
| Собеседник видит картинку; тап по облачному стикеру → набор отправителя | ✅ `GET /api/users/{id}/stickers`, `POST /api/stickers/import`, `UserStickerPackModal` + клик по `sticker://u/…` в пузыре |
| Именованные наборы (`user_sticker_packs`), автор = владелец; импорт набора и «все наборы» | ✅ миграция `015_sticker_packs.sql`, API `POST/GET/PATCH/DELETE /api/stickers/packs`, `POST .../import-pack`, `POST .../import-all`; UI: чипы наборов в `StickerPanel`, кнопки в модалке |

## Раздел 26.7 — Музыка и голосовые (P2)

| Пункт ТЗ | Статус |
|----------|--------|
| Голосовые: волны, скорость, без глобального плеера | ✅ `VoiceBubblePlayer` — локальный `<audio>`, `VOICE_SPEEDS`, не использует глобальный бар |
| Музыка (mp3/m4a…): тип сообщения **10** на сервере | ✅ `MessageTypeAudio` в `pkg/models`; push «🎵 Аудио» |
| Отправка: `voice.webm` → тип 4, иной `audio/*` → тип 10 | ✅ `MessageInput.detectMessageType` |
| Глобальный бар снизу при воспроизведении музыки | ✅ `MusicPlayerContext` + `MusicBottomBar`; `MusicBubblePlayer` в пузыре; убран верхний `AudioTopSheet` |
| Очередь треков + «Следующий» | ✅ новый трек при уже играющем — в **очередь**; по окончании трека — следующий из очереди; кнопка **SkipForward** в баре при `queueLength > 0`; подпись «ещё N в очереди» |
| Файлы как «аудио» в типе 3 (документ) | ✅ по-прежнему `MusicBubblePlayer` |
| ID3: название, исполнитель, обложка в пузыре и в глобальном плеере | ✅ `fetchAudioId3Tags`, поле `albumArt` в `MusicTrack`; Vite alias на `dist/jsmediatags.min.js` |

## Раздел 27 — Профиль на мобильных (адаптив)

| Пункт ТЗ | Статус |
|----------|--------|
| Настройки → Профиль: полная ширина, поля `box-sizing`, форма по центру | ✅ `sp-content--profile` в `SettingsPanel` + стили |
| Панель пользователя в чате (`UserProfilePanel`): safe-area, секции и кнопки на ширину экрана | ✅ `UserProfilePanel.css` (`@media max-width: 767px`); на мобильных **`createPortal(…, document.body)`** — иначе `position:fixed` внутри `.chatArea` с `transform` даёт узкую/смещённую колонку; `padding-top: env(safe-area-inset-top)`, класс `upp--portal` → `z-index: 200` |

## Раздел 23 — Liquid Glass

| Пункт ТЗ | Статус |
|----------|--------|
| backdrop-filter на ключевых панелях + fallback | ✅ `MainLayout.css` при `html[data-liquid-glass=on]` (сайдбар, шапка чата, поле ввода `.mi`, моб. нижняя навигация); `App.tsx`: `data-backdrop-support=yes|no` по `CSS.supports` |
| Переключатель в настройках | ✅ «Оформление» → **Энергосбережение** → «Жидкое стекло (Liquid Glass)» + подсказка про батарею |
| Список чатов: без жёстких разделителей, hover/active со «свечением» | ✅ `DialogList.css` при Liquid Glass: прозрачный `.dl`, ослабленные `.dl-separator`, стили `.dl-item` / `.dl-filter` |
| Поле ввода: акцент при фокусе | ✅ `.mi:focus-within` (обводка + внутренняя подсветка) при Liquid Glass |
| Модалки и оверлеи: размытый фон и «стекло» у карточек | ✅ `global.css`: `.modal-overlay` / `.modal`, `.cip-modal-*`, `.mi-poll-*`, `.chat-view__forward-*`, `.dl-dropdown`, `.dl-ctx` при `data-liquid-glass=on` + `@supports not (backdrop-filter)` fallback |

## Раздел 24 — Демонстрация экрана

| Пункт ТЗ | Статус |
|----------|--------|
| WebRTC / getDisplayMedia | ✅ `CallModal`; вне Electron — системный диалог |
| Electron: превью и выбор экрана/окна | ✅ `desktopCapturer` → IPC `dierchat:getDesktopSources`; **`ScreenSharePicker`**: «Экраны» / «Окна», превью |
| Захват по выбранному источнику | ✅ `getMediaStreamForDesktopSource` (`chromeMediaSource` + id) |
| Системный диалог из модалки (часто со звуком) | ✅ кнопка **«Системный выбор…»** → `getDisplayMedia` + тот же `applyScreenStream` |
| Предупреждение о приватности | ✅ `confirm` перед стартом |
| Индикатор «Вы транслируете», смена источника | ✅ баннер + «Источник» |
| Оптимизация исходящего видео экрана | ✅ `webrtcScreenTune.ts`: `contentHint = detail`, `maxBitrate` ~2.5 Мбит/с, `maxFramerate` 30 на `RTCRtpSender` |
| Отдельные вкладки Chrome / ручной выбор кодека H264 | ⚪ в браузере решает движок; отдельный UI не делался |

## Раздел 28 / 30 — Встроенный браузер (вкладки + DevTools)

Старый `InAppBrowser` (webview/Electron) **заменён** на **§30**: `BrowserPanel.tsx` + `BrowserPanel.css`, только **`<iframe>`** по вкладке, главная по умолчанию — Google (`browserNav.ts`).

| Пункт ТЗ | Статус |
|----------|--------|
| P0: оверлей, адресная строка, назад/вперёд (стек URL), обновить, домой (Google), закрыть, внешний браузер, HTTPS | ✅ `BrowserPanel.tsx` |
| Вкладки (макс. 10), «+», favicon (s2), заголовок, drag-and-drop, persist вкладок | ✅ `store` + `reorderInAppBrowserTabs`, `setInAppBrowserTabMeta`; persist `inAppBrowserTabs` / `activeTabId` |
| DevTools: вкладки «Консоль» / «Элементы», F12 / Ctrl+Shift+I, предупреждение; same-origin eval / HTML | ✅ `BrowserDevTools.tsx`; cross-origin — ограничение браузера (сообщение в UI) |
| Адаптив: ПК — DevTools справа ~50%; узкий экран — снизу | ✅ классы `wb-shell--desktop` / `--mobile`, медиа в `BrowserPanel.css` |
| ПКМ по области страницы → открыть DevTools (контекст с iframe cross-origin не перехватывается — есть кнопка и F12) | ⚠️ частично |
| §28.6 блокировка трекеров / загрузки | ⚪ переключатели сохраняются; логика — заглушка |
| Настройка: ссылки во встроенном vs системном | ✅ `SettingsPanel`; `useOpenHttpLink` |
| IPC внешнего URL (Electron) | ✅ `preload.openExternalUrl` |

## Прочее (кратко)

- PWA, уведомления — по коду в `DierCHAT-Desktop` (см. также прошлые коммиты). Истории — см. таблицу §26.2 выше.
- §26.7: **очередь и «следующий»** — ✅; **ID3 / обложка** — ✅ `jsmediatags` (`audioId3.ts`, кэш), обновление трека через `PATCH_TRACK` в `MusicPlayerProvider`; превью в `MusicBubblePlayer` и в нижнем баре.
- Полный паритет Telegram, расширенные анимации §23 (скролл/волны), E2E — **не** закрыты этим файлом.

*Обновлено по мере работ.*
