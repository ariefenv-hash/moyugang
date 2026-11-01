"""诊断：无尽战场凝滞时刻的页面状态（截屏 + 覆盖层文本 + 按钮清单）"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
PRESET = {
    "unlockedLevel": 50,
    "completedLevels": list(range(1, 51)),
    "storySeen": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "jadeSparks": 5000,
    "heroUpgrades": {"attackLevel": 3, "hpLevel": 3, "cooldownLevel": 2, "resonanceLevel": 2},
    "unitUpgrades": {"SCRIBE": 2, "SWORD": 2, "ARCHER": 1, "GUARDIAN": 1, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 5, "gatherSpeedLevel": 5},
    "levelStars": {},
    "endlessBest": 9,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))", PRESET)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.click("text=启卷入战")
    page.wait_for_timeout(1500)
    tab = page.locator("button:has-text('风雅集')").first
    if tab.is_visible():
        tab.click()
        page.wait_for_timeout(600)
    page.locator("button[title*='迷津长夜']").first.click()
    page.wait_for_timeout(400)
    page.locator("button:has-text('入夜坚守')").first.click()
    page.wait_for_timeout(45000)  # 等到凝滞发生（第 2 波祝福应在 30s 内出现）

    page.screenshot(path="/tmp/stall.png")
    state = page.evaluate(
        """
        () => {
          const btns = [...document.querySelectorAll('button')].map((b) => ({
            title: b.title || '', text: (b.innerText || '').slice(0, 24),
            visible: !!(b.offsetWidth || b.offsetHeight),
          }));
          const overlays = [...document.querySelectorAll('div')]
            .filter((d) => d.innerText && d.innerText.length > 6 && d.children.length > 0
              && getComputedStyle(d).position === 'fixed')
            .slice(0, 8)
            .map((d) => (d.innerText || '').slice(0, 120));
          return {
            hasBlessText: document.body.innerText.includes('墨灵祝福'),
            hasMilestone: document.body.innerText.includes('无尽长卷'),
            hudWave: document.querySelector("[title='无尽试炼当前波次']")?.innerText ?? '?',
            overlays, btnCount: btns.length,
            visibleBtns: btns.filter((b) => b.visible && (b.title || b.text)).slice(0, 24),
          };
        }
        """
    )
    for k, v in state.items():
        print(f"{k}: {v}")
    browser.close()
