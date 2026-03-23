import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Music2 } from 'lucide-react';
import { useMusicPlayerOptional } from '@/contexts/MusicPlayerContext';
import { fetchAudioId3Tags } from '@/lib/audioId3';
import './MusicBubblePlayer.css';

function titleFromUrl(url: string): string {
  try {
    return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'Трек');
  } catch {
    return 'Трек';
  }
}

interface Props {
  src: string;
  isOwn?: boolean;
}

/** Музыкальный файл — компактный блок; воспроизведение в глобальном нижнем баре (§26.7.2). ID3 для названия/обложки. */
export function MusicBubblePlayer({ src, isOwn }: Props) {
  const ctx = useMusicPlayerOptional();
  const fallbackTitle = titleFromUrl(src);
  const [displayTitle, setDisplayTitle] = useState(fallbackTitle);
  const [artist, setArtist] = useState<string | undefined>(undefined);
  const [cover, setCover] = useState<string | undefined>(undefined);

  useEffect(() => {
    setDisplayTitle(fallbackTitle);
    setArtist(undefined);
    setCover(undefined);
    let cancelled = false;
    void fetchAudioId3Tags(src).then((tags) => {
      if (cancelled || !tags) return;
      if (tags.title) setDisplayTitle(tags.title);
      if (tags.artist) setArtist(tags.artist);
      if (tags.pictureDataUrl) setCover(tags.pictureDataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [src, fallbackTitle]);

  const active = ctx?.isActive(src);
  const playing = active ? ctx!.playing : false;

  const onClick = useCallback(() => {
    if (!ctx) return;
    if (ctx.isActive(src)) ctx.toggle();
    else ctx.play(src, displayTitle, artist);
  }, [ctx, src, displayTitle, artist]);

  const subtitle = active
    ? playing
      ? 'Воспроизводится'
      : 'На паузе'
    : artist
      ? artist
      : 'Воспроизвести в плеере';

  return (
    <button
      type="button"
      className={`mb-music ${isOwn ? 'mb-music--own' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="mb-music__art" aria-hidden>
        {cover ? (
          <img src={cover} alt="" className="mb-music__cover" />
        ) : (
          <Music2 size={24} />
        )}
      </div>
      <div className="mb-music__info">
        <span className="mb-music__name">{displayTitle}</span>
        <span className="mb-music__hint">{subtitle}</span>
      </div>
      <span className="mb-music__btn" aria-hidden>
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </span>
    </button>
  );
}
