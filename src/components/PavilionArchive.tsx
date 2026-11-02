import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PlayerProgress } from '../types/game';
import { STORY_CHAPTERS, CN_NUMS } from '../data/story';
import { weekKey } from '../data/weeklyTrial';
import bgInkMountains from '../assets/images/bg_ink_mountains_1791652099827.jpg';
import {
  ChevronLeft,
  ScrollText,
  Feather,
  Scroll,
  Lock,
  ChevronDown,
  Crown,
  CalendarHeart,
  Infinity as InfinityIcon,
  Trophy,
  Star,
  Skull,
  Swords,
} from 'lucide-react';

/** 战绩堂单项：图标 + 标签 + 等宽值 */
const StatCell: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="min-w-0">
    <p className="text-[10px] text-ink-light font-serif flex items-center gap-1 mb-0.5">{icon}{label}</p>
    <p className="font-mono text-sm text-ink-strong truncate" title={value}>{value}</p>
  </div>
);

interface PavilionArchiveProps {
  progress: PlayerProgress;
  onBack: () => void;
}

/**
 * 文心殿 · 藏卷 —— 通关心得回顾室
 * 每大章完卷（终折通关）即入藏一卷：章前引子 / 卷首诗 / 通关尾声随时重温。
 * 亦兼藏每日试炼答卷与无尽章境的战绩回顾。
 */
