import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/store';
import type { WsMessagePayload } from '@/api/ws';
import './Toast.css';

type ToastItem = {
  id: string;
  chatId: string;
  senderName: string;
  text: string;
  messageId: string;
};

const TOAST_DURATION_MS = 4000;

function msgPreview(msg: WsMessagePayload): string {
  if (!msg) return 'Новое сообщение';
  if (msg.text && typeof msg.text === 'string') {
    return msg.text.length > 60 ? msg.text.slice(0, 57) + '...' : msg.text;
  }
  const t = msg.type;
  if (t === 1) return 'Фото';
  if (t === 2) return 'Видео';
  if (t === 4) return 'Файл';
  if (t === 5) return 'Голосовое сообщение';
  if (t === 6) return 'Стикер';
  return 'Новое сообщение';
}

export function MessageToast() {
  const currentChatId = useStore((s) => s.currentChatId);
  const setCurrentChatId = useStore((s) => s.setCurrentChatId);
  const notificationPrefs = useStore((s) => s.notificationPrefs);
  const chatTypes = useStore((s) => s.chatTypes);
  const notificationMutedChatIds = useStore((s) => s.notificationMutedChatIds);
  const showInAppMessageToasts = useStore((s) => s.showInAppMessageToasts);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ message: WsMessagePayload; sender?: { display_name?: string } }>;
      const { message, sender } = ev.detail ?? {};
      if (!message?.id || !message?.chat_id) return;

      const chatIdStr = String(message.chat_id);
      if (currentChatId === chatIdStr) return;
      if (!showInAppMessageToasts) return;
      if (notificationMutedChatIds.includes(chatIdStr)) return;

      const ctype = chatTypes[chatIdStr] ?? 0;
      const notifEnabled =
        ctype === 0
          ? notificationPrefs.personal.enabled
          : ctype === 1
            ? notificationPrefs.groups.enabled
            : notificationPrefs.channels.enabled;
      if (!notifEnabled) return;

      const senderName = sender?.display_name || 'Кто-то';
      const item: ToastItem = {
        id: `toast-${message.id}-${Date.now()}`,
        chatId: chatIdStr,
        senderName,
        text: msgPreview(message),
        messageId: String(message.id),
      };

      setToasts((prev) => [...prev.filter((t) => t.chatId !== chatIdStr), item]);

      if (notificationPrefs.vibrate !== false && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch {
          /* ignore */
        }
      }

      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(senderName, { body: msgPreview(message), tag: chatIdStr, icon: '/favicon.ico' });
        n.onclick = () => {
          n.close();
          window.focus();
          setCurrentChatId(chatIdStr);
          dismiss(item.id);
        };
      }

      const tid = setTimeout(() => dismiss(item.id), TOAST_DURATION_MS);
      timersRef.current.set(item.id, tid);
    };

    window.addEventListener('dierchat:new_message', handler);
    return () => {
      window.removeEventListener('dierchat:new_message', handler);
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [
    currentChatId,
    dismiss,
    notificationPrefs,
    chatTypes,
    notificationMutedChatIds,
    showInAppMessageToasts,
    setCurrentChatId,
  ]);

  if (toasts.length === 0) return null;

  return (
    <div className="message-toast-container">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="message-toast"
          onClick={() => {
            setCurrentChatId(t.chatId);
            dismiss(t.id);
          }}
          onKeyDown={(e) => e.key === 'Escape' && dismiss(t.id)}
        >
          <span className="message-toast__sender">{t.senderName}</span>
          <span className="message-toast__text">{t.text}</span>
        </button>
      ))}
    </div>
  );
}
