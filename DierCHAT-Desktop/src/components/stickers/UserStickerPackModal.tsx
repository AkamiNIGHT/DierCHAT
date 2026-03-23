import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Check, Layers } from 'lucide-react';
import { api } from '@/api/client';
import type { ServerSticker, ServerStickerPackWithStickers, UserStickerLibraryResponse } from '@/api/client';
import { flattenStickersFromLibrary, mergeServerStickers } from '@/lib/stickers';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './UserStickerPackModal.css';

function normUrl(u: string): string {
  return (normalizeMediaUrl(u.trim()) || u.trim()).toLowerCase();
}

type Props = {
  onClose: () => void;
  userId: string;
  displayName: string;
  highlightStickerId?: string;
  isOwn: boolean;
};

export function UserStickerPackModal({
  onClose,
  userId,
  displayName,
  highlightStickerId,
  isOwn,
}: Props) {
  const [library, setLibrary] = useState<UserStickerLibraryResponse | null>(null);
  const [mine, setMine] = useState<ServerSticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);

  const mineMedia = useMemo(() => {
    const s = new Set<string>();
    for (const m of mine) s.add(normUrl(m.media_url));
    return s;
  }, [mine]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [their, myLib] = await Promise.all([
        api.getUserStickerLibrary(userId),
        api.getMyStickerLibrary(),
      ]);
      setLibrary(their);
      setMine(flattenStickersFromLibrary(myLib.packs ?? []));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const mergeImported = useCallback((list: ServerSticker[]) => {
    mergeServerStickers(list);
    setMine((prev) => {
      const next = [...prev];
      const ids = new Set(next.map((x) => x.id));
      for (const s of list) {
        if (!ids.has(s.id)) next.push(s);
      }
      return next;
    });
  }, []);

  const handleImportOne = async (st: ServerSticker) => {
    if (isOwn || mineMedia.has(normUrl(st.media_url))) return;
    setImporting(st.id);
    setErr(null);
    try {
      const created = await api.importSticker(st.id);
      mergeImported([created]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось';
      if (!msg.includes('Уже') && !msg.includes('409')) setErr(msg);
    } finally {
      setImporting(null);
    }
  };

  const handleImportPack = async (packId: string) => {
    if (isOwn) return;
    setImporting(`pack:${packId}`);
    setErr(null);
    try {
      const pw = await api.importStickerPack(packId);
      mergeImported(pw.stickers ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка импорта набора');
    } finally {
      setImporting(null);
    }
  };

  const handleImportAll = async () => {
    if (isOwn) return;
    setImportingAll(true);
    setErr(null);
    try {
      const res = await api.importAllStickerPacksFromUser(userId);
      const flat = flattenStickersFromLibrary(res.packs ?? []);
      mergeImported(flat);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setImportingAll(false);
    }
  };

  const authorLabel = library?.author?.display_name?.trim() || displayName || 'Пользователь';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="usp-modal" role="dialog" aria-modal aria-labelledby="usp-title">
      <button type="button" className="usp-modal__backdrop" onClick={onClose} aria-label="Закрыть" />
      <div className="usp-modal__panel">
        <div className="usp-modal__head">
          <h2 id="usp-title" className="usp-modal__title">
            {isOwn ? 'Ваши наборы' : `Наборы: ${authorLabel}`}
          </h2>
          <button type="button" className="usp-modal__close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        {!isOwn && library && library.packs.length > 0 && (
          <div className="usp-modal__bulk">
            <button
              type="button"
              className="usp-modal__bulk-btn"
              disabled={importingAll || !!importing}
              onClick={() => void handleImportAll()}
            >
              <Layers size={16} />
              {importingAll ? 'Копирование…' : 'Добавить все наборы'}
            </button>
          </div>
        )}

        <p className="usp-modal__hint">
          {isOwn
            ? 'У каждого набора своё название. Собеседник откроет список и сможет скопировать целиком или по одному.'
            : '«Добавить все из набора» — копия набора к вам. «Добавить все наборы» — копии всех наборов сразу.'}
        </p>
        {err && <div className="usp-modal__err">{err}</div>}
        {loading ? (
          <div className="usp-modal__loading">Загрузка…</div>
        ) : (
          <div className="usp-modal__body">
            {!library || library.packs.length === 0 ? (
              <div className="usp-modal__empty">Нет наборов со стикерами</div>
            ) : (
              library.packs.map((pack: ServerStickerPackWithStickers) => (
                <section key={pack.id} className="usp-pack">
                  <div className="usp-pack__head">
                    <h3 className="usp-pack__title">{pack.title}</h3>
                    {!isOwn && (
                      <button
                        type="button"
                        className="usp-pack__all"
                        disabled={!!importing || importingAll}
                        onClick={() => void handleImportPack(pack.id)}
                      >
                        {importing === `pack:${pack.id}` ? '…' : 'Добавить все из набора'}
                      </button>
                    )}
                  </div>
                  <div className="usp-modal__grid">
                    {(pack.stickers ?? []).map((s) => {
                      const thumb = normalizeMediaUrl(s.media_url.trim()) || s.media_url.trim();
                      const has = mineMedia.has(normUrl(s.media_url));
                      const hi =
                        highlightStickerId && s.id.toLowerCase() === highlightStickerId.toLowerCase();
                      return (
                        <div key={s.id} className={`usp-cell ${hi ? 'usp-cell--hi' : ''}`}>
                          <div className="usp-cell__img">
                            <img src={thumb} alt="" draggable={false} />
                          </div>
                          {!isOwn && (
                            <button
                              type="button"
                              className="usp-cell__btn"
                              disabled={has || importing === s.id || !!importingAll}
                              onClick={() => void handleImportOne(s)}
                            >
                              {has ? (
                                <>
                                  <Check size={14} /> Есть
                                </>
                              ) : importing === s.id ? (
                                '…'
                              ) : (
                                <>
                                  <Plus size={14} /> Добавить
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {(pack.stickers ?? []).length === 0 && (
                      <div className="usp-modal__empty usp-modal__empty--inline">Пусто</div>
                    )}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
