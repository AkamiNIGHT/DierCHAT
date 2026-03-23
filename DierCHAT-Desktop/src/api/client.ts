import { getPublicApiBaseUrl } from '@/lib/publicApiUrl';
import type { ApiStoryRow } from '@/lib/stories';
import { normalizeMessageFromApi } from '@/lib/messageNormalize';
import { normalizeChatFromApi } from '@/lib/chatNormalize';
import { canonicalUuid } from '@/lib/uuidCanonical';

/** ТЗ §46: поле `text` — raw UTF-8; подготовка только через `src/lib/messageText.ts` (без trim целого текста). */

// Electron: прямой запрос к бэкенду | браузер: origin (напр. https://dier-chat.ru) | Vite: ''
const DEFAULT_BASE_URL = getPublicApiBaseUrl();

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private chatsCache: { at: number; data: Chat[] } | null = null;
  private static readonly CHATS_TTL_MS = 5000;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** UUID в path сегменте: один формат + безопасное кодирование (P0 рассинхрон id). */
  private pathChatId(chatId: string): string {
    return encodeURIComponent(canonicalUuid(chatId));
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private formatHttpError(res: Response, text: string, parsed: unknown): string {
    const d = parsed as { error?: string; message?: string };
    if (typeof d.error === 'string' && d.error.trim()) return d.error;
    if (typeof d.message === 'string' && d.message.trim()) return d.message;
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (snippet && !snippet.startsWith('<')) {
      return `Сервер ответил ${res.status}: ${snippet}`;
    }
    if (res.status === 404) {
      return `API не найдено (404). Проверьте адрес сервера: ${this.baseUrl}`;
    }
    if (res.status >= 500) {
      return `Ошибка на сервере (${res.status}). Запущен ли DierCHAT-Server, доступны ли PostgreSQL/Redis? См. логи сервера.`;
    }
    return `Запрос отклонён (HTTP ${res.status} ${res.statusText || ''}). База API: ${this.baseUrl}`;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      const hint =
        /failed to fetch|load failed|network|fetch|econnrefused|aborted|timed out/i.test(m)
          ? ` Нет соединения с ${this.baseUrl}. Для локальной разработки: запустите DierCHAT-Server (порт из config.json, обычно 9000), PostgreSQL и Redis. В Electron можно задать VITE_API_BASE_URL.`
          : '';
      throw new Error(`Сеть: ${m}.${hint}`);
    }

    const text = await res.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = {};
      }
    }

    if (!res.ok) {
      throw new Error(this.formatHttpError(res, text, parsed));
    }

    return parsed as T;
  }

  async sendCode(email: string): Promise<{ status: string }> {
    return this.request('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyCode(
    email: string,
    code: string,
    device?: string
  ): Promise<
    | { user: User; token: string }
    | { needs_2fa: true; temp_2fa: string; user: User }
  > {
    return this.request('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, device: device ?? 'desktop' }),
    });
  }

  async verify2FA(
    temp2fa: string,
    password: string,
    device?: string
  ): Promise<{ user: User; token: string }> {
    return this.request('/api/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({
        temp_2fa: temp2fa,
        password,
        device: device ?? 'desktop',
      }),
    });
  }

  async forgotPassword(email: string): Promise<{ status: string }> {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<{ status: string }> {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        code,
        new_password: newPassword,
      }),
    });
  }

  async setPassword(password: string, current?: string): Promise<{ status: string }> {
    return this.request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password, current }),
    });
  }

  async logout(): Promise<{ status: string }> {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async getMe(): Promise<User> {
    return this.request('/api/auth/me');
  }

  async updateProfile(
    name: string,
    username: string,
    bio: string,
    avatarUrl?: string
  ): Promise<{ status: string }> {
    const body: Record<string, unknown> = {
      display_name: name,
      username,
      bio,
    };
    if (avatarUrl !== undefined) body.avatar_url = avatarUrl;

    return this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async searchUsers(query: string): Promise<User[]> {
    const users = await this.request<User[]>('/api/users/search?q=' + encodeURIComponent(query));
    return users ?? [];
  }

  async getUser(id: string): Promise<User> {
    return this.request(`/api/users/${id}`);
  }

  async blockUser(userId: string): Promise<{ status: string }> {
    return this.request(`/api/users/${userId}/block`, { method: 'POST' });
  }

  async unblockUser(userId: string): Promise<{ status: string }> {
    return this.request(`/api/users/${userId}/block`, { method: 'DELETE' });
  }

  async getBlockedUsers(): Promise<User[]> {
    const users = await this.request<User[]>('/api/users/blocked');
    return users ?? [];
  }

  /** Сброс кэша списка чатов (после создания чата и т.п., ТЗ §19). */
  invalidateChatsCache(): void {
    this.chatsCache = null;
  }

  async getChats(): Promise<Chat[]> {
    const now = Date.now();
    if (
      this.chatsCache &&
      now - this.chatsCache.at < ApiClient.CHATS_TTL_MS
    ) {
      return this.chatsCache.data;
    }
    const chats = await this.request<Chat[]>('/api/chats');
    const list = (chats ?? []).map((c) => normalizeChatFromApi(c));
    this.chatsCache = { at: now, data: list };
    return list;
  }

  async createPrivateChat(userId: string): Promise<Chat> {
    const c = await this.request<Chat>('/api/chats/private', {
      method: 'POST',
      body: JSON.stringify({ user_id: canonicalUuid(userId) }),
    });
    this.invalidateChatsCache();
    return normalizeChatFromApi(c);
  }

  async createGroup(
    title: string,
    description: string,
    memberIds: string[]
  ): Promise<Chat> {
    const c = await this.request<Chat>('/api/chats/group', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        members: memberIds,
      }),
    });
    this.invalidateChatsCache();
    return normalizeChatFromApi(c);
  }

  async createChannel(
    title: string,
    description: string,
    isPublic: boolean
  ): Promise<Chat> {
    const c = await this.request<Chat>('/api/chats/channel', {
      method: 'POST',
      body: JSON.stringify({ title, description, is_public: isPublic }),
    });
    this.invalidateChatsCache();
    return normalizeChatFromApi(c);
  }

  async ensureChannelDiscussion(
    chatId: string
  ): Promise<{ discussion_chat_id: string; status: string }> {
    const r = await this.request<{ discussion_chat_id: string; status: string }>(
      `/api/chats/${this.pathChatId(chatId)}/ensure-discussion`,
      { method: 'POST' }
    );
    this.invalidateChatsCache();
    return r;
  }

  async updateChatTitle(chatId: string, title: string): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async setSlowMode(chatId: string, seconds: number): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/slow-mode`, {
      method: 'PUT',
      body: JSON.stringify({ seconds }),
    });
  }

  async pinChat(chatId: string, pinned: boolean): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned }),
    });
  }

  async muteChat(chatId: string, muted: boolean): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/mute`, {
      method: 'PUT',
      body: JSON.stringify({ muted }),
    });
  }

  async archiveChat(chatId: string, archived: boolean): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/archive`, {
      method: 'PUT',
      body: JSON.stringify({ archived }),
    });
  }

  async getMessages(
    chatId: string,
    before?: string,
    limit?: number
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (before) params.set('before', before);
    if (limit != null) params.set('limit', String(limit));
    const qs = params.toString();
    const path = `/api/chats/${this.pathChatId(chatId)}/messages${qs ? '?' + qs : ''}`;
    const msgs = await this.request<Message[]>(path);
    return (msgs ?? []).map((m) => normalizeMessageFromApi(m));
  }

  async sendMessage(
    chatId: string,
    type: number,
    text: string,
    replyTo?: string,
    silent?: boolean
  ): Promise<Message> {
    const raw = await this.request<Message>(`/api/chats/${this.pathChatId(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        text,
        reply_to: replyTo ?? undefined,
        silent: silent ?? undefined,
      }),
    });
    return normalizeMessageFromApi(raw);
  }

  async editMessage(msgId: string, text: string): Promise<{ status: string }> {
    return this.request(`/api/messages/${msgId}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    });
  }

  async deleteMessage(msgId: string): Promise<{ status: string }> {
    return this.request(`/api/messages/${msgId}`, { method: 'DELETE' });
  }

  async forwardMessage(
    messageId: string,
    chatIds: string[],
    opts?: { hideForwardAuthor?: boolean }
  ): Promise<Message[]> {
    const res = await this.request<Message[]>(`/api/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({
        chat_ids: chatIds,
        hide_forward_author: Boolean(opts?.hideForwardAuthor),
      }),
    });
    return (res ?? []).map((m) => normalizeMessageFromApi(m));
  }

  async pinMessage(chatId: string, messageId: string, pinned: boolean): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/pin-message`, {
      method: 'PUT',
      body: JSON.stringify({ message_id: messageId, pinned }),
    });
  }

  async addReaction(messageId: string, emoji: string = '👍'): Promise<{ status: string }> {
    return this.request(`/api/messages/${messageId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId: string): Promise<{ status: string }> {
    return this.request(`/api/messages/${messageId}/reaction`, { method: 'DELETE' });
  }

  async setSelfDestruct(messageId: string, seconds: number): Promise<{ status: string }> {
    return this.request(`/api/messages/${messageId}/self-destruct`, {
      method: 'PUT',
      body: JSON.stringify({ seconds }),
    });
  }

  async searchInChat(chatId: string, query: string, limit?: number): Promise<Message[]> {
    const params = new URLSearchParams({ q: query });
    if (limit != null) params.set('limit', String(limit));
    const res = await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/search?${params}`);
    return (res ?? []).map((m) => normalizeMessageFromApi(m));
  }

  async getPinnedMessages(chatId: string, limit?: number): Promise<Message[]> {
    const params = limit != null ? `?limit=${limit}` : '';
    const res = (await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/pinned${params}`)) ?? [];
    return res.map((m) => normalizeMessageFromApi(m));
  }

  async getOGPreview(url: string): Promise<{ title?: string; description?: string; image?: string }> {
    const params = new URLSearchParams({ url });
    return this.request<{ title?: string; description?: string; image?: string }>(`/api/og?${params}`) ?? {};
  }

  async getMembers(chatId: string): Promise<ChatMember[]> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/members`);
  }

  async getChatMedia(chatId: string, type?: string, limit?: number): Promise<Message[]> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (limit != null) params.set('limit', String(limit));
    const qs = params.toString();
    const r = (await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/media${qs ? '?' + qs : ''}`)) ?? [];
    return r.map((m) => normalizeMessageFromApi(m));
  }

  async getChatFavorites(chatId: string, limit?: number): Promise<Message[]> {
    const params = limit != null ? `?limit=${limit}` : '';
    const r = (await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/favorites${params}`)) ?? [];
    return r.map((m) => normalizeMessageFromApi(m));
  }

  async getChatLinks(chatId: string, limit?: number): Promise<Message[]> {
    const params = limit != null ? `?limit=${limit}` : '';
    const r = (await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/links${params}`)) ?? [];
    return r.map((m) => normalizeMessageFromApi(m));
  }

  async getChatVoices(chatId: string, limit?: number): Promise<Message[]> {
    const params = limit != null ? `?limit=${limit}` : '';
    const r = (await this.request<Message[]>(`/api/chats/${this.pathChatId(chatId)}/voices${params}`)) ?? [];
    return r.map((m) => normalizeMessageFromApi(m));
  }

  async addBookmark(messageId: string): Promise<{ status: string }> {
    return this.request(`/api/messages/${messageId}/bookmark`, { method: 'POST' });
  }

  async removeBookmark(messageId: string): Promise<{ status: string }> {
    return this.request(`/api/messages/${messageId}/bookmark`, { method: 'DELETE' });
  }

  async createPoll(
    chatId: string,
    question: string,
    options: string[],
    allowsMultiple: boolean
  ): Promise<{ message: Message; poll: Poll }> {
    const res = await this.request<{ message: Message; poll: Poll }>(
      `/api/chats/${this.pathChatId(chatId)}/polls`,
      {
        method: 'POST',
        body: JSON.stringify({ question, options, allows_multiple: allowsMultiple }),
      }
    );
    return res!;
  }

  async votePoll(messageId: string, optionIds: string[]): Promise<{ status: string }> {
    return this.request(`/api/polls/${messageId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_ids: optionIds }),
    });
  }

  async getPoll(messageId: string): Promise<PollWithResults | null> {
    const res = await this.request<PollWithResults>(`/api/polls/${messageId}`);
    return res ?? null;
  }

  async newsSubscribe(chatId: string): Promise<{ status: string }> {
    return this.request('/api/news/subscribe', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId }),
    });
  }

  async newsUnsubscribe(chatId: string): Promise<{ status: string }> {
    return this.request('/api/news/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId }),
    });
  }

  async newsSend(chatId: string, text: string): Promise<{ status: string }> {
    return this.request('/api/news/send', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }

  async getPushVapidPublic(): Promise<{ vapid_public_key: string }> {
    return this.request('/api/push/vapid-public');
  }

  async subscribePush(subscription: PushSubscriptionJSON): Promise<{ status: string }> {
    return this.request('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  async createReport(targetType: string, targetId: string, reason?: string): Promise<{ status: string }> {
    return this.request('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason: reason ?? '' }),
    });
  }

  async listReports(limit?: number): Promise<Report[]> {
    const q = limit != null ? `?limit=${limit}` : '';
    const res = await this.request<Report[]>(`/api/reports${q}`);
    return res ?? [];
  }

  async broadcast(
    chatIds: string[],
    contentType: 'text' | 'code',
    text: string
  ): Promise<{ chat_id: string; ok: boolean; error?: string }[]> {
    const data = await this.request<{ results: Array<{ chat_id: string; ok: boolean; error?: string }> }>(
      '/api/chats/broadcast',
      { method: 'POST', body: JSON.stringify({ chat_ids: chatIds, content_type: contentType, text }) }
    );
    return data?.results ?? [];
  }

  async generateInviteLink(chatId: string): Promise<{ invite_link: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/invite-link`, { method: 'POST' });
  }

  async joinByInvite(code: string): Promise<{ status: string; chat_id: string }> {
    const res = await this.request<{ status: string; chat_id: string }>(
      `/api/invite/${code}`,
      { method: 'POST' }
    );
    this.invalidateChatsCache();
    return res;
  }

  /** Проверка бэкенда (ТЗ §22). Без авторизации. */
  async health(): Promise<{ ok: boolean; service?: string; ts?: string }> {
    return this.request('/api/health');
  }

  async addMember(chatId: string, userId: string): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async removeMember(chatId: string, userId: string): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/members/${this.pathChatId(userId)}`, {
      method: 'DELETE',
    });
  }

  async setMemberRole(chatId: string, userId: string, role: number): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/members/${this.pathChatId(userId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async markRead(chatId: string, messageId: string): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId }),
    });
  }

  async sendTyping(chatId: string): Promise<{ status: string }> {
    return this.request(`/api/chats/${this.pathChatId(chatId)}/typing`, { method: 'POST' });
  }

  async uploadFile(file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);

    const url = `${this.baseUrl}/api/upload`;
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? 'Ошибка загрузки';
      throw new Error(msg);
    }

    return data as UploadResult;
  }

  async listSessions(): Promise<Session[]> {
    const res = await this.request<Session[]>('/api/auth/sessions');
    return res ?? [];
  }

  async terminateAllSessions(): Promise<{ status: string }> {
    return this.request('/api/auth/sessions/terminate-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async searchMessages(query: string): Promise<Message[]> {
    const msgs = await this.request<Message[]>(
      '/api/search/messages?q=' + encodeURIComponent(query)
    );
    return (msgs ?? []).map((m) => normalizeMessageFromApi(m));
  }

  /** Собеседники в личных чатах, у которых сейчас открыт WebSocket */
  async getPeersPresence(): Promise<{ online_user_ids: string[] }> {
    return this.request('/api/presence/peers');
  }

  async createBot(username: string, name: string, desc: string): Promise<Bot> {
    return this.request('/api/bots', {
      method: 'POST',
      body: JSON.stringify({
        username,
        display_name: name,
        description: desc,
      }),
    });
  }

  async listBots(): Promise<Bot[]> {
    const list = await this.request<Bot[]>('/api/bots');
    return list ?? [];
  }

  async getStoriesFeed(): Promise<ApiStoryRow[]> {
    const list = await this.request<ApiStoryRow[]>('/api/stories/feed');
    return list ?? [];
  }

  async createStory(body: {
    media_url: string;
    media_kind: number;
    caption?: string;
  }): Promise<ApiStoryRow> {
    return this.request<ApiStoryRow>('/api/stories', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async recordStoryView(storyId: string): Promise<{ status: string }> {
    return this.request(`/api/stories/${encodeURIComponent(storyId)}/view`, {
      method: 'POST',
    });
  }

  /** Принятые друзья (истории видны только им и вам). */
  async listFriends(): Promise<FriendProfile[]> {
    const list = await this.request<FriendProfile[]>('/api/friends');
    return list ?? [];
  }

  async listFriendRequestsIncoming(): Promise<FriendProfile[]> {
    const list = await this.request<FriendProfile[]>('/api/friends/incoming');
    return list ?? [];
  }

  async listFriendRequestsOutgoing(): Promise<FriendProfile[]> {
    const list = await this.request<FriendProfile[]>('/api/friends/outgoing');
    return list ?? [];
  }

  async sendFriendRequest(userId: string): Promise<{ status: string }> {
    return this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async acceptFriendRequest(requesterId: string): Promise<{ status: string }> {
    return this.request('/api/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ requester_id: requesterId }),
    });
  }

  async declineFriendRequest(requesterId: string): Promise<{ status: string }> {
    return this.request('/api/friends/decline', {
      method: 'POST',
      body: JSON.stringify({ requester_id: requesterId }),
    });
  }

  async cancelFriendRequest(userId: string): Promise<{ status: string }> {
    return this.request('/api/friends/cancel', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async removeFriend(userId: string): Promise<{ status: string }> {
    return this.request(`/api/friends/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  /** Библиотека стикеров на сервере — наборы с названием (§26.6) */
  async getMyStickerLibrary(): Promise<StickerLibraryResponse> {
    return this.request<StickerLibraryResponse>('/api/stickers/mine');
  }

  async createStickerPack(title: string): Promise<ServerStickerPackMeta> {
    return this.request<ServerStickerPackMeta>('/api/stickers/packs', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async renameStickerPack(packId: string, title: string): Promise<{ status: string }> {
    return this.request(`/api/stickers/packs/${encodeURIComponent(packId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async deleteStickerPack(packId: string): Promise<{ status: string }> {
    return this.request(`/api/stickers/packs/${encodeURIComponent(packId)}`, {
      method: 'DELETE',
    });
  }

  async resolveStickers(ids: string[]): Promise<ServerSticker[]> {
    const res = await this.request<{ stickers: ServerSticker[] }>('/api/stickers/resolve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    return res?.stickers ?? [];
  }

  async getSticker(id: string): Promise<ServerSticker> {
    return this.request<ServerSticker>(`/api/stickers/${encodeURIComponent(id)}`);
  }

  async createSticker(mediaUrl: string, packId?: string): Promise<ServerSticker> {
    const body: Record<string, unknown> = { media_url: mediaUrl };
    if (packId) body.pack_id = packId;
    return this.request<ServerSticker>('/api/stickers', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deleteSticker(id: string): Promise<{ status: string }> {
    return this.request(`/api/stickers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** Наборы стикеров другого пользователя + автор. */
  async getUserStickerLibrary(userId: string): Promise<UserStickerLibraryResponse> {
    return this.request<UserStickerLibraryResponse>(
      `/api/users/${encodeURIComponent(userId)}/stickers`
    );
  }

  /** Копия чужого стикера в свою библиотеку (новый id). */
  async importSticker(stickerId: string): Promise<ServerSticker> {
    return this.request<ServerSticker>('/api/stickers/import', {
      method: 'POST',
      body: JSON.stringify({ sticker_id: stickerId }),
    });
  }

  /** Импорт целого набора (новый набор «… (копия)»). */
  async importStickerPack(packId: string): Promise<ServerStickerPackWithStickers> {
    return this.request<ServerStickerPackWithStickers>('/api/stickers/import-pack', {
      method: 'POST',
      body: JSON.stringify({ pack_id: packId }),
    });
  }

  /** Импорт всех наборов пользователя. */
  async importAllStickerPacksFromUser(userId: string): Promise<{ packs: ServerStickerPackWithStickers[] }> {
    return this.request<{ packs: ServerStickerPackWithStickers[] }>('/api/stickers/import-all', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }
}

// Re-export types for convenience
export type FriendProfile = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string;
};

export type User = {
  id: string;
  phone?: string;
  email?: string;
  username?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  last_seen: string;
  online: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type Chat = {
  id: string;
  type: number;
  title?: string;
  description?: string;
  avatar_url?: string;
  owner_id: string;
  is_public: boolean;
  invite_link?: string;
  /** Группа комментариев для канала (§26.3) */
  discussion_chat_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  slow_mode_seconds?: number;
  /** Личный чат (type=0): имя собеседника с сервера */
  peer_display_name?: string;
  peer_user_id?: string;
  peer_avatar_url?: string;
  member_count?: number;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
};

export type ChatMember = {
  chat_id: string;
  user_id: string;
  role: number;
  joined_at: string;
  muted_at?: string;
};

export type ReactionInfo = { emoji: string; count: number; user_ids: string[] };

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  /** 0 text, 1 photo, 2 video, 3 file, 4 voice, 5 sticker, 6 system, 7 forward, 8 poll, 9 video note, 10 audio/music */
  type: number;
  text?: string;
  reply_to_id?: string;
  forward_id?: string;
  /** Имя автора оригинала при пересылке с подписью (ТЗ §48.4) */
  forward_from_name?: string;
  edited_at?: string;
  created_at: string;
  deleted_at?: string;
  attachments?: Attachment[];
  read_by?: string[];
  reactions?: ReactionInfo[];
  poll?: Poll;
};

export type Poll = {
  id: string;
  message_id: string;
  question: string;
  allows_multiple: boolean;
  options: PollOption[];
  created_at?: string;
};

export type PollOption = {
  id: string;
  poll_id?: string;
  text: string;
  vote_count?: number;
  sort_order?: number;
};

export type PollWithResults = {
  poll: Poll;
  option_counts: number[];
  total_votes: number;
  user_vote_ids: string[];
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
};

export type Attachment = {
  id: string;
  message_id: string;
  type: string;
  url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
};

export type UploadResult = {
  id: string;
  url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  thumbnail?: string;
};

/** Запись в облачной библиотеке стикеров (`user_stickers`) */
export type ServerSticker = {
  id: string;
  pack_id: string;
  user_id: string;
  media_url: string;
  created_at: string;
};

/** Мета набора без стикеров */
export type ServerStickerPackMeta = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type ServerStickerPackWithStickers = ServerStickerPackMeta & {
  stickers: ServerSticker[];
};

export type StickerLibraryResponse = {
  packs: ServerStickerPackWithStickers[];
};

export type UserStickerLibraryResponse = {
  author: { user_id: string; display_name: string };
  packs: ServerStickerPackWithStickers[];
};

export type Session = {
  id: string;
  device: string;
  ip: string;
  created_at: string;
  expires_at: string;
};

export type Bot = {
  id: string;
  owner_id: string;
  username: string;
  display_name: string;
  token: string;
  webhook_url?: string;
  description?: string;
  avatar_url?: string;
  is_inline: boolean;
  created_at: string;
};

export const apiClient = new ApiClient();
export default apiClient;
export const api = apiClient;
