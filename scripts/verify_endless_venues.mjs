/**
 * 无尽章境数据层单测
 * 用法：bun scripts/verify_endless_venues.mjs
 */
import {
  ENDLESS_VENUES,
  ENDLESS_LEVEL,
  getEndlessLevelForVenue,
} from '/home/z/my-project/moyugang/src/data/gameData.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name} ${detail}`);
};

// 1. 十章境齐全、氛围两两互异
check('1. 十章境', ENDLESS_VENUES.length === 10);
const ambients = new Set(ENDLESS_VENUES.map((v) => v.ambientType));
check('2. 氛围两两互异', ambients.size === 10, [...ambients].join(','));

// 3. 解锁链：终折 id 5..50 递增
const unlocks = ENDLESS_VENUES.map((v) => v.unlockLevelId);
check('3. 解锁链 5..50', unlocks.join(',') === [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].join(','));

// 4. 生成关卡：endless 标记/id/数值与基础一致，仅景与文案变化
const v = ENDLESS_VENUES[5]; // 桃花源
const lv = getEndlessLevelForVenue(v);
check('4a. endless/id 保留', lv.endless === true && lv.id === 999);
check('4b. 数值继承', lv.playerBaseHp === 2600 && lv.enemyWaveInterval === 12 && lv.initialInk === 350);
check('4c. 氛围换景', lv.ambientType === v.ambientType, lv.ambientType);
check('4d. 题名换景', lv.title.includes(v.name) && lv.chapter.includes(v.anthology), lv.title);
check('4e. boss 结构保留', JSON.stringify(lv.boss) === JSON.stringify(ENDLESS_LEVEL.boss));

// 5. 每章生成皆合法
const allOk = ENDLESS_VENUES.every((x) => {
  const l = getEndlessLevelForVenue(x);
  return l.endless && l.id === 999 && l.ambientType === x.ambientType;
});
check('5. 十章境全生成合法', allOk);

console.log(`\n===== 无尽章境数据层: ${results.filter(Boolean).length}/${results.length} PASS =====`);
process.exit(results.every(Boolean) ? 0 : 1);
