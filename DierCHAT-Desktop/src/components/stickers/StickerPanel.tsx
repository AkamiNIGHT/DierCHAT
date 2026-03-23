import { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Plus, Store, Cloud, Trash2, Pencil, FolderPlus } from 'lucide-react';
import { api } from '@/api/client';
import type { ServerSticker, ServerStickerPackWithStickers } from '@/api/client';
import {
  DEFAULT_STICKER_PACKS,
  encodeSticker,
  encodeServerSticker,
  flattenStickersFromLibrary,
  loadCustomStickers,
  mergeServerStickers,
  removeServerStickerFromCache,
  saveCustomStickers,
  type CustomSticker,
} from '@/lib/stickers';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './StickerPanel.css';

type TabId = string | 'custom' | 'shop';

interface Props {
  onPick: (encodedSticker: string) => void;
  onClose: () => void;
}

export function StickerPanel({ onPick, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('classic');
  const [custom, setCustom] = useState<CustomSticker[]>(loadCustomStickers);
  const [packs, setPacks] = useState<ServerStickerPackWithStickers[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [uploadingCloud, setUploadingCloud] = useState(false);

  useEffect(() => {
    setCustom(loadCustomStickers());
  }, []);

  const refreshServerStickers = useCallback(async () => {
    setServerLoading(true);
    try {
      const lib = await api.getMyStickerLibrary();
      const list = lib.packs ?? [];
      mergeServerStickers(flattenStickersFromLibrary(list));
      setPacks(list);
      setSelectedPackId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      setPacks([]);
    } finally {
      setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshServerStickers();
  }, [refreshServerStickers]);

  const tabs = useMemo(() => {
    const base = DEFAULT_STICKER_PACKS.map((p) => ({ id: p.id as TabId, label: p.name }));
    return [...base, { id: 'custom' as const, label: 'Мои' }, { id: 'shop' as const, label: 'Магазин' }];
  }, []);

  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) ?? packs[0],
    [packs, selectedPackId]
  );

  const serverStickers: ServerSticker[] = selectedPack?.stickers ?? [];

  const handleFileLocal = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const id = `c_${Date.now()}`;
        const next: CustomSticker[] = [...custom, { id, dataUrl, tag: file.name }];
        const trimmed = next.slice(-48);
        saveCustomStickers(trimmed);
        setCustom(trimmed);
        setTab('custom');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [custom]
  );

  const handleNewPack = useCallback(async () => {
    const title = window.prompt('Название набора', 'Новый набор')?.trim();
    if (!title) return;
    try {
      await api.createStickerPack(title);
      await refreshServerStickers();
      setTab('custom');
    } catch {
      /* ignore */
    }
  }, [refreshServerStickers]);

  const handleRenamePack = useCallback(async () => {
    if (!selectedPack) return;
    const title = window.prompt('Новое название', selectedPack.title)?.trim();
    if (!title) return;
    try {
      await api.renameStickerPack(selectedPack.id, title);
      await refreshServerStickers();
    } catch {
      /* ignore */
    }
  }, [selectedPack, refreshServerStickers]);

  const handleDeletePack = useCallback(async () => {
    if (!selectedPack) return;
    if (!window.confirm(`Удалить набор «${selectedPack.title}» и все стикеры в нём?`)) return;
    try {
      await api.deleteStickerPack(selectedPack.id);
      for (const s of selectedPack.stickers ?? []) removeServerStickerFromCache(s.id);
      await refreshServerStickers();
    } catch {
      /* ignore */
    }
  }, [selectedPack, refreshServerStickers]);

  const handleFileCloud = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) return;
      setUploadingCloud(true);
      try {
        const up = await api.uploadFile(file);
        const packId = selectedPack?.id;
        const st = await api.createSticker(up.url, packId);
        mergeServerStickers([st]);
        await refreshServerStickers();
        if (packId) setSelectedPackId(packId);
        setTab('custom');
      } catch {
        /* toast optional */
      } finally {
        setUploadingCloud(false);
      }
    },
    [selectedPack, refreshServerStickers]
  );

  const handleDeleteCloud = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
        await api.deleteSticker(id);
        removeServerStickerFromCache(id);
        await refreshServerStickers();
      } catch {
        /* ignore */
      }
    },
    [refreshServerStickers]
  );

  const thumbUrl = (url: string) => normalizeMediaUrl(url.trim()) || url.trim();

  return (
    <div className="st-panel" onClick={(e) => e.stopPropagation()}>
      <div className="st-panel__head">
        <span className="st-panel__title">Стикеры</span>
        <button type="button" className="st-panel__close" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
      </div>
      <div className="st-panel__tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`st-panel__tab ${tab === t.id ? 'st-panel__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="st-panel__body">
        {tab === 'shop' && (
        <div className="st-panel__shop">
          <Store size={48} />
          <p>Магазин стикеров скоро будет в каталоге.</p>
          <p className="st-panel__hint">Пока используйте наборы «Классика», «Коты» и вкладку «Мои».</p>
        </div>
        )}

        {tab === 'custom' && (
        <>
          <div className="st-panel__section">
            <div className="st-panel__section-title">
              <Cloud size={14} /> Облако
            </div>
            <div className="st-panel__pack-row">
              <div className="st-panel__pack-chips">
                {packs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`st-panel__pack-chip ${selectedPack?.id === p.id ? 'st-panel__pack-chip--active' : ''}`}
                    onClick={() => setSelectedPackId(p.id)}
                    title={p.title}
                  >
                    {p.title.length > 14 ? `${p.title.slice(0, 12)}…` : p.title}
                  </button>
                ))}
                <button type="button" className="st-panel__pack-chip st-panel__pack-chip--add" onClick={() => void handleNewPack()} title="Новый набор">
                  <FolderPlus size={16} />
                </button>
              </div>
              {selectedPack && (
                <div className="st-panel__pack-actions">
                  <button type="button" className="st-panel__icon-btn" title="Переименовать" onClick={() => void handleRenamePack()}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="st-panel__icon-btn st-panel__icon-btn--danger" title="Удалить набор" onClick={() => void handleDeletePack()}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
            <div className="st-panel__toolbar">
              <label className={`st-panel__add ${uploadingCloud ? 'st-panel__add--disabled' : ''}`}>
                <Plus size={18} /> {uploadingCloud ? 'Загрузка…' : 'В выбранный набор'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={uploadingCloud}
                  onChange={handleFileCloud}
                />
              </label>
              <span className="st-panel__hint">
                {selectedPack ? `Загрузка в «${selectedPack.title}»` : 'Сначала создайте набор (+) или откройте чат после первой загрузки'}
              </span>
            </div>
            <div className="st-panel__grid">
              {serverLoading && serverStickers.length === 0 && (
                <div className="st-panel__empty st-panel__empty--wide">Загрузка…</div>
              )}
              {!serverLoading && packs.length === 0 && (
                <div className="st-panel__empty st-panel__empty--wide">Нет наборов — нажмите + или отправьте стикер из чата</div>
              )}
              {!serverLoading && packs.length > 0 && serverStickers.length === 0 && (
                <div className="st-panel__empty st-panel__empty--wide">В этом наборе пока пусто</div>
              )}
              {serverStickers.map((s) => (
                <div key={s.id} className="st-panel__cell-wrap">
                  <button
                    type="button"
                    className="st-panel__cell st-panel__cell--img"
                    onClick={() => onPick(encodeServerSticker(s.id))}
                  >
                    <img src={thumbUrl(s.media_url)} alt="" draggable={false} />
                  </button>
                  <button
                    type="button"
                    className="st-panel__cell-delete"
                    title="Удалить"
                    aria-label="Удалить стикер"
                    onClick={(e) => void handleDeleteCloud(e, s.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="st-panel__section">
            <div className="st-panel__section-title">На этом устройстве</div>
            <div className="st-panel__toolbar">
              <label className="st-panel__add">
                <Plus size={18} /> PNG / JPG
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFileLocal} />
              </label>
              <span className="st-panel__hint">До 48 шт. локально в браузере</span>
            </div>
            <div className="st-panel__grid">
              {custom.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className="st-panel__cell st-panel__cell--img"
                  onClick={() => onPick(encodeSticker('custom', i))}
                >
                  <img src={c.dataUrl} alt="" draggable={false} />
                </button>
              ))}
              {custom.length === 0 && <div className="st-panel__empty st-panel__empty--wide">Нет локальных — загрузите PNG/JPG</div>}
            </div>
          </div>
        </>
        )}

        {tab !== 'shop' && tab !== 'custom' && (
          <div className="st-panel__grid">
            {DEFAULT_STICKER_PACKS.filter((p) => p.id === tab).map((pack) =>
              pack.items.map((emoji, i) => (
                <button
                  key={`${pack.id}-${i}`}
                  type="button"
                  className="st-panel__cell"
                  onClick={() => onPick(encodeSticker(pack.id, i))}
                >
                  {emoji}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
