import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Volume2,
  VolumeX,
  RefreshCw,
  Minimize2,
} from 'lucide-react';
import wsClient, { type CallIncomingPayload } from '@/api/ws';
import { useStore, type ActiveCall } from '@/store';
import { Avatar } from '@/components/common/Avatar';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import { getMediaStreamForDesktopSource, hasElectronDesktopPicker } from '@/lib/electronScreenCapture';
import { tuneScreenShareEncoding } from '@/lib/webrtcScreenTune';
import { acquireCallMediaStream, acquireCameraOnlyStream } from '@/lib/mediaConstraints';
import {
  playCallConnected,
  playCallHangup,
  setCallAudioOutputSink,
  startIncomingRing,
  startOutgoingRing,
  stopAllCallRings,
  stopIncomingRing,
  stopOutgoingRing,
} from '@/lib/callSounds';
import { applySinkIdToMediaElement } from '@/lib/audioOutput';
import { buildParticipantIdList, shouldInitiateMeshPeer } from '@/lib/groupCallPeers';
import { ScreenSharePicker } from './ScreenSharePicker';
import { MeshRemoteVideo } from './MeshRemoteVideo';
import { CallPipMini } from './CallPipMini';
import { supportsScreenShare } from '@/lib/webrtcEnv';
import { buildRtcConfiguration } from '@/lib/rtcIceServers';
import './CallModal.css';

/** Групповой звонок без видео: громкость участника из callAudioPrefs (§48.5) */
function GroupRemoteAudioTrack({
  peerId,
  stream,
  speakerOn,
  speakerId,
}: {
  peerId: string;
  stream: MediaStream;
  speakerOn: boolean;
  speakerId: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const volMul = useStore(
    (s) =>
      s.callAudioPrefs.volumeByPeerId[peerId] ??
      s.callAudioPrefs.volumeByPeerId[peerId.toLowerCase()] ??
      1
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.volume = (speakerOn ? 1 : 0) * Math.min(1, volMul);
    void applySinkIdToMediaElement(el, speakerId);
  }, [stream, speakerOn, speakerId, volMul]);
  return <video ref={ref} className="call-modal__remote-audio-video" autoPlay playsInline />;
}

