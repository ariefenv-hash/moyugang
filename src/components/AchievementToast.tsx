import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Crown,
  Feather,
  Flame,
  Infinity as InfinityIcon,
  Shield,
  Sparkles,
  Star,
  Sword,
  Trophy,
} from 'lucide-react';
import type { AchievementDef } from '../types/game';

/** 成就浮提示（Task 47）：progress 驱动即时解锁的修行反馈最后一跳。
 *  战斗结算路径的成就仍由 VictoryDefeatModal 展示，此处不重复打扰；
 *  仅覆盖墨阁购买/每日首胜/累计击破等静默入档场景。 */

const TOAST_ICONS: Record<AchievementDef['icon'], typeof Sparkles> = {
  TROPHY: Trophy,
  STAR: Star,
  FLAME: Flame,
  SWORD: Sword,
  SHIELD: Shield,
  INFINITE: InfinityIcon,
  CROWN: Crown,
  FEATHER: Feather,
};

/** 单枚停留时长（毫秒） */
const TOAST_TTL_MS = 4500;
/** 同屏最多同时可见枚数，其余在队列中依序补位 */
const MAX_VISIBLE = 3;

function ToastCard({
  def,
  onExpire,
}: {
  def: AchievementDef;
  onExpire: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(def.id), TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [def.id, onExpire]);

  const Icon = TOAST_ICONS[def.icon] ?? Sparkles;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 56 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 56 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className="panel-paper-deep pointer-events-auto flex w-72 max-w-[calc(100vw-1.5rem)] items-start gap-3 px-4 py-3 shadow-lg shadow-black/10"
      role="status"
      data-achievement-toast={def.id}
    >
      <span
        className="seal mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-[10px] tracking-widest text-cinnabar">
          文心宝箓 · 参悟
        </span>
        <span className="block font-serif text-sm font-bold leading-snug text-ink-strong">
          {def.name}
        </span>
        <span className="block text-xs leading-snug text-ink-mid">{def.description}</span>
      </span>
    </motion.div>
  );
}

export function AchievementToast({
  toasts,
  onExpire,
}: {
  toasts: AchievementDef[];
  onExpire: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed right-3 top-16 z-[70] flex flex-col items-end gap-2 md:right-5 md:top-20"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.slice(0, MAX_VISIBLE).map((def) => (
          <ToastCard key={def.id} def={def} onExpire={onExpire} />
        ))}
      </AnimatePresence>
    </div>
  );
}
