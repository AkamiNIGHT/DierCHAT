/**
 * Simple i18n: Russian (default) + English.
 * Usage: useTranslation() then t('key')
 */
import { useCallback } from 'react';
import { useStore } from '@/store';
import type { Language } from '@/store';

const translations: Record<Language, Record<string, string>> = {
  ru: {
    chats: 'Чаты',
    contacts: 'Контакты',
    friends: 'Друзья',
    settings: 'Настройки',
    profile: 'Профиль',
    loading: 'Загрузка…',
    message: 'Сообщение',
    send: 'Отправить',
    info: 'Информация',
    media: 'Медиа',
    favorites: 'Избранное',
    links: 'Ссылки',
    voice: 'Голосовые',
    members: 'Участники',
    empty_chat: 'Выберите чат для начала общения',
    media_empty: 'Фото, видео и файлы из этого чата появятся здесь.',
    favorites_empty: 'Нажмите на сообщение и выберите «В избранное», чтобы сохранить его здесь.',
    links_empty: 'Ссылки из переписки появятся здесь.',
    voice_empty: 'Голосовые сообщения появятся здесь.',
    online: 'в сети',
    was_online: 'был(а) недавно',
    select_photo: 'Выбрать фото',
    edit: 'Изменить',
    broadcast: 'Рассылка',
    broadcast_desc: 'Отправить сообщение в несколько групп и каналов, в которых вы администратор.',
    broadcast_select_chats: 'Выберите чаты',
    broadcast_message: 'Сообщение',
    broadcast_send: 'Разослать',
    broadcast_sending: 'Отправка…',
    broadcast_success: 'Отправлено',
    broadcast_failed: 'Ошибка',
    broadcast_content_text: 'Текст',
    broadcast_content_code: 'Код',
    support: 'Поддержка',
    donations: 'Пожертвования',
    ideas: 'Идеи',
    back: 'Назад',
    logout: 'Выйти',
    notifications: 'Уведомления',
    privacy: 'Конфиденциальность',
    appearance: 'Оформление',
    storage: 'Данные и память',
    about: 'О программе',
    language_label: 'Язык',
    devices: 'Устройства',
    search_settings: 'Поиск в настройках',
    silent_send: 'Без звука',
  },
  en: {
    chats: 'Chats',
    contacts: 'Contacts',
    friends: 'Friends',
    settings: 'Settings',
    profile: 'Profile',
    loading: 'Loading…',
    message: 'Message',
    send: 'Send',
    info: 'Info',
    media: 'Media',
    favorites: 'Favorites',
    links: 'Links',
    voice: 'Voice',
    members: 'Members',
    empty_chat: 'Select a chat to start messaging',
    media_empty: 'Photos, videos and files from this chat will appear here.',
    favorites_empty: 'Tap a message and choose «Add to Favorites» to save it here.',
    links_empty: 'Links from the conversation will appear here.',
    voice_empty: 'Voice messages will appear here.',
    online: 'online',
    was_online: 'recently',
    select_photo: 'Select photo',
    edit: 'Edit',
    broadcast: 'Broadcast',
    broadcast_desc: 'Send a message to multiple groups and channels where you are an admin.',
    broadcast_select_chats: 'Select chats',
    broadcast_message: 'Message',
    broadcast_send: 'Send',
    broadcast_sending: 'Sending…',
    broadcast_success: 'Sent',
    broadcast_failed: 'Error',
    broadcast_content_text: 'Text',
    broadcast_content_code: 'Code',
    support: 'Support',
    donations: 'Donations',
    ideas: 'Ideas',
    back: 'Back',
    logout: 'Log out',
    notifications: 'Notifications',
    privacy: 'Privacy',
    appearance: 'Appearance',
    storage: 'Data & storage',
    about: 'About',
    language_label: 'Language',
    devices: 'Devices',
    search_settings: 'Search settings',
    silent_send: 'Silent',
  },
  kk: { ...{} as Record<string, string> },
  tr: { ...{} as Record<string, string> },
  az: { ...{} as Record<string, string> },
  hy: { ...{} as Record<string, string> },
  be: { ...{} as Record<string, string> },
};

// Fallback: use Russian for missing locales
for (const lang of ['kk', 'tr', 'az', 'hy', 'be'] as Language[]) {
  if (Object.keys(translations[lang] || {}).length === 0) {
    translations[lang] = translations.ru;
  }
}

export function useTranslation() {
  const language = useStore((s) => s.language);
  const t = useCallback(
    (key: string): string => {
      const dict = translations[language] || translations.ru;
      return dict[key] ?? translations.ru[key] ?? key;
    },
    [language]
  );
  return { t, language };
}

/** date-fns locale by app language */
export function getDateLocale(lang: Language) {
  try {
    if (lang === 'ru') return import('date-fns/locale/ru').then((m) => m.ru);
    if (lang === 'en') return import('date-fns/locale/en-US').then((m) => m.enUS);
    return import('date-fns/locale/ru').then((m) => m.ru);
  } catch {
    return import('date-fns/locale/ru').then((m) => m.ru);
  }
}
