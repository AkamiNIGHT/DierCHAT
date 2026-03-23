import { normalizeMessageFromApi } from '@/lib/messageNormalize';
import { canonicalUuid } from '@/lib/uuidCanonical';

const RECONNECT_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;

export type CallIncomingPayload = {
  from_user_id: string;
  from_display_name?: string;
  from_avatar_url?: string;
  chat_id: string;
  video: boolean;
  sdp?: RTCSessionDescriptionInit;
  /** Участники группового звонка (mesh), включая всех участников */
  participant_ids?: string[];
  initiator_id?: string;
};

export type CallAcceptedPayload = {
  from_user_id: string;
  sdp: RTCSessionDescriptionInit;
};

export type CallIcePayload = {
  from_user_id: string;
  candidate: RTCIceCandidateInit;
};

export type CallRenegotiatePayload = {
  from_user_id: string;
  sdp: RTCSessionDescriptionInit;
  is_offer: boolean;
};

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export type WSEventCallbacks = {
  onNewMessage?: (message: WsMessagePayload) => void;
  onMessageEdited?: (payload: { message_id: string; text: string }) => void;
  onMessageDeleted?: (payload: { message_id: string }) => void;
  onTyping?: (payload: { chat_id: string; user_id: string; display_name?: string }) => void;
  onOnline?: (payload: { user_id: string }) => void;
  onOffline?: (payload: { user_id: string; last_seen?: string }) => void;
  /** ТЗ §37: единое событие с last_seen */
  onOnlineStatus?: (payload: { user_id: string; online: boolean; last_seen?: string }) => void;
  /** ТЗ §41 */
  onGroupCallUpdate?: (payload: {
    chat_id: string;
    state: string;
    participant_count?: number;
    video?: boolean;
    from_user_id?: string;
  }) => void;
  /** ТЗ §42 заглушка: live-трансляции */
  onLiveStreamUpdate?: (payload: Record<string, unknown>) => void;
  onReadReceipt?: (payload: { chat_id: string; user_id: string; message_id: string }) => void;
  onCallIncoming?: (payload: CallIncomingPayload) => void;
  onCallAccepted?: (payload: CallAcceptedPayload) => void;
  onCallEnded?: (payload: { from_user_id: string }) => void;
  onCallIce?: (payload: CallIcePayload) => void;
  onCallRenegotiate?: (payload: CallRenegotiatePayload) => void;
  onReactionUpdate?: (payload: { message_id: string; chat_id: string; reactions: { emoji: string; count: number; user_ids: string[] }[] }) => void;
};

export type WsMessagePayload = {
  id: string;
  chat_id?: string;
  sender_id: string;
  type: number;
  text?: string;
  reply_to_id?: string;
  edited_at?: string;
  created_at: string;
  attachments?: unknown[];
  [key: string]: unknown;
};

type WsEvent = {
  type: string;
  chat_id?: string;
  user_id?: string;
  payload: unknown;
};

type OutgoingMsg = {
  action: string;
  payload: Record<string, unknown>;
};

function httpToWs(baseUrl: string): string {
  return baseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
}

export class WSClient {
  private ws: WebSocket | null = null;
  private baseUrl = '';
  private token = '';
  private callbacks: WSEventCallbacks = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private onConnected: (() => void) | null = null;
  private onDisconnected: (() => void) | null = null;
  private _status: ConnectionStatus = 'disconnected';
  private statusListeners: ((s: ConnectionStatus) => void)[] = [];

  getStatus(): ConnectionStatus {
    return this._status;
  }

  onStatusChange(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.push(cb);
    return () => {
      this.statusListeners = this.statusListeners.filter(c => c !== cb);
    };
  }

  private setStatus(s: ConnectionStatus): void {
    if (this._status !== s) {
      this._status = s;
      this.statusListeners.forEach(cb => cb(s));
    }
  }

