import React from 'react';
import { motion } from 'motion/react';
import { LevelConfig, PlayerProgress } from '../types/game';
import { CHAPTER_LEVELS, ENDLESS_LEVEL } from '../data/gameData';
import bgInkMountains from '../assets/images/bg_ink_mountains_1791652099827.jpg';
import {
  ChevronLeft,
  Sparkles,
  Lock,
  Star,
  Swords,
  BookOpen,
  Infinity as InfinityIcon,
} from 'lucide-react';

interface ChapterSelectProps {
  progress: PlayerProgress;
  onSelectLevel: (level: LevelConfig) => void;
  onOpenUpgrades: () => void;
  onBackToMenu: () => void;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((s) => (
        <Star
          key={s}
          className={`w-3 h-3 ${
            s <= count ? 'fill-amber-400 text-amber-400' : 'text-stone-600'
          }`}
        />
      ))}
    </div>
  );
}

export const ChapterSelect: React.FC<ChapterSelectProps> = ({
  progress,
  onSelectLevel,
  onOpenUpgrades,
  onBackToMenu,
}) => {
  const endlessUnlocked = progress.completedLevels.includes(5);

  return (
    <div className="relative min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Background Decorative Layer */}
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <img
          src={bgInkMountains}
          alt="Ink background"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center grayscale"
        />
      </div>

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="relative z-10 flex items-center justify-between gap-8 px-8 py-5 border-b border-stone-800/80 bg-stone-950/70 backdrop-blur-md">
        {/* Zone 1: Brand title */}
        <div className="flex items-center gap-4 whitespace-nowrap shrink-0">
          <button
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-400 hover:text-stone-200 bg-stone-900 border border-stone-800 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            返回主卷
          </button>
          <span className="text-xl font-bold tracking-wider font-serif text-stone-100">
            风雅集 · 第一卷
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-400">
          <span className="text-stone-200 font-serif">诗卷征程</span>
          <span className="text-stone-600">·</span>
          <span>五折雅章</span>
          <span className="text-stone-600">·</span>
          <span>墨道通幽</span>
        </nav>

        {/* Zone 3: Primary Action / Resources */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-stone-400">灵玉</span>
            <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">
              {progress.jadeSparks}
            </span>
          </div>

          <button
            onClick={onOpenUpgrades}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-amber-100 bg-stone-900 hover:bg-stone-800 border border-amber-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            翰墨赋诗阁
          </button>
        </div>
      </header>

      {/* Main Chapter Content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col justify-center">
        {/* Chapter Header */}
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2 text-xs text-stone-500 mb-2">
            <span>第一大章</span>
            <span aria-hidden="true">·</span>
            <span>风雅诗律</span>
            <span aria-hidden="true">·</span>
            <span>剑仙起阵</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-black tracking-widest text-stone-100">
            《风雅集·翰墨千秋》
          </h2>
          <p className="mt-3 text-sm text-stone-400 font-serif leading-relaxed">
            以云砚剑仙为阵眼，携墨童与诗剑弟子漫步山河。破五重幻境，悟墨韵真谛。守护墨阁越完好，星级评价越高。
          </p>
        </div>

        {/* 5 Levels Grid + Endless Card */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {CHAPTER_LEVELS.map((level, idx) => {
            const isUnlocked = level.id <= progress.unlockedLevel;
            const isCompleted = progress.completedLevels.includes(level.id);
            const stars = progress.levelStars[level.id] || 0;

            return (
              <motion.div
                key={level.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.06 }}
                className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 ${
                  isUnlocked
                    ? 'bg-stone-900/80 hover:bg-stone-900 border-stone-800 hover:border-cyan-800/60 shadow-xl'
                    : 'bg-stone-950/40 border-stone-900/50 opacity-60'
                }`}
              >
                <div>
                  {/* Stage Order & Star status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-serif font-medium text-stone-400">
                      折 {level.id}
                    </span>
                    {isCompleted ? (
                      <Stars count={stars} />
                    ) : isUnlocked ? (
                      <span className="text-[10px] text-cyan-400 font-mono">待通关</span>
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-stone-600" />
                    )}
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-lg font-serif font-bold text-stone-100 tracking-wide">
                    {level.title}
                  </h3>
                  <p className="text-xs text-stone-400 font-serif mt-1">
                    {level.subtitle}
                  </p>

                  {/* Poetic Verse Quote */}
                  <div className="my-4 py-2 px-3 bg-stone-950/60 border border-stone-800/80 rounded-xl">
                    <p className="text-xs font-serif italic text-amber-200/90 leading-relaxed">
                      "{level.poeticVerse}"
                    </p>
                  </div>

                  {/* Stage Details */}
                  <p className="text-xs text-stone-400 line-clamp-3 leading-relaxed mb-4">
                    {level.description}
                  </p>
                </div>

                <div>
                  {/* Rewards & Unlock Tags */}
                  <div className="flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/60 mb-4">
                    <span className="flex items-center gap-1 font-mono">
                      <Sparkles className="w-3 h-3 text-amber-400" />+{level.rewardJade} 灵玉
                    </span>
                    {level.boss && (
                      <span className="text-[10px] text-rose-400 font-medium">首领战</span>
                    )}
                  </div>

                  {/* Action Launch Button */}
                  {isUnlocked ? (
                    <button
                      onClick={() => onSelectLevel(level)}
                      className="w-full py-2.5 px-3 text-xs font-medium text-stone-950 bg-stone-100 hover:bg-amber-100 rounded-xl font-serif tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-98"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      启程试炼
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-3 text-xs text-center text-stone-600 bg-stone-900/40 rounded-xl font-serif">
                      尚未感悟
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* ===== 无尽试炼卡片 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.36 }}
            className={`relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 ${
              endlessUnlocked
                ? 'bg-gradient-to-b from-purple-950/50 to-stone-900/80 border-purple-800/50 hover:border-purple-500/60 shadow-xl'
                : 'bg-stone-950/40 border-stone-900/50 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-1 text-xs font-serif font-medium text-purple-300">
                  <InfinityIcon className="w-3.5 h-3.5" />
                  无尽卷
                </span>
                {endlessUnlocked ? (
                  progress.endlessBest > 0 ? (
                    <span className="text-[10px] text-purple-300 font-mono">
                      最佳 {progress.endlessBest} 波
                    </span>
                  ) : (
                    <span className="text-[10px] text-purple-400 font-mono">待挑战</span>
                  )
                ) : (
                  <Lock className="w-3.5 h-3.5 text-stone-600" />
                )}
              </div>

              <h3 className="text-lg font-serif font-bold text-purple-100 tracking-wide">
                {ENDLESS_LEVEL.title.split('·')[1]}
              </h3>
              <p className="text-xs text-stone-400 font-serif mt-1">{ENDLESS_LEVEL.subtitle}</p>

              <div className="my-4 py-2 px-3 bg-stone-950/60 border border-purple-900/40 rounded-xl">
                <p className="text-xs font-serif italic text-purple-200/90 leading-relaxed">
                  "{ENDLESS_LEVEL.poeticVerse}"
                </p>
              </div>

              <p className="text-xs text-stone-400 line-clamp-3 leading-relaxed mb-4">
                {endlessUnlocked
                  ? ENDLESS_LEVEL.description
                  : '通关第五折后，无尽长夜将为你敞开。墨潮永无止境，坚守到底！'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-purple-900/30 mb-4">
                <span className="flex items-center gap-1 font-mono">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  每波 +18 灵玉
                </span>
                <span className="text-[10px] text-purple-300 font-medium">波次无限</span>
              </div>

              {endlessUnlocked ? (
                <button
                  onClick={() => onSelectLevel(ENDLESS_LEVEL)}
                  className="w-full py-2.5 px-3 text-xs font-medium text-purple-50 bg-purple-800 hover:bg-purple-700 rounded-xl font-serif tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-98"
                >
                  <InfinityIcon className="w-3.5 h-3.5" />
                  入夜坚守
                </button>
              ) : (
                <div className="w-full py-2.5 px-3 text-xs text-center text-stone-600 bg-stone-900/40 rounded-xl font-serif">
                  破第五折解锁
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-4 border-t border-stone-900 bg-stone-950 text-center text-xs text-stone-500">
        墨韵战纪 · 以文载道 · 剑笔同心
      </footer>
    </div>
  );
};
