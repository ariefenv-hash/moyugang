import React from 'react';
import { X, Trophy, Star, Flame, Sword, Shield, Crown, Feather, Infinity as InfinityIcon, Sparkles } from 'lucide-react';
import { AchievementDef } from '../types/game';
import { ACHIEVEMENTS } from '../data/gameData';

interface AchievementsModalProps {
  unlocked: string[];
  onClose: () => void;
}

const ICONS: Record<AchievementDef['icon'], React.ReactNode> = {
  TROPHY: <Trophy className="w-5 h-5" />,
  STAR: <Star className="w-5 h-5" />,
  FLAME: <Flame className="w-5 h-5" />,
  SWORD: <Sword className="w-5 h-5" />,
  SHIELD: <Shield className="w-5 h-5" />,
  INFINITE: <InfinityIcon className="w-5 h-5" />,
  CROWN: <Crown className="w-5 h-5" />,
  FEATHER: <Feather className="w-5 h-5" />,
};

/** 成就百宝格：展示全部成就与解锁进度 */
export const AchievementsModal: React.FC<AchievementsModalProps> = ({ unlocked, onClose }) => {
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-stone-800 mb-5">
          <div>
            <h2 className="text-xl font-serif font-black tracking-wider text-stone-100">
              文心宝箓 · 成就
            </h2>
            <p className="text-xs text-stone-400 font-serif mt-0.5">
              已参悟 {unlockedCount} / {ACHIEVEMENTS.length} 式
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-100 bg-stone-800 rounded-xl cursor-pointer"
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
                className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-colors ${
                  isUnlocked
                    ? 'bg-amber-950/20 border-amber-800/40'
                    : 'bg-stone-950/50 border-stone-800/60'
                }`}
              >
                <div
                  className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                    isUnlocked
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-600/40'
                      : 'bg-stone-900 text-stone-600 border border-stone-800'
                  }`}
                >
                  {ICONS[a.icon]}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-serif font-bold flex items-center gap-1 ${
                      isUnlocked ? 'text-amber-100' : 'text-stone-400'
                    }`}
                  >
                    {a.name}
                    {isUnlocked && <Sparkles className="w-3 h-3 text-amber-400" />}
                  </p>
                  <p className="text-[11px] text-stone-400 leading-relaxed mt-0.5">
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
