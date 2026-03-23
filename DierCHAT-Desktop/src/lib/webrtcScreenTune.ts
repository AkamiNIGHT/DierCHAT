/**
 * Настройка кодирования видео при демонстрации экрана (§24.7 — разумный битрейт / FPS).
 * Без жёсткой привязки к H264: браузер выбирает кодек; параметры — подсказка WebRTC.
 */
export async function tuneScreenShareEncoding(sender: RTCRtpSender): Promise<void> {
  const track = sender.track;
  if (track?.kind === 'video') {
    try {
      track.contentHint = 'detail';
    } catch {
      /* старые движки */
    }
  }
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    const enc = params.encodings[0];
    enc.maxBitrate = 2_500_000;
    enc.maxFramerate = 30;
    await sender.setParameters(params);
  } catch {
    /* ignore */
  }
}
