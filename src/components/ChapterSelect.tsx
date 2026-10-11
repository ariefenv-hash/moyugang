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
            s <= count ? 'fill-tenghuang text-tenghuang' : 'text-paper-edge'
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
    <div className="relative min-h-screen paper-grain text-ink flex flex-col font-sans select-none overflow-x-hidden">
      {/* Background Decorative Layer */}
      <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply">
        <img
          src={bgInkMountains}
          alt="Ink background"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-paper/30 via-transparent to-paper" />
      </div>

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="relative z-10 flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-8 py-4 border-b rule-ink-strong">
        {/* Zone 1: Brand title */}
        <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap shrink-0 min-w-0">
          <button
            onClick={onBackToMenu}
            className="btn-ink flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            返回主卷
          </button>
          <span className="text-lg sm:text-xl font-bold tracking-wider font-serif text-ink-strong truncate">
            风雅集 · 第一卷
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-mid">
          <span className="text-ink-strong font-serif">诗卷征程</span>
          <span className="text-cinnabar/50">·</span>
          <span>五折雅章</span>
          <span className="text-cinnabar/50">·</span>
          <span>墨道通幽</span>
        </nav>

        {/* Zone 3: Primary Action / Resources */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 panel-paper-deep">
            <Sparkles className="w-3.5 h-3.5 text-tenghuang" />
            <span className="text-xs text-ink-mid">灵玉</span>
            <span className="text-sm font-bold text-ink-strong font-mono tabular-nums">
              {progress.jadeSparks}
            </span>
          </div>

          <button
            onClick={onOpenUpgrades}
            className="btn-ink flex items-center gap-2 px-4 py-2 text-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-daiqing" />
            翰墨赋诗阁
          </button>
        </div>
      </header>

      {/* Main Chapter Content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col justify-center">
        {/* Chapter Header */}
        <div className="text-center mb-10 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2.5 text-xs text-ink-light mb-3">
            <span className="inline-block w-8 h-px bg-cinnabar/60" aria-hidden="true" />
            <span>第一大章</span>
            <span aria-hidden="true" className="text-cinnabar/60">·</span>
            <span>风雅诗律</span>
            <span aria-hidden="true" className="text-cinnabar/60">·</span>
            <span>剑仙起阵</span>
            <span className="inline-block w-8 h-px bg-cinnabar/60" aria-hidden="true" />
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-black tracking-widest text-ink-strong">
            《风雅集·翰墨千秋》
          </h2>
          <p className="mt-3 text-sm text-ink-mid font-serif leading-loose">
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
                className={`relative flex flex-col justify-between p-5 border transition-colors duration-200 ${
                  isUnlocked
                    ? 'panel-paper hover:border-daiqing/70'
                    : 'panel-paper opacity-55'
                }`}
              >
                <div>
                  {/* 折序大字与星印 */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="w-9 h-9 flex items-center justify-center border border-ink-strong/60 font-serif font-bold text-lg text-ink-strong bg-paper-deep/60">
                        {level.id}
                      </span>
                      <span className="text-xs text-ink-light">折</span>
                    </div>
                    {isCompleted ? (
                      <Stars count={stars} />
                    ) : isUnlocked ? (
                      <span className="text-[10px] text-daiqing border-b border-daiqing/50 pb-px">待通关</span>
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-ink-light" />
                    )}
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-lg font-serif font-bold text-ink-strong tracking-wide">
                    {level.title}
                  </h3>
                  <p className="text-xs text-ink-mid font-serif mt-1">
                    {level.subtitle}
                  </p>

                  {/* 题跋式引文：朱丝左界 */}
                  <div className="my-4 pl-3 border-l-2 border-cinnabar/60">
                    <p className="text-sm font-brush-xing text-ink-mid leading-relaxed">
                      {level.poeticVerse}
                    </p>
                  </div>

                  {/* Stage Details */}
                  <p className="text-xs text-ink-mid line-clamp-3 leading-relaxed mb-4">
                    {level.description}
                  </p>
                </div>

                <div>
                  {/* Rewards & Unlock Tags */}
                  <div className="flex items-center justify-between text-xs text-ink-mid pt-3 border-t rule-ink mb-4">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-tenghuang" />
                      +<span className="font-mono">{level.rewardJade}</span> 灵玉
                    </span>
                    {level.boss && (
                      <span className="seal px-1.5 py-0.5 text-[10px] tracking-widest animate-seal-stamp">首领战</span>
                    )}
                  </div>

                  {/* Action Launch Button */}
                  {isUnlocked ? (
                    <button
                      onClick={() => onSelectLevel(level)}
                      className="btn-ink w-full py-2.5 px-3 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      启程试炼
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-3 text-xs text-center text-ink-light panel-paper-deep font-serif tracking-widest">
                      尚未感悟
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* ===== 无尽试炼卡片：五折皆纸，长夜为墨 ===== */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.36 }}
            className={`relative flex flex-col justify-between p-5 transition-colors duration-200 ${
              endlessUnlocked
                ? 'panel-night text-paper shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]'
                : 'panel-paper opacity-55'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-serif text-paper-dim">
                  <InfinityIcon className="w-3.5 h-3.5" />
                  无尽卷
                </span>
                {endlessUnlocked ? (
                  progress.endlessBest > 0 ? (
                    <span className="text-[10px] text-paper-dim">
                      最佳 <span className="font-mono">{progress.endlessBest}</span> 波
                    </span>
                  ) : (
                    <span className="text-[10px] text-paper-dim border-b border-paper-dim/50 pb-px">待挑战</span>
                  )
                ) : (
                  <Lock className="w-3.5 h-3.5 text-ink-light" />
                )}
              </div>

              <h3 className={`text-lg font-serif font-bold tracking-wide ${endlessUnlocked ? 'text-paper' : 'text-ink-strong'}`}>
                {ENDLESS_LEVEL.title.split('·')[1]}
              </h3>
              <p className={`text-xs font-serif mt-1 ${endlessUnlocked ? 'text-paper-dim' : 'text-ink-mid'}`}>
                {ENDLESS_LEVEL.subtitle}
              </p>

              <div className={`my-4 pl-3 border-l-2 ${endlessUnlocked ? 'border-paper-dim/60' : 'border-cinnabar/60'}`}>
                <p className={`text-sm font-brush-xing leading-relaxed ${endlessUnlocked ? 'text-paper-dim' : 'text-ink-mid'}`}>
                  {ENDLESS_LEVEL.poeticVerse}
                </p>
              </div>

              <p className={`text-xs line-clamp-3 leading-relaxed mb-4 ${endlessUnlocked ? 'text-paper-dim' : 'text-ink-mid'}`}>
                {endlessUnlocked
                  ? ENDLESS_LEVEL.description
                  : '通关第五折后，无尽长夜将为你敞开。墨潮永无止境，坚守到底！'}
              </p>
            </div>

            <div>
              <div className={`flex items-center justify-between text-xs pt-3 border-t mb-4 whitespace-nowrap ${endlessUnlocked ? 'border-paper-dim/25 text-paper-dim' : 'rule-ink text-ink-mid'}`}>
                <span className="flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3 text-tenghuang shrink-0" />
                  每波+<span className="font-mono">18</span>灵玉
                </span>
                <span className="text-[10px] shrink-0 ml-2">波次无限</span>
              </div>

              {endlessUnlocked ? (
                <button
                  onClick={() => onSelectLevel(ENDLESS_LEVEL)}
                  className="w-full py-2.5 px-3 text-xs font-medium bg-paper text-ink-strong hover:bg-paper-soft font-serif tracking-widest flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
                >
                  <InfinityIcon className="w-3.5 h-3.5" />
                  入夜坚守
                </button>
              ) : (
                <div className="w-full py-2.5 px-3 text-xs text-center text-ink-light panel-paper-deep font-serif tracking-widest">
                  破第五折解锁
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-4 border-t rule-ink text-center text-xs text-ink-light">
        <span className="font-serif tracking-widest">墨韵战纪 · 以文载道 · 剑笔同心</span>
      </footer>
    </div>
  );
};
