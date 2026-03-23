import { useState, useRef, useCallback, useEffect } from 'react';
import './AvatarCropModal.css';

type Props = {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => void;
};

const OUT = 512;
const VIEW = 280;

/** ТЗ §35: кроппер 1:1, круглый экспорт (canvas) */
export function AvatarCropModal({ open, imageSrc, onClose, onConfirm }: Props) {
  const [zoom, setZoom] = useState(1);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (open && imageSrc) setZoom(1);
  }, [open, imageSrc]);

  const exportCircle = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const z = Math.max(0.5, Math.min(3, zoom));
    const crop = Math.min(iw, ih) / z;
    const sx = (iw - crop) / 2;
    const sy = (ih - crop) / 2;
    ctx.drawImage(img, sx, sy, crop, crop, 0, 0, OUT, OUT);

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
        onClose();
      },
      'image/png',
      0.92
    );
  }, [zoom, onConfirm, onClose]);

  if (!open || !imageSrc) return null;

  const z = Math.max(0.5, Math.min(3, zoom));
  const imgScale = `${(115 * z).toFixed(1)}%`;

  return (
    <div className="acm-overlay" role="dialog" aria-modal aria-labelledby="acm-title">
      <div className="acm-panel">
        <h3 id="acm-title">Область аватарки</h3>
        <p className="acm-hint">Масштаб: меньше значение — больше лица в круге.</p>
        <div className="acm-viewport" style={{ width: VIEW, height: VIEW }}>
          <div className="acm-mask-ring" />
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            className="acm-img"
            draggable={false}
            style={{
              width: imgScale,
              height: imgScale,
              maxWidth: 'none',
            }}
          />
        </div>
        <label className="acm-zoom">
          Масштаб
          <input
            type="range"
            min={0.6}
            max={2.8}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div className="acm-actions">
          <button type="button" className="acm-btn acm-btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="acm-btn acm-btn--primary" onClick={exportCircle}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
