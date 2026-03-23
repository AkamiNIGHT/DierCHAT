import { useRef, useState, useEffect, useCallback } from 'react';
import { Maximize2, PhoneOff, Mic, MicOff } from 'lucide-react';
import type { ActiveCall } from '@/store';
import { Avatar } from '@/components/common/Avatar';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './CallPipMini.css';

type Props = {
  activeCall: ActiveCall;
  peerName: string;
  peerAvatarUrl?: string | null;
  callDuration: number;
  formatCallTime: (s: number) => string;
  showVideoLayout: boolean;
  screenSharing: boolean;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  /** 1:1 аудиозвонок: скрытый &lt;video&gt; для воспроизведения удалённого потока */
  remoteAudioRef?: React.RefObject<HTMLVideoElement | null>;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraPipRef: React.RefObject<HTMLVideoElement | null>;
  meshRemoteStreams: Map<string, MediaStream>;
  onExpand: () => void;
  onHangup: () => void;
  /** ТЗ §48.2: микрофон в мини-окне */
  audioEnabled?: boolean;
  onToggleMic?: () => void;
};

const stopDrag = (e: React.PointerEvent) => {
  e.stopPropagation();
};

/** ТЗ §31: мини-окно звонка поверх чатов */
export function CallPipMini({
  activeCall,
  peerName,
  peerAvatarUrl,
  callDuration,
  formatCallTime,
  showVideoLayout,
  screenSharing,
  remoteVideoRef,
  remoteAudioRef,
  localVideoRef,
  cameraPipRef,
  meshRemoteStreams,
  onExpand,
  onHangup,
  audioEnabled = true,
  onToggleMic,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; lx: number; ly: number } | null>(null);
  const [offset, setOffset] = useState({ x: 16, y: 16 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const w = window.innerWidth;
    setOffset({ x: Math.max(8, w - 200), y: 80 });
  }, [isMobile]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile) return;
      dragRef.current = { x: e.clientX, y: e.clientY, lx: offset.x, ly: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isMobile, offset]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || isMobile) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setOffset({
        x: Math.max(8, Math.min(window.innerWidth - 220, dragRef.current.lx + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 200, dragRef.current.ly + dy)),
      });
    },
    [isMobile]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const firstMesh = meshRemoteStreams.size > 0 ? meshRemoteStreams.entries().next().value : null;
  const meshStream = firstMesh ? firstMesh[1] : null;

  const av = peerAvatarUrl?.trim() ? normalizeMediaUrl(peerAvatarUrl.trim()) : undefined;

  const wideVideo = screenSharing && showVideoLayout;
  const w = wideVideo ? 200 : 120;
  const h = wideVideo ? 120 : 120;

  return (
    <div ref={wrapRef} className="call-pip" style={{ left: offset.x, top: offset.y, width: w + 24 }}>
      <div className="call-pip__media" style={{ width: w, height: h }}>
        {activeCall.isGroup && meshStream ? (
          <video className="call-pip__video" autoPlay playsInline ref={(el) => { if (el) el.srcObject = meshStream; }} />
        ) : showVideoLayout && screenSharing ? (
          <>
            <video className="call-pip__video" ref={localVideoRef} autoPlay playsInline muted />
            <video className="call-pip__pip" ref={cameraPipRef} autoPlay playsInline muted />
          </>
        ) : showVideoLayout ? (
          <video className="call-pip__video" ref={remoteVideoRef} autoPlay playsInline />
        ) : (
          <>
            <div className="call-pip__avatar">
              <Avatar name={peerName} imageUrl={av} variant="callPip" />
            </div>
            {remoteAudioRef ? (
              <video ref={remoteAudioRef} className="call-pip__hidden-audio" autoPlay playsInline />
            ) : null}
          </>
        )}
      </div>
      <div className="call-pip__bar">
        <div
          className="call-pip__drag"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <span className="call-pip__name">{peerName}</span>
          <span className="call-pip__time">{formatCallTime(callDuration)}</span>
        </div>
        <div className="call-pip__btns">
          {onToggleMic && (
            <button
              type="button"
              className={`call-pip__icon ${!audioEnabled ? 'call-pip__icon--muted' : ''}`}
              title={audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
              onPointerDown={stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMic();
              }}
            >
              {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
          )}
          <button
            type="button"
            className="call-pip__icon"
            title="Развернуть"
            onPointerDown={stopDrag}
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
          >
            <Maximize2 size={18} />
          </button>
          <button
            type="button"
            className="call-pip__icon call-pip__icon--hang"
            title="Завершить"
            onPointerDown={stopDrag}
            onClick={(e) => {
              e.stopPropagation();
              onHangup();
            }}
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
