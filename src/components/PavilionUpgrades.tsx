import React from 'react';
import { PlayerProgress, UnitType } from '../types/game';
import { UNIT_CONFIGS, HERO_SKILLS } from '../data/gameData';
import {
  ChevronLeft,
  Sparkles,
  Sword,
  Heart,
  Clock,
  Shield,
  Feather,
  Crosshair,
  Music,
  ArrowUp,
  Zap,
} from 'lucide-react';

interface PavilionUpgradesProps {
  progress: PlayerProgress;
  onUpdateProgress: (newProgress: PlayerProgress) => void;
  onBack: () => void;
}

export const PavilionUpgrades: React.FC<PavilionUpgradesProps> = ({
  progress,
  onUpdateProgress,
  onBack,
}) => {
  const getUpgradeCost = (currentLevel: number) => {
    return Math.round(50 * Math.pow(1.5, currentLevel));
  };

  const upgradeHeroStat = (stat: keyof PlayerProgress['heroUpgrades']) => {
    const cost = getUpgradeCost(progress.heroUpgrades[stat]);
    if (progress.jadeSparks < cost) return;

    onUpdateProgress({
      ...progress,
      jadeSparks: progress.jadeSparks - cost,
      heroUpgrades: {
        ...progress.heroUpgrades,
        [stat]: progress.heroUpgrades[stat] + 1,
      },
    });
  };

  const upgradeUnit = (type: UnitType) => {
    const currentLvl = progress.unitUpgrades[type] || 0;
    const cost = getUpgradeCost(currentLvl);
    if (progress.jadeSparks < cost) return;

    onUpdateProgress({
      ...progress,
      jadeSparks: progress.jadeSparks - cost,
      unitUpgrades: {
        ...progress.unitUpgrades,
        [type]: currentLvl + 1,
      },
    });
  };

  const upgradeCitadel = (stat: keyof PlayerProgress['citadelUpgrades']) => {
    const cost = getUpgradeCost(progress.citadelUpgrades[stat]);
    if (progress.jadeSparks < cost) return;

    onUpdateProgress({
      ...progress,
      jadeSparks: progress.jadeSparks - cost,
      citadelUpgrades: {
        ...progress.citadelUpgrades,
        [stat]: progress.citadelUpgrades[stat] + 1,
      },
    });
  };

  return (
    <div className="relative min-h-screen paper-grain text-ink flex flex-col font-sans select-none overflow-x-hidden">
      {/* Top Bar Contract */}
      <header className="relative z-10 flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-8 py-4 border-b rule-ink-strong">
        <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap shrink-0 min-w-0">
          <button
            onClick={onBack}
            className="btn-ink flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            返回选折
          </button>
          <span className="text-lg sm:text-xl font-bold font-serif text-ink-strong tracking-wider truncate">
            翰墨赋诗阁 · 阵法修习
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-mid">
          <span className="text-ink-strong font-serif">剑仙心法</span>
          <span className="text-cinnabar/50">·</span>
          <span>百家军势</span>
          <span className="text-cinnabar/50">·</span>
          <span>墨阁基业</span>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 panel-paper-deep">
            <Sparkles className="w-3.5 h-3.5 text-tenghuang" />
            <span className="text-xs text-ink-mid">可用灵玉</span>
            <span className="text-sm font-bold text-ink-strong font-mono tabular-nums">
              {progress.jadeSparks}
            </span>
          </div>
        </div>
      </header>

      {/* Main Upgrades Pavilion */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-8 space-y-10">
        {/* Section 1: Hero Cultivation */}
        <div>
          <div className="flex items-baseline gap-4 mb-4 pb-2 rule-zhusi">
            <h3 className="text-lg font-serif font-bold text-ink-strong shrink-0">
              主角心法 · 云砚仙姿
            </h3>
            <p className="text-xs text-ink-mid font-serif hidden sm:block">
              以主角为阵法枢纽，提升个人攻击、护体真气与全军战力呼应。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Attack */}
            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="flex items-center gap-1.5 font-serif text-ink-strong">
                    <Sword className="w-4 h-4 text-zheshi" />
                    落墨剑气
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.heroUpgrades.attackLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  剑锋附带凌厉墨气，每级增加基础攻击 +10 点。
                </p>
              </div>

              <button
                onClick={() => upgradeHeroStat('attackLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.heroUpgrades.attackLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                研习 ({getUpgradeCost(progress.heroUpgrades.attackLevel)} 灵玉)
              </button>
            </div>

            {/* HP */}
            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="flex items-center gap-1.5 font-serif text-ink-strong">
                    <Heart className="w-4 h-4 text-shilv" />
                    丹青浩气
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.heroUpgrades.hpLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  扩充主角气血上限，每级提升 +60 点生命值。
                </p>
              </div>

              <button
                onClick={() => upgradeHeroStat('hpLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.heroUpgrades.hpLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                研习 ({getUpgradeCost(progress.heroUpgrades.hpLevel)} 灵玉)
              </button>
            </div>

            {/* Cooldown */}
            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="flex items-center gap-1.5 font-serif text-ink-strong">
                    <Clock className="w-4 h-4 text-qingjin" />
                    笔走龙蛇
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.heroUpgrades.cooldownLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  运笔愈发迅捷，全技能冷却时间缩短 8%（当前总缩短 {progress.heroUpgrades.cooldownLevel * 8}%）。
                </p>
              </div>

              <button
                onClick={() => upgradeHeroStat('cooldownLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.heroUpgrades.cooldownLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                研习 ({getUpgradeCost(progress.heroUpgrades.cooldownLevel)} 灵玉)
              </button>
            </div>

            {/* Resonance Aura */}
            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="flex items-center gap-1.5 font-serif text-ink-strong">
                    <Sparkles className="w-4 h-4 text-tenghuang" />
                    君臣共鸣
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.heroUpgrades.resonanceLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  强化风雅领域，周边友军护盾与大招治疗增幅 +12%（当前总增幅 +{progress.heroUpgrades.resonanceLevel * 12}%）。
                </p>
              </div>

              <button
                onClick={() => upgradeHeroStat('resonanceLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.heroUpgrades.resonanceLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                研习 ({getUpgradeCost(progress.heroUpgrades.resonanceLevel)} 灵玉)
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Troops Upgrades */}
        <div>
          <div className="flex items-baseline gap-4 mb-4 pb-2 rule-zhusi">
            <h3 className="text-lg font-serif font-bold text-ink-strong shrink-0">
              百家军势 · 兵法进阶
            </h3>
            <p className="text-xs text-ink-mid font-serif hidden sm:block">
              全面强化征召的兵种弟子，赋予更强气血与伤害。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {(['SCRIBE', 'SWORD', 'ARCHER', 'GUARDIAN', 'HARPIST'] as UnitType[]).map((type) => {
              const config = UNIT_CONFIGS[type];
              const currentLvl = progress.unitUpgrades[type] || 0;
              const cost = getUpgradeCost(currentLvl);

              return (
                <div
                  key={type}
                  className="p-4 panel-paper flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                      <span className="font-serif font-semibold text-ink-strong">
                        {config.name}
                      </span>
                      <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                        Lv.{currentLvl}
                      </span>
                    </div>
                    <p className="text-xs text-ink-mid line-clamp-2 leading-relaxed">
                      {config.description}
                    </p>
                  </div>

                  <button
                    onClick={() => upgradeUnit(type)}
                    disabled={progress.jadeSparks < cost}
                    className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                    进阶 ({cost} 灵玉)
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Citadel Upgrades */}
        <div>
          <div className="flex items-baseline gap-4 mb-4 pb-2 rule-zhusi">
            <h3 className="text-lg font-serif font-bold text-ink-strong shrink-0">
              翰墨基业 · 圣阁筑造
            </h3>
            <p className="text-xs text-ink-mid font-serif hidden sm:block">
              夯实后方圣殿基石，提供源源不断的墨韵支撑。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="font-serif font-semibold text-ink-strong">
                    圣阁城垣
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.citadelUpgrades.baseHpLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  加固墨阁城阙与防护法阵，每级提升大本营生命值 +300 点。
                </p>
              </div>

              <button
                onClick={() => upgradeCitadel('baseHpLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.citadelUpgrades.baseHpLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                加固 ({getUpgradeCost(progress.citadelUpgrades.baseHpLevel)} 灵玉)
              </button>
            </div>

            <div className="p-4 panel-paper flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mid mb-2">
                  <span className="font-serif font-semibold text-ink-strong">
                    聚灵墨泉
                  </span>
                  <span className="px-1.5 py-0.5 border border-daiqing/60 text-daiqing font-mono text-[10px]">
                    Lv.{progress.citadelUpgrades.gatherSpeedLevel}
                  </span>
                </div>
                <p className="text-xs text-ink-mid leading-relaxed">
                  催发天地文运，战斗中每秒自动产生的墨韵流转速度提高 25%。
                </p>
              </div>

              <button
                onClick={() => upgradeCitadel('gatherSpeedLevel')}
                disabled={progress.jadeSparks < getUpgradeCost(progress.citadelUpgrades.gatherSpeedLevel)}
                className="btn-seal mt-4 py-2 px-3 text-xs font-serif flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                汇聚 ({getUpgradeCost(progress.citadelUpgrades.gatherSpeedLevel)} 灵玉)
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
