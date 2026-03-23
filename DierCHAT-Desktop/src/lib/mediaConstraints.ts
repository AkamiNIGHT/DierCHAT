/**
 * Ограничения для getUserMedia с учётом выбранных в настройках камеры/микрофона.
 * В Chromium/Electron `deviceId: { ideal }` часто даёт устройство по умолчанию — для явного выбора
 * в настройках используем цепочку exact → ideal → без привязки.
 */

/** Обработка звука для речи — одинаково для exact/ideal/default. */
const MIC_PROCESSING: Pick<MediaTrackConstraints, 'echoCancellation' | 'noiseSuppression'> = {
  echoCancellation: true,
  noiseSuppression: true,
};

const VIDEO_BASE = { width: { ideal: 640 }, height: { ideal: 640 } } as const;

function micConstraintSteps(microphoneId?: string | null): MediaTrackConstraints[] {
  const t = microphoneId?.trim();
  if (!t) return [{ ...MIC_PROCESSING }];
  return [
    { ...MIC_PROCESSING, deviceId: { exact: t } },
    { ...MIC_PROCESSING, deviceId: { ideal: t } },
    { ...MIC_PROCESSING },
  ];
}

/** Шаги видео: явная камера из настроек или мобильный facingMode без deviceId. */
function videoConstraintSteps(
  cameraId?: string | null,
  mobile?: { facingMode: MediaTrackConstraints['facingMode'] }
): MediaTrackConstraints[] {
  if (mobile?.facingMode != null) {
    return [
      {
        facingMode: mobile.facingMode,
        width: { ideal: 640 },
        height: { ideal: 640 },
      },
    ];
  }
  const t = cameraId?.trim();
  if (!t) {
    return [{ ...VIDEO_BASE, facingMode: 'user' }];
  }
  return [
    { ...VIDEO_BASE, deviceId: { exact: t } },
    { ...VIDEO_BASE, deviceId: { ideal: t } },
    { ...VIDEO_BASE, facingMode: 'user' },
  ];
}

/**
 * @deprecated Используйте openMediaStreamWithPreferredMic / openMediaStreamWithPreferredAv.
 * Оставлено для совместимости.
 */
export function buildAudioConstraint(microphoneId: string | undefined | null): boolean | MediaTrackConstraints {
  const id = microphoneId?.trim();
  if (!id) return { ...MIC_PROCESSING };
  return {
    ...MIC_PROCESSING,
    deviceId: { ideal: id },
  };
}

export function buildVideoNoteCameraConstraint(cameraId: string | undefined | null): MediaTrackConstraints {
  const steps = videoConstraintSteps(cameraId, undefined);
  return steps[0];
}

/** Только микрофон: exact → ideal → дефолт. */
export async function openMediaStreamWithPreferredMic(
  build: (audio: MediaTrackConstraints) => MediaStreamConstraints,
  microphoneId: string | undefined | null
): Promise<MediaStream> {
  for (const mic of micConstraintSteps(microphoneId)) {
    try {
      return await navigator.mediaDevices.getUserMedia(build(mic));
    } catch {
      /* next */
    }
  }
  return navigator.mediaDevices.getUserMedia(build({ ...MIC_PROCESSING }));
}

/** Микрофон + камера (кружок на ПК и т.п.): перебор комбинаций шагов. */
export async function openMediaStreamWithPreferredAv(opts: {
  microphoneId?: string | null;
  cameraId?: string | null;
  mobileVideo?: { facingMode: MediaTrackConstraints['facingMode'] };
}): Promise<MediaStream> {
  const micSteps = micConstraintSteps(opts.microphoneId);
  const vidSteps = videoConstraintSteps(opts.cameraId, opts.mobileVideo);
  for (const mic of micSteps) {
    for (const vid of vidSteps) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: mic, video: vid });
      } catch {
        /* next */
      }
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: true, video: true });
}

/**
 * Единая точка для звонков.
 */
export async function acquireCallMediaStream(opts: {
  video: boolean;
  microphoneId?: string | null;
  cameraId?: string | null;
}): Promise<MediaStream> {
  try {
    if (opts.video) {
      return await openMediaStreamWithPreferredAv({
        microphoneId: opts.microphoneId,
        cameraId: opts.cameraId,
      });
    }
    return await openMediaStreamWithPreferredMic((audio) => ({ audio }), opts.microphoneId);
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: opts.video, audio: true });
  }
}

/** Только камера (апгрейд до видео, возврат после экрана). */
export async function acquireCameraOnlyStream(cameraId: string | undefined | null): Promise<MediaStream> {
  for (const vid of videoConstraintSteps(cameraId, undefined)) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: vid });
    } catch {
      /* next */
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}
