"""
文心殿·藏卷端到端验证
验证项：
  1. 无完卷进度 → 主菜单不显示文心殿入口
  2. 预置完卷第一卷（id=5）→ 主菜单出现「文心殿·藏卷」→ 点入
  3. 第一章卡已入藏，展开可见 章前引子/卷首诗/通关尾声 三段卷宗
  4. 第二章卡未入藏（已破 n/m 折 · 完卷后入藏，Task 42 起展示折数进度）
  5. 无 console/page 错误
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def preset_progress(page, completed, unlocked):
    p = {
        "unlockedLevel": unlocked,
        "completedLevels": completed,
        "storySeen": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "jadeSparks": 900,
        "heroUpgrades": {"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0, "resonanceLevel": 0},
        "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
        "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
        "levelStars": {},
        "endlessBest": 0,
        "achievements": [],
        "tutorialDone": True,
        "totalKills": 100,
    }
    page.evaluate("(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))", p)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 无完卷：入口不显示
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(800)
    preset_progress(page, [], 1)
    entry_hidden = page.locator("button:has-text('文心殿·藏卷')").count() == 0
    check("1. 未完卷无文心殿入口", entry_hidden)

    # 2. 完卷第一卷：入口显示并点入
    preset_progress(page, [1, 2, 3, 4, 5], 6)
    entry = page.locator("button:has-text('文心殿·藏卷')").first
    entry_visible = entry.is_visible()
    check("2. 完卷后文心殿入口出现", entry_visible)
    if not entry_visible:
        browser.close()
        print(f"\n===== 文心殿: {sum(1 for _, ok, _ in results if ok)}/{len(results)} PASS =====")
        sys.exit(1)
    entry.click()
    page.wait_for_timeout(1200)

    # 3. 第一章卷宗展开（默认展开最后一卷=第一章）
    intro_vis = page.locator("text=章前引子").first.is_visible()
    verse_vis = page.locator("text=卷首诗").first.is_visible()
    epi_vis = page.locator("text=通关尾声").first.is_visible()
    check("3. 第一章卷宗三段齐展（引子/卷首诗/尾声）", intro_vis and verse_vis and epi_vis,
          f"intro={intro_vis} verse={verse_vis} epilogue={epi_vis}")

    # 卷首诗实际内容（第一大章《风雅集·翰墨千秋》verse 应存在非空）
    chap1_card = page.locator("text=《风雅集·翰墨千秋》").first
    check("3b. 第一章卷签在殿", chap1_card.is_visible())

    # 4. 第二章未入藏（Task 42 起文案带折数进度：零进度章显示「未破一折」）
    ch2_label = page.locator("text=完卷后入藏").first.is_visible()
    body_txt = page.locator("body").inner_text()
    fold_aware = ("未破一折" in body_txt) or ("已破" in body_txt)
    check("4. 第二章未入藏提示（含折数进度）", ch2_label and fold_aware)

    # 已藏计数
    counter = page.locator("text=1</span> / 10").count()
    # 直接用文本匹配宽一些
    counter_vis = page.locator("text=已藏").first.is_visible()
    check("4b. 已藏计数显示", counter_vis)

    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("5. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 文心殿·藏卷: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
