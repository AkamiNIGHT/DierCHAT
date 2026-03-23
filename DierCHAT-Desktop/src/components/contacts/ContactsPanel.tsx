import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import type { User } from '@/api/client';
import { Avatar } from '@/components/common/Avatar';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import './ContactsPanel.css';

type Props = {
  onClose: () => void;
  onSelectUser: (userId: string) => void;
};

export function ContactsPanel({ onClose, onSelectUser }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .searchUsers(query.trim())
        .then((users) => setResults(users ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (u: User) => {
    onSelectUser(u.id);
    onClose();
  };

  return (
    <div className="contacts-panel">
      <div className="contacts-panel__header">
        <button type="button" className="contacts-panel__back" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <h2 className="contacts-panel__title">
          <UserPlus size={20} />
          {t('contacts')}
        </h2>
      </div>
      <div className="contacts-panel__content">
        <div className="contacts-panel__search">
          <Search size={18} className="contacts-panel__search-icon" />
          <input
            type="text"
            className="contacts-panel__search-input"
            placeholder="Поиск по имени или телефону..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="contacts-panel__loading">{t('loading')}</div>
        ) : results.length > 0 ? (
          <div className="contacts-panel__list">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="contacts-panel__item"
                onClick={() => handleSelect(u)}
              >
                <Avatar name={u.display_name} size={48} />
                <div className="contacts-panel__item-body">
                  <span className="contacts-panel__item-name">{u.display_name}</span>
                  <span className="contacts-panel__item-meta">
                    {u.username ? `@${u.username}` : u.phone}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : query.trim().length >= 2 ? (
          <div className="contacts-panel__empty">
            <p>Никого не найдено</p>
            <p className="contacts-panel__empty-hint">Введите имя или номер телефона</p>
          </div>
        ) : (
          <div className="contacts-panel__empty">
            <UserPlus size={40} strokeWidth={1.2} />
            <p>Поиск контактов</p>
            <p className="contacts-panel__empty-hint">Введите минимум 2 символа для поиска</p>
          </div>
        )}
      </div>
    </div>
  );
}
