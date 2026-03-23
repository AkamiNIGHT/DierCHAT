import { useEffect, useRef, useState } from 'react';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import { useStore } from '@/store';

type Props = {
  stream: MediaStream;
  peerId: string;
  speakerOn: boolean;
  speakerId: string;
};

/** ТЗ §34: демка экрана — 16:9; веб-камера — по реальному кадру (4:3 / 9:16) */
function inferGuestKind(stream: MediaStream): 'screen' | 'camera' {
  const v = stream.getVideoTracks()[0];
  if (!v) return 'camera';
  const lbl = (v.label || '').toLowerCase();
  if (lbl.includes('screen') || lbl.includes('display') || lbl.includes('window')) return 'screen';
  const st = v.getSettings?.() as { displaySurface?: string } | undefined;
  if (st?.displaySurface && st.displaySurface !== 'camera') return 'screen';
  return 'camera';
}

export function MeshRemoteVideo({ stream, peerId, speakerOn, speakerId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerVol =
    useStore((s) => {
      const m = s.callAudioPrefs.volumeByPeerId;
      return m[peerId] ?? m[peerId.toLowerCase()] ?? 1;
    });
  const [cssAspect, setCssAspect] = useState<string>('16 / 9');
  const guestKind = inferGuestKind(stream);
  const isScreen = guestKind === 'screen';

  const updateAspectFromVideo = () => {
    const el = videoRef.current;
    if (!el?.videoWidth) return;
    const w = el.videoWidth;
    const h = Math.max(1, el.videoHeight);
    setCssAspect(`${w} / ${h}`);
  };

  useEffect(() => {
    const kind = inferGuestKind(stream);
    if (kind === 'screen') {
      setCssAspect('16 / 9');
    } else {
      setCssAspect('3 / 4');
    }
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    const base = speakerOn ? 1 : 0;
    el.volume = Math.min(1, base * peerVol);
    void applySinkIdToMediaElement(el, speakerId);
  }, [stream, speakerOn, speakerId, peerVol]);

  return (
    <div
      className={`call-modal__mesh-cell call-modal__mesh-cell--${isScreen ? 'screen' : 'cam'}`}
      data-peer={peerId.slice(0, 8)}
      style={{ aspectRatio: cssAspect }}
    >
      {isScreen ? (
        <span className="call-modal__mesh-screen-badge" title="Демонстрация экрана">
          Демонстрация экрана
        </span>
      ) : null}
      <video
        ref={videoRef}
        className="call-modal__video call-modal__video--remote call-modal__video--mesh"
        autoPlay
        playsInline
        onLoadedMetadata={updateAspectFromVideo}
      />
    </div>
  );
}