export const PavilionArchive: React.FC<PavilionArchiveProps> = ({ progress, onBack }) => {
  /** 已入藏的大章（终折通关） */
  const archivedIds = useMemo(
    () =>
      STORY_CHAPTERS.filter((c) => c.status === 'RELEASED' && c.levels?.length)
        .filter((c) => progress.completedLevels.includes(c.levels![c.levels!.length - 1].id))
        .map((c) => c.id),
    [progress.completedLevels]
  );

  const [openChapterId, setOpenChapterId] = useState<number | null>(archivedIds[archivedIds.length - 1] ?? null);
  const hasAny = archivedIds.length > 0;
  const allTen = archivedIds.length >= 10;

  /** 已发行且含折的大章（通关率分母只计正式主线） */
  const releasedChapters = useMemo(
    () => STORY_CHAPTERS.filter((c) => c.status === 'RELEASED' && c.levels?.length),
    []
  );
  const totalFolds = useMemo(
    () => releasedChapters.reduce((s, c) => s + c.levels!.length, 0),
    [releasedChapters]
  );
  const doneFolds = useMemo(
    () =>
      releasedChapters.reduce(
        (s, c) => s + c.levels!.filter((l) => progress.completedLevels.includes(l.id)).length,
        0
      ),
    [releasedChapters, progress.completedLevels]
  );
  const storyRate = totalFolds > 0 ? Math.round((doneFolds / totalFolds) * 100) : 0;
  /** 藏卷星数：仅计主线折星级（满分 3 星/折） */
  const maxStars = totalFolds * 3;
  const gotStars = useMemo(
    () =>
      releasedChapters.reduce(
        (s, c) => s + c.levels!.reduce((t, l) => t + (progress.levelStars[l.id] ?? 0), 0),
        0
      ),
    [releasedChapters, progress.levelStars]
  );
  /** 周试炼状态：与本周周键比对（周一零点换卷） */
  const weeklyLabel = useMemo(() => {
    if (progress.weeklyDone === weekKey()) return '本周已捷';
    return progress.weeklyDone ? `首胜 ${progress.weeklyDone}` : '未曾问锋';
  }, [progress.weeklyDone]);

  return (
    <div className="relative min-h-screen paper-grain text-ink flex flex-col font-sans select-none overflow-x-hidden">
      {/* 背景装饰 */}
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

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-8 py-4 border-b rule-ink-strong">
        <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap shrink-0 min-w-0">
          <button onClick={onBack} className="btn-ink flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0">
            <ChevronLeft className="w-4 h-4" />
            返回主卷
          </button>
          <span className="text-lg sm:text-xl font-bold tracking-wider font-serif text-ink-strong truncate">
            文心殿 · 藏卷
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3 text-xs text-ink-mid font-serif">
          <span>
            已藏 <span className="font-mono text-ink-strong">{archivedIds.length}</span> / {STORY_CHAPTERS.length} 卷
          </span>
          {allTen && (
            <span className="seal px-2 py-0.5 text-[10px] tracking-widest animate-seal-stamp flex items-center gap-1">
              <Crown className="w-3 h-3" />
              十卷俱全
            </span>
          )}
        </div>
      </header>

      {/* 殿身 */}
      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-4">
        {!hasAny && (
          <div className="panel-paper p-10 text-center">
            <span className="seal w-12 h-12 mx-auto flex items-center justify-center mb-4 opacity-80" aria-hidden="true">
              <span className="text-xl font-bold font-serif">藏</span>
            </span>
            <h3 className="text-xl font-serif font-bold tracking-widest text-ink-strong">藏卷尚空</h3>
            <p className="mt-4 text-sm text-ink-mid font-serif leading-loose">
              每完卷一大章，其章前引子、卷首诗与通关尾声便入藏文心殿，随时可归殿重温。
              <br />
              先去破眼前之折吧，剑仙。
            </p>
          </div>
        )}
        {hasAny && (
          <p className="text-center text-xs text-ink-light font-serif tracking-widest">
            完卷之章皆入此殿 · 引子尾声卷首诗随时重温
          </p>
        )}

        {/* 战绩堂 · 文心殿通关率与本地统计 */}
        <div className="panel-paper p-5" data-testid="stats-hall">
          <p className="text-[10px] font-serif tracking-widest text-ink-light mb-3 flex items-center gap-1">
            <Trophy className="w-3 h-3 text-tenghuang" />
            战绩堂 · 文心殿通关率
          </p>

          {/* 通关率主行 */}
          <div className="flex items-end justify-between gap-4 mb-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-3xl font-bold text-ink-strong leading-none" data-testid="story-rate">
                {storyRate}%
              </span>
              <span className="text-xs text-ink-mid font-serif whitespace-nowrap">
                主线 <span className="font-mono text-ink-strong">{doneFolds}</span> / {totalFolds} 折
              </span>
            </div>
            <span className="text-[10px] text-ink-light font-serif whitespace-nowrap">
              已藏 {archivedIds.length} 卷
            </span>
          </div>
          <div
            className="h-2 bg-ink-strong/10 rounded-full overflow-hidden mb-4"
            aria-label="主线通关率进度条"
            data-testid="story-rate-bar"
          >
            <div
              className="h-full bg-gradient-to-r from-daiqing via-cinnabar/80 to-cinnabar rounded-full transition-all duration-700"
              style={{ width: `${storyRate}%` }}
            />
          </div>

          {/* 本地统计格 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <StatCell
              label="藏卷星数"
              value={`${gotStars} / ${maxStars}`}
              icon={<Star className="w-3 h-3 text-tenghuang" />}
            />
            <StatCell
              label="累计击破"
              value={progress.totalKills.toLocaleString('zh-Hans-CN')}
              icon={<Skull className="w-3 h-3 text-ink-mid" />}
            />
            <StatCell
              label="无尽最佳"
              value={`${progress.endlessBest} 波`}
              icon={<InfinityIcon className="w-3 h-3 text-daiqing" />}
            />
            <StatCell
              label="问战连捷"
              value={`${progress.dailyStreak ?? 0} 天`}
              icon={<CalendarHeart className="w-3 h-3 text-cinnabar" />}
            />
            <StatCell
              label="周试炼"
              value={weeklyLabel}
              icon={<Swords className="w-3 h-3 text-ink-mid" />}
            />
            <StatCell
              label="每日问战"
              value={progress.dailyDone ?? '未曾应战'}
              icon={<ScrollText className="w-3 h-3 text-ink-mid" />}
            />
          </div>
        </div>

        {STORY_CHAPTERS.map((c) => {
              const archived = archivedIds.includes(c.id);
              const open = openChapterId === c.id;
              const foldTotal = c.levels?.length ?? 0;
              const foldDone = (c.levels ?? []).filter((l) => progress.completedLevels.includes(l.id)).length;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className={`border transition-colors duration-200 ${
                    archived ? 'panel-paper' : 'panel-paper opacity-55'
                  }`}
                >
                  {/* 卷签行 */}
                  <button
                    onClick={() => archived && setOpenChapterId(open ? null : c.id)}
                    className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-left ${
                      archived ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 flex items-center justify-center border font-serif font-bold text-base shrink-0 ${
                          archived
                            ? 'border-cinnabar/60 text-cinnabar bg-paper-deep/60'
                            : 'border-ink-strong/30 text-ink-light bg-paper-deep/40'
                        }`}
                      >
                        {CN_NUMS[c.id] ?? c.id}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-serif font-bold tracking-wider text-ink-strong truncate">
                          《{c.anthology}·{c.name}》
                        </h3>
                        <p className="text-[11px] text-ink-light font-serif truncate">
                          {archived
                            ? `已入藏 · ${foldDone}/${foldTotal} 折 · 可重温`
                            : c.status === 'RELEASED'
                              ? `${foldDone > 0 ? `已破 ${foldDone}/${foldTotal} 折` : '未破一折'} · 完卷后入藏`
                              : '未启之卷 · 完卷后入藏'}
                        </p>
                      </div>
                    </div>
                    {archived ? (
                      <ChevronDown
                        className={`w-4 h-4 text-ink-mid shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                      />
                    ) : (
                      <Lock className="w-4 h-4 text-ink-light shrink-0" />
                    )}
                  </button>

                  {/* 折数进度细条（已发行章皆显，未完卷亦见进度） */}
                  {c.status === 'RELEASED' && foldTotal > 0 && (
                    <div className="px-5 pb-3" data-testid={`fold-bar-ch${c.id}`}>
                      <div className="h-[3px] bg-ink-strong/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cinnabar/70 rounded-full transition-all duration-500"
                          style={{ width: `${(foldDone / foldTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 卷宗展开 */}
                  {archived && open && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-4">
                        {/* 章前引子 */}
                        <div className="pl-3 border-l-2 border-daiqing/50">
                          <p className="text-[10px] font-serif tracking-widest text-daiqing mb-1.5 flex items-center gap-1">
                            <ScrollText className="w-3 h-3" />
                            章前引子
                          </p>
                          <p className="text-xs text-ink-mid font-serif leading-loose">{c.intro}</p>
                        </div>

                        {/* 卷首诗 */}
                        <div className="pl-3 border-l-2 border-cinnabar/50">
                          <p className="text-[10px] font-serif tracking-widest text-cinnabar mb-1.5 flex items-center gap-1">
                            <Feather className="w-3 h-3" />
                            卷首诗
                          </p>
                          <p className="text-sm font-brush-xing text-ink-strong leading-loose">{c.verse}</p>
                          <p className="text-[10px] text-ink-light font-serif mt-1">{c.verseAuthor}</p>
                        </div>

                        {/* 通关尾声 */}
                        <div className="pl-3 border-l-2 border-tenghuang/60">
                          <p className="text-[10px] font-serif tracking-widest text-tenghuang mb-1.5 flex items-center gap-1">
                            <Scroll className="w-3 h-3" />
                            通关尾声
                          </p>
                          <p className="text-xs text-ink-mid font-serif leading-loose">{c.epilogue}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
      </main>

      {/* 页脚 */}
      <footer className="relative z-10 px-8 py-4 border-t rule-ink text-center text-xs text-ink-light">
        <span className="font-serif tracking-widest">文心殿 · 藏卷十部 · 温故知新</span>
      </footer>
    </div>
  );
};
