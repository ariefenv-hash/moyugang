import React from 'react';
import { Sparkles, RotateCcw, ArrowRight, Home, Star, Swords, Flame, Timer, ShieldCheck, Award, ScrollText } from 'lucide-react';

/* Task 50 结算页视觉精修：弹层根挂 hud-crisp-vd 纳入 DPR 发丝折算体系（panel 类
   描边折算规则见 index.css「结算页视觉精修」区）；卷面内容按叙事节拍依序浮现
  （animate-vd-rise + 内联 animationDelay 阶梯），点亮星逐颗弹出
  （animate-vd-star-pop），prefers-reduced-motion 时由 CSS 侧静置降级。 */
import { AchievementDef } from '../types/game';
import { ACHIEVEMENTS } from '../data/gameData';

interface VictoryDefeatModalProps {
  isVictory: boolean;
  levelTitle: string;
  poeticVerse: string;
  /** 大章通关尾声（终折大捷时展示剧情卷宗） */
  epilogue?: string;
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
  /** 下一折按钮文案（跨章时显示「启下一章」） */
  nextLevelLabel?: string;
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
    <div className="flex-1 min-w-0 p-2.5 panel-paper-deep text-center">
      <div className={`flex items-center justify-center gap-1 ${accent}`}>
        {icon}
        <span className="text-[10px] font-serif">{label}</span>
      </div>
      <p className="text-sm font-bold font-mono text-ink-strong mt-1 tabular-nums">{value}</p>
    </div>
  );
}

