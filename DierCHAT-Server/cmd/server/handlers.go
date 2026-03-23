package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/dierchat/server/internal/auth"
	"github.com/dierchat/server/internal/bots"
	"github.com/dierchat/server/internal/friends"
	"github.com/dierchat/server/internal/media"
	"github.com/dierchat/server/internal/messaging"
	"github.com/dierchat/server/internal/news"
	"github.com/dierchat/server/internal/push"
	"github.com/dierchat/server/internal/stories"
	"github.com/dierchat/server/internal/userstickers"
	"github.com/dierchat/server/internal/ws"
	"github.com/dierchat/server/pkg/models"
)

type API struct {
	auth      *auth.Service
	messaging *messaging.Service
	media     *media.Service
	bots      *bots.Service
	news      *news.Service
	hub       *ws.Hub
	push      *push.Service
	stories   *stories.Service
	stickers  *userstickers.Service
	friends   *friends.Service
}

func NewAPI(a *auth.Service, m *messaging.Service, med *media.Service, b *bots.Service, n *news.Service, h *ws.Hub, pushSvc *push.Service, storySvc *stories.Service, stickerSvc *userstickers.Service, friendSvc *friends.Service) *API {
	return &API{auth: a, messaging: m, media: med, bots: b, news: n, hub: h, push: pushSvc, stories: storySvc, stickers: stickerSvc, friends: friendSvc}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (api *API) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", api.handleHealth)

	// Auth
	mux.HandleFunc("POST /api/auth/send-code", api.handleSendCode)
	mux.HandleFunc("POST /api/auth/verify", api.handleVerify)
	mux.HandleFunc("POST /api/auth/verify-2fa", api.handleVerify2FA)
	mux.HandleFunc("POST /api/auth/forgot-password", api.handleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", api.handleResetPassword)
	mux.HandleFunc("PUT /api/auth/password", api.withAuth(api.handleSetPassword))
	mux.HandleFunc("POST /api/auth/logout", api.withAuth(api.handleLogout))
	mux.HandleFunc("GET /api/auth/me", api.withAuth(api.handleMe))
	mux.HandleFunc("PUT /api/auth/profile", api.withAuth(api.handleUpdateProfile))
	mux.HandleFunc("GET /api/auth/sessions", api.withAuth(api.handleListSessions))
	mux.HandleFunc("POST /api/auth/sessions/terminate-all", api.withAuth(api.handleTerminateAllSessions))

	// Users
	mux.HandleFunc("GET /api/users/search", api.withAuth(api.handleSearchUsers))
	mux.HandleFunc("GET /api/users/{id}/stickers", api.withAuth(api.handleUserStickers))
	mux.HandleFunc("GET /api/users/{id}", api.withAuth(api.handleGetUser))
	mux.HandleFunc("GET /api/presence/peers", api.withAuth(api.handleGetPeersPresence))

	// Chats
	mux.HandleFunc("GET /api/chats", api.withAuth(api.handleGetChats))
	mux.HandleFunc("POST /api/chats/private", api.withAuth(api.handleCreatePrivateChat))
	mux.HandleFunc("POST /api/chats/group", api.withAuth(api.handleCreateGroup))
	mux.HandleFunc("POST /api/chats/channel", api.withAuth(api.handleCreateChannel))
	mux.HandleFunc("POST /api/chats/{id}/ensure-discussion", api.withAuth(api.handleEnsureChannelDiscussion))
	mux.HandleFunc("GET /api/chats/{id}/messages", api.withAuth(api.handleGetMessages))
	mux.HandleFunc("POST /api/chats/{id}/messages", api.withAuth(api.handleSendMessage))
	mux.HandleFunc("PUT /api/messages/{id}", api.withAuth(api.handleEditMessage))
	mux.HandleFunc("DELETE /api/messages/{id}", api.withAuth(api.handleDeleteMessage))
	mux.HandleFunc("GET /api/chats/{id}/members", api.withAuth(api.handleGetMembers))
	mux.HandleFunc("POST /api/chats/{id}/members", api.withAuth(api.handleAddMember))
	mux.HandleFunc("DELETE /api/chats/{id}/members/{uid}", api.withAuth(api.handleRemoveMember))
	mux.HandleFunc("PUT /api/chats/{id}/members/{uid}/role", api.withAuth(api.handleSetMemberRole))
	mux.HandleFunc("POST /api/chats/{id}/read", api.withAuth(api.handleMarkRead))
	mux.HandleFunc("POST /api/chats/{id}/typing", api.withAuth(api.handleTyping))
	mux.HandleFunc("PUT /api/chats/{id}/pin", api.withAuth(api.handlePinChat))
	mux.HandleFunc("PUT /api/chats/{id}/mute", api.withAuth(api.handleMuteChat))
	mux.HandleFunc("PUT /api/chats/{id}/archive", api.withAuth(api.handleArchiveChat))
	mux.HandleFunc("PUT /api/chats/{id}/title", api.withAuth(api.handleUpdateChatTitle))
	mux.HandleFunc("PUT /api/chats/{id}/slow-mode", api.withAuth(api.handleSetSlowMode))
	mux.HandleFunc("POST /api/chats/{id}/invite-link", api.withAuth(api.handleGenerateInviteLink))
	mux.HandleFunc("POST /api/invite/{code}", api.withAuth(api.handleJoinByInvite))
	mux.HandleFunc("GET /api/chats/{id}/media", api.withAuth(api.handleGetChatMedia))
	mux.HandleFunc("GET /api/chats/{id}/favorites", api.withAuth(api.handleGetChatFavorites))
	mux.HandleFunc("GET /api/chats/{id}/links", api.withAuth(api.handleGetChatLinks))
	mux.HandleFunc("GET /api/chats/{id}/voices", api.withAuth(api.handleGetChatVoices))
	mux.HandleFunc("GET /api/chats/{id}/search", api.withAuth(api.handleSearchInChat))
	mux.HandleFunc("GET /api/chats/{id}/pinned", api.withAuth(api.handleGetPinnedMessages))
	mux.HandleFunc("POST /api/messages/{id}/bookmark", api.withAuth(api.handleAddBookmark))
	mux.HandleFunc("DELETE /api/messages/{id}/bookmark", api.withAuth(api.handleRemoveBookmark))
	mux.HandleFunc("POST /api/messages/{id}/forward", api.withAuth(api.handleForwardMessage))
	mux.HandleFunc("POST /api/messages/{id}/reaction", api.withAuth(api.handleAddReaction))
	mux.HandleFunc("DELETE /api/messages/{id}/reaction", api.withAuth(api.handleRemoveReaction))
	mux.HandleFunc("PUT /api/messages/{id}/self-destruct", api.withAuth(api.handleSetSelfDestruct))
	mux.HandleFunc("PUT /api/chats/{id}/pin-message", api.withAuth(api.handlePinMessage))
	mux.HandleFunc("POST /api/chats/broadcast", api.withAuth(api.handleBroadcast))
	mux.HandleFunc("POST /api/chats/{id}/polls", api.withAuth(api.handleCreatePoll))
	mux.HandleFunc("POST /api/polls/{id}/vote", api.withAuth(api.handleVotePoll))
	mux.HandleFunc("GET /api/polls/{id}", api.withAuth(api.handleGetPoll))

	// Block
	mux.HandleFunc("POST /api/users/{id}/block", api.withAuth(api.handleBlockUser))
	mux.HandleFunc("DELETE /api/users/{id}/block", api.withAuth(api.handleUnblockUser))
	mux.HandleFunc("GET /api/users/blocked", api.withAuth(api.handleGetBlockedUsers))

	// Friends (истории только между принятыми друзьями)
	mux.HandleFunc("GET /api/friends", api.withAuth(api.handleFriendsList))
	mux.HandleFunc("GET /api/friends/incoming", api.withAuth(api.handleFriendsIncoming))
	mux.HandleFunc("GET /api/friends/outgoing", api.withAuth(api.handleFriendsOutgoing))
	mux.HandleFunc("POST /api/friends/request", api.withAuth(api.handleFriendsRequest))
	mux.HandleFunc("POST /api/friends/accept", api.withAuth(api.handleFriendsAccept))
	mux.HandleFunc("POST /api/friends/decline", api.withAuth(api.handleFriendsDecline))
	mux.HandleFunc("POST /api/friends/cancel", api.withAuth(api.handleFriendsCancel))
	mux.HandleFunc("DELETE /api/friends/{id}", api.withAuth(api.handleFriendsRemove))

	// News
	mux.HandleFunc("POST /api/news/subscribe", api.withAuth(api.handleNewsSubscribe))
	mux.HandleFunc("POST /api/news/unsubscribe", api.withAuth(api.handleNewsUnsubscribe))
	mux.HandleFunc("POST /api/news/send", api.withAuth(api.handleNewsSend))

	// Reports (moderation)
	mux.HandleFunc("POST /api/reports", api.withAuth(api.handleCreateReport))
	mux.HandleFunc("GET /api/reports", api.withAuth(api.handleListReports))

	// Media
	mux.HandleFunc("POST /api/upload", api.withAuth(api.handleUpload))
	mux.HandleFunc("GET /media/", api.handleServeMedia)

	// Link preview (OpenGraph)
	mux.HandleFunc("GET /api/og", api.withAuth(api.handleGetOG))

	// Search
	mux.HandleFunc("GET /api/search/messages", api.withAuth(api.handleSearchMessages))

	// Push
	mux.HandleFunc("GET /api/push/vapid-public", api.withAuth(api.handlePushVAPIDPublic))
	mux.HandleFunc("POST /api/push/subscribe", api.withAuth(api.handlePushSubscribe))

	// Bots
	mux.HandleFunc("POST /api/bots", api.withAuth(api.handleCreateBot))
	mux.HandleFunc("GET /api/bots", api.withAuth(api.handleListBots))
	mux.HandleFunc("POST /api/bots/{id}/webhook", api.withAuth(api.handleSetWebhook))
	mux.HandleFunc("POST /api/bots/{id}/miniapps", api.withAuth(api.handleCreateMiniApp))

	// Stories (§26.2)
	mux.HandleFunc("GET /api/stories/feed", api.withAuth(api.handleStoriesFeed))
	mux.HandleFunc("POST /api/stories", api.withAuth(api.handleCreateStory))
	mux.HandleFunc("POST /api/stories/{id}/view", api.withAuth(api.handleStoryRecordView))

	// Stickers (§26.6) — пользовательская библиотека на сервере
	mux.HandleFunc("GET /api/stickers/mine", api.withAuth(api.handleStickersMine))
	mux.HandleFunc("POST /api/stickers/resolve", api.withAuth(api.handleStickersResolve))
	mux.HandleFunc("POST /api/stickers/packs", api.withAuth(api.handleStickerPackCreate))
	mux.HandleFunc("PATCH /api/stickers/packs/{id}", api.withAuth(api.handleStickerPackPatch))
	mux.HandleFunc("DELETE /api/stickers/packs/{id}", api.withAuth(api.handleStickerPackDelete))
	mux.HandleFunc("POST /api/stickers/import-all", api.withAuth(api.handleStickerImportAll))
	mux.HandleFunc("POST /api/stickers/import-pack", api.withAuth(api.handleStickerImportPack))
	mux.HandleFunc("POST /api/stickers/import", api.withAuth(api.handleStickerImport))
	mux.HandleFunc("GET /api/stickers/{id}", api.withAuth(api.handleStickerGet))
	mux.HandleFunc("POST /api/stickers", api.withAuth(api.handleStickerCreate))
	mux.HandleFunc("DELETE /api/stickers/{id}", api.withAuth(api.handleStickerDelete))

	// WebSocket
	mux.HandleFunc("GET /ws", api.handleWebSocket)

	// Web client (SPA)
	mux.HandleFunc("GET /", api.handleWebApp)

	return corsMiddleware(mux)
}

// --- Auth handlers ---

func (api *API) handleSendCode(w http.ResponseWriter, r *http.Request) {
	var req struct{ Email string `json:"email"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат запроса", 400)
		return
	}
	if err := api.auth.SendCode(r.Context(), req.Email); err != nil {
		log.Printf("send-code: %v", err)
		jsonError(w, "Ошибка отправки кода", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "code_sent"})
}

func (api *API) handleVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email  string `json:"email"`
		Code   string `json:"code"`
		Device string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат запроса", 400)
		return
	}

	res, err := api.auth.VerifyCode(r.Context(), req.Email, req.Code, req.Device, r.RemoteAddr)
	if err != nil {
		if errors.Is(err, auth.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна: нет подключения к PostgreSQL. Запустите БД и перезапустите сервер (см. DierCHAT-Server/README.md и docker-compose.local.yml).", 503)
			return
		}
		if errors.Is(err, auth.ErrTooManyAttempts) {
			jsonError(w, "Слишком много попыток ввода кода. Подождите 10 минут.", 429)
			return
		}
		jsonError(w, "Неверный код подтверждения", 401)
		return
	}

	if res.Needs2FA {
		jsonOK(w, map[string]interface{}{
			"needs_2fa": true, "temp_2fa": res.Temp2FA, "user": res.User,
		})
		return
	}
	jsonOK(w, map[string]interface{}{"user": res.User, "token": res.Token})
}

func (api *API) handleVerify2FA(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Temp2FA string `json:"temp_2fa"`
		Password string `json:"password"`
		Device  string `json:"device"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	user, token, err := api.auth.Verify2FA(r.Context(), req.Temp2FA, req.Password, req.Device, r.RemoteAddr)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidPassword) {
			jsonError(w, "Неверный пароль", 401)
			return
		}
		jsonError(w, "Неверный или истёкший код. Начните вход заново.", 401)
		return
	}
	jsonOK(w, map[string]interface{}{"user": user, "token": token})
}

