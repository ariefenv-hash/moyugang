import { LevelConfig, BlessingDef } from '../types/game';
import { RELEASED_LEVELS } from './story';
import { BLESSINGS, ENDLESS_LEVEL } from './gameData';
import { pickBlessings } from '../utils/blessingPick';

// ============================================================
// 每日试炼 · 墨历问战
// ------------------------------------------------------------
// 每天一份由日期播种的试炼答卷：从十章 50 折中随机择一「词境」，
// 掷出两条异象词缀与三道开局墨灵祝福。同一「墨历日」内所有玩家
// 所见答卷完全一致（seeded PRNG），次日零点自动换卷。
// 首胜独享灵玉重赏，连胜累积「问战连捷」。
// ============================================================

/** 每日试炼关卡固定 id（避开主线 1-50 与无尽 999） */
export const DAILY_LEVEL_ID = 998;

/** 每日首胜灵玉赏格 */
export const DAILY_REWARD_JADE = 260;

/** 今日墨历日串（本地时区 YYYY-MM-DD） */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** mulberry32：小型可复现 PRNG（周试炼共用） */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 日期串 → 种子（FNV-1a，周试炼共用） */
export function dateSeed(dateStr: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 异象词缀：对所选词境的配置做一次确定性变换 */
export interface DailyModifier {
  id: string;
  name: string;
  verse: string;
  description: string;
  apply: (cfg: DailyTrialConfig) => void;
}

export interface DailyTrialConfig {
  enemyAtkMult: number;
  enemyHpMult: number;
  initialInkMult: number;
  waveIntervalMult: number;
  playerBaseHpMult: number;
}

export const DAILY_MODIFIERS: DailyModifier[] = [
  {
    id: 'frenzy',
    name: '墨潮狂性',
    verse: '黑云压城城欲摧',
    description: '敌军攻击 +18%',
    apply: (c) => { c.enemyAtkMult *= 1.18; },
  },
  {
    id: 'ironwall',
    name: '铁衣百炼',
    verse: '朔气传金柝，寒光照铁衣',
    description: '敌军气血 +22%',
    apply: (c) => { c.enemyHpMult *= 1.22; },
  },
  {
    id: 'drought',
    name: '砚池干涸',
    verse: '问渠那得清如许',
    description: '初始墨韵 −18%',
    apply: (c) => { c.initialInkMult *= 0.82; },
  },
  {
    id: 'haste',
    name: '急鼓催兵',
    verse: '烽火连三月',
    description: '敌军增援间隔 −18%',
    apply: (c) => { c.waveIntervalMult *= 0.82; },
  },
  {
    id: 'citadel',
    name: '文光护阁',
    verse: '安得广厦千万间',
    description: '墨阁气血 +30%',
    apply: (c) => { c.playerBaseHpMult *= 1.3; },
  },
  {
    id: 'tide',
    name: '墨涛拍岸',
    verse: '卷起千堆雪',
    description: '敌军攻击 +10% 且气血 +10%',
    apply: (c) => { c.enemyAtkMult *= 1.1; c.enemyHpMult *= 1.1; },
  },
];

export interface DailyTrialInfo {
  dateStr: string;
  /** 源折（词境）关卡 id 与名号 */
  sourceLevelId: number;
  sourceTitle: string;
  sourceChapter: string;
  /** 异象词缀 ×2 */
  modifiers: DailyModifier[];
  /** 开局墨灵祝福 ×3 */
  blessings: BlessingDef[];
}

/** 按日期解析今日试炼答卷（同一天恒定） */
export function getDailyTrialInfo(
  dateStr: string = todayKey(),
  /** 「祝福气运」升级线等级（稀世祝福权重 +18%/级）；种子流确定性不受影响 */
  blessingLuck: number = 0
): DailyTrialInfo {
  const rnd = mulberry32(dateSeed(dateStr));

  // 词境：避开终折首领战（id % 5 === 0 的首领折与高难度首折均可选，无硬限制；
  // 但排除 boss 折使每日试炼保持「折」的节奏——boss 战留给主线）
  const pool = RELEASED_LEVELS.filter((l) => !l.boss);
  const src = pool[Math.floor(rnd() * pool.length)];

  // 词缀 ×2（不重复）
  const modPool = [...DAILY_MODIFIERS];
  const modifiers: DailyModifier[] = [];
  for (let i = 0; i < 2 && modPool.length > 0; i++) {
    modifiers.push(modPool.splice(Math.floor(rnd() * modPool.length), 1)[0]);
  }

  // 开局祝福 ×3（不重复，全稀有度可掷；「祝福气运」升级线抬升稀世权重）
  const blessings = pickBlessings(BLESSINGS, 3, rnd, blessingLuck);

  return {
    dateStr,
    sourceLevelId: src.id,
    sourceTitle: src.title,
    sourceChapter: src.chapter,
    modifiers,
    blessings,
  };
}

/** 生成每日试炼的可玩关卡配置（词缀烘焙进数据，BattleView 无需感知） */
export function getDailyTrialLevel(dateStr: string = todayKey()): LevelConfig {
  const info = getDailyTrialInfo(dateStr);
  const src = RELEASED_LEVELS.find((l) => l.id === info.sourceLevelId)!;

  const cfg: DailyTrialConfig = {
    enemyAtkMult: 1,
    enemyHpMult: 1,
    initialInkMult: 1,
    waveIntervalMult: 1,
    playerBaseHpMult: 1,
  };
  info.modifiers.forEach((m) => m.apply(cfg));

  // 敌营数值烘焙：波次兵表按 src 深拷贝后乘系数（enemySpawns 仅含编成；
  // 攻/血系数经 LevelConfig 新扩展字段传入战斗管线）
  return {
    ...src,
    id: DAILY_LEVEL_ID,
    chapter: '每日试炼',
    title: `每日问战 · ${info.sourceTitle.split('·')[1] ?? info.sourceTitle}`,
    subtitle: `${info.dateStr} 词境 · ${info.sourceChapter.split('·')[1] ?? info.sourceChapter}`,
    poeticVerse: '墨历翻新页，试炼问今朝。',
    poeticAuthor: '—— 每日卷',
    description: `今日答卷取境「${info.sourceTitle}」，词缀【${info.modifiers
      .map((m) => m.name)
      .join('·')}】，开局赐福【${info.blessings.map((b) => b.name).join('·')}】。当日首胜独享 ${DAILY_REWARD_JADE} 灵玉！`,
    initialInk: Math.round(src.initialInk * cfg.initialInkMult),
    playerBaseHp: Math.round(src.playerBaseHp * cfg.playerBaseHpMult),
    rewardJade: DAILY_REWARD_JADE,
    enemyAtkMult: cfg.enemyAtkMult,
    enemyHpMult: cfg.enemyHpMult,
    dailyModifiers: info.modifiers.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    dailyBlessings: info.blessings.map((b) => b.id),
  };
}

// 防止 ENDLESS_LEVEL 被 tree-shake 误删引用警告（类型层面无依赖，仅保持模块完整性）
void ENDLESS_LEVEL;
