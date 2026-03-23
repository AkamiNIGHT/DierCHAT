import { useCallback, type MouseEvent } from 'react';
import { Pause, Play, X, Music2, SkipForward } from 'lucide-react';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import './MusicBottomBar.css';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Глобальный музыкальный бар внизу экрана (§26.7.2), не для голосовых. */
export function MusicBottomBar() {
  const { track, queueLength, playing, currentTime, duration, toggle, seek, stopAndClear, skipNext } =
    useMusicPlayer();

  const progress = duration > 0 ? currentTime / duration : 0;

  const onBarClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seek(ratio);
    },
    [seek]
  );

  if (!track) return null;

  return (
    <div className="music-bar" role="region" aria-label="Музыкальный плеер">
      <div className="music-bar__cover" aria-hidden>
        {track.albumArt ? (
          <img src={track.albumArt} alt="" className="music-bar__cover-img" />
        ) : (
          <Music2 size={22} />
        )}
      </div>
      <div className="music-bar__main">
        <div className="music-bar__titles">
          <span className="music-bar__title" title={track.title}>
            {track.title}
          </span>
          {(track.artist || queueLength > 0) && (
            <span className="music-bar__artist" title={track.artist}>
              {track.artist
                ? queueLength > 0
                  ? `${track.artist} · ещё ${queueLength} в очереди`
                  : track.artist
                : `Ещё ${queueLength} в очереди`}
            </span>
          )}
        </div>
        <div className="music-bar__row">
          <button
            type="button"
            className="music-bar__play"
            onClick={() => toggle()}
            aria-label={playing ? 'Пауза' : 'Воспроизведение'}
          >
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          {queueLength > 0 && (
            <button
              type="button"
              className="music-bar__next"
              onClick={() => skipNext()}
              aria-label="Следующий трек"
              title="Следующий трек"
            >
              <SkipForward size={20} />
            </button>
          )}
          <div className="music-bar__side">
            <div className="music-bar__bar-wrap" onClick={onBarClick}>
              <div className="music-bar__bar-bg" />
              <div className="music-bar__bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="music-bar__time">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>
          </div>
          <button
            type="button"
            className="music-bar__close"
            onClick={stopAndClear}
            aria-label="Закрыть плеер"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
