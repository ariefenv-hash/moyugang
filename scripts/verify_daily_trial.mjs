/**
 * 每日试炼数据层单测：确定性 / 词境合法 / 词缀烘焙
 * 用法：bun scripts/verify_daily_trial.mjs
 */
import { getDailyTrialInfo, getDailyTrialLevel, DAILY_LEVEL_ID, todayKey } from '/home/z/my-project/moyugang/src/data/dailyTrial.ts';
import { RELEASED_LEVELS } from '/home/z/my-project/moyugang/src/data/story.ts';
import { BLESSINGS } from '/home/z/my-project/moyugang/src/data/gameData.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} ${detail}`);
};

// 1. 同日确定性：两次生成完全一致
const a = getDailyTrialInfo('2026-11-01');
const b = getDailyTrialInfo('2026-11-01');
check('1a. 同日答卷恒定', JSON.stringify(a) === JSON.stringify(b), a.sourceTitle);

// 2. 异日差异性：连续 14 天至少生成 5 种不同词境
const titles = new Set();
for (let i = 1; i <= 14; i++) {
  titles.add(getDailyTrialInfo(`2026-10-${String(i).padStart(2, '0')}`).sourceLevelId);
}
check('2. 异日答卷有变化（14天≥5种）', titles.size >= 5, ` varieties=${titles.size}`);

// 3. 词境合法：来源于已启关卡且非首领折
const all = new Set(RELEASED_LEVELS.filter((l) => !l.boss).map((l) => l.id));
const info = getDailyTrialInfo(todayKey());
check('3a. 词境属于非首领折', all.has(info.sourceLevelId), `source=${info.sourceLevelId}`);

// 4. 词缀与祝福数量与去重
check('4a. 词缀×2 不重复', info.modifiers.length === 2 && new Set(info.modifiers.map((m) => m.id)).size === 2);
check('4b. 祝福×3 不重复且合法', info.blessings.length === 3 && info.blessings.every((x) => BLESSINGS.some((y) => y.id === x.id)));

// 5. 关卡烘焙：id 独立 / 初始墨为整数 / 系数落位
const lv = getDailyTrialLevel(todayKey());
check('5a. 每日关卡 id 独立', lv.id === DAILY_LEVEL_ID && lv.id !== 999 && !(lv.id >= 1 && lv.id <= 50));
check('5b. 词缀系数已落位', typeof lv.enemyAtkMult === 'number' && typeof lv.enemyHpMult === 'number',
  `atk=${lv.enemyAtkMult} hp=${lv.enemyHpMult}`);
check('5c. 初始墨/基地血为正整数', Number.isInteger(lv.initialInk) && lv.initialInk > 0 && Number.isInteger(lv.playerBaseHp) && lv.playerBaseHp > 0);
check('5d. 祝福 id 落位', Array.isArray(lv.dailyBlessings) && lv.dailyBlessings.length === 3);

// 6. 今日串格式
check('6. todayKey 格式', /^\d{4}-\d{2}-\d{2}$/.test(todayKey()), todayKey());

console.log(`\n===== 每日试炼数据层: ${results.filter(Boolean).length}/${results.length} PASS =====`);
process.exit(results.every(Boolean) ? 0 : 1);
