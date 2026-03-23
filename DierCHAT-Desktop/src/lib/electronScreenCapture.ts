/**
 * Захват экрана/окна в Electron через desktopCapturer id (§24).
 * В обычном браузере недоступно — используйте getDisplayMedia.
 */
export async function getMediaStreamForDesktopSource(sourceId: string): Promise<MediaStream> {
  const c = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    },
  } as unknown as MediaStreamConstraints;
  return navigator.mediaDevices.getUserMedia(c);
}

export function hasElectronDesktopPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.dierchat?.getDesktopSources === 'function';
}
