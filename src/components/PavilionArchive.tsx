import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PlayerProgress } from '../types/game';
import { STORY_CHAPTERS, CN_NUMS } from '../data/story';
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
} from 'lucide-react';

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
        {!hasAny ? (
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
        ) : (
          <>
            {/* 殿训 */}
            <p className="text-center text-xs text-ink-light font-serif tracking-widest">
              完卷之章皆入此殿 · 引子尾声卷首诗随时重温
            </p>

            {STORY_CHAPTERS.map((c) => {
              const archived = archivedIds.includes(c.id);
              const open = openChapterId === c.id;
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
                          {archived ? '已入藏 · 可重温' : `${c.status === 'RELEASED' ? '未完卷' : '未启之卷'} · 完卷后入藏`}
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

            {/* 殿外附藏：日常战绩摘要 */}
            {(progress.dailyDone || progress.endlessBest > 0) && (
              <div className="panel-paper p-5 mt-2">
                <p className="text-[10px] font-serif tracking-widest text-ink-light mb-2 flex items-center gap-1">
                  <CalendarHeart className="w-3 h-3" />
                  殿外附藏 · 日常战绩
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-mid font-serif">
                  {progress.dailyDone && (
                    <span>
                      每日问战最后完卷：
                      <span className="font-mono text-ink-strong">{progress.dailyDone}</span>
                      {`（连捷 ${progress.dailyStreak ?? 0} 天）`}
                    </span>
                  )}
                  {progress.endlessBest > 0 && (
                    <span className="flex items-center gap-1">
                      <InfinityIcon className="w-3 h-3 text-daiqing" />
                      无尽最佳：
                      <span className="font-mono text-ink-strong">{progress.endlessBest}</span> 波
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 页脚 */}
      <footer className="relative z-10 px-8 py-4 border-t rule-ink text-center text-xs text-ink-light">
        <span className="font-serif tracking-widest">文心殿 · 藏卷十部 · 温故知新</span>
      </footer>
    </div>
  );
};
