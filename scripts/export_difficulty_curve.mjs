#!/usr/bin/env node
/**
 * 十章难度曲线回归表导出（Task 33）
 * ------------------------------------------------------------
 * 从 src/data/story.ts 实时提取十大章 × 五十折的难度数据，
 * 沉淀为 docs/difficulty-curve.json，供调参与回归对照：
 * - 每折：敌营血量/玩家城防/初始墨/赏格/首领战数据 + 压力指数
 * - 每章：五折聚合（难度带、赏格带、首领威胁）
 * - 灵玉经济回收线：收入侧（十章赏格/每日/无尽）vs 回收侧（墨阁 11 轨成本曲线）
 *
 * 运行：bun scripts/export_difficulty_curve.mjs
 * 输出：docs/difficulty-curve.json（调参后重跑本脚本即可刷新回归表）
 */
import { STORY_CHAPTERS } from '../src/data/story.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'difficulty-curve.json');

const r1 = (n) => Math.round(n * 10) / 10;

// ---------- 难度曲线：逐章逐折 ----------
const chapters = STORY_CHAPTERS.filter((c) => c.status === 'RELEASED' && c.levels).map((c) => {
  const folds = c.levels.map((l) => ({
    foldId: l.id,
    fold: l.chapter,
    title: l.title,
    ambient: l.ambientType,
    playerBaseHp: l.playerBaseHp,
    enemyBaseHp: l.enemyBaseHp,
    initialInk: l.initialInk,
    rewardJade: l.rewardJade,
    enemyWaveInterval: l.enemyWaveInterval,
    boss: l.boss
      ? { name: l.boss.name, title: l.boss.title, hp: l.boss.hp, attack: l.boss.attack }
      : null,
    /** 压力指数：敌营血量 ÷ 初始墨（每点墨需扛下的敌营血量，越大越紧） */
    pressureIndex: r1(l.enemyBaseHp / l.initialInk),
    /** 首领威胁指数：首领血量 ÷ 玩家城防（终折恒有首领） */
    bossThreatIndex: l.boss ? r1(l.boss.hp / l.playerBaseHp) : null,
  }));

  const enemyHp = folds.map((f) => f.enemyBaseHp);
  const jades = folds.map((f) => f.rewardJade);
  return {
    chapterId: c.id,
    key: c.key,
    anthology: c.anthology,
    name: c.name,
    foldCount: folds.length,
    folds,
    aggregate: {
      enemyBaseHpRange: [Math.min(...enemyHp), Math.max(...enemyHp)],
      initialInkRange: [
        Math.min(...folds.map((f) => f.initialInk)),
        Math.max(...folds.map((f) => f.initialInk)),
      ],
      chapterRewardJade: jades.reduce((a, b) => a + b, 0),
      pressureIndexRange: [
        Math.min(...folds.map((f) => f.pressureIndex)),
        Math.max(...folds.map((f) => f.pressureIndex)),
      ],
      bosses: folds.filter((f) => f.boss).map((f) => ({ fold: f.fold, ...f.boss })),
    },
  };
});

// ---------- 灵玉经济回收线 ----------
const INK_INITIAL = 120; // App.tsx 初始灵玉
const DAILY_FIRST_WIN = 260; // dailyTrial.ts 首胜基准赏格
const ENDLESS_PER_WAVE = 18; // App.tsx 无尽每波结算
const SINK_TRACKS = 11; // 墨阁：4 心法 + 5 兵种 + 2 基业
const COST_BASE = 50; // getUpgradeCost 基数
const COST_RATIO = 1.5; // 指数底
const COOLDOWN_CAP = 5; // 冷却轨生效上限（cdMult = max(0.6, 1 - Lv×8%)）

const onePassFoldRewards = chapters.reduce(
  (acc, c) => acc + c.aggregate.chapterRewardJade,
  0
);
const onePassTotal = onePassFoldRewards + INK_INITIAL;
const trackCostToLevel = (lv) =>
  Array.from({ length: lv }, (_, i) => COST_BASE * Math.pow(COST_RATIO, i)).reduce(
    (a, b) => a + b,
    0
  );
const allTrackCostToLevel = (lv) => Math.round(trackCostToLevel(lv) * SINK_TRACKS);
// 注意：JS 的 Math.log 只收一个参数（底数参数会被忽略），换底必须手动除以 ln(底)
const balancedLevel =
  Math.log((onePassTotal / SINK_TRACKS / COST_BASE) * (COST_RATIO - 1) + 1) /
  Math.log(COST_RATIO);

const jadeEconomy = {
  income: {
    initialJade: INK_INITIAL,
    onePassFoldRewards,
    onePassTotal,
    victoryFormula: 'rewardJade × (0.6 + 0.2 × 星级)，复刷可重复获取',
    dailyFirstWinJade: DAILY_FIRST_WIN,
    endlessJadePerWave: ENDLESS_PER_WAVE,
  },
  sink: {
    pavilionTracks: SINK_TRACKS,
    costFormula: '50 × 1.5^Lv（取整）',
    cooldownCapLevel: COOLDOWN_CAP,
    cooldownCapNote:
      '冷却轨实际生效上限 Lv5（战斗侧 cdMult = max(0.6, 1 - Lv×8%)），墨阁 UI 已封顶展示「已臻化境」，Lv6+ 不再售卖',
    milestones: {
      allTracksToLv5: allTrackCostToLevel(5),
      allTracksToLv8: allTrackCostToLevel(8),
      allTracksToLv10: allTrackCostToLevel(10),
      allTracksToLv12: allTrackCostToLevel(12),
    },
  },
  recycleLine: {
    balancedLevelOnOnePass: r1(balancedLevel),
    verdict:
      '单通收入 ≈ ' +
      onePassTotal +
      ' 灵玉，可支撑 11 轨均衡升至 Lv' +
      r1(balancedLevel) +
      '；全轨 Lv10 需 ' +
      allTrackCostToLevel(10) +
      '，缺口由每日试炼（260/日）与无尽章境（18/波）补足——回收线闭合，无通货膨胀。',
    calibration:
      '2026-11-01 Task 33：修复冷却轨超上限售卖（Lv6+ 灵玉无效果）的回收线漏洞。',
  },
};

const out = {
  meta: {
    doc: '墨韵战纪·十章难度曲线回归表',
    source: 'src/data/story.ts → STORY_CHAPTERS',
    generatedBy: 'scripts/export_difficulty_curve.mjs',
    note: '调参后重跑 bun scripts/export_difficulty_curve.mjs 刷新本表',
    chapterCount: chapters.length,
    foldCount: chapters.reduce((a, c) => a + c.foldCount, 0),
  },
  difficultyCurve: { chapters },
  jadeEconomy,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');

// 摘要打印
console.log(`✓ 已写出 ${OUT}`);
console.log(`  章: ${chapters.length} · 折: ${out.meta.foldCount}`);
console.log(
  `  敌营血量曲线: ${chapters[0].aggregate.enemyBaseHpRange[0]} → ${chapters.at(-1).aggregate.enemyBaseHpRange[1]}`
);
console.log(`  单通赏格总和: ${onePassFoldRewards} + 初始 ${INK_INITIAL} = ${onePassTotal}`);
console.log(`  回收线均衡等级: Lv${r1(balancedLevel)}`);
for (const [k, v] of Object.entries(jadeEconomy.sink.milestones)) {
  console.log(`  ${k}: ${v}`);
}