  setCallbacks(cbs: WSEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  setConnectionHandlers(onConnected?: () => void, onDisconnected?: () => void): void {
    this.onConnected = onConnected ?? null;
    this.onDisconnected = onDisconnected ?? null;
  }

  connect(baseUrl: string, token: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.disconnect();
    const wsUrl = `${httpToWs(this.baseUrl)}/ws?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => this.handleOpen();
    this.ws.onclose = () => this.handleClose();
    this.ws.onerror = () => {};
    this.ws.onmessage = (e) => this.handleMessage(e);
  }

  disconnect(): void {
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleOpen(): void {
    this.clearTimers();
    this.setStatus('connected');
    this.startHeartbeat();
    this.onConnected?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dierchat:ws_connected'));
    }
  }

  private handleClose(): void {
    this.clearTimers();
    this.setStatus('disconnected');
    this.onDisconnected?.();
    if (this.token) {
      this.setStatus('reconnecting');
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(this.baseUrl, this.token);
      }, RECONNECT_INTERVAL_MS);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'ping', payload: {} }));
        if (this.pongTimeout) clearTimeout(this.pongTimeout);
        this.pongTimeout = setTimeout(() => {
          this.pongTimeout = null;
          if (this.ws) {
            this.ws.close();
          }
        }, 10000);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private handleMessage(event: MessageEvent): void {
    const raw = String(event.data ?? '');
    const lines = raw
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      try {
        const data = JSON.parse(line) as WsEvent;
        this.dispatchEvent(data);
      } catch {
        /* ignore bad chunk */
      }
    }
  }

  /** Один серверный фрейм может содержать несколько JSON через \\n (WritePump батчит) */
  private dispatchEvent(data: WsEvent): void {
    try {
      const { type, chat_id, user_id, payload } = data;
      const pl = (payload ?? {}) as Record<string, unknown>;

      switch (type) {
        case 'new_message': {
          const raw = (pl.message ?? pl) as Record<string, unknown>;
          if (!raw?.id) break;
          let msg = normalizeMessageFromApi(raw) as WsMessagePayload;
          if (!String(msg.chat_id ?? '').trim() && chat_id) {
            msg = { ...msg, chat_id: canonicalUuid(String(chat_id)) };
          }
          this.callbacks.onNewMessage?.(msg);
          if (typeof window !== 'undefined') {
            const cid = String(chat_id ?? msg.chat_id ?? '');
            window.dispatchEvent(new CustomEvent('dierchat:new_message', {
              detail: { message: msg, sender: pl.sender, chat_id: cid },
            }));
          }
          break;
        }
        case 'edit_message':
          this.callbacks.onMessageEdited?.({
            message_id: String(pl.message_id ?? ''),
            text: String(pl.text ?? ''),
          });
          break;
        case 'delete_message':
          this.callbacks.onMessageDeleted?.({ message_id: String(pl.message_id ?? '') });
          break;
        case 'reaction_update': {
          const mid = String(pl.message_id ?? '');
          const cid = String(chat_id ?? pl.chat_id ?? '');
          const rx = (pl.reactions ?? []) as { emoji: string; count: number; user_ids: string[] }[];
          this.callbacks.onReactionUpdate?.({ message_id: mid, chat_id: cid, reactions: rx });
          break;
        }
        case 'typing':
          this.callbacks.onTyping?.({
            chat_id: chat_id ?? pl.chat_id ?? '',
            user_id: String(pl.user_id ?? user_id ?? ''),
            display_name: pl.display_name as string | undefined,
          });
          break;
        case 'online':
          this.callbacks.onOnline?.({ user_id: String(user_id ?? pl.user_id ?? '') });
          break;
        case 'offline': {
          const offUid = String(user_id ?? pl.user_id ?? '');
          const offLs = pl.last_seen != null ? String(pl.last_seen) : undefined;
          this.callbacks.onOffline?.({ user_id: offUid, last_seen: offLs });
          break;
        }
        case 'online_status': {
          const ouid = String(pl.user_id ?? user_id ?? '');
          const onl = Boolean(pl.online);
          const ols = pl.last_seen != null ? String(pl.last_seen) : undefined;
          this.callbacks.onOnlineStatus?.({ user_id: ouid, online: onl, last_seen: ols });
          break;
        }
        case 'group_call_update': {
          const gc = pl as Record<string, unknown>;
          this.callbacks.onGroupCallUpdate?.({
            chat_id: String(gc.chat_id ?? chat_id ?? ''),
            state: String(gc.state ?? ''),
            participant_count: typeof gc.participant_count === 'number' ? gc.participant_count : undefined,
            video: Boolean(gc.video),
            from_user_id: gc.from_user_id != null ? String(gc.from_user_id) : undefined,
          });
          break;
        }
        case 'live_stream_update':
          this.callbacks.onLiveStreamUpdate?.(pl as Record<string, unknown>);
          break;
        case 'read_receipt':
          this.callbacks.onReadReceipt?.({
            chat_id: String(pl.chat_id ?? chat_id ?? ''),
            user_id: String(pl.user_id ?? user_id ?? ''),
            message_id: String(pl.message_id ?? ''),
          });
          break;
        case 'call_incoming':
          this.callbacks.onCallIncoming?.({
            from_user_id: String(pl.from_user_id ?? ''),
            from_display_name: pl.from_display_name as string | undefined,
            from_avatar_url: pl.from_avatar_url as string | undefined,
            chat_id: String(pl.chat_id ?? ''),
            video: Boolean(pl.video),
            sdp: pl.sdp as RTCSessionDescriptionInit | undefined,
            participant_ids: Array.isArray(pl.participant_ids)
              ? (pl.participant_ids as unknown[]).map((x) => String(x))
              : undefined,
            initiator_id: pl.initiator_id != null ? String(pl.initiator_id) : undefined,
          });
          break;
        case 'call_accepted':
          this.callbacks.onCallAccepted?.({
            from_user_id: String(pl.from_user_id ?? ''),
            sdp: pl.sdp as RTCSessionDescriptionInit,
          });
          break;
        case 'call_ended':
          this.callbacks.onCallEnded?.({ from_user_id: String(pl.from_user_id ?? '') });
          break;
        case 'chat_updated':
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dierchat:chats_changed', { detail: pl }));
          }
          break;
        case 'call_ice':
          this.callbacks.onCallIce?.({
            from_user_id: String(pl.from_user_id ?? ''),
            candidate: pl.candidate as RTCIceCandidateInit,
          });
          break;
        case 'call_renegotiate':
          this.callbacks.onCallRenegotiate?.({
            from_user_id: String(pl.from_user_id ?? ''),
            sdp: pl.sdp as RTCSessionDescriptionInit,
            is_offer: Boolean(pl.is_offer),
          });
          break;
        case 'pong':
          if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
          }
          break;
        default:
          break;
      }
    } catch {
      // ignore
    }
  }

  private send(msg: OutgoingMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendTyping(chatId: string): void {
    this.send({ action: 'typing', payload: { chat_id: chatId } });
  }

  sendMessage(
    chatId: string,
    type: number,
    text: string,
    replyTo?: string,
    silent?: boolean
  ): void {
    this.send({
      action: 'send_message',
      payload: {
        chat_id: chatId,
        type,
        text,
        ...(replyTo && { reply_to: replyTo }),
        ...(silent && { silent: true }),
      },
    });
  }

  sendRead(chatId: string, messageId: string): void {
    this.send({
      action: 'read',
      payload: { chat_id: chatId, message_id: messageId },
    });
  }

  sendCallInvite(
    targetUserId: string,
    chatId: string,
    video: boolean,
    sdp?: RTCSessionDescriptionInit,
    opts?: { participantIds?: string[]; initiatorId?: string }
  ): void {
    this.send({
      action: 'call_invite',
      payload: {
        target_user_id: targetUserId,
        chat_id: chatId,
        video,
        ...(sdp && { sdp }),
        ...(opts?.participantIds?.length && { participant_ids: opts.participantIds }),
        ...(opts?.initiatorId && { initiator_id: opts.initiatorId }),
      },
    });
  }

  sendCallAnswer(targetUserId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({
      action: 'call_answer',
      payload: { target_user_id: targetUserId, sdp },
    });
  }

  sendCallReject(targetUserId: string): void {
    this.send({
      action: 'call_reject',
      payload: { target_user_id: targetUserId },
    });
  }

  sendCallHangup(targetUserId: string): void {
    this.send({
      action: 'call_hangup',
      payload: { target_user_id: targetUserId },
    });
  }

  /** ТЗ §41: один раз при выходе из группового звонка */
  sendGroupCallEnd(chatId: string): void {
    this.send({
      action: 'group_call_end',
      payload: { chat_id: chatId },
    });
  }

  /** ТЗ §42: зарезервировано (сервер может игнорировать до реализации) */
  sendLiveStreamAction(action: string, payload: Record<string, unknown>): void {
    this.send({
      action: 'live_stream',
      payload: { sub_action: action, ...payload },
    });
  }

  sendCallIce(targetUserId: string, candidate: RTCIceCandidateInit): void {
    this.send({
      action: 'call_ice',
      payload: { target_user_id: targetUserId, candidate },
    });
  }

  sendCallRenegotiate(targetUserId: string, sdp: RTCSessionDescriptionInit, isOffer: boolean): void {
    this.send({
      action: 'call_renegotiate',
      payload: { target_user_id: targetUserId, sdp, is_offer: isOffer },
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WSClient();
export default wsClient;
