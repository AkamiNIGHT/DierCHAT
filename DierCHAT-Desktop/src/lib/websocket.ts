import { getWebSocketHttpBaseUrl } from '@/lib/publicApiUrl';

function getWsHttpBase(): string {
  const b = getWebSocketHttpBaseUrl();
  if (b) return b;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:9000';
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let savedToken: string | null = null;

type MessageHandler = (event: { type: string; payload: Record<string, unknown> }) => void;
const handlers: Set<MessageHandler> = new Set();

export function addMessageHandler(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function connectWebSocket(token: string): void {
  savedToken = token;
  if (ws?.readyState === WebSocket.OPEN) return;

  const base = getWsHttpBase();
  const wsUrl = base.replace('http://', 'ws://').replace('https://', 'wss://');
  ws = new WebSocket(`${wsUrl}/ws?token=${encodeURIComponent(token)}`);

  ws.onopen = () => {
    console.log('[WS] Подключено');
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    heartbeatTimer = setInterval(() => { ws?.send(JSON.stringify({ action: 'ping', payload: {} })); }, 30000);
  };

  ws.onmessage = (e) => {
    try {
      const lines = (e.data as string).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        let payload = event.payload;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch {}
        }
        handlers.forEach(h => h({ type: event.type, payload: payload ?? {} }));
      }
    } catch {}
  };

  ws.onclose = () => {
    console.log('[WS] Отключено');
    cleanup();
    if (savedToken) {
      reconnectTimer = setTimeout(() => connectWebSocket(savedToken!), 3000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectWebSocket(): void {
  savedToken = null;
  cleanup();
  ws?.close();
  ws = null;
}

export function wsSend(action: string, payload: Record<string, unknown>): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action, payload }));
  }
}

function cleanup() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}
