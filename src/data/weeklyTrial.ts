import { LevelConfig, BlessingDef } from '../types/game';
import { RELEASED_LEVELS } from './story';
import { BLESSINGS } from './gameData';
import { pickBlessings } from '../utils/blessingPick';
import { mulberry32, dateSeed, DailyModifier, DailyTrialConfig } from './dailyTrial';

// ============================================================
// 周试炼 · 周魁问锋
// ------------------------------------------------------------
// 每周一份由周键（本周一日期）播种的高难答卷：从十章首领折中
// 择一「周魁词境」，掷出三条凶险周词缀与两道开局墨灵祝福。同一
// 周内所有玩家所见答卷完全一致（seeded PRNG），周一零点自动换卷。
// 与每日试炼互补：每日专取普通折节奏轻快（词缀×2/祝福×3），
// 周试炼直取首领折重锋问战（词缀×3/祝福×2，倍率更凶）。
// 本周首胜独享灵玉重赏。
// ============================================================

/** 周试炼关卡固定 id（避开主线 1-50 / 每日 998 / 无尽 999） */
export const WEEKLY_LEVEL_ID = 997;

/** 周试炼首胜灵玉赏格（高难重赏，约为每日 260 的 1.6 倍） */
export const WEEKLY_REWARD_JADE = 420;

/** 本周周键：本周一日期串（本地时区，周一为一周之始，YYYY-MM-DD） */
export function weekKey(d: Date = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = monday.getDay(); // 0=周日 … 6=周六
  const diff = dow === 0 ? -6 : 1 - dow; // 周日归前一周周一，其余回退到本周一
  monday.setDate(monday.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 周词缀：比每日更凶险的确定性变换（高难卷语义，全部负向或复合施压） */
export const WEEKLY_MODIFIERS: DailyModifier[] = [
  {
    id: 'w_inksha',
    name: '墨煞蚀锋',
    verse: '黑云翻墨未遮山',
    description: '敌军攻击 +20%',
    apply: (c) => { c.enemyAtkMult *= 1.2; },
  },
  {
    id: 'w_ironcurtain',
    name: '千钧铁幕',
    verse: '但使龙城飞将在',
    description: '敌军气血 +26%',
    apply: (c) => { c.enemyHpMult *= 1.26; },
  },
  {
    id: 'w_frozenink',
    name: '砚海冰封',
    verse: '瀚海阑干百丈冰',
    description: '初始墨韵 −25%',
    apply: (c) => { c.initialInkMult *= 0.75; },
  },
  {
    id: 'w_nightdrum',
    name: '烽火连宵',
    verse: '烽火扬州路',
    description: '敌军增援间隔 −22%',
    apply: (c) => { c.waveIntervalMult *= 0.78; },
  },
  {
    id: 'w_lonelycitadel',
    name: '孤城万仞',
    verse: '一片孤城万仞山',
    description: '墨阁气血 −12%',
    apply: (c) => { c.playerBaseHpMult *= 0.88; },
  },
  {
    id: 'w_gatheringstorm',
    name: '山雨欲来',
    verse: '山雨欲来风满楼',
    description: '敌军攻击 +12% 且气血 +12%',
    apply: (c) => { c.enemyAtkMult *= 1.12; c.enemyHpMult *= 1.12; },
  },
];

export interface WeeklyTrialInfo {
  /** 周键（本周一日期串） */
  weekStr: string;
  /** 周魁词境：首领折关卡 id 与名号 */
  sourceLevelId: number;
  sourceTitle: string;
  sourceChapter: string;
  /** 周词缀 ×3（不重复） */
  modifiers: DailyModifier[];
  /** 开局墨灵祝福 ×2（不重复，全稀有度可掷） */
  blessings: BlessingDef[];
}

/** 按周键解析本周试炼答卷（同一周恒定） */
export function getWeeklyTrialInfo(
  weekStr: string = weekKey(),
  /** 「祝福气运」升级线等级（稀世祝福权重 +18%/级）；种子流确定性不受影响 */
  blessingLuck: number = 0
): WeeklyTrialInfo {
  const rnd = mulberry32(dateSeed('weekly-' + weekStr));

  // 周魁词境：仅取首领折（与每日试炼互补——每日专取非首领普通折）
  const pool = RELEASED_LEVELS.filter((l) => l.boss);
  const src = pool[Math.floor(rnd() * pool.length)];

  // 周词缀 ×3（不重复）
  const modPool = [...WEEKLY_MODIFIERS];
  const modifiers: DailyModifier[] = [];
  for (let i = 0; i < 3 && modPool.length > 0; i++) {
    modifiers.push(modPool.splice(Math.floor(rnd() * modPool.length), 1)[0]);
  }

  // 开局祝福 ×2（不重复，全稀有度可掷；「祝福气运」升级线抬升稀世权重）
  const blessings = pickBlessings(BLESSINGS, 2, rnd, blessingLuck);

  return {
    weekStr,
    sourceLevelId: src.id,
    sourceTitle: src.title,
    sourceChapter: src.chapter,
    modifiers,
    blessings,
  };
}

/** 生成周试炼的可玩关卡配置（词缀烘焙进数据，BattleView 无需感知） */
export function getWeeklyTrialLevel(weekStr: string = weekKey()): LevelConfig {
  const info = getWeeklyTrialInfo(weekStr);
  const src = RELEASED_LEVELS.find((l) => l.id === info.sourceLevelId)!;

  const cfg: DailyTrialConfig = {
    enemyAtkMult: 1,
    enemyHpMult: 1,
    initialInkMult: 1,
    waveIntervalMult: 1,
    playerBaseHpMult: 1,
  };
  info.modifiers.forEach((m) => m.apply(cfg));

  return {
    ...src,
    id: WEEKLY_LEVEL_ID,
    chapter: '周试炼',
    title: `周魁问锋 · ${info.sourceTitle.split('·')[1] ?? info.sourceTitle}`,
    subtitle: `${info.weekStr} 周魁词境 · ${info.sourceChapter.split('·')[1] ?? info.sourceChapter}`,
    poeticVerse: '十年磨一剑，霜刃未曾试。',
    poeticAuthor: '—— 贾岛《剑客》 · 周试炼卷',
    description: `本周周魁取境首领折「${info.sourceTitle}」，词缀【${info.modifiers
      .map((m) => m.name)
      .join('·')}】，开局赐福【${info.blessings.map((b) => b.name).join('·')}】。本周首胜独享 ${WEEKLY_REWARD_JADE} 灵玉！`,
    initialInk: Math.round(src.initialInk * cfg.initialInkMult),
    playerBaseHp: Math.round(src.playerBaseHp * cfg.playerBaseHpMult),
    rewardJade: WEEKLY_REWARD_JADE,
    enemyAtkMult: cfg.enemyAtkMult,
    enemyHpMult: cfg.enemyHpMult,
    dailyModifiers: info.modifiers.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    dailyBlessings: info.blessings.map((b) => b.id),
  };
}
