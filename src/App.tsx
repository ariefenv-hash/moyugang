import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { GameMode, LevelConfig, PlayerProgress, BattleResultStats, AchievementDef } from './types/game';
import { CHAPTER_LEVELS, ENDLESS_LEVEL, ACHIEVEMENTS } from './data/gameData';
import { BattleView } from './components/BattleView';
import { ChapterSelect } from './components/ChapterSelect';
import { PavilionUpgrades } from './components/PavilionUpgrades';
import { VictoryDefeatModal } from './components/VictoryDefeatModal';
import { LoreModal } from './components/LoreModal';
import { AchievementsModal } from './components/AchievementsModal';
import { sound } from './utils/audio';
import bgInkMountains from './assets/images/bg_ink_mountains_1791652099827.jpg';
import bgHeroAvatar from './assets/images/hero_poet_avatar_1791652089636.jpg';
import {
  BookOpen,
  Scroll,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Award,
} from 'lucide-react';

const STORAGE_KEY = 'ink_and_steel_progress_v1';

const INITIAL_PROGRESS: PlayerProgress = {
  unlockedLevel: 1,
  completedLevels: [],
  jadeSparks: 120, // Starting bonus for exploring
  heroUpgrades: {
    attackLevel: 0,
    hpLevel: 0,
    cooldownLevel: 0,
    resonanceLevel: 0,
  },
  unitUpgrades: {
    SCRIBE: 0,
    SWORD: 0,
    ARCHER: 0,
    GUARDIAN: 0,
    HARPIST: 0,
  },
  citadelUpgrades: {
    baseHpLevel: 0,
    gatherSpeedLevel: 0,
  },
  levelStars: {},
  endlessBest: 0,
  achievements: [],
  tutorialDone: false,
  totalKills: 0,
};

/** 旧存档迁移：合并新增字段，避免升级后读取失败 */
function migrateProgress(raw: any): PlayerProgress {
  return {
    ...INITIAL_PROGRESS,
    ...raw,
    heroUpgrades: { ...INITIAL_PROGRESS.heroUpgrades, ...(raw?.heroUpgrades || {}) },
    unitUpgrades: { ...INITIAL_PROGRESS.unitUpgrades, ...(raw?.unitUpgrades || {}) },
    citadelUpgrades: { ...INITIAL_PROGRESS.citadelUpgrades, ...(raw?.citadelUpgrades || {}) },
    levelStars: raw?.levelStars || {},
    achievements: Array.isArray(raw?.achievements) ? raw.achievements : [],
  };
}

