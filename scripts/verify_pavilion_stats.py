"""
文心殿通关率展示（Task 42）验证：战绩堂面板 + 每章折数进度
验证项：
  1. 预置 7 折通关（第一章全 5 折 + 第二章前 2 折）→ 战绩堂面板可见
  2. 通关率主行「14%」且主线进度「7 / 50 折」
  3. 通关率进度条宽度 = 14%
  4. 藏卷星数「17 / 150」（预置星级合计 17）
  5. 累计击破「1,234」（千分位格式化）
  6. 无尽最佳「45 波」
  7. 周试炼「本周已捷」（weeklyDone = 本周一）
  8. 第一章卷签「已入藏 · 5/5 折 · 可重温」；第二章折数细条宽度 = 40%
  9. 旧「殿外附藏」面板已被战绩堂收编（不再出现）
  10. 无 console / page 错误
"""
import sys
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

# 与 src/data/weeklyTrial.ts weekKey() 同算法：本周一（本地时区）
today = date.today()
monday = today - timedelta(days=today.weekday())
WEEK_STR = monday.isoformat()


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


PROGRESS = {
    "unlockedLevel": 8,
    "completedLevels": [1, 2, 3, 4, 5, 6, 7],
    "storySeen": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "jadeSparks": 900,
    "heroUpgrades": {"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0, "resonanceLevel": 0},
    "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
    "levelStars": {"1": 3, "2": 3, "3": 2, "4": 3, "5": 3, "6": 2, "7": 1},
    "endlessBest": 45,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 1234,
    "dailyDone": "2026-11-02",
    "dailyStreak": 3,
    "weeklyDone": WEEK_STR,
}


def bar_width(page, testid):
    el = page.locator(f'[data-testid="{testid}"] div[style*="width"]').first
    style = el.get_attribute("style") or ""
    for part in style.split(";"):
        part = part.strip()
        if part.startswith("width"):
            try:
                return float(part.split(":")[1].strip().replace("%", ""))
            except Exception:
                return -1.0
    return -1.0


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 预置进度 → 重载生效
    page.goto(BASE, wait_until="networkidle")
    page.evaluate(
        "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))", PROGRESS
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)

    # 主菜单直接进入文心殿·藏卷（主菜单 nav 即有入口，archiveOpen 已满足）
    page.click("text=文心殿·藏卷")
    page.wait_for_timeout(1200)

    # 1. 战绩堂面板可见
    hall = page.locator('[data-testid="stats-hall"]')
    check("战绩堂面板可见", hall.is_visible(timeout=3000))

    text = hall.inner_text() if hall.count() else ""
    # 2. 通关率 14% + 主线 7/50 折
    check("通关率「14%」", "14%" in text, f"got: {text[:60]!r}")
    import re

    m = re.search(r"7\s*/\s*50\s*折", text)
    check("主线进度「7 / 50 折」", bool(m))
    # 3. 通关率进度条宽度
    w = bar_width(page, "story-rate-bar")
    check("通关率进度条宽度=14%", abs(w - 14.0) < 0.5, f"got {w}%")
    # 4-7. 统计格
    check("藏卷星数「17 / 150」", "17 / 150" in text)
    check("累计击破「1,234」", "1,234" in text)
    check("无尽最佳「45 波」", "45 波" in text)
    check("周试炼「本周已捷」", "本周已捷" in text)
    # 8. 第一章卷签（已全折通关 → 已入藏）+ 第二章细条
    body_text = page.locator("body").inner_text()
    check("第一章卷签「已入藏 · 5/5 折 · 可重温」", "已入藏 · 5/5 折" in body_text)
    check("第二章卷签「已破 2/5 折 · 完卷后入藏」", "已破 2/5 折" in body_text)
    w2 = bar_width(page, "fold-bar-ch2")
    check("第二章折数细条宽度=40%", abs(w2 - 40.0) < 0.5, f"got {w2}%")
    w10 = bar_width(page, "fold-bar-ch10")
    check("第十章折数细条宽度=0%", abs(w10) < 0.5, f"got {w10}%")
    # 9. 旧殿外附藏已移除
    check("旧「殿外附藏」面板已收编", "殿外附藏" not in page.locator("body").inner_text())
    # 10. 零错误
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("零 console/page 错误", len(real_errors) == 0, f"{real_errors[:2]}")

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n总计 {len(results)} 项：{len(results) - len(fails)} PASS / {len(fails)} FAIL")
sys.exit(1 if fails else 0)
