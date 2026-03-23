import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';
import type { User } from '@/api/client';
import { useStore } from '@/store';
import { Avatar } from '@/components/common/Avatar';
import { X, MessageCircle, ShieldOff, ShieldCheck, Users } from 'lucide-react';
import './UserProfilePanel.css';

interface Props {
  userId: string;
  onClose: () => void;
  onOpenChat?: (chatId: string) => void;
  /** На мобильных рендер в document.body: иначе position:fixed внутри .chatArea с transform даёт узкую/смещённую колонку (§27). */
  isMobile?: boolean;
}

function portalIfMobile(node: ReactNode, isMobile?: boolean) {
  if (isMobile && typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }
  return node;
}

export function UserProfilePanel({ userId, onClose, onOpenChat, isMobile }: Props) {
  const currentUser = useStore((s) => s.user);
  const setCurrentChatId = useStore((s) => s.setCurrentChatId);
  const [profile, setProfile] = useState<User | null>(null);
  const [commonGroups, setCommonGroups] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getUser(userId)
      .then((u) => setProfile(u))
      .catch(() => {})
      .finally(() => setLoading(false));

    api.getBlockedUsers().then((list) => {
      setBlocked(list.some((u) => u.id === userId));
    }).catch(() => {});
    api.getChats().then((chats: any[]) => {
      const groups = chats.filter((c: any) => c.type === 1);
      setCommonGroups(groups.map((g: any) => ({ id: g.id, title: g.title || 'Группа' })));
    }).catch(() => {});
  }, [userId]);

  async function handleWriteMessage() {
    try {
      const chat = await api.createPrivateChat(userId);
      setCurrentChatId(chat.id);
      onOpenChat?.(chat.id);
      onClose();
    } catch {}
  }

  if (loading) {
    return portalIfMobile(
      (
        <div className={`upp${isMobile ? ' upp--portal' : ''}`}>
          <div className="upp-header">
            <h3>Профиль</h3>
            <button className="upp-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="upp-loading">Загрузка...</div>
        </div>
      ),
      isMobile,
    );
  }

  if (!profile) {
    return portalIfMobile(
      (
        <div className={`upp${isMobile ? ' upp--portal' : ''}`}>
          <div className="upp-header">
            <h3>Профиль</h3>
            <button className="upp-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="upp-loading">Пользователь не найден</div>
        </div>
      ),
      isMobile,
    );
  }

  const isOnline = profile.online;
  const lastSeen = profile.last_seen ? new Date(profile.last_seen) : null;

  return portalIfMobile(
    (
      <div className={`upp${isMobile ? ' upp--portal' : ''}`}>
      <div className="upp-header">
        <h3>Профиль</h3>
        <button className="upp-close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="upp-body">
        <div className="upp-avatar-section">
          <Avatar name={profile.display_name || '?'} size={96} />
          <h2 className="upp-name">{profile.display_name}</h2>
          {profile.username && <p className="upp-username">@{profile.username}</p>}
          <p className="upp-status">
            {isOnline ? (
              <span className="upp-online">в сети</span>
            ) : lastSeen ? (
              `был(а) ${lastSeen.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            ) : (
              'давно'
            )}
          </p>
        </div>

        {profile.bio && (
          <div className="upp-section">
            <div className="upp-section-title">О себе</div>
            <p className="upp-bio">{profile.bio}</p>
          </div>
        )}

        {profile.email && (
          <div className="upp-section">
            <div className="upp-section-title">Email</div>
            <p className="upp-detail">{profile.email}</p>
          </div>
        )}

        {userId !== currentUser?.id && (
          <div className="upp-actions">
            <button className="upp-action-btn" onClick={handleWriteMessage}>
              <MessageCircle size={18} /> Написать сообщение
            </button>
            <button
              className={`upp-action-btn ${blocked ? 'upp-action-btn--danger' : ''}`}
              onClick={async () => {
                try {
                  if (blocked) {
                    await api.unblockUser(userId);
                    setBlocked(false);
                  } else {
                    if (!confirm('Заблокировать пользователя?')) return;
                    await api.blockUser(userId);
                    setBlocked(true);
                  }
                } catch {}
              }}
            >
              {blocked ? <><ShieldCheck size={18} /> Разблокировать</> : <><ShieldOff size={18} /> Заблокировать</>}
            </button>
          </div>
        )}

        {commonGroups.length > 0 && (
          <div className="upp-section">
            <div className="upp-section-title"><Users size={14} /> Общие группы ({commonGroups.length})</div>
            <div className="upp-groups">
              {commonGroups.map((g) => (
                <div
                  key={g.id}
                  className="upp-group-item"
                  onClick={() => { setCurrentChatId(g.id); onClose(); }}
                >
                  <Avatar name={g.title} size={36} />
                  <span>{g.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    ),
    isMobile,
  );
}
