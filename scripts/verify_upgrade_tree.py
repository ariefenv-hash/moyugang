#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_upgrade_tree.py — 墨阁升级树扩展（Task 44）无头验证

覆盖链路：
  A. 纯函数单元（bun 直跑 TS）：pickBlessings 不重复/池尽兜底/同 rng 确定性/
     luck=0 vs luck=8 EPIC 出现率显著上升（理论 11.4%→29.4%）/权重表锚
  B. e2e（playwright + dev :3000）：
     预置 jadeSparks=900 全升级 0 → 主菜单「赋诗研习」→ 墨阁两新卡在场
     （字诀精研/祝福气运 Lv.0）→ 各研习一次 → Lv.1 + 灵玉 900→800 →
     reload 持久化（新字段落档）→ 冷却轨封顶锚不受影响
  C. 静态源锚：BattleView 字诀乘算注入 / offerBlessings 加权替换 /
     daily+weekly pickBlessings 接线 / ChapterSelect luck 传参
  D. 全程零 console error / pageerror

用法：python3 scripts/verify_upgrade_tree.py（需 dev server 已在 :3000）
"""
import json
import subprocess
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


UNIT_TS = r'''
import { pickBlessings, blessingWeight, RARITY_BASE_WEIGHTS, BLESSING_LUCK_RARE_GAIN } from "./src/utils/blessingPick";
import { BLESSINGS } from "./src/data/gameData";
function mulberry32(a: number) { return function() { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const out: any = {};
// 1) 权重表锚
out.weights = { ...RARITY_BASE_WEIGHTS, GAIN: BLESSING_LUCK_RARE_GAIN };
// 2) 不重复 + 池尽兜底
const p1 = pickBlessings(BLESSINGS, 3, mulberry32(42), 0);
out.p1_len = p1.length;
out.p1_ids = p1.map((b) => b.id);
const p_all = pickBlessings(BLESSINGS, 99, mulberry32(7), 0);
out.all_len = p_all.length;
out.all_unique = new Set(p_all.map((b) => b.id)).size;
// 3) 确定性：同 seed 两次序列全等
const a = pickBlessings(BLESSINGS, 3, mulberry32(1234), 3);
const b = pickBlessings(BLESSINGS, 3, mulberry32(1234), 3);
out.det_same = JSON.stringify(a.map((x) => x.id)) === JSON.stringify(b.map((x) => x.id));
// 4) luck 提升稀世出现率：各 4000 组三选一，统计 EPIC/RARE 张占比
function rate(luck: number) {
  const rng = mulberry32(2026);
  let epic = 0, rare = 0, total = 0;
  for (let i = 0; i < 4000; i++) {
    for (const bl of pickBlessings(BLESSINGS, 3, rng, luck)) {
      total++;
      if (bl.rarity === "EPIC") epic++;
      if (bl.rarity === "RARE") rare++;
    }
  }
  return { epic: epic / total, rare: rare / total };
}
out.rate0 = rate(0);
out.rate8 = rate(8);
out.rate200 = rate(200);
console.log(JSON.stringify(out));
'''


def run_unit_tests():
    print("A. 纯函数单元（bun 直跑 TS）")
    r = subprocess.run(
        ["bun", "-e", UNIT_TS], capture_output=True, text=True, cwd=".",
        timeout=120,
    )
    if r.returncode != 0:
        check("A0 bun 运行", False, r.stderr[:300])
        return None
    d = json.loads(r.stdout.strip().splitlines()[-1])
    w = d["weights"]
    check("A1 权重表锚三档同权 1.0 + 增益 0.18（luck0 等价旧均匀零 nerf）",
          abs(w["COMMON"] - 1.0) < 1e-9 and abs(w["RARE"] - 1.0) < 1e-9
          and abs(w["EPIC"] - 1.0) < 1e-9 and abs(w["GAIN"] - 0.18) < 1e-9)
    check("A2 三选一不重复（3 张全异 id）", d["p1_len"] == 3 and len(set(d["p1_ids"])) == 3, str(d["p1_ids"]))
    check("A3 池尽兜底（n=99 → 全池 8 张不重复）", d["all_len"] == 8 and d["all_unique"] == 8)
    check("A4 同 seed 确定性（两次序列全等）", d["det_same"])
    check("A5a luck=0 EPIC 率 = 池占比 0.25（旧均匀行为等价，±0.02）",
          abs(d["rate0"]["epic"] - 0.25) <= 0.02, f"实测 {d['rate0']['epic']:.3f}")
    lift = d["rate8"]["epic"] / max(d["rate0"]["epic"], 1e-9)
    check("A5b luck=8 EPIC 率单调上升（×1.15 阈；R/E 同增益下理论上界 40%）", lift >= 1.15,
          f"0级={d['rate0']['epic']:.3f} 8级={d['rate8']['epic']:.3f} 提升×{lift:.2f}")
    check("A6 luck=200 极端端点 EPIC 率 > 0.36（逼近上界 0.40，机制方向实证）",
          d["rate200"]["epic"] > 0.36, f"端点 {d['rate200']['epic']:.3f}")
    rare_lift = d["rate8"]["rare"] / max(d["rate0"]["rare"], 1e-9)
    check("A7 luck=8 RARE 率同步上升（×1.15 阈）", rare_lift >= 1.15, f"×{rare_lift:.2f}")
    return d


PROGRESS = {
    "unlockedLevel": 8,
    "completedLevels": [1, 2, 3, 4, 5, 6, 7],
    "storySeen": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "jadeSparks": 900,
    "heroUpgrades": {
        "attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0,
        "resonanceLevel": 0, "runeLevel": 0, "blessingLuckLevel": 0,
    },
    "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
    "levelStars": {"1": 3, "2": 3, "3": 2, "4": 3, "5": 3, "6": 2, "7": 1},
    "endlessBest": 45,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 1234,
}


def run_e2e():
    print("B. e2e 购买链（playwright + dev :3000）")
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.evaluate(
            "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))",
            PROGRESS,
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(900)

        # 主菜单 → 赋诗研习（墨阁）
        page.get_by_text("赋诗研习", exact=True).first.click()
        page.wait_for_timeout(700)

        body = page.inner_text("body")
        check("B1 「字诀精研」卡在场", "字诀精研" in body)
        check("B2 「祝福气运」卡在场", "祝福气运" in body)
        check("B3 两卡初始 Lv.0", body.count("Lv.0") >= 2, f"Lv.0 出现 {body.count('Lv.0')} 次")

        # 研习「字诀精研」
        rune_card = page.locator("div.panel-paper", has_text="字诀精研").first
        btn = rune_card.get_by_role("button")
        btn.click()
        page.wait_for_timeout(400)
        check("B4 字诀精研 Lv.0→1", "Lv.1" in rune_card.inner_text())
        # 灵玉 900 - 50（getUpgradeCost(0)=round(50*1.5^0)=50）
        check("B5 灵玉扣减 900→850", "850" in page.inner_text("body"))

        # 研习「祝福气运」
        luck_card = page.locator("div.panel-paper", has_text="祝福气运").first
        luck_card.get_by_role("button").click()
        page.wait_for_timeout(400)
        check("B6 祝福气运 Lv.0→1", "Lv.1" in luck_card.inner_text())

        # 持久化：reload 后新字段在档
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(900)
        saved = page.evaluate(
            "() => JSON.parse(localStorage.getItem('ink_and_steel_progress_v1') || '{}')"
        )
        hu = saved.get("heroUpgrades", {})
        check(
            "B7 新字段落档持久化",
            hu.get("runeLevel") == 1 and hu.get("blessingLuckLevel") == 1,
            f"rune={hu.get('runeLevel')} luck={hu.get('blessingLuckLevel')}",
        )
        check("B8 灵玉持久化 800", saved.get("jadeSparks") == 800, str(saved.get("jadeSparks")))

        # 冷却轨封顶语义不受影响（仍五层上限文案逻辑在场）
        page.get_by_text("赋诗研习", exact=True).first.click()
        page.wait_for_timeout(600)
        body2 = page.inner_text("body")
        check("B9 既有四卡在场（落墨剑气/丹青浩气/笔走龙蛇/君臣共鸣）",
              all(k in body2 for k in ("落墨剑气", "丹青浩气", "笔走龙蛇", "君臣共鸣")))
        browser.close()


def run_static_anchors():
    print("C. 静态源锚")
    bv = open("src/components/BattleView.tsx", encoding="utf-8").read()
    check("C1 castCharAbility 字诀精研乘算注入",
          "(match.powerMult + chainBonus)" in bv and "runeLevel ?? 0) * 0.10" in bv)
    check("C2 offerBlessings 加权抽取替换（pickBlessings + blessingLuckLevel）",
          "pickBlessings(\n      BLESSINGS,\n      3,\n      Math.random," in bv
          and "blessingLuckLevel ?? 0" in bv)
    check("C3 BattleView import pickBlessings", "from '../utils/blessingPick'" in bv)
    d1 = open("src/data/dailyTrial.ts", encoding="utf-8").read()
    check("C4 dailyTrial pickBlessings 接线（3 张 + luck 入参）",
          "pickBlessings(BLESSINGS, 3, rnd, blessingLuck)" in d1
          and "blessingLuck: number = 0" in d1)
    d2 = open("src/data/weeklyTrial.ts", encoding="utf-8").read()
    check("C5 weeklyTrial pickBlessings 接线（2 张 + luck 入参）",
          "pickBlessings(BLESSINGS, 2, rnd, blessingLuck)" in d2)
    cs = open("src/components/ChapterSelect.tsx", encoding="utf-8").read()
    check("C6 ChapterSelect 两调用点传 luck",
          cs.count("progress.heroUpgrades.blessingLuckLevel ?? 0") >= 2)
    ap = open("src/App.tsx", encoding="utf-8").read()
    check("C7 INITIAL_PROGRESS 新字段默认 0（旧档迁移兜底）",
          "runeLevel: 0" in ap and "blessingLuckLevel: 0" in ap)


def main():
    unit = run_unit_tests()
    if unit is None:
        print("纯函数段失败，终止")
        sys.exit(1)
    run_e2e()
    run_static_anchors()
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"\n==== verify_upgrade_tree: {len(results) - n_fail}/{len(results)} PASS ====")
    if console_errors:
        print("console/page errors:")
        for e in console_errors[:8]:
            print("  -", e[:200])
    sys.exit(1 if (n_fail or console_errors) else 0)


if __name__ == "__main__":
    main()