/** 成就检查：返回本次新解锁的成就 */
function checkAchievements(
  progress: PlayerProgress,
  stats: BattleResultStats,
  isVictory: boolean,
  isEndless: boolean
): AchievementDef[] {
  const newly: AchievementDef[] = [];
  const has = (id: string) => progress.achievements.includes(id);
  const add = (id: string) => {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (def && !has(id)) newly.push(def);
  };

  if (isVictory && !isEndless) {
    if (progress.completedLevels.length >= 1 || progress.unlockedLevel >= 2) add('first_clear');
    if (progress.completedLevels.includes(3)) add('chapter_half');
    if (progress.completedLevels.includes(5)) add('chapter_clear');
    if (stats.baseHpPct >= 0.7) add('perfect_defense');
  }
  if (stats.maxCombo >= 20) add('combo_dragon');
  if (stats.maxCombo >= 45) add('combo_transcend');
  if (stats.kills >= 40) add('slayer_40');
  if (isEndless && (stats.endlessWave || 0) >= 10) add('endless_10');
  if (isEndless && (stats.endlessWave || 0) >= 20) add('endless_20');

  return newly;
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('MENU');
  const [currentLevel, setCurrentLevel] = useState<LevelConfig>(CHAPTER_LEVELS[0]);
  const [progress, setProgress] = useState<PlayerProgress>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return migrateProgress(JSON.parse(saved));
    } catch {}
    return INITIAL_PROGRESS;
  });

  const [showLore, setShowLore] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [battleResult, setBattleResult] = useState<{
    status: 'VICTORY' | 'DEFEAT';
    stats: BattleResultStats;
    newAchievements: AchievementDef[];
    isEndless: boolean;
  } | null>(null);

  const [isMuted, setIsMuted] = useState(sound.getMuted());

  // Save progress
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {}
  }, [progress]);

  const handleStartBattle = (level: LevelConfig) => {
    setCurrentLevel(level);
    setBattleResult(null);
    setMode('BATTLE');
    sound.startBGM();
  };

  const handleVictory = (stats: BattleResultStats) => {
    const level = currentLevel;
    const isFirstClear = !progress.completedLevels.includes(level.id);

    setProgress((prev) => {
      const completed = Array.from(new Set([...prev.completedLevels, level.id]));
      const nextUnlocked = Math.max(prev.unlockedLevel, Math.min(5, level.id + 1));
      const prevStars = prev.levelStars[level.id] || 0;
      return {
        ...prev,
        completedLevels: completed,
        unlockedLevel: nextUnlocked,
        jadeSparks: prev.jadeSparks + stats.jadeEarned,
        levelStars: {
          ...prev.levelStars,
          [level.id]: Math.max(prevStars, stats.stars),
        },
        totalKills: prev.totalKills + stats.kills,
        achievements: [...prev.achievements],
      };
    });

    const newAchievements = checkAchievements(progress, stats, true, false);
    if (newAchievements.length > 0) {
      const ids = newAchievements.map((a) => a.id);
      setProgress((prev) => ({
        ...prev,
        achievements: Array.from(new Set([...prev.achievements, ...ids])),
      }));
    }

    setBattleResult({
      status: 'VICTORY',
      stats,
      newAchievements,
      isEndless: false,
    });
  };

  const handleDefeat = (stats: BattleResultStats) => {
    const isEndless = !!currentLevel.endless;

    setProgress((prev) => {
      if (isEndless && stats.endlessWave && stats.endlessWave > prev.endlessBest) {
        return {
          ...prev,
          endlessBest: stats.endlessWave,
          jadeSparks: prev.jadeSparks + stats.endlessWave * 18,
          totalKills: prev.totalKills + stats.kills,
        };
      }
      return { ...prev, totalKills: prev.totalKills + stats.kills };
    });

    const newAchievements = checkAchievements(progress, stats, false, isEndless);
    if (newAchievements.length > 0) {
      const ids = newAchievements.map((a) => a.id);
      setProgress((prev) => ({
        ...prev,
        achievements: Array.from(new Set([...prev.achievements, ...ids])),
      }));
    }

    setBattleResult({
      status: 'DEFEAT',
      stats,
      newAchievements,
      isEndless,
    });
  };

  const handleNextLevel = () => {
    const nextIdx = CHAPTER_LEVELS.findIndex((l) => l.id === currentLevel.id) + 1;
    if (nextIdx < CHAPTER_LEVELS.length) {
      handleStartBattle(CHAPTER_LEVELS[nextIdx]);
    } else {
      setBattleResult(null);
      setMode('LEVEL_SELECT');
    }
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const handleResetProgress = () => {
    if (confirm('确定要重置所有感悟进度与赋诗灵玉吗？')) {
      setProgress(INITIAL_PROGRESS);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  };

  const endlessUnlocked = progress.completedLevels.includes(5);

  return (
    <div className="w-full h-full min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-600 selection:text-white">
      {/* View Router */}
      {mode === 'MENU' && (
        <div className="relative min-h-screen flex flex-col justify-between overflow-hidden">
          {/* Background Scenic Landscape Layer */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            <img
              src={bgInkMountains}
              alt="Ink mountains"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center contrast-125"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/70 to-stone-950/40" />
          </div>

          {/* Top Bar Contract */}
          <header className="relative z-10 flex items-center justify-between gap-8 px-8 py-5 border-b border-stone-800/80 bg-stone-950/40 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold font-serif tracking-widest text-stone-100">
                墨韵战纪 · 风雅篇
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-400">
              <button
                onClick={() => setMode('LEVEL_SELECT')}
                className="hover:text-stone-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                选折启程
              </button>
              <button
                onClick={() => setMode('UPGRADES')}
                className="hover:text-stone-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                赋诗研习
              </button>
              <button
                onClick={() => setShowLore(true)}
                className="hover:text-stone-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                兵法心诀
              </button>
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-900/80 border border-stone-800 rounded-lg">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-stone-400">灵玉</span>
                <span className="text-sm font-bold text-amber-300 font-mono tabular-nums">
                  {progress.jadeSparks}
                </span>
              </div>
              <button
                onClick={toggleSound}
                className="p-2 text-stone-400 hover:text-stone-100 bg-stone-900 border border-stone-800 rounded-lg transition-colors cursor-pointer"
                title="音频开关"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Hero Center Display */}
          <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-12">
            {/* Left Column: Calligraphy Title & Pitch */}
            <div className="flex-1 max-w-lg space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2 text-xs text-amber-300/80 tracking-widest font-serif"
              >
                <span>水墨风雅</span>
                <span aria-hidden="true">·</span>
                <span>独创剑仙主角</span>
                <span aria-hidden="true">·</span>
                <span>火柴人战争新篇</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.08 }}
                className="text-4xl md:text-5xl font-serif font-black tracking-widest text-stone-100 leading-tight"
              >
                一砚清霜写江山
                <br />
                <span className="text-amber-200">剑破千峰墨染云</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.16 }}
                className="text-sm text-stone-400 font-serif leading-relaxed"
              >
                告别单调纯旁观的阵线对撞！亲临前线操控「云砚剑仙」，手握落墨三式与绝技「水墨山河」，统领采墨侍、折柳剑客、抚竹射手与墨岩卫，征战五大诗意关卡。更有墨灵祝福三选一、文房四宝收集、墨龙卷与墨滞时刻等奇遇机制，通关后更可入无尽长夜，迎战无穷墨潮！
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.24 }}
                className="flex flex-wrap items-center gap-4 pt-2"
              >
                <button
                  onClick={() => setMode('LEVEL_SELECT')}
                  className="py-3.5 px-7 bg-amber-200 hover:bg-amber-100 text-stone-950 font-serif font-bold text-sm rounded-xl flex items-center gap-2.5 shadow-2xl transition-all cursor-pointer active:scale-95"
                >
                  <Play className="w-4 h-4 fill-stone-950" />
                  启卷入战
                </button>

                <button
                  onClick={() => setMode('UPGRADES')}
                  className="py-3.5 px-6 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 font-serif text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  翰墨赋诗阁
                </button>

                <button
                  onClick={() => setShowLore(true)}
                  className="py-3.5 px-5 bg-stone-900/60 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-stone-200 font-serif text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Scroll className="w-4 h-4" />
                  兵法心诀
                </button>
              </motion.div>

              {/* Level Progress Indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.32 }}
                className="pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400 font-mono"
              >
                <span>当前进度: 第 {progress.unlockedLevel}/5 折</span>
                <span aria-hidden="true">·</span>
                <span>已通关: {progress.completedLevels.length} 关</span>
                {progress.endlessBest > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-purple-300">无尽最佳: {progress.endlessBest} 波</span>
                  </>
                )}
              </motion.div>
            </div>

            {/* Right Column: Hero Art Showcase Frame */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="relative w-72 h-72 md:w-88 md:h-88 shrink-0 rounded-3xl overflow-hidden border border-stone-800 shadow-2xl bg-stone-900/80"
            >
              <img
                src={bgHeroAvatar}
                alt="云砚·青莲剑仙"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center contrast-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <span className="text-sm font-serif font-bold text-stone-100 tracking-wider">
                  阵心主角 · 云砚剑笔仙
                </span>
                <p className="text-[11px] text-cyan-300 font-serif mt-0.5">
                  身随剑动 · 墨意通灵 · 随君冲锋
                </p>
              </div>
            </motion.div>
          </main>

          {/* Footer */}
          <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-8 py-4 border-t border-stone-900/80 bg-stone-950/80 text-xs text-stone-500">
            <span>《风雅集·翰墨千秋》 第一大章全五折已备</span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAchievements(true)}
                className="text-stone-500 hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Award className="w-3 h-3" />
                文心宝箓（{progress.achievements.length}/{ACHIEVEMENTS.length}）
              </button>
              <button
                onClick={handleResetProgress}
                className="text-stone-600 hover:text-stone-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                重置感悟进度
              </button>
            </div>
          </footer>
        </div>
      )}

      {mode === 'LEVEL_SELECT' && (
        <ChapterSelect
          progress={progress}
          onSelectLevel={handleStartBattle}
          onOpenUpgrades={() => setMode('UPGRADES')}
          onBackToMenu={() => setMode('MENU')}
        />
      )}

      {mode === 'UPGRADES' && (
        <PavilionUpgrades
          progress={progress}
          onUpdateProgress={setProgress}
          onBack={() => setMode(progress.completedLevels.length > 0 ? 'LEVEL_SELECT' : 'MENU')}
        />
      )}

      {mode === 'BATTLE' && (
        <BattleView
          level={currentLevel}
          progress={progress}
          onVictory={handleVictory}
          onDefeat={handleDefeat}
          onExit={() => setMode('LEVEL_SELECT')}
          onRestart={() => handleStartBattle(currentLevel)}
          onTutorialDone={() =>
            setProgress((prev) => ({ ...prev, tutorialDone: true }))
          }
        />
      )}

      {/* Victory / Defeat Modal */}
      {battleResult && (
        <VictoryDefeatModal
          isVictory={battleResult.status === 'VICTORY'}
          levelTitle={currentLevel.title}
          poeticVerse={currentLevel.poeticVerse}
          jadeEarned={battleResult.stats.jadeEarned}
          stars={battleResult.stats.stars}
          kills={battleResult.stats.kills}
          maxCombo={battleResult.stats.maxCombo}
          durationSec={battleResult.stats.durationSec}
          baseHpPct={battleResult.stats.baseHpPct}
          endlessWave={battleResult.stats.endlessWave}
          endlessBest={progress.endlessBest}
          newAchievements={battleResult.newAchievements}
          onNextLevel={
            !currentLevel.endless && currentLevel.id < 5 ? handleNextLevel : undefined
          }
          onRetry={() => handleStartBattle(currentLevel)}
          onBackToMap={() => {
            setBattleResult(null);
            setMode('LEVEL_SELECT');
          }}
        />
      )}

      {/* Lore & Controls Modal */}
      {showLore && <LoreModal onClose={() => setShowLore(false)} />}

      {/* Achievements Modal */}
      {showAchievements && (
        <AchievementsModal
          unlocked={progress.achievements}
          onClose={() => setShowAchievements(false)}
        />
      )}
    </div>
  );
}
