import React from 'react';
import { X, Trophy, Star, Flame, Sword, Shield, Crown, Feather, Infinity as InfinityIcon } from 'lucide-react';
import { AchievementDef } from '../types/game';
import { ACHIEVEMENTS } from '../data/gameData';

interface AchievementsModalProps {
  unlocked: string[];
  onClose: () => void;
}

const ICONS: Record<AchievementDef['icon'], React.ReactNode> = {
  TROPHY: <Trophy className="w-4 h-4" />,
  STAR: <Star className="w-4 h-4" />,
  FLAME: <Flame className="w-4 h-4" />,
  SWORD: <Sword className="w-4 h-4" />,
  SHIELD: <Shield className="w-4 h-4" />,
  INFINITE: <InfinityIcon className="w-4 h-4" />,
  CROWN: <Crown className="w-4 h-4" />,
  FEATHER: <Feather className="w-4 h-4" />,
};

/** 文心印谱：每枚成就为一方钤印，参悟则印成朱色 */
export const AchievementsModal: React.FC<AchievementsModalProps> = ({ unlocked, onClose }) => {
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-strong/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative max-w-lg w-full max-h-[85vh] overflow-y-auto paper-scroll p-6 md:p-7 scroll-mount text-ink">
        <div className="flex items-center justify-between pb-4 border-b rule-zhusi mb-5">
          <div>
            <h2 className="text-xl font-serif font-black tracking-widest text-ink-strong">
              文心印谱
            </h2>
            <p className="text-xs text-ink-mid font-serif mt-1 tracking-wider">
              已参悟 <span className="font-mono text-cinnabar">{unlockedCount}</span> /{' '}
              <span className="font-mono">{ACHIEVEMENTS.length}</span> 方 · 印成者朱，未悟者白
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-ink p-2 cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ACHIEVEMENTS.map((a) => {
            const isUnlocked = unlocked.includes(a.id);
            return (
              <div
                key={a.id}
                className={`p-3.5 flex items-start gap-3 transition-colors ${
                  isUnlocked ? 'panel-paper' : 'panel-paper opacity-70'
                }`}
              >
                {/* 印面 */}
                <div
                  className={`w-10 h-10 shrink-0 flex items-center justify-center ${
                    isUnlocked
                      ? 'seal animate-seal-stamp'
                      : 'seal-ghost'
                  }`}
                  aria-hidden="true"
                >
                  {ICONS[a.icon]}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-serif font-bold tracking-wide ${
                      isUnlocked ? 'text-ink-strong' : 'text-ink-light'
                    }`}
                  >
                    {a.name}
                  </p>
                  <p className="text-[11px] text-ink-mid leading-relaxed mt-0.5">
                    {a.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
