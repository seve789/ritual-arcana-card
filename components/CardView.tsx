'use client';

import { cardById, RARITY_STYLE } from '@/lib/cards';
import type { CardMeta } from '@/lib/cards';

interface CardViewProps {
  cardId: bigint | number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  canAttack?: boolean;
  hpOverride?: bigint | number;
  atkOverride?: bigint | number;
  count?: number;
  label?: string;
}

const SIZE_CLASS: Record<NonNullable<CardViewProps['size']>, string> = {
  xs: 'w-16 h-24 p-1',
  sm: 'w-24 h-36 p-1.5',
  md: 'w-32 h-48 p-2',
  lg: 'w-40 h-60 p-2.5',
};

const NAME_CLASS: Record<NonNullable<CardViewProps['size']>, string> = {
  xs: 'text-[7px]',
  sm: 'text-[9px]',
  md: 'text-[11px]',
  lg: 'text-sm',
};

const GLYPH_CLASS: Record<NonNullable<CardViewProps['size']>, string> = {
  xs: 'text-lg',
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-5xl',
};

export default function CardView({
  cardId,
  size = 'md',
  onClick,
  disabled,
  dimmed,
  selected,
  canAttack,
  hpOverride,
  atkOverride,
  count,
  label,
}: CardViewProps) {
  const meta: CardMeta = cardById(cardId);
  const style = RARITY_STYLE[meta.rarity] ?? RARITY_STYLE[0];
  const hp = hpOverride !== undefined ? Number(hpOverride) : meta.hp;
  const atk = atkOverride !== undefined ? Number(atkOverride) : meta.atk;
  const dead = hp <= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${meta.name} — ${meta.cost}费 ${atk}/${hp}`}
      className={[
        'relative flex flex-col justify-between rounded-lg border-2 bg-ritual-elevated shadow-card transition-all',
        SIZE_CLASS[size],
        style.border,
        style.glow,
        onClick && !disabled ? 'hover:-translate-y-1 hover:border-ritual-lime cursor-pointer' : 'cursor-default',
        dimmed || dead ? 'opacity-40 grayscale' : '',
        selected ? 'ring-2 ring-ritual-lime shadow-glow-green' : '',
        canAttack ? 'animate-pulse-green' : '',
        'select-none',
      ].join(' ')}
    >
      {/* 费用 */}
      <div className="absolute -top-2 -left-2 flex items-center justify-center w-6 h-6 rounded-full bg-ritual-surface border border-ritual-gold text-ritual-gold font-mono text-xs font-semibold">
        {meta.cost}
      </div>

      {/* 名称 */}
      <div className={`text-center font-semibold leading-tight truncate ${NAME_CLASS[size]} text-gray-200 pt-1`}>
        {meta.name}
        {count !== undefined && (
          <span className="ml-1 font-mono text-ritual-lime">×{count}</span>
        )}
      </div>

      {/* 中央符号 + 稀有度 */}
      <div className="flex flex-col items-center justify-center flex-1">
        <span className={`${GLYPH_CLASS[size]} ${style.text}`}>{meta.glyph}</span>
        <span className={`text-[8px] uppercase tracking-widest ${style.text} mt-1`}>
          {label ?? ''}
        </span>
      </div>

      {/* 攻/血 */}
      <div className="flex items-center justify-between px-1 pb-0.5">
        <span className="font-mono text-xs font-bold text-ritual-green">{atk}⚔</span>
        <span className={`font-mono text-xs font-bold ${dead ? 'text-red-500' : 'text-red-300'}`}>{hp}♥</span>
      </div>
    </button>
  );
}