export const VictoryDefeatModal: React.FC<VictoryDefeatModalProps> = ({
  isVictory,
  levelTitle,
  poeticVerse,
  epilogue,
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
  nextLevelLabel = '下一折',
}) => {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-strong/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="hud-crisp-vd relative max-w-md w-full max-h-[92vh] overflow-y-auto paper-scroll p-8 md:p-9 scroll-mount text-center flex flex-col items-center">
        {/* 天头：留白与钤印 */}
        <div
          className={`seal w-14 h-14 flex items-center justify-center mb-5 animate-seal-stamp ${
            isVictory ? '' : 'grayscale opacity-70'
          }`}
          aria-hidden="true"
        >
          <span className="text-2xl font-bold font-serif">{isVictory ? '捷' : '思'}</span>
        </div>

        {/* Title（钤印落定 0.42s 内先行渐入，落款即出） */}
        <h2
          className="animate-vd-rise text-2xl font-serif font-black tracking-widest text-ink-strong"
          style={{ animationDelay: '0.16s' }}
        >
          {isVictory ? '大捷 · 诗成破阵' : endlessWave !== undefined ? '长夜未尽 · 万墨潮退' : '折戟 · 墨涸气竭'}
        </h2>
        <p
          className="animate-vd-rise text-xs text-ink-mid font-serif mt-1.5 tracking-wider"
          style={{ animationDelay: '0.22s' }}
        >
          {levelTitle}
        </p>

        {/* Stars (victory) / Wave reached (endless defeat) */}
        {isVictory && (
          <div
            className="animate-vd-rise flex items-center gap-1.5 mt-4"
            style={{ animationDelay: '0.28s' }}
          >
            {[1, 2, 3].map((s) => (
              <Star
                key={s}
                className={`w-7 h-7 transition-all ${
                  s <= stars
                    ? 'animate-vd-star-pop fill-tenghuang text-tenghuang'
                    : 'text-paper-edge'
                }`}
                style={s <= stars ? { animationDelay: ['0.34s', '0.47s', '0.60s'][s - 1] } : undefined}
              />
            ))}
          </div>
        )}
        {!isVictory && endlessWave !== undefined && (
          <div
            className="animate-vd-rise mt-4 px-4 py-2 panel-paper-deep"
            style={{ animationDelay: '0.28s' }}
          >
            <p className="text-xs text-ink-mid font-serif">
              坚守至第 <span className="font-mono font-bold text-ink-strong">{endlessWave}</span> 波
              {endlessBest !== undefined && (
                <span className="text-ink-light">
                  {' '}· 历史最佳 {endlessBest} 波
                </span>
              )}
            </p>
          </div>
        )}

        {/* Battle Stats（四 chip 同拍齐出，数值自身不加动画保持稳重） */}
        <div
          className="animate-vd-rise flex gap-2 w-full mt-5"
          style={{ animationDelay: '0.36s' }}
        >
          <StatChip
            icon={<Swords className="w-3 h-3" />}
            label="击破"
            value={`${kills}`}
            accent="text-zheshi"
          />
          <StatChip
            icon={<Flame className="w-3 h-3" />}
            label="最高连墨"
            value={`${maxCombo}`}
            accent="text-tenghuang"
          />
          <StatChip
            icon={<Timer className="w-3 h-3" />}
            label="用时"
            value={timeText}
            accent="text-daiqing"
          />
          {isVictory && (
            <StatChip
              icon={<ShieldCheck className="w-3 h-3" />}
              label="墨阁留存"
              value={`${Math.round(baseHpPct * 100)}%`}
              accent="text-shilv"
            />
          )}
        </div>

        {/* 题跋：诗句收束（竖向粗线为设计性笔意，整词匹配不受发丝折算影响） */}
        <div
          className="animate-vd-rise my-5 pl-4 border-l-2 border-cinnabar/60 w-full text-left"
          style={{ animationDelay: '0.44s' }}
        >
          <p className="text-lg font-brush-cao text-ink leading-loose">{poeticVerse}</p>
        </div>

        {/* 章节尾声：大章终折大捷的剧情卷宗 */}
        {isVictory && epilogue && (
          <div
            className="animate-vd-rise w-full mb-4 p-4 panel-paper text-left border-l-2 border-cinnabar/70"
            style={{ animationDelay: '0.5s' }}
          >
            <p className="text-[11px] font-serif font-bold text-cinnabar tracking-[0.25em] mb-2 flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" />
              章节尾声
            </p>
            <p className="text-xs text-ink-mid font-serif leading-loose text-justify">{epilogue}</p>
          </div>
        )}

        {/* New achievements */}
        {newAchievements.length > 0 && (
          <div
            className="animate-vd-rise w-full mb-4 p-3 panel-paper text-left"
            style={{ animationDelay: '0.5s' }}
          >
            <p className="text-[11px] font-serif font-bold text-cinnabar flex items-center gap-1.5 mb-2">
              <Award className="w-3.5 h-3.5" />
              参悟新成就
            </p>
            <div className="space-y-1">
              {newAchievements.map((a) => (
                <p key={a.id} className="text-xs text-ink font-serif">
                  【{a.name}】<span className="text-ink-mid">{a.description}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Reward */}
        {isVictory && jadeEarned > 0 && (
          <div
            className="animate-vd-rise flex items-center gap-2 px-4 py-2 panel-paper-deep mb-6 text-ink-strong"
            style={{ animationDelay: '0.56s' }}
          >
            <Sparkles className="w-4 h-4 text-tenghuang" />
            <span className="text-xs font-serif">获赠文心灵玉：</span>
            <span className="font-mono font-bold">+{jadeEarned}</span>
          </div>
        )}

        {/* Actions（末拍入场，接续灵玉/战报之后收束整卷） */}
        <div
          className="animate-vd-rise flex items-center gap-3 w-full mt-auto"
          style={{ animationDelay: '0.62s' }}
        >
          <button
            onClick={onBackToMap}
            className="btn-ink flex-1 py-3 px-4 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            返回卷轴
          </button>

          <button
            onClick={onRetry}
            className="btn-ink flex-1 py-3 px-4 text-xs font-serif tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {endlessWave !== undefined && !isVictory ? '再入长夜' : '再试一局'}
          </button>

          {isVictory && onNextLevel && (
            <button
              onClick={onNextLevel}
              className="btn-seal flex-1 py-3 px-4 text-xs font-serif font-bold tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {nextLevelLabel}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
