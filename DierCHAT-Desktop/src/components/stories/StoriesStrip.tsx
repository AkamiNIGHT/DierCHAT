import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/api/client';
import { useStore } from '@/store';
import {
  loadStories,
  addStory,
  storiesByUser,
  mergeServerAndLocal,
  storyFromApi,
  type StoryItem,
} from '@/lib/stories';
import { StoryViewer } from './StoryViewer';
import { Avatar } from '@/components/common/Avatar';
import './StoriesStrip.css';

export function StoriesStrip() {
  const user = useStore((s) => s.user);
  const [items, setItems] = useState<StoryItem[]>([]);
  const [viewer, setViewer] = useState<{ groups: ReturnType<typeof storiesByUser>; index: number } | null>(null);
  const [captionDraft, setCaptionDraft] = useState<{ file: File; previewUrl: string } | null>(null);

  const refresh = useCallback(async () => {
    let server: StoryItem[] = [];
    try {
      const rows = await api.getStoriesFeed();
      server = rows.map(storyFromApi);
    } catch {
      /* нет сети / без бэка */
    }
    const local = loadStories();
    setItems(mergeServerAndLocal(server, local));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onStorage = () => void refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  useEffect(() => {
    const onFriends = () => void refresh();
    window.addEventListener('dierchat:friends_changed', onFriends);
    return () => window.removeEventListener('dierchat:friends_changed', onFriends);
  }, [refresh]);

  useEffect(() => {
    api.getChats().catch(() => {});
  }, []);

  const publishStory = async (file: File, caption: string) => {
    if (!user) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return;

    try {
      const up = await api.uploadFile(file);
      await api.createStory({
        media_url: up.url,
        media_kind: isVideo ? 1 : 0,
        caption: caption.trim() || undefined,
      });
      await refresh();
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        addStory({
          id: `s_${Date.now()}`,
          userId: user.id,
          authorName: user.display_name || 'Вы',
          mediaUrl: url,
          mediaKind: isVideo ? 'video' : 'image',
          caption: caption.trim() || undefined,
          createdAt: Date.now(),
        });
        void refresh();
      };
      reader.readAsDataURL(file);
    }
  };

  const groups = storiesByUser(items).filter((g) => g.items.length > 0);

  return (
    <>
      <div className="stories-strip">
        <label className="stories-strip__add" title="Добавить историю (фото или видео)">
          <Plus size={22} />
          <input
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const previewUrl = URL.createObjectURL(f);
                setCaptionDraft({ file: f, previewUrl });
              }
              e.target.value = '';
            }}
          />
        </label>
        {groups.map((g, i) => (
          <button
            key={g.userId}
            type="button"
            className="stories-strip__ring"
            onClick={() => setViewer({ groups, index: i })}
          >
            <span className="stories-strip__ring-border">
              <Avatar name={g.authorName} size={56} imageUrl={g.authorAvatarUrl} />
            </span>
            <span className="stories-strip__name">{g.authorName.slice(0, 14)}</span>
          </button>
        ))}
      </div>

      {captionDraft && (
        <div
          className="stories-caption-modal"
          role="dialog"
          aria-modal
          onClick={() => {
            URL.revokeObjectURL(captionDraft.previewUrl);
            setCaptionDraft(null);
          }}
        >
          <div className="stories-caption-modal__box" onClick={(e) => e.stopPropagation()}>
            <div className="stories-caption-modal__preview">
              {captionDraft.file.type.startsWith('video/') ? (
                <video src={captionDraft.previewUrl} muted playsInline className="stories-caption-modal__media" />
              ) : (
                <img src={captionDraft.previewUrl} alt="" className="stories-caption-modal__media" />
              )}
            </div>
            <label className="stories-caption-modal__label">Подпись (необязательно)</label>
            <CaptionForm
              onSubmit={(text) => {
                void publishStory(captionDraft.file, text).finally(() => {
                  URL.revokeObjectURL(captionDraft.previewUrl);
                  setCaptionDraft(null);
                });
              }}
              onCancel={() => {
                URL.revokeObjectURL(captionDraft.previewUrl);
                setCaptionDraft(null);
              }}
            />
          </div>
        </div>
      )}

      {viewer && viewer.groups.length > 0 && (
        <StoryViewer
          groups={viewer.groups}
          startIndex={viewer.index}
          onClose={() => setViewer(null)}
          onUpdate={refresh}
        />
      )}
    </>
  );
}

function CaptionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <>
      <textarea
        className="stories-caption-modal__input"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Текст на истории…"
        maxLength={280}
      />
      <div className="stories-caption-modal__actions">
        <button type="button" className="stories-caption-modal__btn stories-caption-modal__btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="stories-caption-modal__btn" onClick={() => onSubmit(text)}>
          Опубликовать
        </button>
      </div>
    </>
  );
}
