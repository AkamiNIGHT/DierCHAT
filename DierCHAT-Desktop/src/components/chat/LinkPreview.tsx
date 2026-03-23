import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { X } from 'lucide-react';
import './LinkPreview.css';

const URL_REGEX = /https?:\/\/[^\s]+/gi;

function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  if (!m?.[0]) return null;
  let u = m[0];
  while (/[.,;:!?)]$/.test(u)) u = u.slice(0, -1);
  return u;
}

type OGData = { title?: string; description?: string; image?: string };

export function LinkPreview({
  url,
  onRemove,
  onOpenLink,
}: {
  url: string;
  onRemove?: () => void;
  /** ТЗ §28 — открытие во встроенном / системном браузере */
  onOpenLink?: (url: string, e: React.MouseEvent) => void;
}) {
  const [data, setData] = useState<OGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getOGPreview(url)
      .then((d) => {
        if (!cancelled && (d.title || d.description || d.image)) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url]);

  if (hidden || loading || !data) return null;
  if (!data.title && !data.description && !data.image) return null;

  const handleRemove = () => {
    setHidden(true);
    onRemove?.();
  };

  return (
    <div className="link-preview glass-panel">
      {data.image && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-preview__image-wrap"
          onClick={onOpenLink ? (e) => onOpenLink(url, e) : undefined}
        >
          <img src={data.image} alt="" className="link-preview__image" loading="lazy" />
        </a>
      )}
      <div className="link-preview__body">
        {data.title && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="link-preview__title"
            onClick={onOpenLink ? (e) => onOpenLink(url, e) : undefined}
          >
            {data.title}
          </a>
        )}
        {data.description && (
          <p className="link-preview__desc">{data.description.slice(0, 160)}{data.description.length > 160 ? '…' : ''}</p>
        )}
      </div>
      {onRemove && (
        <button type="button" className="link-preview__remove" onClick={handleRemove} title="Убрать превью">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function useLinkPreview(text: string) {
  return extractFirstUrl(text || '');
}
