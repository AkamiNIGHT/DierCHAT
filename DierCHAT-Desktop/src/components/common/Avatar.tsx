import type { CSSProperties } from 'react';
import { useAvatarCachedUrl } from '@/lib/useAvatarCachedUrl';
import './Avatar.css';

const COLORS = [
  '#E57373',
  '#F06292',
  '#BA68C8',
  '#7986CB',
  '#64B5F6',
  '#4DB6AC',
  '#81C784',
  '#FFB74D',
];

/** ТЗ §35: стандартные размеры без искажений */
export type AvatarVariant = 'list' | 'header' | 'reaction' | 'profile' | 'callIncoming' | 'callPip';

const VARIANT_SIZE: Record<AvatarVariant, number> = {
  list: 40,
  header: 48,
  reaction: 28,
  profile: 120,
  callIncoming: 88,
  callPip: 112,
};

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  /** Явный размер (перекрывает variant) */
  size?: number;
  /** ТЗ §35: предустановленные размеры */
  variant?: AvatarVariant;
  onClick?: () => void;
  style?: CSSProperties;
  /** Отключить IndexedDB (редко) */
  disableCache?: boolean;
}

export function Avatar({
  name,
  imageUrl,
  size: sizeProp,
  variant,
  onClick,
  style: extraStyle,
  disableCache = false,
}: AvatarProps) {
  const size = sizeProp ?? (variant ? VARIANT_SIZE[variant] : 48);
  const bgColor = COLORS[hash(name || '?') % COLORS.length];
  const initials = getInitials(name || '?');
  const cachedDisplay = useAvatarCachedUrl(imageUrl?.trim() || null, !disableCache);
  const src = cachedDisplay || undefined;

  const style: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    fontSize: size * 0.4,
    backgroundColor: src ? undefined : bgColor,
    ...extraStyle,
  };

  return (
    <div
      className={`avatar ${onClick ? 'avatar--clickable' : ''}`}
      style={style}
      title={name}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {src ? (
        <img src={src} alt="" className="avatar__img" draggable={false} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
