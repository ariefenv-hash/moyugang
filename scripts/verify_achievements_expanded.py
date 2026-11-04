#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_achievements_expanded.py — 修行线成就扩展（Task 45）无头验证

覆盖链路：
  A. 静态源锚：ACHIEVEMENTS 37 方 / 10 新 id 在册 / checkProgressAchievements
     函数与 useEffect 触发在 App.tsx / 六线鼎盛条件含 Task 44 双新线
  B. e2e 高值预置：dailyStreak=8 / runeLevel=6 / luck=6 / totalKills=25000 /
     endlessBest=45 / 六线 3+ → reload 即全解锁（10/10）→ 成就 modal
     计数 37/37 → 持久化入档
  C. e2e 低值边界：全零预置 → 零新解锁（防误发）
  D. e2e progress 驱动即时解锁：墨阁购买字诀精研至 Lv3（不出战斗）→
     rune_adept 即时入档（检查器挂 progress effect 的核心实证）
  E. 全程零 console error / pageerror

用法：python3 scripts/verify_achievements_expanded.py（需 dev :3000）
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

NEW_IDS = [
    "daily_streak_3", "daily_streak_7",
    "rune_adept", "rune_master",
    "blessing_charm", "blessing_fortune",
    "kills_5000", "kills_20000",
    "endless_40", "upgrade_zenith",
]


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def make_progress(**over):
    base = {
        "unlockedLevel": 8,
        "completedLevels": [1, 2, 3, 4, 5, 6, 7],
        "storySeen": [1, 2, 3],
        "jadeSparks": 900,
        "heroUpgrades": {
            "attackLevel": 3, "hpLevel": 3, "cooldownLevel": 3,
            "resonanceLevel": 3, "runeLevel": 6, "blessingLuckLevel": 6,
        },
        "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
        "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
        "levelStars": {"1": 3, "2": 3, "3": 2},
        "endlessBest": 45,
        "achievements": [],
        "tutorialDone": True,
        "totalKills": 25000,
        "dailyStreak": 8,
    }
    base.update(over)
    return base


def set_progress(page, p):
    page.evaluate(
        "(v) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(v))", p
    )


def read_saved(page):
    return page.evaluate(
        "() => JSON.parse(localStorage.getItem('ink_and_steel_progress_v1') || '{}')"
    )


def open_achievements(page):
    page.get_by_text("文心宝箓", exact=False).first.click()
    page.wait_for_timeout(500)


def run_static():
    print("A. 静态源锚")
    gd = open("src/data/gameData.ts", encoding="utf-8").read()
    seg = gd[gd.index("export const ACHIEVEMENTS"):gd.index("];", gd.index("export const ACHIEVEMENTS"))]
    n = seg.count("{ id: '")
    check("A1 ACHIEVEMENTS 共 37 方", n == 37, f"实测 {n}")
    missing = [i for i in NEW_IDS if f"'{i}'" not in seg]
    check("A2 十枚新成就 id 在册", not missing, str(missing))
    ap = open("src/App.tsx", encoding="utf-8").read()
    check("A3 checkProgressAchievements 在册", "function checkProgressAchievements" in ap)
    check("A4 useEffect progress 驱动触发在册",
          "const newly = checkProgressAchievements(progress);" in ap
          and "}, [progress]);" in ap)
    check("A5 鼎盛条件含 Task 44 双新线",
          "runeLv >= 3" in ap and "luckLv >= 3" in ap
          and ap.count(">= 3") >= 6)
    check("A6 dailyStreak/totalKills/endlessBest 三字段消费",
          "progress.dailyStreak ?? 0) >= 3" in ap
          and "progress.totalKills >= 5000" in ap
          and "progress.endlessBest >= 40" in ap)


def run_e2e_high(page):
    print("B. e2e 高值预置 → 全解锁")
    set_progress(page, make_progress())
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    saved = read_saved(page)
    got = set(saved.get("achievements", []))
    missing = [i for i in NEW_IDS if i not in got]
    check("B1 reload 即全解锁（10/10 progress 驱动）", not missing, str(missing))
    open_achievements(page)
    body = page.inner_text("body")
    check("B2 modal 计数 37", "37" in body, "文心宝箓 37 方")
    names = ["七日不辍", "入木三分", "鸿运当头", "荡涤墨浊", "长夜孤灯", "墨阁鼎盛"]
    absent = [n for n in names if n not in body]
    check("B3 新成就名面上可见", not absent, str(absent))
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def run_e2e_low(page):
    print("C. e2e 低值边界 → 零误发")
    set_progress(page, make_progress(
        heroUpgrades={"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0,
                      "resonanceLevel": 0, "runeLevel": 0, "blessingLuckLevel": 0},
        totalKills=0, endlessBest=0, dailyStreak=0, jadeSparks=900))
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    saved = read_saved(page)
    got = set(saved.get("achievements", []))
    leaked = [i for i in NEW_IDS if i in got]
    check("C1 低值零新解锁", not leaked, str(leaked))


def run_e2e_instant(page):
    print("D. e2e 墨阁购买 → 即时解锁（progress 驱动核心实证）")
    # 断言已清（C 段 reload 后账面干净），直接从当前页进墨阁
    body = page.inner_text("body")
    if "赋诗研习" not in body:
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(700)
    page.get_by_text("赋诗研习", exact=True).first.click()
    page.wait_for_timeout(700)
    rune_card = page.locator("div.panel-paper", has_text="字诀精研").first
    for _ in range(3):  # Lv0 → 3：50+75+113=238 灵玉（900 充足）
        rune_card.get_by_role("button").click()
        page.wait_for_timeout(280)
    page.wait_for_timeout(600)  # effect 触发与入档窗口
    saved = read_saved(page)
    hu = saved.get("heroUpgrades", {})
    check("D1 字诀精研 Lv3 落档", hu.get("runeLevel") == 3, str(hu.get("runeLevel")))
    check("D2 rune_adept 即时入档（不出战斗）", "rune_adept" in saved.get("achievements", []),
          str(saved.get("achievements", [])))
    new_only = [i for i in NEW_IDS if i in saved.get("achievements", [])]
    check("D3 仅解锁 rune_adept 一枚（无批量误发）", new_only == ["rune_adept"], str(new_only))


def main():
    run_static()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(600)
        run_e2e_high(page)
        run_e2e_low(page)
        run_e2e_instant(page)
        browser.close()
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"\n==== verify_achievements_expanded: {len(results) - n_fail}/{len(results)} PASS ====")
    if console_errors:
        print("console/page errors:")
        for e in console_errors[:8]:
            print("  -", e[:200])
    sys.exit(1 if (n_fail or console_errors) else 0)


if __name__ == "__main__":
    main()
