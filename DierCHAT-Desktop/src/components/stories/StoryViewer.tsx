import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, ThumbsUp, Eye } from 'lucide-react';
import type { StoryItem } from '@/lib/stories';
import {
  loadStories,
  saveStories,
  recordStoryView,
  bumpStoryReaction,
  mergeDisplayReactions,
} from '@/lib/stories';
import { api } from '@/api/client';
import { useStore } from '@/store';
import './StoryViewer.css';

type Group = { userId: string; authorName: string; items: StoryItem[] };

interface Props {
  groups: Group[];
  startIndex: number;
  onClose: () => void;
  onUpdate: () => void;
}

const SLIDE_MS = 5200;

export function StoryViewer({ groups, startIndex, onClose, onUpdate }: Props) {
  const currentUserId = useStore((s) => s.user?.id);
  const [gIdx, setGIdx] = useState(startIndex);
  const [sIdx, setSIdx] = useState(0);
  const [slideKey, setSlideKey] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewerTick, setViewerTick] = useState(0);
  const g = groups[gIdx];
  const storyBase = g?.items[sIdx];
  const story = useMemo(() => {
    if (!storyBase) return storyBase;
    if (storyBase.id.startsWith('s_')) {
      const fresh = loadStories().find((s) => s.id === storyBase.id);
      return fresh ?? storyBase;
    }
    return storyBase;
  }, [storyBase, viewerTick]);

  const nextSlide = useRef(() => {});
  nextSlide.current = () => {
    const curG = groups[gIdx];
    if (!curG) {
      onClose();
      return;
    }
    if (sIdx < curG.items.length - 1) {
      setSIdx((i) => i + 1);
      setSlideKey((k) => k + 1);
      return;
    }
    if (gIdx < groups.length - 1) {
      setGIdx((i) => i + 1);
      setSIdx(0);
      setSlideKey((k) => k + 1);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!story?.id || !currentUserId) return;
    if (story.userId === currentUserId) return;
    if (story.id.startsWith('s_')) {
      recordStoryView(story.id, currentUserId);
      setViewerTick((t) => t + 1);
      onUpdate();
      return;
    }
    void api
      .recordStoryView(story.id)
      .then(() => onUpdate())
      .catch(() => {});
    setViewerTick((t) => t + 1);
  }, [story?.id, story?.userId, currentUserId, onUpdate]);

  useEffect(() => {
    const t = setTimeout(() => nextSlide.current(), SLIDE_MS);
    return () => clearTimeout(t);
  }, [gIdx, sIdx, slideKey]);

  const handlePrev = () => {
    if (sIdx > 0) {
      setSIdx((i) => i - 1);
      setSlideKey((k) => k + 1);
      return;
    }
    if (gIdx > 0) {
      const prevG = groups[gIdx - 1];
      setGIdx((i) => i - 1);
      setSIdx(Math.max(0, prevG.items.length - 1));
      setSlideKey((k) => k + 1);
    }
  };

  const react = (emoji: string) => {
    if (!story) return;
    if (story.id.startsWith('s_')) {
      const all = loadStories();
      const i = all.findIndex((x) => x.id === story.id);
      if (i < 0) return;
      all[i].reactions[emoji] = (all[i].reactions[emoji] || 0) + 1;
      saveStories(all);
    } else {
      bumpStoryReaction(story.id, emoji);
    }
    setViewerTick((t) => t + 1);
    onUpdate();
  };

  if (!g || !story) {
    return null;
  }

  const isOwnRing = currentUserId != null && g.userId === currentUserId;
  const viewCount = story.viewers?.length ?? 0;
  const localLegacy = story.id.startsWith('s_');
  const rx = mergeDisplayReactions(story.reactions, story.id, localLegacy);
  const heartCount = (rx['❤️'] || 0) + (rx['heart'] || 0);
  const likeCount = rx['👍'] || 0;

  return (
    <div className="story-viewer" role="dialog" aria-modal>
      <button type="button" className="story-viewer__close" onClick={onClose} aria-label="Закрыть">
        <X size={28} />
      </button>
      <div className="story-viewer__progress">
        {g.items.map((_, i) => (
          <div key={`${slideKey}-${i}`} className="story-viewer__seg">
            {i === sIdx ? (
              <div
                key={slideKey}
                className="story-viewer__fill story-viewer__fill--anim"
                style={{ animationDuration: `${SLIDE_MS}ms` }}
              />
            ) : (
              <div
                className="story-viewer__fill story-viewer__fill--static"
                style={{ width: i < sIdx ? '100%' : '0%' }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="story-viewer__head">
        <span className="story-viewer__author">{g.authorName}</span>
        {isOwnRing && (
          <button
            type="button"
            className="story-viewer__views"
            onClick={() => setShowViewers((v) => !v)}
            title="Просмотревшие"
          >
            <Eye size={16} /> {viewCount}
          </button>
        )}
      </div>
      {isOwnRing && showViewers && (
        <div className="story-viewer__viewers-panel">
          <div className="story-viewer__viewers-title">Просмотревшие ({viewCount})</div>
          {viewCount === 0 ? (
            <div className="story-viewer__viewers-empty">Пока никого</div>
          ) : (
            <ul className="story-viewer__viewers-list">
              {story.viewers.map((id) => (
                <li key={id} className="story-viewer__viewer-id">
                  {id === currentUserId ? 'Вы' : `id: ${id.slice(0, 8)}…`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" className="story-viewer__tap story-viewer__tap--left" onClick={handlePrev} aria-label="Назад">
        <ChevronLeft size={40} />
      </button>
      <div className="story-viewer__media">
        {story.mediaKind === 'video' ? (
          <video
            key={story.id}
            src={story.mediaUrl}
            className="story-viewer__video"
            autoPlay
            muted
            playsInline
            loop
          />
        ) : (
          <img src={story.mediaUrl} alt="" />
        )}
        {story.caption && <div className="story-viewer__caption">{story.caption}</div>}
      </div>
      <button
        type="button"
        className="story-viewer__tap story-viewer__tap--right"
        onClick={() => nextSlide.current()}
        aria-label="Далее"
      >
        <ChevronRight size={40} />
      </button>
      <div className="story-viewer__reactions">
        <button type="button" onClick={() => react('❤️')} aria-label="Сердце" className="story-viewer__rx">
          <Heart size={22} />
          {heartCount > 0 && <span className="story-viewer__rx-count">{heartCount}</span>}
        </button>
        <button type="button" onClick={() => react('👍')} aria-label="Лайк" className="story-viewer__rx">
          <ThumbsUp size={22} />
          {likeCount > 0 && <span className="story-viewer__rx-count">{likeCount}</span>}
        </button>
      </div>
    </div>
  );
}
