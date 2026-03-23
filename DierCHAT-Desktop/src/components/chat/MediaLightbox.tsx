import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useStore } from '@/store';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import './MediaLightbox.css';

export type LightboxMedia = { kind: 'image' | 'video' | 'audio'; url: string };

type Props = {
  media: LightboxMedia;
  onClose: () => void;
};

export function MediaLightbox({ media, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const speakerId = useStore((s) => s.devicePrefs.speakerId);

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    const apply = () => {
      if (media.kind === 'video' && v) void applySinkIdToMediaElement(v, speakerId);
      if (media.kind === 'audio' && a) void applySinkIdToMediaElement(a, speakerId);
    };
    apply();
    v?.addEventListener('play', apply);
    a?.addEventListener('play', apply);
    return () => {
      v?.removeEventListener('play', apply);
      a?.removeEventListener('play', apply);
    };
  }, [media.kind, media.url, speakerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const node = (
    <div className="media-lightbox" role="dialog" aria-modal aria-label="Просмотр медиа">
      <div className="media-lightbox__backdrop" onClick={onClose} />
      <div className="media-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-lightbox__close" onClick={onClose} aria-label="Закрыть">
          <X size={28} />
        </button>
        {media.kind === 'image' && (
          <img src={media.url} alt="" className="media-lightbox__img" draggable={false} />
        )}
        {media.kind === 'video' && (
          <video
            ref={videoRef}
            className="media-lightbox__video"
            src={media.url}
            controls
            autoPlay
            playsInline
            controlsList="nodownload"
          />
        )}
        {media.kind === 'audio' && (
          <div className="media-lightbox__audio-wrap">
            <audio
              ref={audioRef}
              className="media-lightbox__audio"
              src={media.url}
              controls
              autoPlay
              playsInline
            />
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