func (api *API) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct{ Email string `json:"email"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.auth.SendPasswordResetCode(r.Context(), req.Email); err != nil {
		jsonError(w, "Ошибка отправки кода", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "code_sent"})
}

func (api *API) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.auth.ResetPassword(r.Context(), req.Email, req.Code, req.NewPassword); err != nil {
		if errors.Is(err, auth.ErrInvalidCode) {
			jsonError(w, "Неверный код", 401)
			return
		}
		if errors.Is(err, auth.ErrCodeExpired) {
			jsonError(w, "Код истёк. Запросите новый.", 401)
			return
		}
		jsonError(w, "Ошибка сброса пароля", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleSetPassword(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Password string `json:"password"`
		Current  string `json:"current,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	has, _ := api.auth.HasPassword(r.Context(), user.ID)
	if has && req.Current == "" {
		jsonError(w, "Введите текущий пароль", 400)
		return
	}
	if err := api.auth.SetPassword(r.Context(), user.ID, req.Password); err != nil {
		jsonError(w, "Ошибка сохранения пароля", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	token := extractToken(r)
	api.auth.Logout(r.Context(), token)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleMe(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	jsonOK(w, user)
}

func (api *API) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		DisplayName string `json:"display_name"`
		Username    string `json:"username"`
		Bio         string `json:"bio"`
		AvatarURL   *string `json:"avatar_url,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.auth.UpdateProfile(r.Context(), user.ID, req.DisplayName, req.Username, req.Bio, req.AvatarURL); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			jsonError(w, "Имя пользователя уже занято", 400)
			return
		}
		log.Printf("UpdateProfile error: %v", err)
		jsonError(w, "Ошибка обновления профиля", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleListSessions(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	sessions, err := api.auth.ListSessions(r.Context(), user.ID)
	if err != nil {
		jsonError(w, "Ошибка получения сессий", 500)
		return
	}
	jsonOK(w, sessions)
}

func (api *API) handleTerminateAllSessions(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	if err := api.auth.TerminateAllSessions(r.Context(), user.ID); err != nil {
		jsonError(w, "Ошибка завершения сессий", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// --- User handlers ---

func (api *API) handleSearchUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		jsonOK(w, []interface{}{})
		return
	}
	users, err := api.auth.SearchUsers(r.Context(), q, 50)
	if err != nil {
		jsonError(w, "Ошибка поиска", 500)
		return
	}
	jsonOK(w, users)
}

func (api *API) handleGetUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	user, err := api.auth.GetUser(r.Context(), id)
	if err != nil {
		jsonError(w, "Пользователь не найден", 404)
		return
	}
	jsonOK(w, user)
}

// handleUserStickers — набор стикеров пользователя (для просмотра / добавления к себе, §26.6).
func (api *API) handleUserStickers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	targetID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	packs, err := api.stickers.ListByUserID(r.Context(), targetID)
	if err != nil {
		log.Printf("user stickers: %v", err)
		jsonError(w, "Ошибка загрузки стикеров", 500)
		return
	}
	if packs == nil {
		packs = []userstickers.PackWithStickers{}
	}
	u, uerr := api.auth.GetUser(r.Context(), targetID)
	displayName := ""
	if uerr == nil && u != nil {
		displayName = u.DisplayName
	}
	jsonOK(w, map[string]interface{}{
		"author": map[string]string{
			"user_id":      targetID.String(),
			"display_name": displayName,
		},
		"packs": packs,
	})
}

// handleGetPeersPresence — кто из собеседников в личных чатах сейчас с открытым WS (ТЗ §4: статус онлайн в списке).
func (api *API) handleGetPeersPresence(w http.ResponseWriter, r *http.Request) {
	me := r.Context().Value(ctxUserKey).(*models.User)
	ctx := r.Context()
	chats, err := api.messaging.GetUserChats(ctx, me.ID)
	if err != nil {
		jsonError(w, "Ошибка чатов", 500)
		return
	}
	seen := make(map[uuid.UUID]struct{})
	var online []string
	for _, c := range chats {
		if c.Type != models.ChatTypePrivate {
			continue
		}
		members, err := api.messaging.GetChatMembers(ctx, c.ID)
		if err != nil {
			continue
		}
		for _, m := range members {
			if m.UserID == me.ID {
				continue
			}
			if _, ok := seen[m.UserID]; ok {
				continue
			}
			seen[m.UserID] = struct{}{}
			if api.hub.IsOnline(m.UserID) {
				online = append(online, m.UserID.String())
			}
		}
	}
	jsonOK(w, map[string][]string{"online_user_ids": online})
}

// --- Chat handlers ---

func (api *API) handleGetChats(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chats, err := api.messaging.GetUserChatsEnriched(r.Context(), user.ID)
	if err != nil {
		jsonError(w, "Ошибка получения чатов", 500)
		return
	}
	if chats == nil {
		chats = []messaging.ChatEnriched{}
	}
	saved, err := api.messaging.GetOrCreateSavedMessagesChat(r.Context(), user.ID)
	if err == nil && saved != nil {
		chats = append([]messaging.ChatEnriched{*saved}, chats...)
	}
	jsonOK(w, chats)
}

func (api *API) handleCreatePrivateChat(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct{ UserID uuid.UUID `json:"user_id"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chat, err := api.messaging.CreatePrivateChat(r.Context(), user.ID, req.UserID)
	if err != nil {
		jsonError(w, "Ошибка создания чата", 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chat.ID)
	jsonOK(w, chat)
}

func (api *API) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Title       string      `json:"title"`
		Description string      `json:"description"`
		Members     []uuid.UUID `json:"members"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chat, err := api.messaging.CreateGroup(r.Context(), user.ID, req.Title, req.Description, req.Members)
	if err != nil {
		jsonError(w, "Ошибка создания группы", 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chat.ID)
	jsonOK(w, chat)
}

func (api *API) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		IsPublic    bool   `json:"is_public"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chat, err := api.messaging.CreateChannel(r.Context(), user.ID, req.Title, req.Description, req.IsPublic)
	if err != nil {
		msg := err.Error()
		if len(msg) > 400 {
			msg = msg[:400] + "…"
		}
		jsonError(w, "Ошибка создания канала: "+msg, 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chat.ID)
	if chat.DiscussionChatID != nil {
		api.refreshHubChatMembers(r.Context(), *chat.DiscussionChatID)
	}
	jsonOK(w, chat)
}

func (api *API) handleEnsureChannelDiscussion(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	discID, err := api.messaging.EnsureChannelDiscussion(r.Context(), chatID, user.ID)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	api.refreshHubChatMembers(r.Context(), discID)
	jsonOK(w, map[string]string{"discussion_chat_id": discID.String(), "status": "ok"})
}

func (api *API) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}

	// Первая страница: верхняя граница чуть в будущем, чтобы не отрезать сообщения
	// из‑за рассинхрона часов БД/приложения (created_at < before).
	before := time.Now().UTC().Add(2 * time.Minute)
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339, b); err == nil {
			before = t
		}
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	msgs, err := api.messaging.GetMessages(r.Context(), chatID, before, limit)
	if err != nil {
		jsonError(w, "Ошибка получения сообщений", 500)
		return
	}
	if msgs == nil {
		msgs = []models.Message{}
	}
	jsonOK(w, msgs)
}

