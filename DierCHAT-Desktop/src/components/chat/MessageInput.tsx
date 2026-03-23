import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import wsClient from '@/api/ws';
import { useStore } from '@/store';
import { Paperclip, Smile, SendHorizontal, X, Mic, Image, File as FileIcon, MapPin, BarChart3, Video, Music, BellOff, UserPlus, Sticker, SwitchCamera } from 'lucide-react';
import { StickerPanel } from '@/components/stickers/StickerPanel';
import { compressImageFileIfNeeded } from '@/lib/imageCompress';
import { openMediaStreamWithPreferredMic, openMediaStreamWithPreferredAv } from '@/lib/mediaConstraints';
import { isOutgoingMessageEmpty, logOutgoingTextStructure, prepareOutgoingMessageText } from '@/lib/messageText';
import './MessageInput.css';

type VideoFacing = 'user' | 'environment';

const TYPING_INTERVAL = 5000;
const MAX_LINES = 6;
const LONG_PRESS_MS = 280;
const VIDEO_MAX_SEC = 60;

const QUICK_REPLIES = ['Ок', 'Спасибо', 'Перезвоню', 'Понял', 'Хорошо', 'Да', 'Нет', '👍'];

const EMOJI_GROUPS = [
  { label: 'Часто', emojis: ['👍', '❤️', '😂', '🔥', '😮', '😢', '😡', '🎉', '🤔', '👎', '🙏', '💯'] },
  { label: 'Смайлы', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '😍', '🤩', '😘', '😗', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤐', '😑', '😶', '😏', '😬', '🤥', '😌', '😔', '😪', '😴', '😷', '🤒', '🤕'] },
  { label: 'Жесты', emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🤝', '💪'] },
  { label: 'Природа', emojis: ['🌞', '🌙', '⭐', '🔥', '💧', '🌊', '🌈', '⚡', '❄️', '🌸', '🌺', '🌻', '🌹', '🍀', '🌲', '🌴'] },
  { label: 'Еда', emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🍖', '🍗', '🥩', '🍤', '🍣', '🍱', '🍩', '🍪', '🎂', '🍫', '🍬', '☕', '🍺', '🍷'] },
  { label: 'Предметы', emojis: ['💻', '📱', '⌚', '📷', '🔑', '💡', '🔔', '📌', '✏️', '📎', '🎮', '🎵', '🎬', '🏆', '🎁', '❤️‍🔥', '💀', '👀', '🧠', '💎'] },
];

export type MentionUser = { user_id: string; display_name: string; username?: string };

export interface MessageInputProps {
  chatId: string;
  onSend: (text: string, replyToId?: string, silent?: boolean) => void | Promise<void>;
  onMessageSent?: (msg: import('@/api/client').Message) => void;
  onPollCreated?: () => void;
  replyingTo?: { id: string; text?: string } | null;
  onClearReply?: () => void;
  mentionUsers?: MentionUser[];
  currentUserId?: string;
}

const DRAFT_KEY = (id: string) => `dierchat-draft:${id}`;

export function MessageInput({ chatId, onSend, onMessageSent, onPollCreated, replyingTo, onClearReply, mentionUsers = [], currentUserId }: MessageInputProps) {
  const sendSound = useStore((s) => s.sendSound);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY(chatId)) || '';
    } catch { return ''; }
  });
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [showSticker, setShowSticker] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<{ id: string; display_name: string; username?: string; email?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [silentSend, setSilentSend] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionOpenRef = useRef(false);
  const mentionIndexRef = useRef(0);
  mentionIndexRef.current = mentionIndex;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** На телефоне — передняя/задняя камера для видеокружка (не deviceId из настроек) */
  const circleFacingRef = useRef<VideoFacing>('user');
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  const devicePrefs = useStore((s) => s.devicePrefs);
  const quickRepliesEnabled = useStore((s) => s.quickRepliesEnabled);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobileLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const playSendSound = useCallback(() => {
    if (!sendSound) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 600;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch { /* ignore */ }
  }, [sendSound]);

  const doSend = useCallback(async () => {
    const t = prepareOutgoingMessageText(text);
    if (isOutgoingMessageEmpty(t) || sending) return;
    logOutgoingTextStructure('send', t);
    setSending(true);
    try {
      await onSend(t, replyingTo?.id, silentSend);
      setText('');
      try { localStorage.removeItem(DRAFT_KEY(chatId)); } catch { /* ignore */ }
      onClearReply?.();
      if (taRef.current) { taRef.current.style.height = 'auto'; }
      playSendSound();
    } finally { setSending(false); }
  }, [text, sending, onSend, replyingTo, onClearReply, silentSend, playSendSound, chatId]);

  function handleQuickReply(phrase: string) {
    setText(prev => (prev ? prev + ' ' + phrase : phrase));
    taRef.current?.focus();
  }

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    const allEntry: MentionUser = { user_id: '__all__', display_name: 'Все участники', username: 'all' };
    const userList = mentionUsers
      .filter((u) => u.user_id !== currentUserId)
      .filter((u) => {
        const name = (u.display_name || '').toLowerCase();
        const uname = (u.username || '').toLowerCase();
        return !q || name.includes(q) || uname.includes(q);
      })
      .slice(0, 7);
    if (!q || 'all'.includes(q) || 'все'.includes(q) || 'everyone'.includes(q)) {
      return [allEntry, ...userList];
    }
    return userList;
  }, [mentionUsers, currentUserId, mentionQuery]);

  useEffect(() => {
    setMentionIndex((i) => Math.min(i, Math.max(0, filteredMentions.length - 1)));
  }, [filteredMentions.length]);

  const insertMention = useCallback((user: MentionUser) => {
    const insert = '@' + (user.username || user.display_name.replace(/\s+/g, '_')) + ' ';
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const beforeCursor = text.slice(0, cursor);
    const match = beforeCursor.match(/@[^@\s]*$/);
    const start = match ? cursor - match[0].length : cursor;
    const newText = text.slice(0, start) + insert + text.slice(cursor);
    setText(newText);
    mentionOpenRef.current = false;
    setShowMentionDropdown(false);
    setMentionQuery('');
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + insert.length, start + insert.length);
    }, 0);
  }, [text]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (mentionOpenRef.current && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndexRef.current]);
        return;
      }
      if (e.key === 'Escape') {
        mentionOpenRef.current = false;
        setShowMentionDropdown(false);
        setMentionQuery('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  }, [doSend, filteredMentions, mentionIndex, insertMention]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const val = ta.value;
    setText(val);
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 24 * MAX_LINES)}px`;
    const cursor = ta.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/@([^@\s]*)$/);
    if (match) {
      mentionOpenRef.current = true;
      setShowMentionDropdown(true);
      setMentionQuery(match[1].toLowerCase());
      setMentionIndex(0);
    } else {
      mentionOpenRef.current = false;
      setShowMentionDropdown(false);
    }
    const now = Date.now();
    if (now - lastTyping.current > TYPING_INTERVAL) {
      lastTyping.current = now;
      if (wsClient.isConnected()) wsClient.sendTyping(chatId);
      else api.sendTyping(chatId).catch(() => {});
    }
  }, [chatId]);

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      try {
        const prev = prevChatIdRef.current;
        const prevDraft = text;
        if (prevDraft.length) localStorage.setItem(DRAFT_KEY(prev), prevDraft);
        else localStorage.removeItem(DRAFT_KEY(prev));
        prevChatIdRef.current = chatId;
      } catch { /* ignore */ }
    }
    try {
      const saved = localStorage.getItem(DRAFT_KEY(chatId)) || '';
      setText(saved);
    } catch { /* ignore */ }
  }, [chatId]);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (text.length) {
          localStorage.setItem(DRAFT_KEY(chatId), text);
          window.dispatchEvent(new CustomEvent('dierchat:draft_updated', { detail: { chatId } }));
        } else {
          localStorage.removeItem(DRAFT_KEY(chatId));
          window.dispatchEvent(new CustomEvent('dierchat:draft_updated', { detail: { chatId } }));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(id);
  }, [chatId, text]);

  function insertEmoji(emoji: string) {
    setText(prev => prev + emoji);
    taRef.current?.focus();
  }

  function detectMessageType(file: File): number {
    if (file.type.startsWith('image/')) return 1; // photo
    if (file.type.startsWith('video/')) return 2; // video
    if (file.type.startsWith('audio/')) {
      const n = file.name.toLowerCase();
      // Запись с микрофона — голосовое (§26.7.1); загруженные mp3/m4a — музыка (§26.7.2), тип 10
      if (n.startsWith('voice.') && n.endsWith('.webm')) return 4;
      return 10;
    }
    return 3; // generic file
  }

  async function handleGeolocation() {
    setShowAttach(false);
    if (!navigator.geolocation) {
      alert('Геолокация не поддерживается в этом браузере.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=17`;
        const text = `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${url}`;
        try {
          const msg = await api.sendMessage(chatId, 0, text, replyingTo?.id);
          onMessageSent?.(msg);
          onClearReply?.();
        } catch (e) {
          alert((e as Error)?.message || 'Ошибка отправки');
        }
      },
      () => alert('Не удалось определить местоположение. Проверьте разрешения.')
    );
  }

  /** forcedType: например 9 для видеокружка с камеры (§26.4), иначе по MIME */
  const sendFileAsMessage = useCallback(
    async (file: File, forcedType?: number) => {
      try {
        const toUpload =
          file.type.startsWith('image/') ? await compressImageFileIfNeeded(file) : file;
        const uploaded = await api.uploadFile(toUpload);
        const type = forcedType ?? detectMessageType(file);
        const msg = await api.sendMessage(chatId, type, uploaded.url, replyingTo?.id);
        onMessageSent?.(msg);
        onClearReply?.();
      } catch (e) {
        alert((e as Error)?.message || 'Ошибка отправки');
      }
    },
    [chatId, replyingTo?.id, onMessageSent, onClearReply]
  );

  async function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await sendFileAsMessage(file);
    }
  }

  function handleFileSelect(accept?: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (accept) input.accept = accept;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      for (const file of files) {
        await sendFileAsMessage(file);
      }
    };
    input.click();
    setShowAttach(false);
  }

  async function handleCreatePoll() {
    const question = pollQuestion.trim();
    const options = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    setPollSending(true);
    try {
      await api.createPoll(chatId, question, options, pollMultiple);
      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollMultiple(false);
      onPollCreated?.();
    } catch {
      // error handled by api
    } finally {
      setPollSending(false);
    }
  }

  const startRecording = useCallback(async (mode: 'voice' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return;
    try {
      const pickMime = (isVideo: boolean) => {
        if (isVideo) {
          return MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';
        }
        return MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      };

      let stream: MediaStream;
      if (mode === 'video' && isMobileLayout) {
        circleFacingRef.current = 'user';
      }
      /* exact → ideal → дефолт для mic/cam: иначе Electron часто берёт устройства по умолчанию */
      if (mode === 'voice') {
        stream = await openMediaStreamWithPreferredMic((audio) => ({ audio }), devicePrefs.microphoneId);
      } else if (isMobileLayout) {
        stream = await openMediaStreamWithPreferredAv({
          microphoneId: devicePrefs.microphoneId,
          mobileVideo: { facingMode: circleFacingRef.current },
        });
      } else {
        stream = await openMediaStreamWithPreferredAv({
          microphoneId: devicePrefs.microphoneId,
          cameraId: devicePrefs.cameraId,
        });
      }

      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        alert('Нет аудиодорожки: проверьте микрофон в настройках и разрешения браузера.');
        return;
      }

      streamRef.current = stream;
      const isVideo = mode === 'video';
      const mimeType = pickMime(isVideo);
      const recorder = MediaRecorder.isTypeSupported(mimeType)
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        setRecordSeconds(0);
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        const file = new File([blob], `${isVideo ? 'video' : 'voice'}.webm`, {
          type: recorder.mimeType || mimeType,
        });
        await sendFileAsMessage(file, isVideo ? 9 : undefined);
      };
      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);

      if (isVideo) {
        requestAnimationFrame(() => {
          if (videoPreviewRef.current && streamRef.current) {
            videoPreviewRef.current.srcObject = streamRef.current;
            videoPreviewRef.current.play().catch(() => {});
          }
        });
        setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
            setIsRecording(false);
          }
        }, VIDEO_MAX_SEC * 1000);
      }
    } catch (err) {
      alert(mode === 'video' ? 'Не удалось получить доступ к камере.' : 'Не удалось получить доступ к микрофону.');
    }
  }, [sendFileAsMessage, devicePrefs.microphoneId, devicePrefs.cameraId, isMobileLayout]);

  const flipCircleCamera = useCallback(async () => {
    if (!isMobileLayout || recordMode !== 'video') return;
    const stream = streamRef.current;
    if (!stream) return;
    const oldVideo = stream.getVideoTracks()[0];
    if (!oldVideo) return;
    const next: VideoFacing = circleFacingRef.current === 'user' ? 'environment' : 'user';
    try {
      await oldVideo.applyConstraints({ facingMode: next });
      circleFacingRef.current = next;
      return;
    } catch {
      /* часто нужен новый трек */
    }
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: next },
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
      });
      const nv = newStream.getVideoTracks()[0];
      stream.removeTrack(oldVideo);
      oldVideo.stop();
      stream.addTrack(nv);
      circleFacingRef.current = next;
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
      newStream.getAudioTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }, [isMobileLayout, recordMode]);

  const stopRecording = useCallback((send: boolean) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecordSeconds(0);
    const mr = mediaRecorderRef.current;
    if (mr?.state === 'recording') {
      if (send) {
        mr.stop();
      } else {
        mr.stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        chunksRef.current = [];
        mediaRecorderRef.current = null;
      }
    }
    if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = null; }
    setIsRecording(false);
  }, []);

  const handleRecordPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (isRecording) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      startRecording(recordMode);
    }, LONG_PRESS_MS);
  }, [isRecording, recordMode, startRecording]);

  const handleRecordPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      setRecordMode((m) => (m === 'voice' ? 'video' : 'voice'));
    } else if (isRecording) {
      stopRecording(true);
    }
  }, [isRecording, stopRecording]);

  const handleRecordPointerLeave = useCallback((e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isRecording) stopRecording(false);
  }, [isRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const close = () => { setShowEmoji(false); setShowAttach(false); setShowSticker(false); };
    if (showEmoji || showAttach || showSticker) {
      const timer = setTimeout(() => window.addEventListener('click', close), 10);
      return () => { clearTimeout(timer); window.removeEventListener('click', close); };
    }
  }, [showEmoji, showAttach, showSticker]);

  useEffect(() => {
    if (!showContactPicker || contactSearch.length < 2) { setContactResults([]); return; }
    const t = setTimeout(() => {
      api.searchUsers(contactSearch).then((users) => setContactResults(users.slice(0, 10))).catch(() => setContactResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch, showContactPicker]);

  return (
    <div className={`mi ${dragOver ? 'mi--dragover' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleFileDrop}>

      {dragOver && <div className="mi-drop-zone">Перетащите файлы сюда</div>}

      {isRecording && (
        <div className="mi-recording-bar">
          {recordMode === 'video' && (
            <div className="mi-recording-preview">
              <video ref={videoPreviewRef} className="mi-recording-video" muted playsInline />
              {isMobileLayout && (
                <button
                  type="button"
                  className="mi-recording-flip"
                  title="Переключить камеру"
                  aria-label="Переключить переднюю и заднюю камеру"
                  onClick={(e) => {
                    e.stopPropagation();
                    void flipCircleCamera();
                  }}
                >
                  <SwitchCamera size={18} />
                </button>
              )}
            </div>
          )}
          <div className="mi-recording-info">
            <span className="mi-recording-dot" />
            <span className="mi-recording-label">
              {recordMode === 'voice' ? 'Запись голоса' : 'Запись кружка'}
            </span>
            <span className="mi-recording-time">
              {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="mi-recording-actions">
            <button type="button" className="mi-recording-cancel" onClick={() => stopRecording(false)}>Отмена</button>
            <button type="button" className="mi-recording-send" onClick={() => stopRecording(true)}>Отправить</button>
          </div>
        </div>
      )}

      {showPollModal && (
        <div className="mi-poll-modal-overlay" onClick={() => setShowPollModal(false)}>
          <div className="mi-poll-modal" onClick={e => e.stopPropagation()}>
            <h3 className="mi-poll-title">Новый опрос</h3>
            <input
              className="mi-poll-input sp-input"
              placeholder="Вопрос"
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value)}
            />
            <div className="mi-poll-options">
              {pollOptions.map((opt, i) => (
                <div key={i} className="mi-poll-opt-row">
                  <input
                    className="mi-poll-opt-input sp-input"
                    placeholder={`Вариант ${i + 1}`}
                    value={opt}
                    onChange={e => setPollOptions(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                  />
                  {pollOptions.length > 2 && (
                    <button type="button" className="mi-poll-opt-rm" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button type="button" className="mi-poll-add" onClick={() => setPollOptions(prev => [...prev, ''])}>+ Добавить вариант</button>
              )}
            </div>
            <label className="mi-poll-multi">
              <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} />
              Разрешить несколько ответов
            </label>
            <div className="mi-poll-actions">
              <button className="sp-save" onClick={handleCreatePoll} disabled={pollSending || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}>
                {pollSending ? 'Отправка…' : 'Создать'}
              </button>
              <button className="mi-poll-cancel" onClick={() => setShowPollModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {replyingTo && (
        <div className="mi-reply">
          <div className="mi-reply-bar">
            <span className="mi-reply-text">Ответ: {replyingTo.text || '(медиа)'}</span>
            <button className="mi-reply-close" onClick={onClearReply}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* ТЗ §36: на телефоне — только при фокусе; на ПК — если включено */}
      {quickRepliesEnabled && !text.trim() && !replyingTo && (!isMobileLayout || inputFocused) && (
        <div className="mi-quick-replies">
          {QUICK_REPLIES.map((phrase) => (
            <button key={phrase} type="button" className="mi-quick-reply-btn" onClick={() => handleQuickReply(phrase)}>
              {phrase}
            </button>
          ))}
        </div>
      )}

      <div className="mi-row mi-row--with-footer">
        {/* Attach */}
        <div className="mi-attach-wrap">
          <button className="mi-btn" onClick={e => { e.stopPropagation(); setShowAttach(!showAttach); setShowEmoji(false); setShowSticker(false); }} title="Прикрепить">
            <Paperclip size={20} />
          </button>
          {showAttach && (
            <div className="mi-attach-menu" onClick={e => e.stopPropagation()}>
              <button onClick={() => handleFileSelect('image/*')}><Image size={18} /> Фото</button>
              <button onClick={() => handleFileSelect('video/*')}><Video size={18} /> Видео</button>
              <button onClick={() => handleFileSelect('audio/*')}><Music size={18} /> Аудио</button>
              <button onClick={() => handleFileSelect()}><FileIcon size={18} /> Файл</button>
              <button onClick={() => { setShowAttach(false); setShowPollModal(true); }}>
                <BarChart3 size={18} /> Опрос
              </button>
              <button onClick={handleGeolocation}><MapPin size={18} /> Геолокация</button>
              <button onClick={() => { setShowAttach(false); setShowContactPicker(true); }}>
                <UserPlus size={18} /> Контакт
              </button>
            </div>
          )}
        </div>

        {/* Emoji */}
        <div className="mi-emoji-wrap">
          <button className="mi-btn" onClick={e => { e.stopPropagation(); setShowEmoji(!showEmoji); setShowAttach(false); setShowSticker(false); }} title="Эмодзи">
            <Smile size={20} />
          </button>
          {showEmoji && (
            <div className="mi-emoji-panel" onClick={e => e.stopPropagation()}>
              <div className="mi-emoji-tabs">
                {EMOJI_GROUPS.map((g, i) => (
                  <button key={i} className={`mi-emoji-tab ${emojiTab === i ? 'mi-emoji-tab--active' : ''}`}
                    onClick={() => setEmojiTab(i)}>{g.emojis[0]}</button>
                ))}
              </div>
              <div className="mi-emoji-title">{EMOJI_GROUPS[emojiTab].label}</div>
              <div className="mi-emoji-grid">
                {EMOJI_GROUPS[emojiTab].emojis.map((e, i) => (
                  <button key={i} className="mi-emoji-item" onClick={() => insertEmoji(e)}>{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Stickers (раздел 12 ТЗ) */}
        <div className="mi-emoji-wrap mi-sticker-wrap">
          <button
            className="mi-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowSticker(!showSticker);
              setShowEmoji(false);
              setShowAttach(false);
            }}
            title="Стикеры"
          >
            <Sticker size={20} />
          </button>
          {showSticker && (
            <StickerPanel
              onPick={async (enc) => {
                setShowSticker(false);
                setSending(true);
                try {
                  await onSend(enc, replyingTo?.id, silentSend);
                  setText('');
                  try {
                    localStorage.removeItem(DRAFT_KEY(chatId));
                  } catch { /* ignore */ }
                  playSendSound();
                } finally {
                  setSending(false);
                }
              }}
              onClose={() => setShowSticker(false)}
            />
          )}
        </div>

        {/* Text input + char count */}
        <div className="mi-input-wrap mi-input-wrap--relative">
          <textarea
            ref={taRef}
            className="mi-textarea"
            placeholder="Сообщение"
            value={text}
            onChange={e => setText(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKey}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            rows={1}
            disabled={sending}
          />
          {showMentionDropdown && filteredMentions.length > 0 && (
            <div className="mi-mention-dropdown">
              {filteredMentions.map((u, i) => (
                <button
                  key={u.user_id}
                  type="button"
                  className={`mi-mention-item ${i === mentionIndex ? 'mi-mention-item--active' : ''}`}
                  onClick={() => insertMention(u)}
                >
                  {u.display_name}
                  {u.username && <span className="mi-mention-username">@{u.username}</span>}
                </button>
              ))}
            </div>
          )}
          {text.length > 0 && (
            <span className={`mi-char-count ${text.length > 4000 ? 'mi-char-count--warn' : ''}`}>
              {text.length > 999 ? `${(text.length / 1000).toFixed(1)}k` : text.length}
            </span>
          )}
        </div>

        {/* Silent send toggle (when typing) */}
        {text.trim() && (
          <button
            className={`mi-btn ${silentSend ? 'mi-btn--silent-active' : ''}`}
            title={silentSend ? 'Отправить без звука (вкл.)' : 'Отправить без звука'}
            onClick={() => setSilentSend((v) => !v)}
          >
            <BellOff size={18} />
          </button>
        )}
        {/* Send / Mic */}
        {text.trim() ? (
          <button className="mi-btn mi-btn--send" onClick={doSend} disabled={sending} title="Отправить">
            <SendHorizontal size={20} />
          </button>
        ) : (
          <button
            type="button"
            className={`mi-btn mi-btn--record ${isRecording ? 'mi-btn--recording' : ''}`}
            title={recordMode === 'voice'
              ? (isRecording ? 'Отпустите для отправки' : 'Голосовое сообщение (зажмите) • Тап — переключить на видео')
              : (isRecording ? 'Отпустите для отправки' : 'Видеокружок (зажмите) • Тап — переключить на голос')}
            onPointerDown={handleRecordPointerDown}
            onPointerUp={handleRecordPointerUp}
            onPointerLeave={handleRecordPointerLeave}
            onPointerCancel={handleRecordPointerLeave}
          >
            {recordMode === 'voice' ? <Mic size={20} /> : <Video size={20} />}
          </button>
        )}
      </div>

      {showContactPicker && (
        <div className="mi-poll-modal-overlay" onClick={() => setShowContactPicker(false)}>
          <div className="mi-poll-modal" onClick={e => e.stopPropagation()}>
            <h3 className="mi-poll-title">Отправить контакт</h3>
            <input
              className="mi-poll-input sp-input"
              placeholder="Поиск по имени..."
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              autoFocus
            />
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {contactResults.map(u => (
                <div
                  key={u.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 8 }}
                  className="mi-mention-item"
                  onClick={async () => {
                    const vcard = `👤 ${u.display_name}${u.username ? `\n@${u.username}` : ''}${u.email ? `\n✉️ ${u.email}` : ''}`;
                    try {
                      const msg = await api.sendMessage(chatId, 0, vcard, replyingTo?.id);
                      onMessageSent?.(msg);
                      onClearReply?.();
                    } catch { /* ignore */ }
                    setShowContactPicker(false);
                    setContactSearch('');
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{u.display_name}</span>
                  {u.username && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{u.username}</span>}
                </div>
              ))}
              {contactSearch.length >= 2 && contactResults.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Никого не найдено</div>
              )}
            </div>
            <button className="mi-poll-cancel" onClick={() => { setShowContactPicker(false); setContactSearch(''); }} style={{ marginTop: 8 }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
