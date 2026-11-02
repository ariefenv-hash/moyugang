"""
周试炼端到端验证（Task 38）
验证项：
  A. 锁定态：仅通关 1 折（未破首领折）→ 周试炼卡呈锁定文案「先破一魁」；每日卡同屏可见（对照）
  B. 解锁态：预置通关 1-5 折 → 周试炼卡可见（周魁问锋 + 本周周键）+ 隐藏载体 data-weekly-level-id
  C. 应召问锋 → 进入战斗，HUD 显示「周魁问锋」（本周词境：第肆折「流水落花」）
  D. 开局两祝福静默生效（HUD ≥2 个祝福徽记）
  E. 词缀系数生效：首波 SWORD attack ≈ 26×1.344=35，maxHp ≈ 240×1.12=269（±1 容差）
  F. 无 console/page 错误
说明：沙箱为 UTC 时区，浏览器内 weekKey()=本周一（UTC 周一）；本周（2026-10-26 起）答卷为
      词境 id=4「流水落花」，词缀 墨煞蚀锋+烽火连宵+山雨欲来 → atk=1.344 / hp=1.12。
      周一 UTC 换卷后如遇答卷变化，E 组期望需按数据层脚本输出同步。
前置：bun run dev 已在 3000 端口
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


PRESET_LOCKED = {
    "unlockedLevel": 2,
    "completedLevels": [1],
    "storySeen": [1, 2],
    "jadeSparks": 300,
    "heroUpgrades": {"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0, "resonanceLevel": 0},
    "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
    "levelStars": {"1": 2},
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 12,
}

PRESET_UNLOCKED = {
    "unlockedLevel": 6,
    "completedLevels": [1, 2, 3, 4, 5],
    "storySeen": [1, 2, 3, 4, 5, 6],
    "jadeSparks": 800,
    "heroUpgrades": {"attackLevel": 2, "hpLevel": 2, "cooldownLevel": 1, "resonanceLevel": 1},
    "unitUpgrades": {"SCRIBE": 1, "SWORD": 1, "ARCHER": 1, "GUARDIAN": 1, "HARPIST": 1},
    "citadelUpgrades": {"baseHpLevel": 1, "gatherSpeedLevel": 1},
    "levelStars": {"1": 3, "4": 2},
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 120,
}


def goto_select(page, preset):
    page.goto(BASE, wait_until="networkidle")
    page.evaluate(
        "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))",
        preset,
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.click("text=启卷入战")
    page.wait_for_timeout(1500)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== A. 锁定态 =====
    goto_select(page, PRESET_LOCKED)
    weekly_label = page.locator("text=周魁问锋").first
    check("A1. 锁定态周试炼卡可见（标题在）", weekly_label.is_visible())
    locked_hint = page.locator("text=先破一魁")
    check("A2. 锁定文案「先破一魁」", locked_hint.count() > 0)
    check("A3. 无「应召问锋」按钮", page.locator("button:has-text('应召问锋')").count() == 0)
    daily_btn = page.locator("button:has-text('接卷问战')")
    check("A4. 每日卡同屏可接卷（对照）", daily_btn.count() > 0)

    # ===== B. 解锁态 =====
    goto_select(page, PRESET_UNLOCKED)
    check("B1. 周试炼卡可见", page.locator("text=周魁问锋").first.is_visible())
    # 周词境按周键播种（周一零点换卷）→ 从源码动态复算本周词境名，消除日期脆弱
    import subprocess, json as _json
    _wk = subprocess.run(
        ["npx", "tsx", "-e",
         "import { getWeeklyTrialInfo } from './src/data/weeklyTrial';"
         "const info = getWeeklyTrialInfo();"
         "const cfg: any = { enemyAtkMult: 1, enemyHpMult: 1, initialInkMult: 1, waveIntervalMult: 1, playerBaseHpMult: 1 };"
         "for (const m of info.modifiers) m.apply(cfg);"
         "console.log(JSON.stringify({ title: info.sourceTitle, atk: cfg.enemyAtkMult, hp: cfg.enemyHpMult, mods: info.modifiers.map((m: any) => m.name) }));"],
        capture_output=True, text=True, timeout=60, cwd=".")
    WK = _json.loads(_wk.stdout.strip().splitlines()[-1]) if _wk.returncode == 0 else {"title": "", "atk": 1.0, "hp": 1.0}
    check(f"B2. 词境展示「{WK['title']}」（本周播种）", WK["title"] and page.locator(f"text={WK['title']}").count() > 0,
          f"本周词缀 {WK.get('mods')}")
    check("B3. 赏格 +420 灵玉", page.locator("text=420").count() > 0)
    carrier = page.locator("[data-weekly-level-id='997']")
    check("B4. 隐藏载体 data-weekly-level-id=997", carrier.count() == 1)

    # ===== C. 应召问锋 → 进入战斗 =====
    weekly_btn = page.locator("button:has-text('应召问锋')")
    check("C1. 应召问锋按钮可见", weekly_btn.is_visible())
    weekly_btn.click()
    page.wait_for_timeout(2500)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    check("C2. 进入战斗", in_battle)

    st = page.evaluate("() => window.__inkGestureDebug.battleState()")
    check("C3. HUD 显示周魁问锋", "周魁问锋" in (st.get("levelTitle") or ""),
          f"levelTitle={st.get('levelTitle')}")

    # ===== D. 开局两祝福生效 =====
    page.wait_for_timeout(800)
    bless_count = page.locator("text=×1").count()
    check("D1. 开局两祝福生效（HUD ≥2 祝福徽记）", bless_count >= 2, f"count={bless_count}")

    # ===== E. 词缀系数：首波 SWORD（8s 出兵） =====
    t0 = time.time()
    mults = []
    while time.time() - t0 < 40:
        mults = page.evaluate(
            "() => window.__inkGestureDebug.units().filter(u => u.isEnemy).map(u => ({type: u.type, attack: u.attack, maxHp: u.maxHp}))"
        )
        swords = [u for u in mults if u["type"] == "SWORD"]
        if swords:
            mults = swords
            break
        page.wait_for_timeout(600)
    # 期望：SWORD attack 26×atkMult；maxHp 240×hpMult（容差±1，词缀按周键播种动态复算）
    if mults:
        sample = mults[0]
        atk_exp = round(26 * WK["atk"])
        hp_exp = round(240 * WK["hp"])
        atk_ok = abs(sample["attack"] - atk_exp) <= 1
        hp_ok = abs(sample["maxHp"] - hp_exp) <= 1
        check(f"E1. 敌军攻击带周词缀系数（26×{WK['atk']}≈{atk_exp}）", atk_ok,
              f"attack={sample["attack"]}")
        check(f"E2. 敌军气血带周词缀系数（240×{WK['hp']}≈{hp_exp}）", hp_ok,
              f"maxHp={sample["maxHp"]}")
    else:
        check("E1. 敌军攻击带周词缀系数", False, "40s 内无 SWORD 出现")
        check("E2. 敌军气血带周词缀系数", False, "40s 内无 SWORD 出现")

    # ===== F. 无 console 错误 =====
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("F1. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 周试炼端到端: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
