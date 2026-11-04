// ============================================================
// 祝福加权抽取（Task 44 墨阁升级树扩展 ·「祝福气运」升级线内核）
// ------------------------------------------------------------
// 三处消费（局内三选一 / 每日问战开局 / 周试炼开局）统一走本纯函数：
//   · luck=0 时全稀有度权重同为 1——等价旧均匀抽取，普通玩家零 nerf
//     （无放回抽样下稀世占比 = 池占比，与旧行为逐比特一致）
//   ·「祝福气运」每级将 RARE/EPIC 单张权重抬升 +18%（COMMON 恒 1），
//     稀世入选概率单调上升，只增益不惩罚
//   · 确定性契约：每抽一张恰消耗一次 rng() 调用，与旧均匀 splice
//     的消耗次数一致——每日/周试炼的种子流（game.rng）在同版本内
//     仍同卷恒定（同 seed + 同算法 = 同序列）
// ============================================================
import { BlessingDef } from '../types/game';

export type BlessingRng = () => number;

/**
 * 稀有度基础权重表：三档同权（luck=0 等价旧均匀抽取，零 nerf 基线）。
 * 保留导出以锚定契约——若未来引入基础稀缺权重，须同步复核「luck=0 等价旧行为」断言。
 */
export const RARITY_BASE_WEIGHTS: Record<BlessingDef['rarity'], number> = {
  COMMON: 1.0,
  RARE: 1.0,
  EPIC: 1.0,
};

/** 祝福气运每级对 RARE/EPIC 的权重增益系数 */
export const BLESSING_LUCK_RARE_GAIN = 0.18;

/** 单张祝福的当前权重（气运等级只作用于非普通稀有度；负等级按 0 兜底） */
export function blessingWeight(b: BlessingDef, luckLevel: number): number {
  const base = RARITY_BASE_WEIGHTS[b.rarity] ?? 1.0;
  if (b.rarity === 'COMMON') return base;
  return base * (1 + Math.max(0, luckLevel) * BLESSING_LUCK_RARE_GAIN);
}

/**
 * 加权不重复抽取 n 张祝福（池内去重，池尽即返回全部）。
 * rng 注入可测：局内传 Math.random，每日/周试炼传种子流 rnd。
 */
export function pickBlessings(
  pool: BlessingDef[],
  n: number,
  rng: BlessingRng,
  luckLevel: number = 0
): BlessingDef[] {
  const rest = [...pool];
  const picks: BlessingDef[] = [];
  while (picks.length < n && rest.length > 0) {
    const weights = rest.map((b) => blessingWeight(b, luckLevel));
    const total = weights.reduce((a, w) => a + w, 0);
    let roll = rng() * total;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }
    picks.push(rest.splice(idx, 1)[0]);
  }
  return picks;
}
