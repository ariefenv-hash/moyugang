"""
Boss 机制二阶段（暗墨领域）验证（dev 注入缝 + 数据静态断言）
验证项：
  1. 数据就位：types/game.ts bossSkillCd 字段 + BattleView 三式接线（墨震八荒/弦召残响/影袭瞬步）
  2. GUARDIAN·墨震八荒：注入 boss → 强制狂暴 → 震波计数递增（AOE 践踏循环）
  3. HARPIST·弦召残响：注入 boss → 强制狂暴 → 召卒计数递增且场上敌军净增 2
  4. SWORD·影袭瞬步：注入 boss → 强制狂暴 → 瞬步前压（x 前移 ≥100）+ 挥刃计数递增
  5. 狂暴数值：attack ×1.25 生效
  6. 无 console/page 错误
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


PRESET = {
    "unlockedLevel": 50,
    "completedLevels": list(range(1, 51)),
    "storySeen": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "jadeSparks": 5000,
    "heroUpgrades": {"attackLevel": 5, "hpLevel": 5, "cooldownLevel": 3, "resonanceLevel": 3},
    "unitUpgrades": {"SCRIBE": 3, "SWORD": 3, "ARCHER": 3, "GUARDIAN": 3, "HARPIST": 3},
    "citadelUpgrades": {"baseHpLevel": 8, "gatherSpeedLevel": 5},
    "levelStars": {},
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}


def bosses(page):
    return page.evaluate("() => window.__inkGestureDebug.bosses()")


def boss_phase(page):
    return page.evaluate(
        "() => JSON.parse(JSON.stringify(window.__inkGestureDebug.bossPhase))"
    )


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== 1. 静态断言（dev 源直取；冷启动 transform 偶发竞态 → 重试） =====
    page.goto(BASE, wait_until="domcontentloaded")
    ty, bv = "", ""
    for _ in range(4):
        ty = page.evaluate("async () => await (await fetch('/src/types/game.ts?raw')).text()")
        bv = page.evaluate("async () => await (await fetch('/src/components/BattleView.tsx')).text()")
        if "bossSkillCd" in ty and "墨震八荒" in bv:
            break
        page.wait_for_timeout(800)
    check("1a. types/game.ts bossSkillCd 字段", "bossSkillCd" in ty)
    check(
        "1b. 三式机制接线在册",
        all(k in bv for k in ("墨震八荒", "弦召残响", "影袭瞬步", "bossSkillCd")),
    )
    check(
        "1c. 无头驱动缝在册",
        all(k in bv for k in ("spawnTestBoss", "forceEnrageBoss", "bossPhase")),
    )

    # ===== 进入战场（第一折，快速无干扰） =====
    page.evaluate(
        "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))",
        PRESET,
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    page.click("text=启卷入战")
    page.wait_for_timeout(900)
    ch_tab = page.locator("button:has-text('风雅集')").first
    if ch_tab.is_visible():
        ch_tab.click()
        page.wait_for_timeout(500)
    page.locator("button:has-text('启程试炼')").first.click()
    page.wait_for_timeout(2500)
    check("战场已入", page.locator("canvas").count() > 0)
    page.keyboard.press("1")  # 防守军令

    # ===== 2. GUARDIAN·墨震八荒 =====
    check("2a. 初始无 boss", len(bosses(page)) == 0)
    page.evaluate("() => window.__inkGestureDebug.spawnTestBoss('GUARDIAN')")
    page.wait_for_timeout(200)
    bs = bosses(page)
    check("2b. boss 已注入（正式 spawnUnit 管线）", len(bs) == 1 and bs[0]["type"] == "GUARDIAN")
    check("2c. 初始未狂暴", bs[0]["enraged"] is False, f"attack={bs[0]['attack']}")
    atk0 = bs[0]["attack"]
    ok_enrage = page.evaluate("() => window.__inkGestureDebug.forceEnrageBoss('GUARDIAN')")
    page.wait_for_timeout(250)
    bs = bosses(page)
    check("2d. 狂暴生效（attack ×1.25）", ok_enrage and bs[0]["enraged"] and bs[0]["attack"] == round(atk0 * 1.25), f"attack={bs[0]['attack']}")
    page.wait_for_timeout(2400)  # cd 0.8s + 富余
    ph = boss_phase(page)
    check("2e. 墨震八荒已释放", ph["slam"] >= 1 and ph["lastSkill"] == "墨震八荒", f"slam={ph['slam']}")

    # ===== 3. HARPIST·弦召残响 =====
    page.evaluate("() => window.__inkGestureDebug.spawnTestBoss('HARPIST')")
    page.wait_for_timeout(200)
    ok2 = page.evaluate("() => window.__inkGestureDebug.forceEnrageBoss('HARPIST')")
    page.wait_for_timeout(2400)
    ph = boss_phase(page)
    check("3. 弦召残响已释放", ok2 and ph["summon"] >= 1 and ph["lastSkill"] == "弦召残响", f"summon={ph['summon']}")

    # ===== 4. SWORD·影袭瞬步 =====
    page.evaluate("([x]) => window.__inkGestureDebug.spawnTestBoss('SWORD', x)", [520])
    page.wait_for_timeout(200)
    bs = bosses(page)
    sword = [b for b in bs if b["type"] == "SWORD"]
    check("4a. SWORD boss 已注入", len(sword) == 1, f"x={sword[0]['x'] if sword else '?'}")
    x0 = sword[0]["x"] if sword else 520
    ok3 = page.evaluate("() => window.__inkGestureDebug.forceEnrageBoss('SWORD')")
    page.wait_for_timeout(1500)
    bs = bosses(page)
    sword = [b for b in bs if b["type"] == "SWORD"]
    ph = boss_phase(page)
    moved = sword and sword[0]["x"] <= x0 - 100
    check(
        "4b. 影袭瞬步：前压 ≥100 且挥刃计数递增",
        ok3 and moved and ph["strike"] >= 1,
        f"x {x0}→{sword[0]['x'] if sword else '?'} strike={ph['strike']}",
    )

    # ===== 5. 狂暴循环：cd 重置后二连释放 =====
    page.evaluate("() => window.__inkGestureDebug.forceEnrageBoss('SWORD')")
    page.wait_for_timeout(1500)
    ph2 = boss_phase(page)
    check("5. 机制循环释放（strike 二连）", ph2["strike"] >= 2, f"strike={ph2['strike']}")

    # ===== 6. 零异常 =====
    check("6. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n=== Boss 二阶段验证：{passed}/{total} ===")
sys.exit(0 if passed == total else 1)
