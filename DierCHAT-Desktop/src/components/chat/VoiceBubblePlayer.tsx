import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Play, Pause } from 'lucide-react';
import { useNowPlayingMedia } from '@/store/nowPlayingMedia';
import { useStore } from '@/store';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import './AudioPlayer.css';

export const VOICE_SPEEDS = [1, 1.5, 2] as const;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateBars(url: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = ((h * 1103515245 + 12345) & 0x7fffffff);
    bars.push(0.2 + (h % 100) / 125);
  }
  return bars;
}

interface Props {
  src: string;
  isOwn?: boolean;
  label?: string;
  /** Для глобального бара «сейчас играет» */
  chatId?: string;
  messageId?: string;
}

/** Голосовое сообщение — локальный плеер + глобальный бар при chatId/messageId (§26.7.1). */
export function VoiceBubblePlayer({ src, isOwn, label, chatId, messageId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakerId = useStore((s) => s.devicePrefs.speakerId);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const bars = generateBars(src, 32);

  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = VOICE_SPEEDS[speedIdx];
  }, [speedIdx]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !chatId || !messageId) return;
    const onPlaying = () => {
      const store = useNowPlayingMedia.getState();
      if (store.active && store.active.messageId !== messageId && store.controller) {
        if (!store.controller.getPaused()) store.controller.toggle();
      }
      store.setActive(
        { chatId, messageId, kind: 'voice', label: label || 'Голосовое' },
        {
          toggle: () => {
            if (a.paused) void a.play();
            else a.pause();
          },
          getPaused: () => a.paused,
          getCurrentTime: () => a.currentTime,
          getDuration: () => (Number.isFinite(a.duration) ? a.duration : 0),
        }
      );
    };
    const onPause = () => {
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
    const onEnded = () => {
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
    a.addEventListener('playing', onPlaying);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
  }, [chatId, messageId, label, src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.src = src;
    a.playbackRate = VOICE_SPEEDS[speedIdx];
    setCurrentTime(0);
    setPlaying(false);
    void applySinkIdToMediaElement(a, speakerId);
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      void applySinkIdToMediaElement(a, speakerId);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, [src, speedIdx, speakerId]);

  const onPlayClick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => { /* нет источника / 404 / неподдерживаемый формат */ });
    else a.pause();
  }, []);

  const handleBarClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const a = audioRef.current;
      if (!a || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      a.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration]
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((i) => {
      const next = (i + 1) % VOICE_SPEEDS.length;
      const a = audioRef.current;
      if (a) a.playbackRate = VOICE_SPEEDS[next];
      return next;
    });
  }, []);

  return (
    <div className={`ap ${isOwn ? 'ap--own' : ''}`}>
      <audio ref={audioRef} preload="metadata" hidden />
      <button type="button" className="ap-play" onClick={onPlayClick} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="ap-body">
        <div className="ap-bars" onClick={handleBarClick}>
          {bars.map((h, i) => (
            <div
              key={i}
              className={`ap-bar ${i / bars.length <= progress ? 'ap-bar--active' : ''}`}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <div className="ap-meta">
          <span className="ap-time">
            {playing || currentTime > 0 ? formatDuration(currentTime) : duration > 0 ? formatDuration(duration) : '—'}
          </span>
          <button
            type="button"
            className="ap-speed"
            onClick={(e) => {
              e.stopPropagation();
              cycleSpeed();
            }}
            title="Скорость"
          >
            {VOICE_SPEEDS[speedIdx]}x
          </button>
        </div>
      </div>
      <span className="visually-hidden">{label || 'Голосовое сообщение'}</span>
    </div>
  );
}
