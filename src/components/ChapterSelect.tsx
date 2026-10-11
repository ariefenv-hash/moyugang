import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { LevelConfig, PlayerProgress } from '../types/game';
import { ENDLESS_LEVEL } from '../data/gameData';
import {
  STORY_CHAPTERS,
  CN_NUMS,
  MAX_STORY_LEVEL_ID,
  getChapterByLevelId,
} from '../data/story';
import { StoryIntroModal } from './StoryIntroModal';
import bgInkMountains from '../assets/images/bg_ink_mountains_1791652099827.jpg';
import {
  ChevronLeft,
  Sparkles,
  Lock,
  Star,
  Swords,
  BookOpen,
  Infinity as InfinityIcon,
  ScrollText,
  Hourglass,
} from 'lucide-react';

interface ChapterSelectProps {
  progress: PlayerProgress;
  onSelectLevel: (level: LevelConfig) => void;
  onOpenUpgrades: () => void;
  onBackToMenu: () => void;
  /** 标记某大章的章前引子已读（持久化） */
  onMarkStorySeen: (chapterId: number) => void;
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
  onMarkStorySeen,
}) => {
  const endlessUnlocked = progress.completedLevels.includes(5);

  // 默认落在「当前进度」所在的大章
  const defaultChapterId = useMemo(() => {
    const cur = Math.min(progress.unlockedLevel, MAX_STORY_LEVEL_ID);
    return getChapterByLevelId(cur)?.id ?? 1;
  }, [progress.unlockedLevel]);

  const [activeChapterId, setActiveChapterId] = useState(defaultChapterId);
  const [showIntro, setShowIntro] = useState(false);
  const activeChapter = STORY_CHAPTERS.find((c) => c.id === activeChapterId) ?? STORY_CHAPTERS[0];
  const isReleased = activeChapter.status === 'RELEASED';
  const activeLevels = activeChapter.levels ?? [];

  // 首次切入「已启且已解锁」的大章：自动展开章前引子（每章一次，持久化）
  useEffect(() => {
    setShowIntro(false);
    const ch = STORY_CHAPTERS.find((c) => c.id === activeChapterId);
    if (!ch || ch.status !== 'RELEASED') return;
    const firstLevel = ch.levels?.[0];
    if (!firstLevel) return;
    if (firstLevel.id <= progress.unlockedLevel && !progress.storySeen.includes(ch.id)) {
      setShowIntro(true);
      onMarkStorySeen(ch.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterId]);

  return (
    <div className="relative min-h-screen paper-grain text-ink flex flex-col font-sans select-none overflow-x-hidden">
      {/* Background Decorative Layer */}
      <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-multiply">
        <img
          src={bgInkMountains}
          alt="远山淡墨"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          className="w-full h-full object-cover object-center grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-paper/30 via-transparent to-paper" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-8 py-4 border-b rule-ink-strong">
        <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap shrink-0 min-w-0">
          <button
            onClick={onBackToMenu}
            className="btn-ink flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            返回主卷
          </button>
          <span className="text-lg sm:text-xl font-bold tracking-wider font-serif text-ink-strong truncate">
            诗卷征程 · 十章总纲
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-mid">
          <span className="text-ink-strong font-serif">册页章签</span>
          <span className="text-cinnabar/50">·</span>
          <span>折页启程</span>
          <span className="text-cinnabar/50">·</span>
          <span>墨道通幽</span>
        </nav>

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

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col">
        {/* ===== 十章册页章签（主线总纲导航） ===== */}
        <div className="flex gap-2 overflow-x-auto pb-2.5 mb-8 -mx-1 px-1 [scrollbar-width:thin]">
          {STORY_CHAPTERS.map((c) => {
            const isActive = c.id === activeChapterId;
            const released = c.status === 'RELEASED';
            const unlocked = c.levels?.[0] ? c.levels[0].id <= progress.unlockedLevel : false;
            return (
              <button
                key={c.id}
                onClick={() => setActiveChapterId(c.id)}
                className={`shrink-0 flex flex-col items-start gap-0.5 px-3.5 py-2 border text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'border-cinnabar/80 bg-paper-deep/80 shadow-[0_6px_18px_-8px_rgba(150,40,30,0.45)]'
                    : 'rule-ink bg-paper-deep/40 hover:border-daiqing/60'
                } ${released ? '' : 'opacity-62'}`}
                title={released ? undefined : `${c.anthology}·${c.name} —— 敬请期待`}
              >
                <span className={`text-[10px] font-serif tracking-widest ${released && unlocked ? 'text-cinnabar' : 'text-ink-light'}`}>
                  {released ? `第${CN_NUMS[c.id] ?? c.id}章` : '未启之卷'}
                </span>
                <span className={`font-serif font-bold text-sm tracking-wider whitespace-nowrap ${isActive ? 'text-ink-strong' : 'text-ink-mid'}`}>
                  {c.anthology}
                </span>
              </button>
            );
          })}
        </div>

        {/* ===== 章头 ===== */}
        <div className="text-center mb-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2.5 text-xs text-ink-light mb-3">
            <span className="inline-block w-8 h-px bg-cinnabar/60" aria-hidden="true" />
            <span>
              第{CN_NUMS[activeChapter.id] ?? activeChapter.id}大章
            </span>
            <span aria-hidden="true" className="text-cinnabar/60">·</span>
            <span>{isReleased ? '已启诗卷' : '未启之卷'}</span>
            {isReleased && (
              <>
                <span aria-hidden="true" className="text-cinnabar/60">·</span>
                <span>{activeLevels.length} 折连战</span>
              </>
            )}
            <span className="inline-block w-8 h-px bg-cinnabar/60" aria-hidden="true" />
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-black tracking-widest text-ink-strong">
            《{activeChapter.anthology}·{activeChapter.name}》
          </h2>
          <p className="mt-3 text-base font-brush-xing text-ink-mid leading-loose">
            {activeChapter.verse}
          </p>
          <p className="text-[11px] text-ink-light font-serif">{activeChapter.verseAuthor}</p>

          {isReleased ? (
            <button
              onClick={() => setShowIntro(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-mid hover:text-cinnabar transition-colors font-serif cursor-pointer"
            >
              <ScrollText className="w-3.5 h-3.5" />
              卷首 · 重温章前引子
            </button>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-light font-serif">
              <Hourglass className="w-3.5 h-3.5" />
              此卷尚在挥毫之中 · 敬请期待
            </p>
          )}
        </div>

        {/* ===== 章身 ===== */}
        {isReleased ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {activeLevels.map((level, idx) => {
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
                            {idx + 1}
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

              {/* ===== 无尽试炼卡片：仅第一大章卷内展示，五折皆纸，长夜为墨 ===== */}
              {activeChapter.id === 1 && (
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
              )}
            </div>

            {/* 章引子摘要（折页下方点睛） */}
            <p className="mt-6 text-xs text-ink-light font-serif leading-relaxed text-center max-w-3xl mx-auto line-clamp-2">
              {activeChapter.intro}
            </p>
          </>
        ) : (
          /* ===== 未启之卷：预告卷宗 ===== */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-xl w-full mx-auto panel-paper p-8 text-center"
          >
            <span className="seal w-12 h-12 mx-auto flex items-center justify-center mb-4 opacity-80" aria-hidden="true">
              <span className="text-xl font-bold font-serif">候</span>
            </span>
            <h3 className="text-xl font-serif font-bold tracking-widest text-ink-strong">
              {activeChapter.anthology} · {activeChapter.name}
            </h3>
            <p className="mt-4 text-sm text-ink-mid font-serif leading-loose">
              {activeChapter.teaser}
            </p>
            <div className="mt-6 pt-4 border-t rule-ink">
              <p className="text-xs text-ink-light font-serif tracking-widest">
                主线十章 · 徐徐展开 —— 先破眼前之卷，方启未启之章
              </p>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-4 border-t rule-ink text-center text-xs text-ink-light">
        <span className="font-serif tracking-widest">墨韵战纪 · 十章总纲 · 以文载道 · 剑笔同心</span>
      </footer>

      {/* 章前引子卷轴 */}
      {showIntro && isReleased && (
        <StoryIntroModal chapter={activeChapter} onClose={() => setShowIntro(false)} />
      )}
    </div>
  );
};