export function CallModal() {
  const { user, incomingCall, activeCall, setIncomingCall, setActiveCall } = useStore();
  const devicePrefs = useStore((s) => s.devicePrefs);
  const callAudioPrefs = useStore((s) => s.callAudioPrefs);

  /** ICE/STUN/TURN: пересборка при смене переключателя TURN в настройках */
  const [icePrefsRev, setIcePrefsRev] = useState(0);
  useEffect(() => {
    const h = () => setIcePrefsRev((n) => n + 1);
    window.addEventListener('dierchat-webrtc-prefs-changed', h);
    return () => window.removeEventListener('dierchat-webrtc-prefs-changed', h);
  }, []);
  const pcConfig = useMemo(() => buildRtcConfiguration(), [icePrefsRev]);
  const setCallPeerVolume = useStore((s) => s.setCallPeerVolume);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const speakerOnRef = useRef(true);
  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);
  const [screenSharing, setScreenSharing] = useState(false);
  const screenSharingRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackForPipRef = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const cameraPipRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  /** Аудиозвонок: <video playsInline> — иначе тишина в WebView (см. attachRemoteStream) */
  const remoteAudioRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerUserIdRef = useRef<string>('');
  const startedOutgoingRef = useRef(false);
  /** Групповой mesh: отдельный PC на каждого участника */
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingMeshInvitesRef = useRef<CallIncomingPayload[]>([]);
  const meshParticipantIdsRef = useRef<string[]>([]);
  const meshInitiatorIdRef = useRef<string>('');
  const meshCalleeConnectedRef = useRef(false);
  const meshOutgoingConnectedRef = useRef(false);
  const [meshRemoteStreams, setMeshRemoteStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const activeCallRef = useRef(activeCall);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  /** Кандидаты до setRemoteDescription (и во время гудков входящего) — иначе addIceCandidate молча падает */
  const pendingIceByPeerRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const flushPendingIce = useCallback((peerId: string, pc: RTCPeerConnection | null) => {
    if (!pc?.remoteDescription) return;
    const m = pendingIceByPeerRef.current;
    const q = m.get(peerId);
    if (!q?.length) return;
    m.delete(peerId);
    for (const c of q) {
      void pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
  }, []);

  const queueOrAddIce = useCallback(
    (peerId: string, pc: RTCPeerConnection | null | undefined, cand: RTCIceCandidateInit) => {
      if (!pc || !pc.remoteDescription) {
        const m = pendingIceByPeerRef.current;
        const arr = m.get(peerId) ?? [];
        arr.push(cand);
        m.set(peerId, arr);
        return;
      }
      void pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    },
    []
  );

  const isOurP2pPeer = useCallback((fromUserId: string) => {
    if (peerUserIdRef.current === fromUserId) return true;
    const inc = useStore.getState().incomingCall;
    return Boolean(inc?.fromUserId === fromUserId);
  }, []);
  const [upgradingVideo, setUpgradingVideo] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [localHasVideo, setLocalHasVideo] = useState(false);
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  /** Режим модалки выбора экрана: первая демонстрация или смена источника (§24) */
  const screenPickerModeRef = useRef<'start' | 'switch'>('start');
  /** ТЗ §31: мини-окно поверх чата */
  const [pipMinimized, setPipMinimized] = useState(false);

  useEffect(() => {
    screenSharingRef.current = screenSharing;
  }, [screenSharing]);

  const startCallTimer = useCallback(() => {
    setCallDuration(0);
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }, []);

  const attachRemoteStream = useCallback(
    (e: RTCTrackEvent) => {
      let ms = remoteStreamRef.current;
      if (!ms) {
        ms = new MediaStream();
        remoteStreamRef.current = ms;
      }
      const tr = e.track;
      if (!ms.getTracks().some((t) => t.id === tr.id)) {
        ms.addTrack(tr);
      }
      if (tr.kind === 'video') {
        setRemoteHasVideo(true);
      }
      tr.onended = () => {
        try {
          ms?.removeTrack(tr);
        } catch {
          /* ignore */
        }
        if (tr.kind === 'video' && !ms?.getVideoTracks().length) {
          setRemoteHasVideo(false);
        }
      };
      const vEl = remoteVideoRef.current;
      const aEl = remoteAudioRef.current;
      const playEl = (el: HTMLMediaElement | null) => {
        if (!el) return;
        el.srcObject = ms;
        const pid = peerUserIdRef.current;
        const prefs = useStore.getState().callAudioPrefs;
        const pv = pid
          ? prefs.volumeByPeerId[pid] ?? prefs.volumeByPeerId[pid.toLowerCase()] ?? 1
          : 1;
        el.volume = (speakerOnRef.current ? 1 : 0) * Math.min(1, pv);
        el.muted = false;
        void el.play().catch(() => {
          /* iOS/Android: повтор после жеста — acceptCall уже был тапом */
        });
      };
      playEl(vEl);
      playEl(aEl);
    },
    []
  );

  useEffect(() => {
    const pid = activeCall?.peerUserId;
    const pv = pid
      ? callAudioPrefs.volumeByPeerId[pid] ?? callAudioPrefs.volumeByPeerId[pid.toLowerCase()] ?? 1
      : 1;
    const base = speakerOn ? 1 : 0;
    const vol = base * Math.min(1, pv);
    const v = remoteVideoRef.current;
    const a = remoteAudioRef.current;
    if (v) {
      v.volume = vol;
      v.muted = false;
    }
    if (a) {
      a.volume = vol;
      a.muted = false;
    }
  }, [speakerOn, activeCall?.peerUserId, callAudioPrefs.volumeByPeerId]);

  useEffect(() => {
    void applySinkIdToMediaElement(remoteVideoRef.current, devicePrefs.speakerId);
    void applySinkIdToMediaElement(remoteAudioRef.current, devicePrefs.speakerId);
  }, [devicePrefs.speakerId, activeCall?.peerUserId]);

  useEffect(() => {
    void setCallAudioOutputSink(devicePrefs.speakerId);
  }, [devicePrefs.speakerId]);

  /** Группа: ref callback не вызывается при смене громкости/динамика — обновляем volume и setSinkId */
  useEffect(() => {
    if (!activeCall?.isGroup) return;
    const vol = speakerOn ? 1 : 0;
    document.querySelectorAll<HTMLVideoElement>('.call-modal__mesh-grid video, .call-modal__audio-only .call-modal__remote-audio-video').forEach((el) => {
      el.volume = vol;
      void applySinkIdToMediaElement(el, devicePrefs.speakerId);
    });
  }, [speakerOn, activeCall?.isGroup, meshRemoteStreams, devicePrefs.speakerId]);

  /** PiP ⇄ полный экран: после смены узла снова вешаем удалённый поток (1:1) */
  useEffect(() => {
    if (!activeCall || activeCall.isGroup) return;
    const ms = remoteStreamRef.current;
    if (!ms) return;
    const vidLayout = Boolean(activeCall.isVideo || remoteHasVideo);

    if (pipMinimized) {
      if (vidLayout && !screenSharing) {
        const v = remoteVideoRef.current;
        if (v) {
          v.srcObject = ms;
          v.volume = speakerOn ? 1 : 0;
          v.muted = false;
          void applySinkIdToMediaElement(v, devicePrefs.speakerId);
          void v.play().catch(() => {});
        }
      } else if (!vidLayout) {
        const a = remoteAudioRef.current;
        if (a) {
          a.srcObject = ms;
          a.volume = speakerOn ? 1 : 0;
          a.muted = false;
          void applySinkIdToMediaElement(a, devicePrefs.speakerId);
          void a.play().catch(() => {});
        }
      }
      return;
    }

    if (vidLayout && remoteVideoRef.current) {
      const v = remoteVideoRef.current;
      v.srcObject = ms;
      v.volume = speakerOn ? 1 : 0;
      v.muted = false;
      void applySinkIdToMediaElement(v, devicePrefs.speakerId);
      void v.play().catch(() => {});
    }
    if (!vidLayout && remoteAudioRef.current) {
      const a = remoteAudioRef.current;
      a.srcObject = ms;
      a.volume = speakerOn ? 1 : 0;
      a.muted = false;
      void applySinkIdToMediaElement(a, devicePrefs.speakerId);
      void a.play().catch(() => {});
    }
  }, [activeCall, pipMinimized, screenSharing, remoteHasVideo, speakerOn, devicePrefs.speakerId]);

  /** PiP: демонстрация экрана 1:1 — превью экрана и камеры в мини-окне */
  useEffect(() => {
    if (!pipMinimized || !activeCall || activeCall.isGroup || !screenSharing) return;
    const local = localVideoRef.current;
    const cam = cameraPipRef.current;
    const ls = localStreamRef.current;
    if (local && ls) {
      local.srcObject = ls;
      void local.play().catch(() => {});
    }
    const camTr = cameraTrackForPipRef.current;
    if (cam && camTr?.readyState === 'live') {
      cam.srcObject = new MediaStream([camTr]);
      void cam.play().catch(() => {});
    }
  }, [pipMinimized, activeCall, screenSharing, localHasVideo]);

  const cleanup = useCallback((opts?: { playHangup?: boolean }) => {
    stopAllCallRings();
    if (opts?.playHangup) playCallHangup();
    pcRef.current?.close();
    pcRef.current = null;
    pcMapRef.current.forEach((pc) => pc.close());
    pcMapRef.current.clear();
    pendingMeshInvitesRef.current = [];
    meshParticipantIdsRef.current = [];
    meshInitiatorIdRef.current = '';
    meshCalleeConnectedRef.current = false;
    meshOutgoingConnectedRef.current = false;
    setMeshRemoteStreams(new Map());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraTrackForPipRef.current = null;
    remoteStreamRef.current = null;
    setRemoteHasVideo(false);
    setLocalHasVideo(false);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (cameraPipRef.current) cameraPipRef.current.srcObject = null;
    setScreenSharing(false);
    screenSharingRef.current = false;
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallDuration(0);
    setActiveCall(null);
    setIncomingCall(null);
    startedOutgoingRef.current = false;
    setUpgradingVideo(false);
    setScreenPickerOpen(false);
    setPipMinimized(false);
    pendingIceByPeerRef.current.clear();
  }, [setActiveCall, setIncomingCall]);

  const stopScreenShareInternal = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);
    screenSharingRef.current = false;

    const cam = cameraTrackForPipRef.current;
    cameraTrackForPipRef.current = null;

    const videoSenders = (): RTCRtpSender[] => {
      if (activeCallRef.current?.isGroup) {
        const out: RTCRtpSender[] = [];
        for (const pc of pcMapRef.current.values()) {
          const s = pc.getSenders().find((x) => x.track?.kind === 'video');
          if (s) out.push(s);
        }
        return out;
      }
      const pc = pcRef.current;
      const s = pc?.getSenders().find((x) => x.track?.kind === 'video');
      return s ? [s] : [];
    };

    const senders = videoSenders();
    if (senders.length === 0) return;

    if (cam && cam.readyState === 'live') {
      for (const sender of senders) {
        await sender.replaceTrack(cam);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      if (cameraPipRef.current) cameraPipRef.current.srcObject = null;
      return;
    }

    try {
      const camStream = await acquireCameraOnlyStream(devicePrefs.cameraId);
      const videoTrack = camStream.getVideoTracks()[0];
      for (const sender of senders) {
        await sender.replaceTrack(videoTrack);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
        localStreamRef.current.addTrack(videoTrack);
      } else {
        localStreamRef.current = camStream;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      if (cameraPipRef.current) cameraPipRef.current.srcObject = null;
      setVideoEnabled(true);
    } catch {
      setStatus('Не удалось вернуть камеру');
    }
  }, [devicePrefs.cameraId]);

  const applyScreenStream = useCallback(
    async (screenStream: MediaStream, isSwitch: boolean) => {
      const ac = activeCallRef.current;
      const isGroup = Boolean(ac?.isGroup);
      if (isGroup && !ac?.isVideo) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!isGroup && (!pcRef.current || !ac?.isVideo)) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (isGroup && pcMapRef.current.size === 0) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (isSwitch) {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      }

      screenStreamRef.current = screenStream;
      const vTrack = screenStream.getVideoTracks()[0];
      /* Звук демонстрации экрана не смешиваем с микрофоном — иначе ломается захват/микшер в Chromium */
      for (const at of screenStream.getAudioTracks()) {
        try {
          at.stop();
        } catch {
          /* ignore */
        }
      }
      vTrack.onended = () => {
        void stopScreenShareInternal();
      };

      if (!isSwitch) {
        const prevCam = localStreamRef.current?.getVideoTracks()[0];
        if (prevCam && prevCam.readyState === 'live') {
          cameraTrackForPipRef.current = prevCam;
          if (cameraPipRef.current) {
            cameraPipRef.current.srcObject = new MediaStream([prevCam]);
          }
        }
      }

      if (isGroup) {
        for (const pc of pcMapRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(vTrack);
            await tuneScreenShareEncoding(sender);
          }
        }
      } else {
        const pc = pcRef.current;
        const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(vTrack);
          await tuneScreenShareEncoding(sender);
        }
      }

      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      setScreenSharing(true);
      screenSharingRef.current = true;
      setStatus('');
    },
    [stopScreenShareInternal]
  );

  const handleDesktopSourcePick = useCallback(
    async (sourceId: string) => {
      setScreenPickerOpen(false);
      const isSwitch = screenPickerModeRef.current === 'switch';
      try {
        const stream = await getMediaStreamForDesktopSource(sourceId);
        await applyScreenStream(stream, isSwitch);
      } catch {
        setStatus(isSwitch ? 'Не удалось сменить источник' : 'Ошибка демонстрации экрана');
        if (isSwitch) await stopScreenShareInternal();
      }
    },
    [applyScreenStream, stopScreenShareInternal]
  );

  /** Системный диалог getDisplayMedia — часто со звуком; из модалки Electron (§24). */
  const pickDisplayMediaAndApply = useCallback(async () => {
    setScreenPickerOpen(false);
    const isSwitch = screenPickerModeRef.current === 'switch';
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });
      await applyScreenStream(screenStream, isSwitch);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
        return;
      }
      setStatus(isSwitch ? 'Не удалось сменить источник' : 'Ошибка демонстрации экрана');
    }
  }, [applyScreenStream]);

  const startScreenShareInternal = useCallback(async () => {
    const ac = activeCallRef.current;
    if (!ac?.isVideo) return;
    if (ac.isGroup) {
      if (pcMapRef.current.size === 0) return;
    } else if (!pcRef.current) return;
    if (!supportsScreenShare()) {
      setStatus('Демонстрация экрана на телефоне недоступна. Используйте сайт в браузере на ПК или приложение для Windows.');
      return;
    }
    if (
      !window.confirm(
        'Вы будете транслировать экран. Личные данные могут быть видны собеседнику. Продолжить?'
      )
    ) {
      return;
    }
    if (hasElectronDesktopPicker()) {
      screenPickerModeRef.current = 'start';
      setScreenPickerOpen(true);
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });
      await applyScreenStream(screenStream, false);
    } catch {
      setStatus('Ошибка демонстрации экрана');
    }
  }, [applyScreenStream]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharingRef.current) {
      await stopScreenShareInternal();
    } else {
      await startScreenShareInternal();
    }
  }, [startScreenShareInternal, stopScreenShareInternal]);

  /** Смена источника: в Electron — своё окно с превью; иначе системный диалог */
  const switchScreenSource = useCallback(async () => {
    if (!screenSharingRef.current) return;
    if (!supportsScreenShare()) {
      setStatus('Смена источника на этом устройстве недоступна');
      return;
    }
    if (hasElectronDesktopPicker()) {
      screenPickerModeRef.current = 'switch';
      setScreenPickerOpen(true);
      return;
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: true,
      });
      await applyScreenStream(screenStream, true);
    } catch {
      setStatus('Не удалось сменить источник');
      await stopScreenShareInternal();
    }
  }, [applyScreenStream, stopScreenShareInternal]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const handleRemoteStream = useCallback(
    (e: RTCTrackEvent) => {
      attachRemoteStream(e);
    },
    [attachRemoteStream]
  );

  const makeMeshTrackHandler = useCallback((peerId: string) => {
    return (e: RTCTrackEvent) => {
      setMeshRemoteStreams((prev) => {
        const next = new Map(prev);
        let ms = next.get(peerId);
        if (!ms) {
          ms = new MediaStream();
        }
        const tr = e.track;
        if (!ms.getTracks().some((t) => t.id === tr.id)) {
          ms.addTrack(tr);
        }
        if (tr.kind === 'video') {
          setRemoteHasVideo(true);
        }
        tr.onended = () => {
          try {
            ms?.removeTrack(tr);
          } catch {
            /* ignore */
          }
          if (tr.kind === 'video' && !ms?.getVideoTracks().length) {
            setRemoteHasVideo(false);
          }
        };
        next.set(peerId, ms);
        return next;
      });
    };
  }, []);

  const acceptMeshPeerInvite = useCallback(
    async (p: CallIncomingPayload) => {
      if (!user?.id || !p.sdp || !localStreamRef.current) return;
      if (pcMapRef.current.has(p.from_user_id)) return;
      const stream = localStreamRef.current;
      const pc = new RTCPeerConnection(pcConfig);
      pcMapRef.current.set(p.from_user_id, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = makeMeshTrackHandler(p.from_user_id);
      pc.onicecandidate = (e) => {
        if (e.candidate) wsClient.sendCallIce(p.from_user_id, e.candidate);
      };
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
        flushPendingIce(p.from_user_id, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsClient.sendCallAnswer(p.from_user_id, answer);
      } catch {
        pc.close();
        pcMapRef.current.delete(p.from_user_id);
      }
    },
    [user?.id, makeMeshTrackHandler, flushPendingIce, pcConfig]
  );

  const flushPendingMeshInvites = useCallback(() => {
    const q = [...pendingMeshInvitesRef.current];
    pendingMeshInvitesRef.current = [];
    for (const inv of q) {
      void acceptMeshPeerInvite(inv);
    }
  }, [acceptMeshPeerInvite]);

  const establishMeshAsCallee = useCallback(async () => {
    const ac = activeCallRef.current;
    const myId = user?.id;
    const initiator = meshInitiatorIdRef.current;
    const participants = meshParticipantIdsRef.current;
    const stream = localStreamRef.current;
    if (!ac?.isGroup || !myId || !initiator || !stream || participants.length < 2) return;
    if (initiator === myId) return;
    for (const other of participants) {
      if (other === myId || other === initiator) continue;
      if (!shouldInitiateMeshPeer(myId, other, initiator)) continue;
      if (pcMapRef.current.has(other)) continue;
      try {
        const pc = new RTCPeerConnection(pcConfig);
        pcMapRef.current.set(other, pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = makeMeshTrackHandler(other);
        pc.onicecandidate = (e) => {
          if (e.candidate) wsClient.sendCallIce(other, e.candidate);
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.sendCallInvite(other, ac.chatId, ac.isVideo, offer, {
          participantIds: participants,
          initiatorId: initiator,
        });
      } catch {
        /* ignore */
      }
    }
  }, [user?.id, makeMeshTrackHandler, pcConfig]);

  const startMeshOutbound = useCallback(
    async (ac: ActiveCall) => {
      if (!user?.id) return;
      const remotes = ac.remotePeerIds ?? [];
      if (remotes.length === 0) return;
      const participantIds = buildParticipantIdList(user.id, remotes);
      meshParticipantIdsRef.current = participantIds;
      meshInitiatorIdRef.current = user.id;
      meshCalleeConnectedRef.current = false;
      meshOutgoingConnectedRef.current = false;
      remoteStreamRef.current = null;
      setMeshRemoteStreams(new Map());
      pendingIceByPeerRef.current.clear();
      try {
        const stream = await acquireCallMediaStream({
          video: ac.isVideo,
          microphoneId: devicePrefs.microphoneId,
          cameraId: devicePrefs.cameraId,
        });
        localStreamRef.current = stream;
        setLocalHasVideo(ac.isVideo);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        for (const remoteId of remotes) {
          const pc = new RTCPeerConnection(pcConfig);
          pcMapRef.current.set(remoteId, pc);
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          pc.ontrack = makeMeshTrackHandler(remoteId);
          pc.onicecandidate = (e) => {
            if (e.candidate) wsClient.sendCallIce(remoteId, e.candidate);
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsClient.sendCallInvite(remoteId, ac.chatId, ac.isVideo, offer, {
            participantIds,
            initiatorId: user.id,
          });
        }
        setStatus('Звонок…');
      } catch {
        setStatus('Ошибка доступа к камере/микрофону');
      }
    },
    [user?.id, devicePrefs.microphoneId, devicePrefs.cameraId, makeMeshTrackHandler, pcConfig]
  );

  const startCall = useCallback(
    async (targetUserId: string, chatId: string, isVideo: boolean) => {
      if (!user?.id) return;
      try {
        pendingIceByPeerRef.current.clear();
        remoteStreamRef.current = null;
        const stream = await acquireCallMediaStream({
          video: isVideo,
          microphoneId: devicePrefs.microphoneId,
          cameraId: devicePrefs.cameraId,
        });
        localStreamRef.current = stream;
        setLocalHasVideo(isVideo);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(pcConfig);
        pcRef.current = pc;
        peerUserIdRef.current = targetUserId;

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = handleRemoteStream;
        pc.onicecandidate = (e) => {
          if (e.candidate) wsClient.sendCallIce(targetUserId, e.candidate);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsClient.sendCallInvite(targetUserId, chatId, isVideo, offer);
        setStatus('Звонок…');
      } catch {
        setStatus('Ошибка доступа к камере/микрофону');
      }
    },
    [user?.id, handleRemoteStream, devicePrefs.microphoneId, devicePrefs.cameraId, pcConfig]
  );

  const acceptCall = useCallback(
    async (invite: NonNullable<typeof incomingCall>) => {
      if (!user?.id) return;
      setIncomingCall(null);

      const isMesh = Boolean(invite.participantIds && invite.participantIds.length >= 2);

      if (isMesh) {
        const initiator = invite.initiatorId || invite.fromUserId;
        const participants =
          invite.participantIds && invite.participantIds.length > 0
            ? [...invite.participantIds]
            : buildParticipantIdList(user.id, [invite.fromUserId]);
        meshParticipantIdsRef.current = participants;
        meshInitiatorIdRef.current = initiator;
        meshCalleeConnectedRef.current = false;
        setActiveCall({
          peerUserId: invite.fromUserId,
          peerDisplayName: invite.fromDisplayName,
          chatId: invite.chatId,
          isVideo: invite.video,
          isOutgoing: false,
          isGroup: true,
          remotePeerIds: participants.filter(
            (id) => id.trim().toLowerCase() !== (user.id || '').trim().toLowerCase()
          ),
          initiatorId: initiator,
        });
        peerUserIdRef.current = invite.fromUserId;

        try {
          remoteStreamRef.current = null;
          setMeshRemoteStreams(new Map());
          const stream = await acquireCallMediaStream({
            video: invite.video,
            microphoneId: devicePrefs.microphoneId,
            cameraId: devicePrefs.cameraId,
          });
          localStreamRef.current = stream;
          setLocalHasVideo(invite.video);
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;

          const pc = new RTCPeerConnection(pcConfig);
          pcMapRef.current.set(invite.fromUserId, pc);

          stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          pc.ontrack = makeMeshTrackHandler(invite.fromUserId);
          pc.onicecandidate = (e) => {
            if (e.candidate) wsClient.sendCallIce(invite.fromUserId, e.candidate);
          };
          pc.onconnectionstatechange = () => {
            if (
              pc.connectionState === 'connected' &&
              initiator !== user.id &&
              !meshCalleeConnectedRef.current
            ) {
              meshCalleeConnectedRef.current = true;
              void establishMeshAsCallee();
            }
          };

          if (invite.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(invite.sdp as RTCSessionDescriptionInit));
            flushPendingIce(invite.fromUserId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsClient.sendCallAnswer(invite.fromUserId, answer);
          }
          stopAllCallRings();
          playCallConnected();
          setStatus('');
          startCallTimer();
          flushPendingMeshInvites();
        } catch {
          setStatus('Ошибка');
          wsClient.sendCallReject(invite.fromUserId);
        }
        return;
      }

      setActiveCall({
        peerUserId: invite.fromUserId,
        peerDisplayName: invite.fromDisplayName,
        chatId: invite.chatId,
        isVideo: invite.video,
        isOutgoing: false,
      });
      peerUserIdRef.current = invite.fromUserId;

      try {
        remoteStreamRef.current = null;
        const stream = await acquireCallMediaStream({
          video: invite.video,
          microphoneId: devicePrefs.microphoneId,
          cameraId: devicePrefs.cameraId,
        });
        localStreamRef.current = stream;
        setLocalHasVideo(invite.video);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(pcConfig);
        pcRef.current = pc;

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = handleRemoteStream;
        pc.onicecandidate = (e) => {
          if (e.candidate) wsClient.sendCallIce(invite.fromUserId, e.candidate);
        };

        if (invite.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(invite.sdp as RTCSessionDescriptionInit));
          flushPendingIce(invite.fromUserId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsClient.sendCallAnswer(invite.fromUserId, answer);
        }
        stopAllCallRings();
        playCallConnected();
        setStatus('');
        startCallTimer();
      } catch {
        setStatus('Ошибка');
        wsClient.sendCallReject(invite.fromUserId);
      }
    },
    [
      user?.id,
      setIncomingCall,
      setActiveCall,
      handleRemoteStream,
      startCallTimer,
      devicePrefs.microphoneId,
      devicePrefs.cameraId,
      makeMeshTrackHandler,
      establishMeshAsCallee,
      flushPendingMeshInvites,
      flushPendingIce,
      pcConfig,
    ]
  );

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      playCallHangup();
      wsClient.sendCallReject(incomingCall.fromUserId);
      pendingIceByPeerRef.current.delete(incomingCall.fromUserId);
      setIncomingCall(null);
    }
  }, [incomingCall, setIncomingCall]);

  const hangup = useCallback(() => {
    const ac = activeCallRef.current;
    if (ac?.isGroup && ac.chatId) {
      wsClient.sendGroupCallEnd(ac.chatId);
    }
    if (ac?.isGroup && pcMapRef.current.size > 0) {
      for (const id of [...pcMapRef.current.keys()]) {
        wsClient.sendCallHangup(id);
      }
    } else if (peerUserIdRef.current) {
      wsClient.sendCallHangup(peerUserIdRef.current);
    }
    cleanup({ playHangup: true });
  }, [cleanup]);

  /** ТЗ §48.3: полный сброс локальных треков и повторный захват (после поломки демки/микрофона) */
  const resetCallMedia = useCallback(async () => {
    const ac = activeCallRef.current;
    if (!ac || !user?.id) return;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    cameraTrackForPipRef.current = null;
    setScreenSharing(false);
    screenSharingRef.current = false;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await acquireCallMediaStream({
        video: ac.isVideo,
        microphoneId: devicePrefs.microphoneId,
        cameraId: devicePrefs.cameraId,
      });
      localStreamRef.current = stream;
      setLocalHasVideo(ac.isVideo && stream.getVideoTracks().length > 0);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setAudioEnabled(true);
      setVideoEnabled(true);
      if (ac.isGroup) {
        for (const pc of pcMapRef.current.values()) {
          for (const sender of pc.getSenders()) {
            const kind = sender.track?.kind;
            if (!kind) continue;
            const nt = stream.getTracks().find((t) => t.kind === kind);
            if (nt) await sender.replaceTrack(nt);
          }
        }
      } else if (pcRef.current) {
        for (const sender of pcRef.current.getSenders()) {
          const kind = sender.track?.kind;
          if (!kind) continue;
          const nt = stream.getTracks().find((t) => t.kind === kind);
          if (nt) await sender.replaceTrack(nt);
        }
      }
      setStatus('');
    } catch {
      setStatus('Не удалось сбросить камеру и микрофон');
    }
  }, [user?.id, devicePrefs.microphoneId, devicePrefs.cameraId]);

  const upgradeToVideo = useCallback(async () => {
    const pc = pcRef.current;
    const peer = peerUserIdRef.current;
    if (!pc || !peer || !activeCall || activeCall.isVideo || upgradingVideo || activeCall.isGroup) return;
    setUpgradingVideo(true);
    try {
      const vStream = await acquireCameraOnlyStream(devicePrefs.cameraId);
      const vTrack = vStream.getVideoTracks()[0];
      if (localStreamRef.current) {
        localStreamRef.current.addTrack(vTrack);
      }
      pc.addTrack(vTrack, localStreamRef.current!);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsClient.sendCallRenegotiate(peer, offer, true);
      setLocalHasVideo(true);
      setActiveCall({ ...activeCall, isVideo: true });
      setStatus('');
    } catch {
      setStatus('Не удалось включить видео');
    } finally {
      setUpgradingVideo(false);
    }
  }, [activeCall, setActiveCall, upgradingVideo, devicePrefs.cameraId]);

  useEffect(() => {
    if (activeCall?.isOutgoing && !startedOutgoingRef.current && user?.id) {
      startedOutgoingRef.current = true;
      if (activeCall.isGroup && activeCall.remotePeerIds && activeCall.remotePeerIds.length > 0) {
        void startMeshOutbound(activeCall);
      } else {
        void startCall(activeCall.peerUserId, activeCall.chatId, activeCall.isVideo);
      }
    }
  }, [activeCall, user?.id, startCall, startMeshOutbound]);

  /** Входящий звонок — звук, пока открыта карточка */
  useEffect(() => {
    if (incomingCall) {
      void startIncomingRing();
      return () => stopIncomingRing();
    }
    stopIncomingRing();
  }, [incomingCall]);

  /** Исходящий — гудки, пока статус «Звонок…» */
  useEffect(() => {
    if (activeCall?.isOutgoing && status === 'Звонок…') {
      void startOutgoingRing();
      return () => stopOutgoingRing();
    }
    stopOutgoingRing();
  }, [activeCall?.isOutgoing, status]);

  useEffect(() => {
    const onCallIncoming = (p: CallIncomingPayload) => {
      const st = useStore.getState();
      const myId = st.user?.id;
      if (!myId) return;
      const ac = activeCallRef.current;
      if (ac && !ac.isGroup) return;
      if (st.incomingCall) return;

      if (ac?.isGroup && ac.chatId === p.chat_id && p.from_user_id !== myId && p.sdp) {
        if (pcMapRef.current.has(p.from_user_id)) return;
        if (!localStreamRef.current) {
          pendingMeshInvitesRef.current.push(p);
          return;
        }
        void acceptMeshPeerInvite(p);
        return;
      }

      st.setIncomingCall({
        fromUserId: p.from_user_id,
        fromDisplayName: p.from_display_name,
        fromAvatarUrl: p.from_avatar_url,
        chatId: p.chat_id,
        video: p.video,
        sdp: p.sdp,
        participantIds: p.participant_ids,
        initiatorId: p.initiator_id,
      });
    };

    const onAccepted = (p: { from_user_id: string; sdp: RTCSessionDescriptionInit }) => {
      const ac = activeCallRef.current;
      if (ac?.isGroup) {
        const pc = pcMapRef.current.get(p.from_user_id);
        if (pc) {
          void pc.setRemoteDescription(new RTCSessionDescription(p.sdp)).then(() => {
            flushPendingIce(p.from_user_id, pc);
            if (!meshOutgoingConnectedRef.current) {
              meshOutgoingConnectedRef.current = true;
              stopAllCallRings();
              playCallConnected();
              setStatus('');
              startCallTimer();
            }
          });
        }
        return;
      }
      if (p.from_user_id !== peerUserIdRef.current) return;
      const pc = pcRef.current;
      if (pc) {
        void pc.setRemoteDescription(new RTCSessionDescription(p.sdp)).then(() => {
          flushPendingIce(p.from_user_id, pc);
          stopAllCallRings();
          playCallConnected();
          setStatus('');
          startCallTimer();
        });
      }
    };

    const onEnded = (payload: { from_user_id: string }) => {
      const ac = activeCallRef.current;
      if (ac?.isGroup) {
        const pc = pcMapRef.current.get(payload.from_user_id);
        if (pc) {
          pc.close();
          pcMapRef.current.delete(payload.from_user_id);
        }
        setMeshRemoteStreams((prev) => {
          const n = new Map(prev);
          n.delete(payload.from_user_id);
          return n;
        });
        if (pcMapRef.current.size === 0) {
          cleanup({ playHangup: true });
        } else {
          playCallHangup();
        }
        return;
      }
      cleanup({ playHangup: true });
    };

    const onIce = (p: { from_user_id: string; candidate: RTCIceCandidateInit }) => {
      const ac = activeCallRef.current;
      if (ac?.isGroup) {
        const pc = pcMapRef.current.get(p.from_user_id);
        queueOrAddIce(p.from_user_id, pc ?? null, p.candidate);
        return;
      }
      if (!isOurP2pPeer(p.from_user_id)) return;
      queueOrAddIce(p.from_user_id, pcRef.current, p.candidate);
    };

    const onRenegotiate = async (p: { from_user_id: string; sdp: RTCSessionDescriptionInit; is_offer: boolean }) => {
      const ac = activeCallRef.current;
      const pc = ac?.isGroup ? pcMapRef.current.get(p.from_user_id) : pcRef.current;
      if (!pc) return;
      if (!ac?.isGroup && p.from_user_id !== peerUserIdRef.current) return;
      try {
        if (p.is_offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
          flushPendingIce(p.from_user_id, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsClient.sendCallRenegotiate(p.from_user_id, answer, false);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
          flushPendingIce(p.from_user_id, pc);
        }
      } catch {
        setStatus('Ошибка согласования видео');
      }
    };

    wsClient.setCallbacks({
      onCallIncoming: onCallIncoming,
      onCallAccepted: onAccepted,
      onCallEnded: onEnded,
      onCallIce: onIce,
      onCallRenegotiate: onRenegotiate,
    });
    return () =>
      wsClient.setCallbacks({
        onCallIncoming: undefined,
        onCallAccepted: undefined,
        onCallEnded: undefined,
        onCallIce: undefined,
        onCallRenegotiate: undefined,
      });
  }, [cleanup, startCallTimer, acceptMeshPeerInvite, flushPendingIce, queueOrAddIce, isOurP2pPeer]);

  const formatCallTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const peerInitial = (name: string) => (name || '?')[0].toUpperCase();

  if (incomingCall) {
    const peerName = incomingCall.fromDisplayName || incomingCall.fromUserId.slice(0, 8);
    const incomingAvatar =
      incomingCall.fromAvatarUrl?.trim() ? normalizeMediaUrl(incomingCall.fromAvatarUrl.trim()) : undefined;
    return (
      <div className="call-modal call-modal--overlay">
        <div className="call-modal__card call-modal__card--incoming">
          <div className="call-modal__avatar-wrap">
            <Avatar name={peerName} imageUrl={incomingAvatar} size={88} />
          </div>
          <p className="call-modal__peer">{peerName}</p>
          <p className="call-modal__call-type">
            {incomingCall.participantIds && incomingCall.participantIds.length >= 2
              ? incomingCall.video
                ? 'Групповой видеозвонок'
                : 'Групповой звонок'
              : incomingCall.video
                ? 'Видеозвонок'
                : 'Аудиозвонок'}
          </p>
          <div className="call-modal__actions">
            <button type="button" className="call-modal__btn call-modal__btn--reject" onClick={rejectCall}>
              <PhoneOff size={28} />
            </button>
            <button type="button" className="call-modal__btn call-modal__btn--accept" onClick={() => acceptCall(incomingCall)}>
              <Phone size={28} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeCall) {
    const peerName = activeCall.peerDisplayName || activeCall.peerUserId.slice(0, 8);
    const showVideoLayout = activeCall.isVideo || remoteHasVideo;

    if (pipMinimized) {
      return (
        <>
          {screenPickerOpen && (
            <ScreenSharePicker
              open
              onClose={() => setScreenPickerOpen(false)}
              onPick={(id) => void handleDesktopSourcePick(id)}
              onUseSystemPicker={() => void pickDisplayMediaAndApply()}
            />
          )}
          {screenSharing && (
            <div className="call-modal__screen-banner call-modal__screen-banner--with-pip">
              <span className="call-modal__screen-dot" aria-hidden />
              <span className="call-modal__screen-text">Вы транслируете экран</span>
              <button type="button" className="call-modal__screen-btn" onClick={() => void toggleScreenShare()}>
                Остановить
              </button>
              <button type="button" className="call-modal__screen-btn call-modal__screen-btn--ghost" onClick={() => void switchScreenSource()}>
                <RefreshCw size={16} /> Источник
              </button>
            </div>
          )}
          <CallPipMini
            activeCall={activeCall}
            peerName={peerName}
            callDuration={callDuration}
            formatCallTime={formatCallTime}
            showVideoLayout={showVideoLayout}
            screenSharing={screenSharing}
            remoteVideoRef={remoteVideoRef}
            remoteAudioRef={remoteAudioRef}
            localVideoRef={localVideoRef}
            cameraPipRef={cameraPipRef}
            meshRemoteStreams={meshRemoteStreams}
            onExpand={() => setPipMinimized(false)}
            onHangup={hangup}
            audioEnabled={audioEnabled}
            onToggleMic={() => {
              setAudioEnabled((a) => {
                localStreamRef.current?.getAudioTracks().forEach((t) => {
                  t.enabled = !a;
                });
                return !a;
              });
            }}
          />
        </>
      );
    }

    return (
      <div className="call-modal call-modal--overlay">
        {screenPickerOpen && (
          <ScreenSharePicker
            open
            onClose={() => setScreenPickerOpen(false)}
            onPick={(id) => void handleDesktopSourcePick(id)}
            onUseSystemPicker={() => void pickDisplayMediaAndApply()}
          />
        )}
        {screenSharing && (
          <div className="call-modal__screen-banner">
            <span className="call-modal__screen-dot" aria-hidden />
            <span className="call-modal__screen-text">Вы транслируете экран</span>
            <button type="button" className="call-modal__screen-btn" onClick={() => void toggleScreenShare()}>
              Остановить
            </button>
            <button type="button" className="call-modal__screen-btn call-modal__screen-btn--ghost" onClick={() => void switchScreenSource()}>
              <RefreshCw size={16} /> Источник
            </button>
          </div>
        )}

        {activeCall.isGroup && showVideoLayout ? (
          <div className="call-modal__video-wrap call-modal__video-wrap--mesh">
            <div className="call-modal__mesh-grid">
              {Array.from(meshRemoteStreams.entries()).map(([peerId, stream]) => (
                <MeshRemoteVideo
                  key={peerId}
                  peerId={peerId}
                  stream={stream}
                  speakerOn={speakerOn}
                  speakerId={devicePrefs.speakerId}
                />
              ))}
            </div>
            <video
              ref={localVideoRef}
              className={`call-modal__video call-modal__video--local ${!localHasVideo ? 'call-modal__video--hidden' : ''}`}
              autoPlay
              playsInline
              muted
            />
          </div>
        ) : activeCall.isGroup && !showVideoLayout ? (
          <div className="call-modal__audio-only">
            <div className="call-modal__audio-avatar">{peerInitial(peerName)}</div>
            <p className="call-modal__peer">{peerName}</p>
            <p className="call-modal__status" style={{ opacity: 0.85 }}>
              Групповой звонок · участников: {meshRemoteStreams.size || activeCall.remotePeerIds?.length || '—'}
            </p>
            {status ? (
              <p className="call-modal__status">{status}</p>
            ) : (
              <p className="call-modal__timer">{formatCallTime(callDuration)}</p>
            )}
            {Array.from(meshRemoteStreams.entries()).map(([peerId, stream]) => (
              <GroupRemoteAudioTrack
                key={peerId}
                peerId={peerId}
                stream={stream}
                speakerOn={speakerOn}
                speakerId={devicePrefs.speakerId}
              />
            ))}
          </div>
        ) : showVideoLayout ? (
          <div className="call-modal__video-wrap">
            <video ref={remoteVideoRef} className="call-modal__video call-modal__video--remote" autoPlay playsInline />
            <video
              ref={localVideoRef}
              className={`call-modal__video call-modal__video--local ${!localHasVideo ? 'call-modal__video--hidden' : ''}`}
              autoPlay
              playsInline
              muted
            />
            {screenSharing && (
              <video
                ref={cameraPipRef}
                className="call-modal__video call-modal__video--camera-pip"
                autoPlay
                playsInline
                muted
              />
            )}
          </div>
        ) : (
          <div className="call-modal__audio-only">
            <div className="call-modal__audio-avatar">{peerInitial(peerName)}</div>
            <p className="call-modal__peer">{peerName}</p>
            {status ? (
              <p className="call-modal__status">{status}</p>
            ) : (
              <p className="call-modal__timer">{formatCallTime(callDuration)}</p>
            )}
            {/* video: на мобильных WebRTC-аудио через <audio> часто не играет; <video playsInline> — да */}
            <video ref={remoteAudioRef} className="call-modal__remote-audio-video" autoPlay playsInline />
          </div>
        )}

        <div className="call-modal__controls">
          {showVideoLayout && (
            <div className="call-modal__top-meta">
              <p className="call-modal__peer call-modal__peer--sm">{peerName}</p>
              {callDuration > 0 && (
                <p className="call-modal__status call-modal__status--inline">
                  {screenSharing && <span className="call-modal__rec-dot" title="Демонстрация" />}
                  {formatCallTime(callDuration)}
                </p>
              )}
              {status && <p className="call-modal__status">{status}</p>}
            </div>
          )}
          {!activeCall.isGroup && (
            <div className="call-modal__peer-volume">
              <span>Громкость собеседника</span>
              <input
                type="range"
                min={25}
                max={200}
                step={5}
                value={Math.round(
                  (callAudioPrefs.volumeByPeerId[activeCall.peerUserId] ??
                    callAudioPrefs.volumeByPeerId[activeCall.peerUserId.toLowerCase()] ??
                    1) * 100
                )}
                onChange={(e) => setCallPeerVolume(activeCall.peerUserId, Number(e.target.value) / 100)}
                aria-label="Громкость собеседника"
              />
            </div>
          )}
          {activeCall.isGroup && (
            <details className="call-modal__peer-volume call-modal__peer-volume--mesh">
              <summary>Громкость участников</summary>
              <div className="call-modal__peer-volume-list">
                {Array.from(
                  new Set([
                    ...(activeCall.remotePeerIds ?? []),
                    ...meshRemoteStreams.keys(),
                  ])
                ).map((pid) => (
                  <label key={pid}>
                    <span title={pid}>{pid.slice(0, 8)}…</span>
                    <input
                      type="range"
                      min={25}
                      max={200}
                      step={5}
                      value={Math.round(
                        (callAudioPrefs.volumeByPeerId[pid] ??
                          callAudioPrefs.volumeByPeerId[pid.toLowerCase()] ??
                          1) * 100
                      )}
                      onChange={(e) => setCallPeerVolume(pid, Number(e.target.value) / 100)}
                    />
                  </label>
                ))}
              </div>
            </details>
          )}
          <div className="call-modal__btns">
            <button
              type="button"
              className={`call-modal__icon-btn ${!audioEnabled ? 'call-modal__icon-btn--muted' : ''}`}
              onClick={() => {
                setAudioEnabled((a) => {
                  localStreamRef.current?.getAudioTracks().forEach((t) => {
                    t.enabled = !a;
                  });
                  return !a;
                });
              }}
              title={audioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              {audioEnabled ? <Mic size={22} /> : <MicOff size={22} />}
            </button>

            <button
              type="button"
              className={`call-modal__icon-btn ${!speakerOn ? 'call-modal__icon-btn--muted' : ''}`}
              onClick={() => setSpeakerOn((s) => !s)}
              title={speakerOn ? 'Выключить звук' : 'Включить звук'}
            >
              {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
            </button>

            {showVideoLayout && (
              <button
                type="button"
                className={`call-modal__icon-btn ${!videoEnabled ? 'call-modal__icon-btn--muted' : ''}`}
                onClick={() => {
                  if (screenSharing) {
                    const cam = cameraTrackForPipRef.current;
                    if (cam) cam.enabled = !cam.enabled;
                    setVideoEnabled((v) => !v);
                    return;
                  }
                  setVideoEnabled((v) => {
                    localStreamRef.current?.getVideoTracks().forEach((t) => {
                      t.enabled = !v;
                    });
                    return !v;
                  });
                }}
                title={
                  screenSharing
                    ? videoEnabled
                      ? 'Скрыть превью камеры'
                      : 'Показать превью камеры'
                    : videoEnabled
                      ? 'Выключить камеру'
                      : 'Включить камеру'
                }
              >
                {videoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
            )}

            {!localHasVideo && !activeCall.isGroup && (
              <button
                type="button"
                className="call-modal__icon-btn"
                onClick={() => void upgradeToVideo()}
                disabled={upgradingVideo}
                title="Включить камеру"
              >
                <Video size={22} />
              </button>
            )}

            {showVideoLayout && supportsScreenShare() && (!activeCall.isGroup || activeCall.isVideo) && (
              <button
                type="button"
                className={`call-modal__icon-btn ${screenSharing ? 'call-modal__icon-btn--active' : ''}`}
                onClick={() => void toggleScreenShare()}
                title={screenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
              >
                <Monitor size={22} />
              </button>
            )}

            <button
              type="button"
              className="call-modal__icon-btn"
              onClick={() => void resetCallMedia()}
              title="Сбросить камеру и микрофон (если пропал звук или видео)"
            >
              <RefreshCw size={22} />
            </button>

            <button
              type="button"
              className="call-modal__icon-btn"
              onClick={() => setPipMinimized(true)}
              title="Свернуть в окошко"
            >
              <Minimize2 size={22} />
            </button>

            <button type="button" className="call-modal__icon-btn call-modal__icon-btn--hangup" onClick={hangup}>
              <PhoneOff size={26} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
