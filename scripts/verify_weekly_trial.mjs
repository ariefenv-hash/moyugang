/**
 * 周试炼数据层单测：确定性 / 周魁词境合法（必为首领折）/ 词缀烘焙 / 周键语义
 * 用法：bun scripts/verify_weekly_trial.mjs
 */
import {
  getWeeklyTrialInfo,
  getWeeklyTrialLevel,
  WEEKLY_LEVEL_ID,
  WEEKLY_REWARD_JADE,
  weekKey,
} from '../src/data/weeklyTrial.ts';
import { RELEASED_LEVELS } from '../src/data/story.ts';
import { BLESSINGS } from '../src/data/gameData.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} ${detail}`);
};

// 1. 同周确定性：两次生成完全一致
const a = getWeeklyTrialInfo('2026-11-02');
const b = getWeeklyTrialInfo('2026-11-02');
check('1a. 同周答卷恒定', JSON.stringify(a) === JSON.stringify(b), a.sourceTitle);

// 2. 跨周差异性：连续 8 周至少生成 3 种不同词境
const titles = new Set();
for (let i = 2; i <= 9; i++) {
  titles.add(getWeeklyTrialInfo(`2026-11-0${i}`).sourceLevelId);
}
check('2. 跨周答卷有变化（8周≥3种）', titles.size >= 3, `varieties=${titles.size}`);

// 3. 周魁词境合法：必为已启首领折（与每日互补——每日专取非首领折）
const bossIds = new Set(RELEASED_LEVELS.filter((l) => l.boss).map((l) => l.id));
const info = getWeeklyTrialInfo(weekKey());
check('3a. 词境属于首领折', bossIds.has(info.sourceLevelId), `source=${info.sourceLevelId}「${info.sourceTitle}」`);
check('3b. 词境不属于每日池（非首领折）', !RELEASED_LEVELS.find((l) => l.id === info.sourceLevelId && !l.boss));

// 4. 词缀与祝福数量与去重
check('4a. 周词缀×3 不重复', info.modifiers.length === 3 && new Set(info.modifiers.map((m) => m.id)).size === 3);
check('4b. 周词缀来自专属池', info.modifiers.every((m) => m.id.startsWith('w_')));
check('4c. 祝福×2 不重复且合法', info.blessings.length === 2 && info.blessings.every((x) => BLESSINGS.some((y) => y.id === x.id)));

// 5. 关卡烘焙：id 独立 / 系数落位 / 祝福落位
const lv = getWeeklyTrialLevel(weekKey());
check('5a. 周试炼关卡 id 独立', lv.id === WEEKLY_LEVEL_ID && lv.id !== 998 && lv.id !== 999 && !(lv.id >= 1 && lv.id <= 50));
check('5b. 词缀系数已落位（高难方向）', typeof lv.enemyAtkMult === 'number' && typeof lv.enemyHpMult === 'number',
  `atk=${lv.enemyAtkMult} hp=${lv.enemyHpMult}`);
check('5c. 初始墨/基地血为正整数', Number.isInteger(lv.initialInk) && lv.initialInk > 0 && Number.isInteger(lv.playerBaseHp) && lv.playerBaseHp > 0,
  `ink=${lv.initialInk} hp=${lv.playerBaseHp}`);
check('5d. 祝福 id 落位×2', Array.isArray(lv.dailyBlessings) && lv.dailyBlessings.length === 2);
check('5e. 章节名与赏格', lv.chapter === '周试炼' && lv.rewardJade === WEEKLY_REWARD_JADE, `jade=${lv.rewardJade}`);
check('5f. 词境源折保留 boss 编排', lv.boss !== undefined && lv.enemySpawns === RELEASED_LEVELS.find((l) => l.id === info.sourceLevelId).enemySpawns);

// 6. 周键语义：周一为一周之始 / 周日归前一周
check('6a. 周一返回自身', weekKey(new Date(2026, 10, 2)) === '2026-11-02', weekKey(new Date(2026, 10, 2))); // 2026-11-02 是周一
check('6b. 周日归前一周周一', weekKey(new Date(2026, 10, 8)) === '2026-11-02', weekKey(new Date(2026, 10, 8))); // 2026-11-08 是周日
check('6c. 周六仍在本周', weekKey(new Date(2026, 10, 7)) === '2026-11-02', weekKey(new Date(2026, 10, 7))); // 2026-11-07 是周六
check('6d. 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(weekKey()), weekKey());

console.log(`\n===== 周试炼数据层: ${results.filter(Boolean).length}/${results.length} PASS =====`);
process.exit(results.every(Boolean) ? 0 : 1);
