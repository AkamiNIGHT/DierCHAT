import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { api } from '@/api/client';
import { Avatar } from '@/components/common/Avatar';
import { ArrowLeft, Bookmark, Star } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import './FavoritesPanel.css';

type ChatE = {
  id: string;
  type: number;
  title?: string;
  description?: string;
};

type Props = { onClose: () => void; onSelectChat: () => void };

export function FavoritesPanel({ onClose, onSelectChat }: Props) {
  const { t } = useTranslation();
  const [chats, setChats] = useState<ChatE[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getChats()
      .then((list: ChatE[]) => setChats(Array.isArray(list) ? list : []))
      .catch(() => setChats([]))
      .finally(() => setLoading(false));
  }, []);

  const { setCurrentChatId, setPendingInfoPanelTab } = useStore();

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setPendingInfoPanelTab('favorites');
    onSelectChat(chatId);
    // Не вызываем onClose — onSelectChat закрывает панель; onClose обнулил бы currentChatId
  };

  return (
    <div className="favorites-panel">
      <div className="favorites-panel__header">
        <button type="button" className="favorites-panel__back" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <h2 className="favorites-panel__title">
          <Star size={20} />
          {t('favorites')}
        </h2>
      </div>
      <div className="favorites-panel__content">
        <p className="favorites-panel__hint">
          Выберите чат, чтобы открыть сохранённые сообщения из вкладки «Избранное».
        </p>
        {loading ? (
          <div className="favorites-panel__loading">{t('loading')}</div>
        ) : (
          <div className="favorites-panel__list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className="favorites-panel__item"
                onClick={() => handleSelectChat(chat.id)}
              >
                <Avatar name={chat.title || 'Чат'} size={48} />
                <div className="favorites-panel__item-body">
                  <span className="favorites-panel__item-name">{chat.title || 'Личный чат'}</span>
                  <span className="favorites-panel__item-meta">
                    {chat.type === 0 ? 'Личный чат' : chat.type === 1 ? 'Группа' : 'Канал'}
                  </span>
                </div>
              </button>
            ))}
            {chats.length === 0 && (
              <div className="favorites-panel__empty">
                <Bookmark size={40} strokeWidth={1.2} />
                <p>Нет чатов</p>
                <p className="favorites-panel__empty-hint">Нажмите на сообщение в чате → «В избранное»</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
