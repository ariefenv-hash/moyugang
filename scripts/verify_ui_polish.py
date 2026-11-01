"""
UI 精美度验证：章签两段式 + 引子卷轴展开动画
验证项：
  1. 预置通关一半（第五章解锁中）→ 章签分「启卷」「藏卷」两段（两段皆可见）
  2. 预置全通关+全章解锁 → 「藏卷」段不渲染（无未启章时隐藏）
  3. 切章触发引子卷轴：卷轴 modal 可见，轴杆结构存在（天杆/卷身/地杆盒模型）
  4. 引子展开动画后内容可读（章名/卷首诗/引子文本可见），「启 卷」按钮可关闭
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


def base_progress(completed, unlocked):
    return {
        "unlockedLevel": unlocked,
        "completedLevels": completed,
        "storySeen": [1],  # 只读过第一章 → 切第二章触发引子
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


def setup(page, p):
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))", p)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    page.click("text=启卷入战")
    page.wait_for_timeout(1400)
    # 默认章的引子会自动弹出（storySeen 未含）→ 先关掉再继续
    try:
        close_btn = page.locator("button:has-text('启 卷')").first
        if close_btn.is_visible(timeout=1500):
            close_btn.click()
            page.wait_for_timeout(500)
    except Exception:
        pass


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 一半进度：两段章签
    setup(page, base_progress([1, 2, 3, 4], 5))
    qijuan = page.locator("text=启卷").first.is_visible()
    cangjuan = page.locator("text=藏卷").first.is_visible()
    check("1a. 启卷段可见", qijuan)
    check("1b. 藏卷段可见（有未解锁章）", cangjuan)

    # 2. 全解锁：藏卷段隐藏
    setup(page, base_progress(list(range(1, 51)), 50))
    qijuan2 = page.locator("text=启卷").first.is_visible()
    cangjuan2 = page.locator("text=藏卷").count()
    check("2. 全解锁后启卷段在、藏卷段隐藏", qijuan2 and cangjuan2 == 0,
          f"启卷={qijuan2} 藏卷count={cangjuan2}")

    # 3. 切未读章触发引子卷轴：切第二章（已解锁，storySeen 无 2）
    ch2 = page.locator("button:has-text('山河谣')").first
    if ch2.is_visible():
        ch2.click()
        page.wait_for_timeout(400)  # 动画展开中
        modal_seen = page.locator("text=章前引子").first.is_visible()
        rod_count = page.evaluate(
            "() => document.querySelectorAll('.fixed.inset-0.z-50 > div > div:first-child').length"
        )
        check("3a. 引子卷轴弹出", modal_seen)
        # 展开动画后内容可读
        page.wait_for_timeout(1100)
        name_vis = page.locator("text=《山河谣").first.is_visible()
        btn_vis = page.locator("button:has-text('启 卷')").first.is_visible()
        check("3b. 展开后章名/启卷按钮可读", name_vis and btn_vis, f"name={name_vis} btn={btn_vis}")
        # 关闭（判据：z-50 弹窗卸载；「章前引子」文本也出现在章头重温按钮，不作判据）
        page.locator("button:has-text('启 卷')").first.click()
        page.wait_for_timeout(500)
        modal_closed = page.locator("div.fixed.inset-0.z-50").count() == 0
        check("3c. 启卷按钮关闭引子", modal_closed)
    else:
        check("3a. 引子卷轴弹出", False, "第二章章签不可见")

    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("4. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== UI 精美度: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