// handleSendMessage — поле text передаётся в messaging как raw UTF-8 (ТЗ §46, без trim на уровне HTTP).
func (api *API) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}

	var req struct {
		Type    int        `json:"type"`
		Text    string     `json:"text"`
		ReplyTo *uuid.UUID `json:"reply_to,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}

	msg, err := api.messaging.SendMessage(r.Context(), chatID, user.ID, models.MessageType(req.Type), req.Text, req.ReplyTo)
	if err != nil {
		jsonError(w, "Ошибка отправки сообщения", 500)
		return
	}

	api.broadcastNewMessage(r.Context(), chatID, msg, user)
	jsonOK(w, msg)
}

func (api *API) handleEditMessage(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct{ Text string `json:"text"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.messaging.EditMessage(r.Context(), msgID, user.ID, req.Text); err != nil {
		jsonError(w, "Ошибка редактирования", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	if err := api.messaging.DeleteMessage(r.Context(), msgID, user.ID); err != nil {
		jsonError(w, "Ошибка удаления", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleForwardMessage(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct {
		ChatIDs           []string `json:"chat_ids"`
		HideForwardAuthor bool     `json:"hide_forward_author"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.ChatIDs) == 0 {
		jsonError(w, "Укажите chat_ids", 400)
		return
	}
	var chatIDs []uuid.UUID
	for _, s := range req.ChatIDs {
		u, e := uuid.Parse(s)
		if e != nil {
			continue
		}
		chatIDs = append(chatIDs, u)
	}
	if len(chatIDs) == 0 {
		jsonError(w, "Неверные chat_ids", 400)
		return
	}
	msgs, err := api.messaging.ForwardMessage(r.Context(), uuid.Nil, user.ID, msgID, chatIDs, req.HideForwardAuthor)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	for _, m := range msgs {
		api.broadcastNewMessage(r.Context(), m.ChatID, m, nil)
	}
	jsonOK(w, msgs)
}

func (api *API) handlePinMessage(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	var req struct {
		MessageID uuid.UUID `json:"message_id"`
		Pinned    bool      `json:"pinned"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if req.Pinned {
		err = api.messaging.PinMessage(r.Context(), chatID, req.MessageID, user.ID)
	} else {
		err = api.messaging.UnpinMessage(r.Context(), chatID, req.MessageID)
	}
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleAddReaction(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.messaging.AddReaction(r.Context(), msgID, user.ID, req.Emoji); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	if chatID, err := api.messaging.GetMessageChatID(r.Context(), msgID); err == nil && chatID != uuid.Nil {
		if reactions, err := api.messaging.GetMessageReactions(r.Context(), msgID); err == nil {
			payload, _ := json.Marshal(map[string]interface{}{
				"message_id": msgID.String(),
				"reactions": reactions,
			})
			api.hub.SendToChat(chatID, &ws.Event{Type: ws.EventReactionUpdate, ChatID: chatID, Payload: payload})
		}
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleRemoveReaction(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	if err := api.messaging.RemoveReaction(r.Context(), msgID, user.ID); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	if chatID, err := api.messaging.GetMessageChatID(r.Context(), msgID); err == nil && chatID != uuid.Nil {
		if reactions, err := api.messaging.GetMessageReactions(r.Context(), msgID); err == nil {
			payload, _ := json.Marshal(map[string]interface{}{
				"message_id": msgID.String(),
				"reactions": reactions,
			})
			api.hub.SendToChat(chatID, &ws.Event{Type: ws.EventReactionUpdate, ChatID: chatID, Payload: payload})
		}
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleSearchInChat(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		jsonOK(w, []interface{}{})
		return
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	msgs, err := api.messaging.SearchMessagesInChat(r.Context(), chatID, user.ID, q, limit)
	if err != nil {
		jsonError(w, "Ошибка поиска", 500)
		return
	}
	if msgs == nil {
		msgs = []models.Message{}
	}
	jsonOK(w, msgs)
}

func (api *API) handleGetPinnedMessages(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	msgs, err := api.messaging.GetPinnedMessages(r.Context(), chatID, user.ID, limit)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	if msgs == nil {
		msgs = []models.Message{}
	}
	jsonOK(w, msgs)
}

func (api *API) handleGetMembers(w http.ResponseWriter, r *http.Request) {
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	members, err := api.messaging.GetChatMembers(r.Context(), chatID)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, members)
}

func (api *API) handleAddMember(w http.ResponseWriter, r *http.Request) {
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct{ UserID uuid.UUID `json:"user_id"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.messaging.AddMember(r.Context(), chatID, req.UserID, models.MemberRoleMember); err != nil {
		jsonError(w, "Ошибка добавления", 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chatID)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	uid, err := uuid.Parse(r.PathValue("uid"))
	if err != nil {
		jsonError(w, "Неверный ID участника", 400)
		return
	}
	if err := api.messaging.RemoveMember(r.Context(), chatID, uid); err != nil {
		jsonError(w, "Ошибка удаления", 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chatID)
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct{ MessageID uuid.UUID `json:"message_id"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	api.messaging.MarkRead(r.Context(), chatID, user.ID, req.MessageID)

	payload, _ := json.Marshal(map[string]interface{}{
		"user_id": user.ID, "message_id": req.MessageID, "chat_id": chatID,
	})
	api.hub.SendToChat(chatID, &ws.Event{
		Type:    ws.EventReadReceipt,
		ChatID:  chatID,
		Payload: payload,
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleTyping(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{"user_id": user.ID, "display_name": user.DisplayName})
	api.hub.SendToChat(chatID, &ws.Event{
		Type:    ws.EventTyping,
		Payload: payload,
	})
	jsonOK(w, map[string]string{"status": "ok"})
}

// --- Chat actions ---

func (api *API) handlePinChat(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	var req struct{ Pinned bool `json:"pinned"` }
	json.NewDecoder(r.Body).Decode(&req)
	if err := api.messaging.PinChat(r.Context(), chatID, user.ID, req.Pinned); err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleMuteChat(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	var req struct{ Muted bool `json:"muted"` }
	json.NewDecoder(r.Body).Decode(&req)
	if err := api.messaging.MuteChat(r.Context(), chatID, user.ID, req.Muted); err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleArchiveChat(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	var req struct{ Archived bool `json:"archived"` }
	json.NewDecoder(r.Body).Decode(&req)
	if err := api.messaging.ArchiveChat(r.Context(), chatID, user.ID, req.Archived); err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleUpdateChatTitle(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	var req struct{ Title string `json:"title"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный запрос", 400); return
	}
	if err := api.messaging.UpdateChatTitle(r.Context(), chatID, user.ID, strings.TrimSpace(req.Title)); err != nil {
		jsonError(w, err.Error(), 403); return
	}
	payload, _ := json.Marshal(map[string]interface{}{"title": strings.TrimSpace(req.Title)})
	api.hub.SendToChat(chatID, &ws.Event{Type: ws.EventChatUpdated, ChatID: chatID, Payload: payload})
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleSetSlowMode(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	var req struct {
		Seconds int `json:"seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if req.Seconds < 0 || req.Seconds > 3600 {
		jsonError(w, "Интервал от 0 до 3600 сек", 400)
		return
	}
	var role int
	err = api.messaging.DB().Pool.QueryRow(r.Context(),
		`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
		chatID, user.ID).Scan(&role)
	if err != nil || (role != 1 && role != 2) {
		jsonError(w, "Нет прав", 403)
		return
	}
	_, err = api.messaging.DB().Pool.Exec(r.Context(),
		`UPDATE chats SET slow_mode_seconds = $2 WHERE id = $1`, chatID, req.Seconds)
	if err != nil {
		jsonError(w, "Ошибка обновления", 500)
		return
	}
	jsonOK(w, map[string]interface{}{"status": "ok", "slow_mode_seconds": req.Seconds})
}

func (api *API) handleGenerateInviteLink(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var role int
	err = api.messaging.DB().Pool.QueryRow(r.Context(),
		`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
		chatID, user.ID).Scan(&role)
	if err != nil || (role != 1 && role != 2) {
		jsonError(w, "Нет прав", 403)
		return
	}
	code := uuid.New().String()[:8]
	_, err = api.messaging.DB().Pool.Exec(r.Context(),
		`UPDATE chats SET invite_link = $2 WHERE id = $1`, chatID, code)
	if err != nil {
		jsonError(w, "Ошибка генерации", 500)
		return
	}
	jsonOK(w, map[string]string{"invite_link": code})
}

func (api *API) handleJoinByInvite(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	code := r.PathValue("code")
	var chatID uuid.UUID
	err := api.messaging.DB().Pool.QueryRow(r.Context(),
		`SELECT id FROM chats WHERE invite_link = $1 AND deleted_at IS NULL`, code).Scan(&chatID)
	if err != nil {
		jsonError(w, "Ссылка недействительна", 404)
		return
	}
	if err := api.messaging.AddMember(r.Context(), chatID, user.ID, models.MemberRoleMember); err != nil {
		jsonError(w, "Ошибка вступления", 500)
		return
	}
	api.refreshHubChatMembers(r.Context(), chatID)
	jsonOK(w, map[string]string{"status": "joined", "chat_id": chatID.String()})
}

func (api *API) handleGetChatMedia(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	msgType := r.URL.Query().Get("type")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, _ := strconv.Atoi(l); n > 0 && n <= 100 { limit = n }
	}
	msgs, err := api.messaging.GetChatMedia(r.Context(), chatID, user.ID, msgType, limit)
	if err != nil { jsonError(w, "Ошибка", 500); return }
	if msgs == nil { msgs = []models.Message{} }
	jsonOK(w, msgs)
}

func (api *API) handleGetChatFavorites(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, _ := strconv.Atoi(l); n > 0 && n <= 100 { limit = n }
	}
	msgs, err := api.messaging.GetChatFavorites(r.Context(), chatID, user.ID, limit)
	if err != nil { jsonError(w, "Ошибка", 500); return }
	if msgs == nil { msgs = []models.Message{} }
	jsonOK(w, msgs)
}

func (api *API) handleGetChatLinks(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, _ := strconv.Atoi(l); n > 0 && n <= 100 { limit = n }
	}
	msgs, err := api.messaging.GetChatLinks(r.Context(), chatID, user.ID, limit)
	if err != nil { jsonError(w, "Ошибка", 500); return }
	if msgs == nil { msgs = []models.Message{} }
	jsonOK(w, msgs)
}

func (api *API) handleGetChatVoices(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, _ := strconv.Atoi(l); n > 0 && n <= 100 { limit = n }
	}
	msgs, err := api.messaging.GetChatVoices(r.Context(), chatID, user.ID, limit)
	if err != nil { jsonError(w, "Ошибка", 500); return }
	if msgs == nil { msgs = []models.Message{} }
	jsonOK(w, msgs)
}

func (api *API) handleAddBookmark(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	if err := api.messaging.AddBookmark(r.Context(), user.ID, msgID); err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleRemoveBookmark(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	if err := api.messaging.RemoveBookmark(r.Context(), user.ID, msgID); err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleBroadcast(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		ChatIDs     []uuid.UUID `json:"chat_ids"`
		ContentType string      `json:"content_type"`
		Text        string      `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if len(req.ChatIDs) == 0 {
		jsonError(w, "Укажите хотя бы один чат", 400)
		return
	}
	if len(req.ChatIDs) > 50 {
		jsonError(w, "Не более 50 чатов за раз", 400)
		return
	}
	results, err := api.messaging.Broadcast(r.Context(), user.ID, req.ChatIDs, req.ContentType, req.Text)
	if err != nil {
		jsonError(w, "Ошибка рассылки", 500)
		return
	}
	for _, res := range results {
		if res.OK && res.Msg != nil {
			api.broadcastNewMessage(r.Context(), res.ChatID, res.Msg, user)
		}
	}
	jsonOK(w, map[string]interface{}{"results": results})
}

// --- Polls ---
func (api *API) handleCreatePoll(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID чата", 400)
		return
	}
	var req struct {
		Question       string   `json:"question"`
		Options        []string `json:"options"`
		AllowsMultiple bool     `json:"allows_multiple"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	msg, poll, err := api.messaging.CreatePoll(r.Context(), chatID, user.ID, req.Question, req.Options, req.AllowsMultiple)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	msg.Poll = poll
	api.broadcastNewMessage(r.Context(), chatID, msg, user)
	jsonOK(w, map[string]interface{}{"message": msg, "poll": poll})
}

func (api *API) handleVotePoll(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct {
		OptionIDs []uuid.UUID `json:"option_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.messaging.VotePoll(r.Context(), msgID, user.ID, req.OptionIDs); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleGetPoll(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	res, err := api.messaging.GetPollWithResults(r.Context(), msgID, user.ID)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	if res == nil {
		jsonError(w, "Опрос не найден", 404)
		return
	}
	for i, c := range res.OptionCounts {
		if i < len(res.Poll.Options) {
			res.Poll.Options[i].VoteCount = c
		}
	}
	jsonOK(w, res)
}

// --- News ---
func (api *API) handleNewsSubscribe(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		ChatID string `json:"chat_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chatID, err := uuid.Parse(req.ChatID)
	if err != nil {
		jsonError(w, "Неверный chat_id", 400)
		return
	}
	if err := api.news.Subscribe(r.Context(), user.ID, chatID); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleNewsUnsubscribe(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		ChatID string `json:"chat_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chatID, err := uuid.Parse(req.ChatID)
	if err != nil {
		jsonError(w, "Неверный chat_id", 400)
		return
	}
	if err := api.news.Unsubscribe(r.Context(), user.ID, chatID); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleNewsSend(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		ChatID string `json:"chat_id"`
		Text   string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	chatID, err := uuid.Parse(req.ChatID)
	if err != nil {
		jsonError(w, "Неверный chat_id", 400)
		return
	}
	msg, err := api.messaging.SendMessage(r.Context(), chatID, user.ID, models.MessageTypeText, req.Text, nil)
	if err != nil {
		jsonError(w, "Ошибка отправки", 500)
		return
	}
	api.broadcastNewMessage(r.Context(), chatID, msg, user)
	jsonOK(w, map[string]interface{}{"message": msg})
}

// --- Reports ---
func (api *API) handleCreateReport(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		TargetType string `json:"target_type"`
		TargetID   string `json:"target_id"`
		Reason     string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if req.TargetType != "user" && req.TargetType != "message" && req.TargetType != "chat" {
		jsonError(w, "target_type должен быть user, message или chat", 400)
		return
	}
	if err := api.messaging.CreateReport(r.Context(), user.ID, req.TargetType, req.TargetID, req.Reason); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleListReports(w http.ResponseWriter, r *http.Request) {
	list, err := api.messaging.ListReports(r.Context(), 50)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, list)
}

func (api *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]interface{}{
		"ok":      true,
		"service": "dierchat",
		"ts":      time.Now().UTC().Format(time.RFC3339Nano),
	})
}

// --- Media handler ---

func (api *API) handleUpload(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	r.ParseMultipartForm(2 << 30)

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "Ошибка загрузки файла", 400)
		return
	}
	defer file.Close()

	result, err := api.media.Upload(r.Context(), user.ID, header.Filename, header.Header.Get("Content-Type"), file)
	if err != nil {
		jsonError(w, "Ошибка сохранения файла", 500)
		return
	}
	jsonOK(w, result)
}

func (api *API) handleServeMedia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/media/")
	http.ServeFile(w, r, "./media/"+path)
}

// --- Search ---

func (api *API) handleSearchMessages(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	q := r.URL.Query().Get("q")
	if q == "" {
		jsonOK(w, []interface{}{})
		return
	}
	msgs, err := api.messaging.SearchMessages(r.Context(), user.ID, q, 50)
	if err != nil {
		jsonError(w, "Ошибка поиска", 500)
		return
	}
	jsonOK(w, msgs)
}

// --- Bots ---

func (api *API) handleCreateBot(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	bot, err := api.bots.CreateBot(r.Context(), user.ID, req.Username, req.DisplayName, req.Description)
	if err != nil {
		jsonError(w, "Ошибка создания бота", 500)
		return
	}
	jsonOK(w, bot)
}

func (api *API) handleListBots(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	list, err := api.bots.ListBotsByOwner(r.Context(), user.ID)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, list)
}

func (api *API) handleSetWebhook(w http.ResponseWriter, r *http.Request) {
	botID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct{ URL string `json:"url"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if err := api.bots.SetWebhook(r.Context(), botID, req.URL); err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleCreateMiniApp(w http.ResponseWriter, r *http.Request) {
	botID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct {
		Title       string `json:"title"`
		URL         string `json:"url"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	app, err := api.bots.CreateMiniApp(r.Context(), botID, req.Title, req.URL, req.Description)
	if err != nil {
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, app)
}

// --- Stories ---

func (api *API) handleStoriesFeed(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	list, err := api.stories.ListFeed(r.Context(), user.ID)
	if err != nil {
		log.Printf("stories feed: %v", err)
		jsonError(w, "Ошибка загрузки историй", 500)
		return
	}
	if list == nil {
		list = []stories.Story{}
	}
	jsonOK(w, list)
}

func (api *API) handleCreateStory(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		MediaURL  string `json:"media_url"`
		MediaKind int    `json:"media_kind"`
		Caption   string `json:"caption"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	st, err := api.stories.Create(r.Context(), user.ID, req.MediaURL, req.MediaKind, req.Caption)
	if err != nil {
		if errors.Is(err, stories.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, st)
}

func (api *API) handleStoryRecordView(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	sid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	err = api.stories.RecordView(r.Context(), sid, user.ID)
	if err != nil {
		if errors.Is(err, stories.ErrNotFound) {
			jsonError(w, "История не найдена", 404)
			return
		}
		if errors.Is(err, stories.ErrForbidden) {
			jsonError(w, "Нет доступа", 403)
			return
		}
		if errors.Is(err, stories.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("story view: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// --- Friends ---

func (api *API) handleFriendsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	list, err := api.friends.ListAccepted(r.Context(), user.ID)
	if err != nil {
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonOK(w, []friends.Profile{})
			return
		}
		log.Printf("friends list: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	if list == nil {
		list = []friends.Profile{}
	}
	jsonOK(w, list)
}

func (api *API) handleFriendsIncoming(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	list, err := api.friends.ListIncoming(r.Context(), user.ID)
	if err != nil {
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonOK(w, []friends.Profile{})
			return
		}
		log.Printf("friends incoming: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	if list == nil {
		list = []friends.Profile{}
	}
	jsonOK(w, list)
}

func (api *API) handleFriendsOutgoing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	list, err := api.friends.ListOutgoing(r.Context(), user.ID)
	if err != nil {
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonOK(w, []friends.Profile{})
			return
		}
		log.Printf("friends outgoing: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	if list == nil {
		list = []friends.Profile{}
	}
	jsonOK(w, list)
}

func (api *API) handleFriendsRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	other, err := uuid.Parse(strings.TrimSpace(req.UserID))
	if err != nil {
		jsonError(w, "Неверный user_id", 400)
		return
	}
	err = api.friends.SendRequest(r.Context(), user.ID, other)
	if err != nil {
		switch {
		case errors.Is(err, friends.ErrSelf):
			jsonError(w, "Нельзя добавить себя", 400)
		case errors.Is(err, friends.ErrBlocked):
			jsonError(w, "Пользователь недоступен", 403)
		case errors.Is(err, friends.ErrExists):
			jsonError(w, "Заявка уже отправлена", 409)
		case errors.Is(err, friends.ErrAlready):
			jsonError(w, "Уже в друзьях", 409)
		case errors.Is(err, friends.ErrDBUnavailable):
			jsonError(w, "База данных недоступна", 503)
		default:
			log.Printf("friends request: %v", err)
			jsonError(w, "Ошибка", 500)
		}
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleFriendsAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		RequesterID string `json:"requester_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	rid, err := uuid.Parse(strings.TrimSpace(req.RequesterID))
	if err != nil {
		jsonError(w, "Неверный requester_id", 400)
		return
	}
	err = api.friends.Accept(r.Context(), user.ID, rid)
	if err != nil {
		if errors.Is(err, friends.ErrNotFound) {
			jsonError(w, "Заявка не найдена", 404)
			return
		}
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("friends accept: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleFriendsDecline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		RequesterID string `json:"requester_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	rid, err := uuid.Parse(strings.TrimSpace(req.RequesterID))
	if err != nil {
		jsonError(w, "Неверный requester_id", 400)
		return
	}
	err = api.friends.Decline(r.Context(), user.ID, rid)
	if err != nil {
		if errors.Is(err, friends.ErrNotFound) {
			jsonError(w, "Заявка не найдена", 404)
			return
		}
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("friends decline: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleFriendsCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	other, err := uuid.Parse(strings.TrimSpace(req.UserID))
	if err != nil {
		jsonError(w, "Неверный user_id", 400)
		return
	}
	err = api.friends.CancelOutgoing(r.Context(), user.ID, other)
	if err != nil {
		if errors.Is(err, friends.ErrNotFound) {
			jsonError(w, "Заявка не найдена", 404)
			return
		}
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("friends cancel: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleFriendsRemove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	user := r.Context().Value(ctxUserKey).(*models.User)
	other, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	err = api.friends.Remove(r.Context(), user.ID, other)
	if err != nil {
		if errors.Is(err, friends.ErrNotFound) {
			jsonError(w, "Не в друзьях", 404)
			return
		}
		if errors.Is(err, friends.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("friends remove: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// --- User stickers (§26.6) ---

func (api *API) handleStickersMine(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	packs, err := api.stickers.ListMine(r.Context(), user.ID)
	if err != nil {
		log.Printf("stickers mine: %v", err)
		jsonError(w, "Ошибка загрузки стикеров", 500)
		return
	}
	if packs == nil {
		packs = []userstickers.PackWithStickers{}
	}
	jsonOK(w, map[string]interface{}{"packs": packs})
}

func (api *API) handleStickerGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "Метод не поддерживается", 405)
		return
	}
	sid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	st, err := api.stickers.GetByID(r.Context(), sid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Не найдено", 404)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, st)
}

func (api *API) handleStickersResolve(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	if len(req.IDs) > 100 {
		jsonError(w, "Слишком много id", 400)
		return
	}
	ids := make([]uuid.UUID, 0, len(req.IDs))
	for _, s := range req.IDs {
		id, err := uuid.Parse(strings.TrimSpace(s))
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	list, err := api.stickers.ResolveMany(r.Context(), ids)
	if err != nil {
		log.Printf("stickers resolve: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	if list == nil {
		list = []userstickers.Sticker{}
	}
	jsonOK(w, map[string]interface{}{"stickers": list})
}

func (api *API) handleStickerImport(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		StickerID string `json:"sticker_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	sid, err := uuid.Parse(strings.TrimSpace(req.StickerID))
	if err != nil {
		jsonError(w, "Неверный ID стикера", 400)
		return
	}
	st, err := api.stickers.ImportSticker(r.Context(), user.ID, sid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Стикер не найден", 404)
			return
		}
		if errors.Is(err, userstickers.ErrAlreadyInLibrary) {
			jsonError(w, "Уже есть в библиотеке", 409)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("sticker import: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, st)
}

func (api *API) handleStickerPackCreate(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	pk, err := api.stickers.CreatePack(r.Context(), user.ID, req.Title)
	if err != nil {
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, pk)
}

func (api *API) handleStickerPackPatch(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	err = api.stickers.UpdatePackTitle(r.Context(), user.ID, pid, req.Title)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Не найдено", 404)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleStickerPackDelete(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	pid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	err = api.stickers.DeletePack(r.Context(), user.ID, pid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Не найдено", 404)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleStickerImportPack(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		PackID string `json:"pack_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	pid, err := uuid.Parse(strings.TrimSpace(req.PackID))
	if err != nil {
		jsonError(w, "Неверный ID набора", 400)
		return
	}
	pw, err := api.stickers.ImportPack(r.Context(), user.ID, pid)
	if err != nil {
		if errors.Is(err, userstickers.ErrNothingToImport) {
			jsonError(w, "Нечего добавлять (всё уже есть)", 409)
			return
		}
		if errors.Is(err, userstickers.ErrOwnPack) {
			jsonError(w, "Это ваш набор", 400)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Набор не найден", 404)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("import pack: %v", err)
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, pw)
}

func (api *API) handleStickerImportAll(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	uid, err := uuid.Parse(strings.TrimSpace(req.UserID))
	if err != nil {
		jsonError(w, "Неверный user_id", 400)
		return
	}
	list, err := api.stickers.ImportAllFromUser(r.Context(), user.ID, uid)
	if err != nil {
		if errors.Is(err, userstickers.ErrOwnLibrary) {
			jsonError(w, "Это ваши наборы", 400)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		log.Printf("import all: %v", err)
		jsonError(w, "Ошибка", 500)
		return
	}
	if list == nil {
		list = []userstickers.PackWithStickers{}
	}
	jsonOK(w, map[string]interface{}{"packs": list})
}

func (api *API) handleStickerCreate(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		MediaURL string  `json:"media_url"`
		PackID   *string `json:"pack_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400)
		return
	}
	var packUUID *uuid.UUID
	if req.PackID != nil && strings.TrimSpace(*req.PackID) != "" {
		id, err := uuid.Parse(strings.TrimSpace(*req.PackID))
		if err != nil {
			jsonError(w, "Неверный pack_id", 400)
			return
		}
		packUUID = &id
	}
	st, err := api.stickers.Create(r.Context(), user.ID, packUUID, req.MediaURL)
	if err != nil {
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, err.Error(), 400)
		return
	}
	jsonOK(w, st)
}

func (api *API) handleStickerDelete(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	sid, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	err = api.stickers.Delete(r.Context(), user.ID, sid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "Не найдено", 404)
			return
		}
		if errors.Is(err, userstickers.ErrDBUnavailable) {
			jsonError(w, "База данных недоступна", 503)
			return
		}
		jsonError(w, "Ошибка", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// refreshHubChatMembers синхронизирует кэш участников для SendToChat (typing, read, реакции).
func (api *API) refreshHubChatMembers(ctx context.Context, chatID uuid.UUID) {
	mems, err := api.messaging.GetChatMembers(ctx, chatID)
	if err != nil {
		return
	}
	uids := make([]uuid.UUID, len(mems))
	for i, m := range mems {
		uids[i] = m.UserID
	}
	api.hub.UpdateChatMembers(chatID, uids)
}

// --- WebSocket ---

func (api *API) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Требуется токен", http.StatusUnauthorized)
		return
	}

	user, err := api.auth.ValidateToken(r.Context(), token)
	if err != nil {
		http.Error(w, "Неверный токен", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] upgrade error: %v", err)
		return
	}

	client := ws.NewClient(api.hub, conn, user.ID)
	api.hub.Register(client)

	// Заполняем hub.chatMembers для чатов пользователя — иначе SendToChat (typing, read, реакции) никому не уходит
	ctx := r.Context()
	if chats, err := api.messaging.GetUserChats(ctx, user.ID); err == nil {
		for _, c := range chats {
			if mems, err := api.messaging.GetChatMembers(ctx, c.ID); err == nil {
				uids := make([]uuid.UUID, len(mems))
				for i, m := range mems {
					uids[i] = m.UserID
				}
				api.hub.UpdateChatMembers(c.ID, uids)
			}
		}
	}

	go client.WritePump()
	go client.ReadPump(api.handleWSMessage)
}

func (api *API) handleWSMessage(client *ws.Client, msg *ws.IncomingMessage) {
	switch msg.Action {
	case "ping":
		pong, _ := json.Marshal(&ws.Event{Type: ws.EventPong, Payload: json.RawMessage("{}")})
		select {
		case client.Send <- pong:
		default:
		}
	case "typing":
		var p struct{ ChatID uuid.UUID `json:"chat_id"` }
		json.Unmarshal(msg.Payload, &p)
		payload, _ := json.Marshal(map[string]interface{}{"user_id": client.UserID})
		api.hub.SendToChat(p.ChatID, &ws.Event{Type: ws.EventTyping, Payload: payload})

	case "send_message":
		var p struct {
			ChatID  uuid.UUID  `json:"chat_id"`
			Type    int        `json:"type"`
			Text    string     `json:"text"`
			ReplyTo *uuid.UUID `json:"reply_to,omitempty"`
		}
		json.Unmarshal(msg.Payload, &p)

		ctx := context.Background()
		m, err := api.messaging.SendMessage(
			ctx, p.ChatID, client.UserID, models.MessageType(p.Type), p.Text, p.ReplyTo,
		)
		if err != nil {
			return
		}
		api.broadcastNewMessage(ctx, p.ChatID, m, nil)

	case "read":
		var p struct {
			ChatID    uuid.UUID `json:"chat_id"`
			MessageID uuid.UUID `json:"message_id"`
		}
		json.Unmarshal(msg.Payload, &p)
		api.messaging.MarkRead(context.Background(), p.ChatID, client.UserID, p.MessageID)
		payload, _ := json.Marshal(map[string]interface{}{
			"user_id": client.UserID, "message_id": p.MessageID,
		})
		api.hub.SendToChat(p.ChatID, &ws.Event{Type: ws.EventReadReceipt, Payload: payload})

	case "call_invite":
		var p struct {
			TargetUserID     uuid.UUID       `json:"target_user_id"`
			ChatID           uuid.UUID       `json:"chat_id"`
			Video            bool            `json:"video"`
			SDP              json.RawMessage `json:"sdp"`
			ParticipantIDs []string        `json:"participant_ids,omitempty"`
			InitiatorID      string          `json:"initiator_id,omitempty"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil {
			ctx := context.Background()
			payloadMap := map[string]interface{}{
				"from_user_id": client.UserID.String(),
				"chat_id":      p.ChatID.String(),
				"video":        p.Video,
			}
			if len(p.ParticipantIDs) > 0 {
				payloadMap["participant_ids"] = p.ParticipantIDs
			}
			if strings.TrimSpace(p.InitiatorID) != "" {
				payloadMap["initiator_id"] = strings.TrimSpace(p.InitiatorID)
			}
			if u, err := api.auth.GetUser(ctx, client.UserID); err == nil && u != nil {
				name := strings.TrimSpace(u.DisplayName)
				if name == "" {
					name = strings.TrimSpace(u.Username)
				}
				if name != "" {
					payloadMap["from_display_name"] = name
				}
				if av := strings.TrimSpace(u.AvatarURL); av != "" {
					payloadMap["from_avatar_url"] = av
				}
			}
			if len(p.SDP) > 0 {
				var sdpObj interface{}
				if json.Unmarshal(p.SDP, &sdpObj) == nil {
					payloadMap["sdp"] = sdpObj
				}
			}
			payload, _ := json.Marshal(payloadMap)
			api.hub.SendToUser(p.TargetUserID, &ws.Event{Type: ws.EventCallIncoming, Payload: payload})
			// ТЗ §41: все участники чата видят, что идёт групповой звонок
			if len(p.ParticipantIDs) >= 2 {
				gcPayload, _ := json.Marshal(map[string]interface{}{
					"chat_id":             p.ChatID.String(),
					"state":               "active",
					"participant_count":   len(p.ParticipantIDs),
					"video":               p.Video,
					"from_user_id":        client.UserID.String(),
				})
				api.hub.SendToChat(p.ChatID, &ws.Event{Type: ws.EventGroupCallUpdate, Payload: gcPayload})
			}
		}

	case "group_call_end":
		var p struct {
			ChatID uuid.UUID `json:"chat_id"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil && p.ChatID != uuid.Nil {
			endPl, _ := json.Marshal(map[string]interface{}{
				"chat_id": p.ChatID.String(),
				"state":   "ended",
			})
			api.hub.SendToChat(p.ChatID, &ws.Event{Type: ws.EventGroupCallUpdate, Payload: endPl})
		}

	case "call_answer":
		var p struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			SDP          json.RawMessage `json:"sdp"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil && len(p.SDP) > 0 {
			var sdpObj interface{}
			if json.Unmarshal(p.SDP, &sdpObj) == nil {
				payload, _ := json.Marshal(map[string]interface{}{"from_user_id": client.UserID, "sdp": sdpObj})
				api.hub.SendToUser(p.TargetUserID, &ws.Event{Type: ws.EventCallAccepted, Payload: payload})
			}
		}

	case "call_reject", "call_hangup":
		var p struct {
			TargetUserID uuid.UUID `json:"target_user_id"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil {
			payload, _ := json.Marshal(map[string]interface{}{"from_user_id": client.UserID})
			api.hub.SendToUser(p.TargetUserID, &ws.Event{Type: ws.EventCallEnded, Payload: payload})
		}

	case "call_ice":
		var p struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			Candidate    json.RawMessage `json:"candidate"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil && len(p.Candidate) > 0 {
			var candObj interface{}
			if json.Unmarshal(p.Candidate, &candObj) == nil {
				payload, _ := json.Marshal(map[string]interface{}{"from_user_id": client.UserID, "candidate": candObj})
				api.hub.SendToUser(p.TargetUserID, &ws.Event{Type: ws.EventCallICE, Payload: payload})
			}
		}

	case "call_renegotiate":
		var p struct {
			TargetUserID uuid.UUID       `json:"target_user_id"`
			SDP          json.RawMessage `json:"sdp"`
			IsOffer      bool            `json:"is_offer"`
		}
		if json.Unmarshal(msg.Payload, &p) == nil && len(p.SDP) > 0 {
			var sdpObj interface{}
			if json.Unmarshal(p.SDP, &sdpObj) == nil {
				payload, _ := json.Marshal(map[string]interface{}{
					"from_user_id": client.UserID,
					"sdp":          sdpObj,
					"is_offer":     p.IsOffer,
				})
				api.hub.SendToUser(p.TargetUserID, &ws.Event{Type: ws.EventCallRenegotiate, Payload: payload})
			}
		}
	}
}

// --- Push ---

func (api *API) handlePushVAPIDPublic(w http.ResponseWriter, r *http.Request) {
	if api.push == nil || !api.push.IsEnabled() {
		jsonOK(w, map[string]string{"vapid_public_key": ""})
		return
	}
	jsonOK(w, map[string]string{"vapid_public_key": api.push.VAPIDPublicKey()})
}

func (api *API) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	var req struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256DH string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Endpoint == "" || req.Keys.P256DH == "" || req.Keys.Auth == "" {
		jsonError(w, "Неверный формат подписки", 400)
		return
	}
	sub := &push.Subscription{Endpoint: req.Endpoint}
	sub.Keys.P256DH = req.Keys.P256DH
	sub.Keys.Auth = req.Keys.Auth
	if api.push == nil || !api.push.IsEnabled() {
		jsonError(w, "Push-уведомления не настроены", 503)
		return
	}
	if err := api.push.Register(r.Context(), user.ID, sub, r.Header.Get("User-Agent")); err != nil {
		jsonError(w, "Ошибка регистрации подписки", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "subscribed"})
}

// --- Web App (SPA) ---

func (api *API) handleWebApp(w http.ResponseWriter, r *http.Request) {
	webDir := "./web"
	path := r.URL.Path

	if path == "/" {
		path = "/index.html"
	}

	filePath := webDir + path
	if _, err := os.Stat(filePath); err == nil {
		http.ServeFile(w, r, filePath)
		return
	}

	http.ServeFile(w, r, webDir+"/index.html")
}

func (api *API) handleGetOG(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		jsonError(w, "Укажите url", 400)
		return
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		jsonError(w, "Недопустимый URL", 400)
		return
	}
	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", rawURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; DierCHAT/1.0)")
	resp, err := client.Do(req)
	if err != nil {
		jsonError(w, "Не удалось загрузить страницу", 502)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		jsonError(w, "Страница недоступна", 502)
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		jsonError(w, "Ошибка чтения", 502)
		return
	}
	html := string(body)
	ogTitle := regexp.MustCompile(`<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']`).FindStringSubmatch(html)
	if len(ogTitle) < 2 {
		ogTitle = regexp.MustCompile(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']`).FindStringSubmatch(html)
	}
	ogDesc := regexp.MustCompile(`<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']`).FindStringSubmatch(html)
	if len(ogDesc) < 2 {
		ogDesc = regexp.MustCompile(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']`).FindStringSubmatch(html)
	}
	ogImage := regexp.MustCompile(`<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`).FindStringSubmatch(html)
	if len(ogImage) < 2 {
		ogImage = regexp.MustCompile(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']`).FindStringSubmatch(html)
	}
	out := map[string]string{}
	if len(ogTitle) >= 2 {
		out["title"] = strings.TrimSpace(ogTitle[1])
	}
	if len(ogDesc) >= 2 {
		out["description"] = strings.TrimSpace(ogDesc[1])
	}
	if len(ogImage) >= 2 {
		imgURL := strings.TrimSpace(ogImage[1])
		if strings.HasPrefix(imgURL, "//") {
			imgURL = parsed.Scheme + ":" + imgURL
		} else if strings.HasPrefix(imgURL, "/") {
			imgURL = parsed.Scheme + "://" + parsed.Host + imgURL
		}
		out["image"] = imgURL
	}
	jsonOK(w, out)
}

// --- Helpers ---

func (api *API) broadcastNewMessage(ctx context.Context, chatID uuid.UUID, msg *models.Message, user *models.User) {
	members, err := api.messaging.GetChatMembers(ctx, chatID)
	if err != nil {
		members = nil
	}
	sender := user
	if sender == nil && msg != nil {
		sender, _ = api.auth.GetUser(ctx, msg.SenderID)
	}
	payload := map[string]interface{}{"message": msg}
	if sender != nil {
		payload["sender"] = sender
	}
	data, _ := json.Marshal(payload)
	ev := &ws.Event{Type: ws.EventNewMessage, ChatID: chatID, Payload: json.RawMessage(data)}
	senderID := uuid.Nil
	if sender != nil {
		senderID = sender.ID
	}
	chatTitle := ""
	if chat, _ := api.messaging.GetChat(ctx, chatID); chat != nil {
		chatTitle = chat.Title
		if chat.Type == models.ChatTypePrivate && chatTitle == "" && sender != nil {
			chatTitle = sender.DisplayName
		}
	}

	told := make(map[uuid.UUID]struct{})
	for _, m := range members {
		told[m.UserID] = struct{}{}
		api.hub.SendToUser(m.UserID, ev)
		if m.UserID != senderID && !api.hub.IsOnline(m.UserID) && api.push.IsEnabled() {
			go api.push.NotifyNewMessage(context.Background(), m.UserID, msg, sender, chatTitle)
		}
	}
	// Отправитель всегда получает new_message (даже если нет строки в chat_members — рассинхрон БД)
	if sender != nil {
		if _, ok := told[sender.ID]; !ok {
			api.hub.SendToUser(sender.ID, ev)
		}
	}
}

type contextKey string

const ctxUserKey contextKey = "user"

// --- Block handlers ---

func (api *API) handleBlockUser(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	targetID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	if targetID == user.ID {
		jsonError(w, "Нельзя заблокировать себя", 400)
		return
	}
	_, execErr := api.messaging.DB().Pool.Exec(r.Context(),
		`INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		user.ID, targetID,
	)
	if execErr != nil {
		jsonError(w, "Ошибка блокировки", 500)
		return
	}
	jsonOK(w, map[string]string{"status": "blocked"})
}

func (api *API) handleUnblockUser(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	targetID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		jsonError(w, "Неверный ID", 400)
		return
	}
	_, _ = api.messaging.DB().Pool.Exec(r.Context(),
		`DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
		user.ID, targetID,
	)
	jsonOK(w, map[string]string{"status": "unblocked"})
}

func (api *API) handleGetBlockedUsers(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	rows, err := api.messaging.DB().Pool.Query(r.Context(),
		`SELECT u.id, COALESCE(u.phone,''), COALESCE(u.email,''), COALESCE(u.username,''),
		        u.display_name, COALESCE(u.avatar_url,''), COALESCE(u.bio,''),
		        u.last_seen, u.online, u.created_at
		 FROM blocked_users b JOIN users u ON u.id = b.blocked_id
		 WHERE b.blocker_id = $1`, user.ID,
	)
	if err != nil {
		jsonOK(w, []interface{}{})
		return
	}
	defer rows.Close()
	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Phone, &u.Email, &u.Username, &u.DisplayName,
			&u.AvatarURL, &u.Bio, &u.LastSeen, &u.Online, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	if users == nil {
		users = []models.User{}
	}
	jsonOK(w, users)
}

func (api *API) handleSetMemberRole(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	chatID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID чата", 400); return }
	targetUID, err := uuid.Parse(r.PathValue("uid"))
	if err != nil { jsonError(w, "Неверный ID участника", 400); return }
	var req struct { Role int `json:"role"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400); return
	}
	var myRole int
	err = api.messaging.DB().Pool.QueryRow(r.Context(),
		`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, chatID, user.ID).Scan(&myRole)
	if err != nil || myRole != 2 {
		jsonError(w, "Только владелец может менять роли", 403); return
	}
	if req.Role < 0 || req.Role > 1 {
		jsonError(w, "Допустимые роли: 0 (участник), 1 (админ)", 400); return
	}
	_, err = api.messaging.DB().Pool.Exec(r.Context(),
		`UPDATE chat_members SET role = $3 WHERE chat_id = $1 AND user_id = $2`, chatID, targetUID, req.Role)
	if err != nil {
		jsonError(w, "Ошибка обновления", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) handleSetSelfDestruct(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(ctxUserKey).(*models.User)
	msgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil { jsonError(w, "Неверный ID", 400); return }
	var req struct { Seconds int `json:"seconds"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Неверный формат", 400); return
	}
	if req.Seconds <= 0 || req.Seconds > 604800 {
		jsonError(w, "От 1 секунды до 7 дней", 400); return
	}
	_, err = api.messaging.DB().Pool.Exec(r.Context(),
		`UPDATE messages SET self_destruct_at = NOW() + make_interval(secs := $2) WHERE id = $1 AND sender_id = $3`,
		msgID, req.Seconds, user.ID)
	if err != nil {
		jsonError(w, "Ошибка", 500); return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

func (api *API) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			jsonError(w, "Требуется авторизация", 401)
			return
		}
		user, err := api.auth.ValidateToken(r.Context(), token)
		if err != nil {
			jsonError(w, "Неверный токен", 401)
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserKey, user)
		next(w, r.WithContext(ctx))
	}
}

func extractToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

func jsonOK(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
