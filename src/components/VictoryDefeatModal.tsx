import React from 'react';
import { Sparkles, Trophy, RotateCcw, ArrowRight, Home, Star, Swords, Flame, Timer, ShieldCheck, Award } from 'lucide-react';
import { AchievementDef } from '../types/game';
import { ACHIEVEMENTS } from '../data/gameData';

interface VictoryDefeatModalProps {
  isVictory: boolean;
  levelTitle: string;
  poeticVerse: string;
  jadeEarned: number;
  stars: number;
  kills: number;
  maxCombo: number;
  durationSec: number;
  baseHpPct: number;
  endlessWave?: number;
  newAchievements: AchievementDef[];
  endlessBest?: number;
  onNextLevel?: () => void;
  onRetry: () => void;
  onBackToMap: () => void;
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex-1 min-w-0 p-2.5 bg-stone-950/70 border border-stone-800 rounded-xl text-center">
      <div className={`flex items-center justify-center gap-1 ${accent}`}>
        {icon}
        <span className="text-[10px] font-serif">{label}</span>
      </div>
      <p className="text-sm font-bold font-mono text-stone-100 mt-1 tabular-nums">{value}</p>
    </div>
  );
}

export const VictoryDefeatModal: React.FC<VictoryDefeatModalProps> = ({
  isVictory,
  levelTitle,
  poeticVerse,
  jadeEarned,
  stars,
  kills,
  maxCombo,
  durationSec,
  baseHpPct,
  endlessWave,
  newAchievements,
  endlessBest,
  onNextLevel,
  onRetry,
  onBackToMap,
}) => {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="max-w-md w-full p-8 bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-center flex flex-col items-center max-h-[92vh] overflow-y-auto">
        {/* Emblem */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            isVictory
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
          }`}
        >
          {isVictory ? <Trophy className="w-8 h-8" /> : <RotateCcw className="w-8 h-8" />}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-serif font-black tracking-widest text-stone-100">
          {isVictory ? '大捷 · 诗成破阵' : endlessWave !== undefined ? '长夜未尽 · 万墨潮退' : '折戟 · 墨涸气竭'}
        </h2>
        <p className="text-xs text-stone-400 font-serif mt-1">{levelTitle}</p>

        {/* Stars (victory) / Wave reached (endless defeat) */}
        {isVictory && (
          <div className="flex items-center gap-1.5 mt-4">
            {[1, 2, 3].map((s) => (
              <Star
                key={s}
                className={`w-7 h-7 transition-all ${
                  s <= stars
                    ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                    : 'text-stone-700'
                }`}
              />
            ))}
          </div>
        )}
        {!isVictory && endlessWave !== undefined && (
          <div className="mt-4 px-4 py-2 bg-purple-950/30 border border-purple-800/40 rounded-xl">
            <p className="text-xs text-purple-200 font-serif">
              坚守至第 <span className="font-mono font-bold text-purple-100">{endlessWave}</span> 波
              {endlessBest !== undefined && (
                <span className="text-purple-400/80">
                  {' '}· 历史最佳 {endlessBest} 波
                </span>
              )}
            </p>
          </div>
        )}

        {/* Battle Stats */}
        <div className="flex gap-2 w-full mt-5">
          <StatChip
            icon={<Swords className="w-3 h-3" />}
            label="击破"
            value={`${kills}`}
            accent="text-rose-300"
          />
          <StatChip
            icon={<Flame className="w-3 h-3" />}
            label="最高连墨"
            value={`${maxCombo}`}
            accent="text-amber-300"
          />
          <StatChip
            icon={<Timer className="w-3 h-3" />}
            label="用时"
            value={timeText}
            accent="text-cyan-300"
          />
          {isVictory && (
            <StatChip
              icon={<ShieldCheck className="w-3 h-3" />}
              label="墨阁留存"
              value={`${Math.round(baseHpPct * 100)}%`}
              accent="text-emerald-300"
            />
          )}
        </div>

        {/* Poetic verse */}
        <div className="my-5 p-4 bg-stone-950/70 border border-stone-800 rounded-2xl w-full">
          <p className="text-sm font-serif italic text-amber-200/90 leading-relaxed">
            "{poeticVerse}"
          </p>
        </div>

        {/* New achievements */}
        {newAchievements.length > 0 && (
          <div className="w-full mb-4 p-3 bg-amber-950/20 border border-amber-800/40 rounded-2xl text-left">
            <p className="text-[11px] font-serif font-bold text-amber-200 flex items-center gap-1.5 mb-2">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              参悟新成就
            </p>
            <div className="space-y-1">
              {newAchievements.map((a) => (
                <p key={a.id} className="text-xs text-amber-100 font-serif">
                  【{a.name}】<span className="text-stone-400">{a.description}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Reward */}
        {isVictory && jadeEarned > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/30 border border-amber-800/40 rounded-xl mb-6 text-amber-300">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-serif">获赠文心灵玉：</span>
            <span className="font-mono font-bold">+{jadeEarned}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 w-full mt-auto">
          <button
            onClick={onBackToMap}
            className="flex-1 py-3 px-4 text-xs font-serif font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            返回卷轴
          </button>

          <button
            onClick={onRetry}
            className="flex-1 py-3 px-4 text-xs font-serif font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {endlessWave !== undefined && !isVictory ? '再入长夜' : '再试一局'}
          </button>

          {isVictory && onNextLevel && (
            <button
              onClick={onNextLevel}
              className="flex-1 py-3 px-4 text-xs font-serif font-bold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
            >
              下一折
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
