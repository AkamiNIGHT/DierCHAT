import { useCallback, useEffect, useState } from 'react';
import { Mic, Pause, Play, Video } from 'lucide-react';
import { useNowPlayingMedia } from '@/store/nowPlayingMedia';
import './NowPlayingBar.css';

type Props = {
  currentChatId: string;
  onJumpToMessage: (messageId: string) => void;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function NowPlayingBar({ currentChatId, onJumpToMessage }: Props) {
  const active = useNowPlayingMedia((s) => s.active);
  const controller = useNowPlayingMedia((s) => s.controller);
  const clear = useNowPlayingMedia((s) => s.clear);

  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [paused, setPaused] = useState(true);

  const visible = !!(active && active.chatId === currentChatId && controller);

  useEffect(() => {
    if (!visible || !controller) {
      setProgress(0);
      setCurrentSec(0);
      setDurationSec(0);
      setPaused(true);
      return;
    }
    let rafId = 0;
    const loop = () => {
      const d = controller.getDuration();
      const c = controller.getCurrentTime();
      setDurationSec(Number.isFinite(d) ? d : 0);
      setCurrentSec(Number.isFinite(c) ? c : 0);
      setProgress(d > 0 && Number.isFinite(c) ? Math.min(1, c / d) : 0);
      setPaused(controller.getPaused());
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [visible, controller]);

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.npb__btn')) return;
      if (active?.messageId) onJumpToMessage(active.messageId);
    },
    [active?.messageId, onJumpToMessage]
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      controller?.toggle();
    },
    [controller]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (controller && !controller.getPaused()) controller.toggle();
      clear();
    },
    [controller, clear]
  );

  if (!visible || !active) return null;

  return (
    <div className="npb" role="region" aria-label="Сейчас воспроизводится">
      <button type="button" className="npb__main" onClick={handleBarClick} title="Перейти к сообщению">
        <div className="npb__top">
          <span className="npb__icon">
            {active.kind === 'video_note' ? <Video size={18} /> : <Mic size={18} />}
          </span>
          <div className="npb__text">
            <span className="npb__title">{active.kind === 'video_note' ? 'Видеокружок' : 'Голосовое'}</span>
            <span className="npb__sub">{active.label}</span>
          </div>
          <span className="npb__time">
            {formatTime(currentSec)} / {formatTime(durationSec)}
          </span>
        </div>
        <div className="npb__progress-wrap" aria-hidden>
          <span className="npb__progress-fg" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </button>
      <button type="button" className="npb__btn" onClick={handleToggle} title={paused ? 'Продолжить' : 'Пауза'} aria-label={paused ? 'Продолжить' : 'Пауза'}>
        {paused ? <Play size={20} /> : <Pause size={20} />}
      </button>
      <button type="button" className="npb__btn npb__btn--close" onClick={handleClose} title="Закрыть" aria-label="Остановить и скрыть">
        ×
      </button>
    </div>
  );
}
