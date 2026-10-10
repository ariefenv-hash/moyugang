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
  Sparkles,
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

const RARITY_STYLE: Record<
  BlessingDef['rarity'],
  { label: string; border: string; text: string; glow: string }
> = {
  COMMON: {
    label: '凡品',
    border: 'border-stone-600 hover:border-stone-400',
    text: 'text-stone-300',
    glow: 'hover:shadow-[0_0_24px_rgba(214,211,209,0.15)]',
  },
  RARE: {
    label: '珍品',
    border: 'border-cyan-800 hover:border-cyan-400',
    text: 'text-cyan-300',
    glow: 'hover:shadow-[0_0_28px_rgba(34,211,238,0.3)]',
  },
  EPIC: {
    label: '绝品',
    border: 'border-amber-700 hover:border-amber-400',
    text: 'text-amber-300',
    glow: 'hover:shadow-[0_0_32px_rgba(251,191,36,0.4)]',
  },
};

/** 墨灵祝福 · 三选一弹窗（选择期间战场凝滞） */
export const BlessingModal: React.FC<BlessingModalProps> = ({
  offerings,
  ownedCounts,
  onPick,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-950/82 backdrop-blur-md animate-fade-in px-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-950/60 border border-amber-700/50 mb-3">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-serif tracking-widest text-amber-200">
              墨灵显现 · 赐尔祝福
            </span>
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <h2 className="text-2xl md:text-3xl font-serif font-black tracking-widest text-stone-100">
            以心印墨 · 三择其一
          </h2>
          <p className="mt-2 text-xs text-stone-400 font-serif">
            择一墨灵祝福护佑全军，祝福可叠加，愈战愈强
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
                className={`group relative text-left p-4 md:p-5 bg-stone-900/95 border-2 ${style.border} ${style.glow} rounded-2xl shadow-2xl transition-all cursor-pointer overflow-hidden`}
              >
                {/* 背景大字水印 */}
                <span className="absolute -bottom-5 -right-2 text-[64px] leading-none font-serif font-black text-stone-800/60 select-none pointer-events-none">
                  {b.name.charAt(0)}
                </span>

                <div className="flex items-center justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center group-active:scale-90 transition-transform">
                    <Icon className={`w-[22px] h-[22px] ${style.text}`} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-serif font-bold tracking-widest ${style.text}`}>
                      {style.label}
                    </span>
                    {owned > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-300 font-mono">
                        已拥 ×{owned}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-serif font-bold tracking-wider text-stone-100">
                  {b.name}
                </h3>
                <p className="mt-0.5 text-[11px] font-serif text-stone-500 italic leading-snug">
                  「{b.verse}」
                </p>
                <p className="mt-2.5 text-xs font-sans text-stone-300 leading-relaxed border-t border-stone-800 pt-2.5">
                  {b.description}
                </p>
              </motion.button>
            );
          })}
        </div>

        <p className="mt-5 text-center text-[10px] text-stone-500 font-serif tracking-wider">
          战场凝滞中 · 落子无悔，择定即生效
        </p>
      </div>
    </div>
  );
};
