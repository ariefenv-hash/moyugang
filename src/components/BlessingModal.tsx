import React from 'react';
import { motion } from 'motion/react';
import { BlessingDef } from '../types/game';
import {
  Sword,
  Shield,
  Wind,
  Flame,
  Coins,
  Heart,
  Zap,
  Star,
} from 'lucide-react';

interface BlessingModalProps {
  /** 当前三张候选祝福 */
  offerings: BlessingDef[];
  /** 已叠层数 map（展示「已拥有 ×n」） */
  ownedCounts: Record<string, number>;
  onPick: (blessing: BlessingDef) => void;
}

const ICON_MAP: Record<BlessingDef['icon'], React.ElementType> = {
  SWORD: Sword,
  SHIELD: Shield,
  WIND: Wind,
  FLAME: Flame,
  COINS: Coins,
  HEART: Heart,
  ZAP: Zap,
  STAR: Star,
};

/** 稀有度 → 符纸边缘色（凡品墨线 / 珍品黛青 / 绝品朱砂） */
const RARITY_STYLE: Record<
  BlessingDef['rarity'],
  { label: string; card: string; edge: string; text: string; seal: string }
> = {
  COMMON: {
    label: '凡品',
    card: 'panel-paper hover:border-ink-strong/70',
    edge: 'border-t-4 border-t-ink-strong/70',
    text: 'text-ink-mid',
    seal: 'text-ink-strong border-ink-strong/60',
  },
  RARE: {
    label: '珍品',
    card: 'panel-paper hover:border-daiqing',
    edge: 'border-t-4 border-t-daiqing',
    text: 'text-daiqing',
    seal: 'text-daiqing border-daiqing/60',
  },
  EPIC: {
    label: '绝品',
    card: 'panel-paper hover:border-cinnabar',
    edge: 'border-t-4 border-t-cinnabar',
    text: 'text-cinnabar',
    seal: 'text-cinnabar border-cinnabar/60',
  },
};

/** 墨灵祝福 · 三选一（选择期间战场凝滞）：夜幕之上悬三张灵符 */
export const BlessingModal: React.FC<BlessingModalProps> = ({
  offerings,
  ownedCounts,
  onPick,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-strong/82 backdrop-blur-sm animate-fade-in px-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center mb-6"
        >
          <h2 className="text-2xl md:text-3xl font-serif font-black tracking-widest text-paper">
            以心印墨 · 三择其一
          </h2>
          <p className="mt-2 text-xs text-paper-dim font-serif tracking-wider">
            墨灵显现，赐尔祝福 —— 择一护佑全军，祝福可叠加，愈战愈强
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {offerings.map((b, idx) => {
            const Icon = ICON_MAP[b.icon];
            const style = RARITY_STYLE[b.rarity];
            const owned = ownedCounts[b.id] || 0;
            return (
              <motion.button
                key={b.id}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 + idx * 0.12 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onPick(b)}
                className={`group relative text-left p-4 md:p-5 ${style.card} ${style.edge} shadow-[0_18px_40px_-16px_rgba(0,0,0,0.65)] transition-colors cursor-pointer overflow-hidden`}
              >
                {/* 背景大字水印：淡墨 */}
                <span className="absolute -bottom-5 -right-2 text-[64px] leading-none font-serif font-black text-ink-strong/8 select-none pointer-events-none">
                  {b.name.charAt(0)}
                </span>

                <div className="flex items-center justify-between mb-3">
                  <div className="w-11 h-11 panel-paper-deep flex items-center justify-center group-active:scale-90 transition-transform">
                    <Icon className={`w-[22px] h-[22px] ${style.text}`} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-1.5 py-0.5 border text-[10px] font-serif font-bold tracking-widest ${style.seal}`}>
                      {style.label}
                    </span>
                    {owned > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 panel-paper-deep text-ink-mid">
                        已拥 ×{owned}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-serif font-bold tracking-wider text-ink-strong">
                  {b.name}
                </h3>
                <p className="mt-1 text-[11px] font-serif text-ink-light leading-snug">
                  「{b.verse}」
                </p>
                <p className="mt-2.5 text-xs text-ink leading-relaxed border-t rule-ink pt-2.5">
                  {b.description}
                </p>
              </motion.button>
            );
          })}
        </div>

        <p className="mt-5 text-center text-[10px] text-paper-dim font-serif tracking-widest">
          战场凝滞中 · 落子无悔，择定即生效
        </p>
      </div>
    </div>
  );
};
