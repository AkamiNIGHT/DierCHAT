import { useCallback, useEffect, useState } from 'react';
import { Monitor, AppWindow, X } from 'lucide-react';
import './ScreenSharePicker.css';

export type DesktopSourceKind = 'screen' | 'window';

export type DesktopSourceInfo = {
  id: string;
  name: string;
  thumbnail: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Выбран источник — вызывающий запускает захват по id */
  onPick: (sourceId: string) => void;
  /** Electron: открыть системный getDisplayMedia (часто доступен захват системного звука) */
  onUseSystemPicker?: () => void;
};

/** Модальное окно выбора экрана/окна (Electron + §24, стиль Liquid Glass при включённом режиме). */
export function ScreenSharePicker({ open, onClose, onPick, onUseSystemPicker }: Props) {
  const [tab, setTab] = useState<DesktopSourceKind>('screen');
  const [sources, setSources] = useState<DesktopSourceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (kind: DesktopSourceKind) => {
    if (!window.dierchat?.getDesktopSources) return;
    setLoading(true);
    setError('');
    try {
      const list = await window.dierchat.getDesktopSources(kind);
      setSources(Array.isArray(list) ? list : []);
    } catch {
      setError('Не удалось получить список источников');
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(tab);
  }, [open, tab, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ssp-overlay" role="dialog" aria-modal="true" aria-labelledby="ssp-title" onClick={onClose}>
      <div className="ssp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ssp-header">
          <h2 id="ssp-title" className="ssp-title">
            Демонстрация экрана
          </h2>
          <button type="button" className="ssp-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <p className="ssp-hint">
          Выберите превью ниже или откройте системный диалог — там обычно можно включить звук экрана/окна.
        </p>

        <div className="ssp-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'screen'}
            className={`ssp-tab ${tab === 'screen' ? 'ssp-tab--active' : ''}`}
            onClick={() => setTab('screen')}
          >
            <Monitor size={16} /> Экраны
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'window'}
            className={`ssp-tab ${tab === 'window' ? 'ssp-tab--active' : ''}`}
            onClick={() => setTab('window')}
          >
            <AppWindow size={16} /> Окна
          </button>
        </div>

        <div className="ssp-body">
          {loading && <div className="ssp-loading">Загрузка…</div>}
          {error && <div className="ssp-error">{error}</div>}
          {!loading && !error && sources.length === 0 && (
            <div className="ssp-empty">Нет доступных источников</div>
          )}
          <div className="ssp-grid">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                className="ssp-card"
                onClick={() => onPick(s.id)}
                title={s.name}
              >
                <div className="ssp-thumb-wrap">
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt="" className="ssp-thumb" />
                  ) : (
                    <div className="ssp-thumb-placeholder" />
                  )}
                </div>
                <span className="ssp-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ssp-footer">
          {onUseSystemPicker && (
            <button type="button" className="ssp-btn ssp-btn--primary" onClick={onUseSystemPicker}>
              Системный выбор…
            </button>
          )}
          <button type="button" className="ssp-btn ssp-btn--ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
