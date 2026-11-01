"""
无尽试炼·波次里程碑横幅验证（预置全通关进度，Task 37）
验证项：
  1. 无尽境入场：迷津长夜章签可点 + 入夜坚守可入（复用 verify_endless_venues 预置）
  2. 负向检查：第 10 波之前不出现里程碑横幅（前 30s 无「无尽长卷」）
  3. 正向检查：第 10 波触发鎏金卷轴（MutationObserver 持久探针捕获瞬时横幅）
     - 波数标注「第 10 波」、词文「十波 · 初澜既平」
  4. 无 console/page 错误
说明：横幅存活 3s，轮询节奏可能错过 → 用 MutationObserver 首见即记录全文。
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
    "endlessBest": 9,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}

OBSERVER_JS = """
() => {
  window.__msText = null;
  window.__defeatSeen = false;
  window.__msWaves = [];
  const grab = () => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.children.length && d.innerText && d.innerText.includes('无尽长卷') && d.innerText.includes('波')
    );
    if (el) {
      window.__msText = el.innerText;
      const m = el.innerText.match(/第\\s*(\\d+)\\s*波/);
      if (m) window.__msWaves.push(m[1]);
    }
    if (!window.__defeatSeen && document.body.innerText.includes('坚守至第')) {
      window.__defeatSeen = true;
    }
  };
  const obs = new MutationObserver(grab);
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
}
"""

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

    # 入无尽：切回风雅集 → 迷津长夜章签 → 入夜坚守
    ch1_tab = page.locator("button:has-text('风雅集')").first
    if ch1_tab.is_visible():
        ch1_tab.click()
        page.wait_for_timeout(600)
    endless_chip = page.locator("button[title*='迷津长夜']").first
    chip_ok = endless_chip.is_visible()
    check("1a. 迷津长夜章签可见", chip_ok)
    if chip_ok:
        endless_chip.click()
        page.wait_for_timeout(400)
    enter_btn = page.locator("button:has-text('入夜坚守')").first
    enter_ok = enter_btn.is_visible()
    check("1b. 入夜坚守按钮可见", enter_ok)
    if not enter_ok:
        browser.close()
        print(f"\n===== 波次里程碑验证: {sum(1 for _, ok, _ in results if ok)}/{len(results)} PASS =====")
        sys.exit(1)
    enter_btn.click()
    page.wait_for_timeout(2500)
    check("1c. 无尽战场已入", page.locator("canvas").count() > 0)

    # 安装持久探针 + 防守军令
    page.evaluate(OBSERVER_JS)
    page.keyboard.press("1")

    # 负向检查：前 30s（第 1~2 波）无里程碑
    page.wait_for_timeout(30000)
    early_ms, early_wave = page.evaluate("() => [window.__msText, document.querySelector(\"[title='无尽试炼当前波次']\")?.innerText ?? '?']")
    check("2. 前期无里程碑误触", early_ms is None, f"30s 时波次={early_wave}")

    # 支援循环：轮询 HUD 波次至 ≥11，每轮先替玩家选祝福（弹窗期间战场凝滞，不选则永不推进）
    BLESSING_JS = """
    () => {
      const cards = [...document.querySelectorAll('button')].filter((b) => {
        const t = b.innerText || '';
        return t.includes('凡品') || t.includes('绝品') || t.includes('珍品') || t.includes('稀品');
      });
      if (!cards.length) return 0;
      // 偏防御：优先墨甲如山，否则首张
      const pick = cards.find((b) => (b.innerText || '').includes('墨甲')) || cards[0];
      pick.click();
      return 1;
    }
    """
    RECRUIT_JS = """
    () => {
      // 坦克优先：墨岩卫 → 抚竹射手 → 折柳剑客 → 采墨侍（有墨即补）
      for (const t of ['墨岩卫', '抚竹射手', '折柳剑客', '采墨侍']) {
        const b = [...document.querySelectorAll('button')].find((x) => (x.title || '').includes(t));
        if (b && !b.disabled) { b.click(); return t; }
      }
      return '';
    }
    """
    milestone_ok = False
    ms_text = None
    defeat_seen = False
    final_wave = "?"
    for i in range(46):
        wave_now, ms_t, df = page.evaluate(
            "() => [document.querySelector(\"[title='无尽试炼当前波次']\")?.innerText ?? '?', window.__msText, window.__defeatSeen]"
        )
        final_wave = wave_now
        print(f"    [poll {i:02d}] wave={wave_now} ms={bool(ms_t)} defeat={df}", flush=True)
        if ms_t:
            milestone_ok = True
            ms_text = ms_t
            break
        if df:
            defeat_seen = True
            break
        # 每轮先替玩家选祝福（凝滞解除才能推进波次），再每轮补兵（坦克优先）
        page.evaluate(BLESSING_JS)
        page.evaluate(RECRUIT_JS)
        # 主动作战：绝技 + 突斩 + 星雨 + 普攻（冷却/能量不足时游戏自动忽略）
        for k in ("r", "q", "e", "j", "j"):
            page.keyboard.press(k)
        page.wait_for_timeout(2600)

    check("3. 第 10 波里程碑触发", milestone_ok,
          f"末次波次={final_wave}" + ("，败局" if defeat_seen else ""))
    if milestone_ok:
        check("3a. 波数标注正确", "10" in (ms_text or ""), (ms_text or "")[:50].replace("\n", " / "))
        check("3b. 里程碑词文正确", "初澜既平" in (ms_text or ""), "十波 · 初澜既平")

    err_ok = len(console_errors) == 0
    check("4. 零 console/page 异常", err_ok, "" if err_ok else "; ".join(console_errors[:3]))

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 波次里程碑验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
