import { create } from 'zustand';

export type NowPlayingKind = 'voice' | 'video_note';

export interface NowPlayingController {
  toggle: () => void;
  getPaused: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
}

interface State {
  active: null | {
    chatId: string;
    messageId: string;
    kind: NowPlayingKind;
    label: string;
  };
  controller: NowPlayingController | null;
  setActive: (active: State['active'], controller: NowPlayingController | null) => void;
  /** Снять регистрацию только если это сообщение (без гонок при смене трека) */
  clearIfMessage: (messageId: string) => void;
  clear: () => void;
}

export const useNowPlayingMedia = create<State>((set, get) => ({
  active: null,
  controller: null,
  setActive: (active, controller) => set({ active, controller }),
  clearIfMessage: (messageId) => {
    const a = get().active;
    if (a?.messageId === messageId) set({ active: null, controller: null });
  },
  clear: () => set({ active: null, controller: null }),
}));
