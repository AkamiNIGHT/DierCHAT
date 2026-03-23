/**
 * Звуки состояния звонка (Web Audio — без внешних файлов, работает в релизе).
 * Требуется user gesture для AudioContext; при первом клике/тапе контекст возобновляется.
 */

import { applySinkIdToAudioContext } from '@/lib/audioOutput';

let ctx: AudioContext | null = null;
let outgoingTimer: ReturnType<typeof setInterval> | null = null;
let incomingTimer: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  }
  return ctx;
}

export async function resumeCallAudio(): Promise<void> {
  try {
    const c = getCtx();
    if (c.state === 'suspended') await c.resume();
  } catch {
    /* ignore */
  }
}

/** Вывод гудков на выбранное в настройках устройство (Chrome 110+ / Electron). */
export async function setCallAudioOutputSink(sinkId: string | undefined | null): Promise<void> {
  await applySinkIdToAudioContext(getCtx(), sinkId);
}

/** Один короткий тон (Гц, длительность сек, громкость 0..1) */
function beep(freq: number, durationSec: number, volume = 0.12): void {
  const c = getCtx();
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

function clearOutgoing(): void {
  if (outgoingTimer) {
    clearInterval(outgoingTimer);
    outgoingTimer = null;
  }
}

function clearIncoming(): void {
  if (incomingTimer) {
    clearInterval(incomingTimer);
    incomingTimer = null;
  }
}

/** Гудки исходящего (ожидание ответа) — короткие импульсы ~425 Гц */
export function startOutgoingRing(): void {
  void resumeCallAudio();
  clearOutgoing();
  const pulse = () => {
    try {
      beep(425, 0.12, 0.1);
      setTimeout(() => beep(425, 0.12, 0.08), 140);
    } catch {
      /* ignore */
    }
  };
  pulse();
  outgoingTimer = setInterval(pulse, 900);
}

/** Входящий звонок — двойной «дзынь» */
export function startIncomingRing(): void {
  void resumeCallAudio();
  clearIncoming();
  const ring = () => {
    try {
      beep(523, 0.18, 0.14);
      setTimeout(() => beep(659, 0.22, 0.16), 200);
    } catch {
      /* ignore */
    }
  };
  ring();
  incomingTimer = setInterval(ring, 2200);
}

export function stopOutgoingRing(): void {
  clearOutgoing();
}

export function stopIncomingRing(): void {
  clearIncoming();
}

export function stopAllCallRings(): void {
  clearOutgoing();
  clearIncoming();
}

/** Соединение установлено */
export function playCallConnected(): void {
  void resumeCallAudio();
  try {
    const c = getCtx();
    const t0 = c.currentTime;
    const freqs = [523, 659, 784];
    freqs.forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t0 + i * 0.06);
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + 0.18);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0 + i * 0.06);
      osc.stop(t0 + i * 0.06 + 0.22);
    });
  } catch {
    /* ignore */
  }
}

let lastHangupAt = 0;

/** Сброс / отклонение / завершение (дебаунс — без двойного при гонке hangup + call_ended) */
export function playCallHangup(): void {
  const now = Date.now();
  if (now - lastHangupAt < 450) return;
  lastHangupAt = now;
  void resumeCallAudio();
  try {
    beep(280, 0.15, 0.1);
    setTimeout(() => beep(180, 0.2, 0.09), 100);
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  const once = () => {
    void resumeCallAudio();
    window.removeEventListener('pointerdown', once);
  };
  window.addEventListener('pointerdown', once, { passive: true });
}
