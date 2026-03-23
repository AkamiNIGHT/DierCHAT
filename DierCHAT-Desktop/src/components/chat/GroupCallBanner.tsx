import { Phone, X } from 'lucide-react';
import { useStore } from '@/store';
import './GroupCallBanner.css';

type Props = { chatId: string };

/** ТЗ §41: баннер активного группового звонка в чате */
export function GroupCallBanner({ chatId }: Props) {
  const banner = useStore((s) => s.groupCallBannerByChatId[chatId]);
  const setGroupCallBanner = useStore((s) => s.setGroupCallBanner);

  if (!banner) return null;

  if (banner.state === 'ended') {
    return (
      <div className="group-call-banner group-call-banner--ended" role="status">
        <Phone size={18} />
        <span>Звонок завершён</span>
      </div>
    );
  }

  return (
    <div className="group-call-banner group-call-banner--active" role="status">
      <span className="group-call-banner__pulse" aria-hidden />
      <Phone size={18} />
      <span className="group-call-banner__text">
        Идёт групповой звонок ({banner.participantCount} участник
        {banner.participantCount === 1 ? '' : banner.participantCount < 5 ? 'а' : 'ов'})
        {banner.video ? ' · видео' : ''}. Подключитесь через кнопки звонка в шапке.
      </span>
      <button
        type="button"
        className="group-call-banner__dismiss"
        title="Скрыть уведомление"
        onClick={() => setGroupCallBanner(chatId, null)}
      >
        <X size={18} />
      </button>
    </div>
  );
}
