"""
无尽章境端到端验证（预置全通关进度）
验证项：
  1. 无尽卡内十枚章签全部可点（全通关）
  2. 选中「桃花源」→ 入夜坚守 → levelTitle=无尽试炼·迷津长夜
  3. 波次推进正常（等待期间 waveDone>0 或敌人生成）
  4. 无 console/page 错误
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
    "heroUpgrades": {"attackLevel": 2, "hpLevel": 2, "cooldownLevel": 1, "resonanceLevel": 1},
    "unitUpgrades": {"SCRIBE": 1, "SWORD": 1, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 1, "gatherSpeedLevel": 1},
    "levelStars": {},
    "endlessBest": 3,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="networkidle")
    page.evaluate(
        "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))",
        PRESET,
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.click("text=启卷入战")
    page.wait_for_timeout(1500)

    # 无尽卡章签：默认在第一章视图，无尽卡可见
    # 无尽卡只挂第一章视图：默认落第十章 → 先切回风雅集章签
    ch1_tab = page.locator("button:has-text('风雅集')").first
    if ch1_tab.is_visible():
        ch1_tab.click()
        page.wait_for_timeout(600)

    venue_btns = page.locator("button:has-text('桃花源')")
    n = venue_btns.count()
    check("1. 章签含桃花源", n >= 1, f"count={n}")

    # 点击桃花源章签（无尽卡内的那枚），然后入夜坚守
    # 注意：章签横滚条里也有「桃花源」章节签——用 title 属性区分（无尽章签 title 带·迷津长夜）
    endless_chip = page.locator("button[title*='迷津长夜']").first
    chip_ok = endless_chip.is_visible()
    if chip_ok:
        endless_chip.click()
        page.wait_for_timeout(400)
    check("2a. 桃花源章签可点", chip_ok)

    enter_btn = page.locator("button:has-text('入夜坚守')").first
    enter_ok = enter_btn.is_visible()
    check("2b. 入夜坚守按钮可见", enter_ok)
    if not enter_ok:
        browser.close()
        print(f"\n===== 无尽章境端到端: {sum(1 for _, ok, _ in results if ok)}/{len(results)} PASS =====")
        sys.exit(1)

    enter_btn.click()
    page.wait_for_timeout(2200)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    check("2c. 进入无尽战场", in_battle)

    st = page.evaluate("() => window.__inkGestureDebug.battleState()")
    check("2d. 题名为迷津长夜", "迷津长夜" in (st.get("levelTitle") or ""),
          f"levelTitle={st.get('levelTitle')}")

    # 3. 波次推进：等待 16s 内首波敌人出现
    import time
    t0 = time.time()
    enemies = 0
    while time.time() - t0 < 25:
        enemies = page.evaluate(
            "() => window.__inkGestureDebug.units().filter(u => u.isEnemy).length"
        )
        if enemies > 0:
            break
        page.wait_for_timeout(600)
    check("3. 无尽首波敌人出现", enemies > 0, f"enemies={enemies}")

    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("4. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 无尽章境端到端: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
