import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

/* PWA: Service Worker — кэш статики, push, Background Sync (ТЗ §13, §16) */
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const isElectron = !!(window as unknown as { dierchat?: unknown }).dierchat;
  if (!isElectron) {
    window.addEventListener('load', () => {
      const base = import.meta.env.BASE_URL;
      const swUrl = new URL('sw.js', `${window.location.origin}${base}`).href;
      navigator.serviceWorker.register(swUrl, { scope: base }).catch(() => {});
    });
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'DIERCHAT_FLUSH_OUTBOX') {
        window.dispatchEvent(new CustomEvent('dierchat:flush_outbox'));
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
