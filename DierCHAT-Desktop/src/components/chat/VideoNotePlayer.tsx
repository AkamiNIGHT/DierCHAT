import { useRef, useState, useCallback, useEffect } from 'react';
import { Maximize2, Play } from 'lucide-react';
import { useNowPlayingMedia } from '@/store/nowPlayingMedia';
import { useStore } from '@/store';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import './VideoNotePlayer.css';

const R = 46;
const CIRC = 2 * Math.PI * R;

type Props = {
  url: string;
  onExpand?: () => void;
  chatId?: string;
  messageId?: string;
  label?: string;
};

/** Видеосообщение-кружок (§26.4): круг, обводка прогресса, пауза по клику, перемотка по кольцу */
export function VideoNotePlayer({ url, onExpand, chatId, messageId, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speakerId = useStore((s) => s.devicePrefs.speakerId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const seekingRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    void applySinkIdToMediaElement(v, speakerId);
    const onTime = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      void applySinkIdToMediaElement(v, speakerId);
    };
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
    };
  }, [speakerId, url]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !chatId || !messageId) return;
    const onPlaying = () => {
      const store = useNowPlayingMedia.getState();
      if (store.active && store.active.messageId !== messageId && store.controller) {
        if (!store.controller.getPaused()) store.controller.toggle();
      }
      store.setActive(
        { chatId, messageId, kind: 'video_note', label: label || 'Видеокружок' },
        {
          toggle: () => {
            if (v.paused) void v.play();
            else v.pause();
          },
          getPaused: () => v.paused,
          getCurrentTime: () => v.currentTime,
          getDuration: () => (Number.isFinite(v.duration) ? v.duration : 0),
        }
      );
    };
    const onPause = () => {
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
    const onEnded = () => {
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
    v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      useNowPlayingMedia.getState().clearIfMessage(messageId);
    };
  }, [chatId, messageId, label, url]);

  const seekFromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v?.duration) return;
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const p = (angle + Math.PI) / (2 * Math.PI);
    v.currentTime = Math.max(0, Math.min(v.duration - 0.01, p * v.duration));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('.vn__expand')) return;
      const wrap = wrapRef.current;
      const v = videoRef.current;
      if (!wrap || !v) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const r = rect.width / 2;
      const band = 16;
      if (dist >= r - band && dist <= r + 6) {
        e.preventDefault();
        e.stopPropagation();
        seekingRef.current = true;
        wrap.setPointerCapture(e.pointerId);
        seekFromPointer(e);
        return;
      }
      if (dist < r - band * 1.5) {
        e.preventDefault();
        e.stopPropagation();
        if (v.paused) void v.play();
        else v.pause();
      }
    },
    [seekFromPointer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!seekingRef.current) return;
      e.preventDefault();
      seekFromPointer(e);
    },
    [seekFromPointer]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (seekingRef.current) {
      seekingRef.current = false;
      try {
        wrapRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      className="vn"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <video
        ref={videoRef}
        className="vn__video"
        src={url}
        playsInline
        preload="metadata"
      />
      <svg className="vn__svg" viewBox="0 0 100 100" aria-hidden>
        <circle className="vn__ring-bg" cx="50" cy="50" r={R} />
        <circle
          className="vn__ring-fg"
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={`${progress * CIRC} ${CIRC}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      {!playing && (
        <div className="vn__play-hint" aria-hidden>
          <Play size={36} fill="currentColor" />
        </div>
      )}
      {onExpand && (
        <button
          type="button"
          className="vn__expand"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          title="На весь экран"
        >
          <Maximize2 size={16} />
        </button>
      )}
    </div>
  );
}
