import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { MusicBottomBar } from '@/components/chat/MusicBottomBar';
import { fetchAudioId3Tags } from '@/lib/audioId3';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import { useStore } from '@/store';

export type MusicTrack = {
  src: string;
  title: string;
  artist?: string;
  /** data URL обложки из ID3 */
  albumArt?: string;
};

type MusicState = {
  current: MusicTrack | null;
  /** Очередь после текущего трека (§26.7.2) */
  queue: MusicTrack[];
};

type MusicAction =
  | { type: 'PLAY'; track: MusicTrack }
  | { type: 'TRACK_ENDED' }
  | { type: 'SKIP_NEXT' }
  | { type: 'STOP' }
  | { type: 'PATCH_TRACK'; src: string; patch: Partial<Pick<MusicTrack, 'title' | 'artist' | 'albumArt'>> };

function musicReducer(state: MusicState, action: MusicAction): MusicState {
  switch (action.type) {
    case 'PLAY': {
      const t = action.track;
      if (state.current?.src === t.src) return state;
      if (!state.current) return { ...state, current: t };
      return { ...state, queue: [...state.queue, t] };
    }
    case 'PATCH_TRACK': {
      const { src, patch } = action;
      if (state.current?.src === src) {
        return { ...state, current: { ...state.current, ...patch } };
      }
      const qi = state.queue.findIndex((x) => x.src === src);
      if (qi >= 0) {
        const queue = [...state.queue];
        queue[qi] = { ...queue[qi], ...patch };
        return { ...state, queue };
      }
      return state;
    }
    case 'TRACK_ENDED':
    case 'SKIP_NEXT': {
      if (state.queue.length === 0) {
        return { current: null, queue: [] };
      }
      const [next, ...rest] = state.queue;
      return { current: next, queue: rest };
    }
    case 'STOP':
      return { current: null, queue: [] };
    default:
      return state;
  }
}

type MusicCtx = {
  track: MusicTrack | null;
  queueLength: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  play: (src: string, title: string, artist?: string) => void;
  toggle: () => void;
  pause: () => void;
  seek: (ratio: number) => void;
  stopAndClear: () => void;
  skipNext: () => void;
  isActive: (src: string) => boolean;
};

const Ctx = createContext<MusicCtx | null>(null);

export function useMusicPlayer(): MusicCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMusicPlayer outside MusicPlayerProvider');
  return v;
}

export function useMusicPlayerOptional(): MusicCtx | null {
  return useContext(Ctx);
}

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const speakerId = useStore((s) => s.devicePrefs.speakerId);
  const [state, dispatch] = useReducer(musicReducer, { current: null, queue: [] });
  const track = state.current;
  const queueLength = state.queue.length;

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const play = useCallback((src: string, title: string, artist?: string) => {
    dispatch({ type: 'PLAY', track: { src, title, artist } });
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !track) return;
    if (a.paused) void a.play();
    else a.pause();
  }, [track]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback(
    (ratio: number) => {
      const a = audioRef.current;
      if (!a || !duration) return;
      a.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration]
  );

  const stopAndClear = useCallback(() => {
    dispatch({ type: 'STOP' });
  }, []);

  const skipNext = useCallback(() => {
    dispatch({ type: 'SKIP_NEXT' });
  }, []);

  const isActive = useCallback((src: string) => track?.src === src, [track]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!track) {
      a.pause();
      a.removeAttribute('src');
      return;
    }
    a.src = track.src;
    const p = a.play();
    if (p) p.catch(() => {});
  }, [track]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => {
      setPlaying(true);
      void applySinkIdToMediaElement(a, speakerId);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
      dispatch({ type: 'TRACK_ENDED' });
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, [speakerId]);

  useEffect(() => {
    if (track) {
      setCurrentTime(0);
      setDuration(0);
    }
  }, [track?.src]);

  useEffect(() => {
    void applySinkIdToMediaElement(audioRef.current, speakerId);
  }, [speakerId, track?.src]);

  /** §26.7: подтягиваем ID3 (название, исполнитель, обложка) для текущего трека */
  useEffect(() => {
    if (!track?.src) return;
    let cancelled = false;
    const src = track.src;
    void fetchAudioId3Tags(src).then((tags) => {
      if (cancelled || !tags) return;
      const patch: Partial<Pick<MusicTrack, 'title' | 'artist' | 'albumArt'>> = {};
      if (tags.title) patch.title = tags.title;
      if (tags.artist) patch.artist = tags.artist;
      if (tags.pictureDataUrl) patch.albumArt = tags.pictureDataUrl;
      if (Object.keys(patch).length === 0) return;
      dispatch({ type: 'PATCH_TRACK', src, patch });
    });
    return () => {
      cancelled = true;
    };
  }, [track?.src]);

  useEffect(() => {
    if (track) {
      document.documentElement.style.setProperty('--music-bar-height', '68px');
    } else {
      document.documentElement.style.removeProperty('--music-bar-height');
    }
    return () => {
      document.documentElement.style.removeProperty('--music-bar-height');
    };
  }, [track]);

  const value = useMemo(
    () => ({
      track,
      queueLength,
      playing,
      currentTime,
      duration,
      play,
      toggle,
      pause,
      seek,
      stopAndClear,
      skipNext,
      isActive,
    }),
    [
      track,
      queueLength,
      playing,
      currentTime,
      duration,
      play,
      toggle,
      pause,
      seek,
      stopAndClear,
      skipNext,
      isActive,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="auto" hidden />
      <MusicBottomBar />
    </Ctx.Provider>
  );
}
