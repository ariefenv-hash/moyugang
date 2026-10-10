import React from 'react';
import { Sparkles, Trophy, RotateCcw, ArrowRight, Home } from 'lucide-react';

interface VictoryDefeatModalProps {
  isVictory: boolean;
  levelTitle: string;
  poeticVerse: string;
  jadeEarned: number;
  onNextLevel?: () => void;
  onRetry: () => void;
  onBackToMap: () => void;
}

export const VictoryDefeatModal: React.FC<VictoryDefeatModalProps> = ({
  isVictory,
  levelTitle,
  poeticVerse,
  jadeEarned,
  onNextLevel,
  onRetry,
  onBackToMap,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="max-w-md w-full p-8 bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-center flex flex-col items-center">
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
          {isVictory ? '大捷 · 诗成破阵' : '折戟 · 墨涸气竭'}
        </h2>
        <p className="text-xs text-stone-400 font-serif mt-1">{levelTitle}</p>

        {/* Poetic verse */}
        <div className="my-5 p-4 bg-stone-950/70 border border-stone-800 rounded-2xl w-full">
          <p className="text-sm font-serif italic text-amber-200/90 leading-relaxed">
            "{poeticVerse}"
          </p>
        </div>

        {/* Reward */}
        {isVictory && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/30 border border-amber-800/40 rounded-xl mb-6 text-amber-300">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-serif">获赠文心灵玉：</span>
            <span className="font-mono font-bold">+{jadeEarned}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={onBackToMap}
            className="flex-1 py-3 px-4 text-xs font-serif font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            返回卷轴
          </button>

          <button
            onClick={onRetry}
            className="flex-1 py-3 px-4 text-xs font-serif font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            再试一局
          </button>

          {isVictory && onNextLevel && (
            <button
              onClick={onNextLevel}
              className="flex-1 py-3 px-4 text-xs font-serif font-bold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-lg"
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
