import jsmediatags from 'jsmediatags';

export type AudioId3Tags = {
  title?: string;
  artist?: string;
  album?: string;
  /** data URL обложки */
  pictureDataUrl?: string;
};

const cache = new Map<string, AudioId3Tags | null>();

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Читает ID3 из URL аудио (mp3 и др., §26.7). Результат кэшируется.
 */
export function fetchAudioId3Tags(url: string): Promise<AudioId3Tags | null> {
  if (cache.has(url)) {
    return Promise.resolve(cache.get(url) ?? null);
  }
  return new Promise((resolve) => {
    try {
      jsmediatags.read(url, {
        onSuccess: (tag: { tags: Record<string, unknown> }) => {
          const tags = tag?.tags;
          if (!tags) {
            cache.set(url, null);
            resolve(null);
            return;
          }
          const title = tags.title != null ? String(tags.title) : undefined;
          const artist = tags.artist != null ? String(tags.artist) : undefined;
          const album = tags.album != null ? String(tags.album) : undefined;
          let pictureDataUrl: string | undefined;
          const pic = tags.picture as
            | { data: number[] | Uint8Array; format?: string }
            | undefined;
          if (pic?.data) {
            try {
              const fmt = pic.format || 'image/jpeg';
              const u8 = pic.data instanceof Uint8Array ? pic.data : new Uint8Array(pic.data);
              pictureDataUrl = `data:${fmt};base64,${uint8ToBase64(u8)}`;
            } catch {
              /* ignore */
            }
          }
          const result: AudioId3Tags = {
            title: title || undefined,
            artist: artist || undefined,
            album: album || undefined,
            pictureDataUrl,
          };
          cache.set(url, result);
          resolve(result);
        },
        onError: () => {
          cache.set(url, null);
          resolve(null);
        },
      });
    } catch {
      cache.set(url, null);
      resolve(null);
    }
  });
}
