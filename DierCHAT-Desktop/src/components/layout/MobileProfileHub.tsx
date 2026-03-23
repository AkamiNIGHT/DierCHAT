import { Settings, LogOut, X } from 'lucide-react';
import { useStore } from '@/store';
import { Avatar } from '@/components/common/Avatar';
import { normalizeMediaUrl } from '@/lib/publicApiUrl';
import './MobileProfileHub.css';

type Props = {
  onOpenSettings: () => void;
  onClose: () => void;
};

/** ТЗ §43: настройки только через аватар; этот экран — вход в профиль/настройки */
export function MobileProfileHub({ onOpenSettings, onClose }: Props) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);

  const name = user?.display_name?.trim() || user?.username || 'Профиль';

  return (
    <div className="mobile-profile-hub">
      <div className="mobile-profile-hub__header">
        <span className="mobile-profile-hub__title">Профиль</span>
        <button type="button" className="mobile-profile-hub__close" onClick={onClose} title="Закрыть">
          <X size={22} />
        </button>
      </div>
      <div className="mobile-profile-hub__card">
        <Avatar
          name={name}
          size={88}
          imageUrl={user?.avatar_url ? normalizeMediaUrl(user.avatar_url) : undefined}
        />
        <div className="mobile-profile-hub__name">{name}</div>
        {user?.username && <div className="mobile-profile-hub__username">@{user.username}</div>}
      </div>
      <div className="mobile-profile-hub__actions">
        <button
          type="button"
          className="mobile-profile-hub__btn"
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
        >
          <Settings size={20} />
          Настройки
        </button>
        <button
          type="button"
          className="mobile-profile-hub__btn mobile-profile-hub__btn--danger"
          onClick={() => {
            if (confirm('Выйти из аккаунта?')) logout();
          }}
        >
          <LogOut size={20} />
          Выйти
        </button>
      </div>
    </div>
  );
}
