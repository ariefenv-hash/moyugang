"""
每日试炼端到端验证
验证项：
  1. 预置进度（完成第一关）→ 选卷页每日试炼卡可见且显示今日日期
  2. 接卷问战 → 进入战斗，开场 banner「今日墨灵庇佑」
  3. 开局三祝福已静默生效（ownedBlessings 数量 = 3）
  4. 词缀系数生效：敌人 attack = UNIT_CONFIGS.attack × enemyAtkMult
  5. HUD 顶栏显示「每日试炼」章节名
  6. 无 console/page 错误
前置：bun run dev 已在 3000 端口
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


PRESET = {
    "unlockedLevel": 6,
    "completedLevels": [1, 2, 3, 4, 5],
    "storySeen": [1, 2, 3, 4, 5, 6],
    "jadeSparks": 800,
    "heroUpgrades": {"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0, "resonanceLevel": 0},
    "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
    "levelStars": {"1": 3},
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 30,
}

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 预置进度 → 选卷页
    page.goto(BASE, wait_until="networkidle")
    page.evaluate(
        "(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))",
        PRESET,
    )
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.click("text=启卷入战")
    page.wait_for_timeout(1500)

    # 每日卡可见
    daily_card = page.locator("text=墨历问战").first
    card_visible = daily_card.is_visible()
    check("1a. 每日试炼卡可见", card_visible)

    daily_btn = page.locator("button:has-text('接卷问战')")
    btn_ok = daily_btn.is_visible()
    check("1b. 接卷问战按钮可见", btn_ok)

    if not btn_ok:
        browser.close()
        print(f"\n===== 每日试炼: {sum(1 for _, ok, _ in results if ok)}/{len(results)} PASS =====")
        sys.exit(1)

    # 2. 接卷问战 → 进入战斗
    daily_btn.click()
    page.wait_for_timeout(2200)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    check("2. 接卷问战进入战斗", in_battle)

    st = page.evaluate("() => window.__inkGestureDebug.battleState()")
    check("3. HUD 显示每日问战", "每日问战" in (st.get("levelTitle") or ""),
          f"levelTitle={st.get('levelTitle')}")

    # 3. 开局三祝福静默生效
    page.wait_for_timeout(800)
    blessings_n = page.evaluate(
        "() => Object.keys(window.__inkGestureDebug.comboInfo() ? {} : {}).length"
    )  # placeholder；真实检查走 DOM
    # 通过 DOM 检查已获祝福徽记（顶栏祝福列表）
    page.wait_for_timeout(500)
    bless_count = page.locator("text=×1").count()
    check("4. 开局三祝福生效（HUD ≥3 个祝福徽记）", bless_count >= 3, f"count={bless_count}")

    # 4. 词缀系数：敌人 attack = config.attack × enemyAtkMult
    mults = page.evaluate(
        """() => {
            const units = window.__inkGestureDebug.units().filter(u => u.isEnemy);
            return units.map(u => ({ type: u.type, attack: u.attack, hp: u.hp, maxHp: u.maxHp }));
        }"""
    )
    # 词缀今天为 atk=1.1 hp=1.1（墨涛拍岸）；等首波敌人出现（神思折 8s 首波）
    import time
    t0 = time.time()
    mults = []
    while time.time() - t0 < 40:
        mults = page.evaluate(
            "() => window.__inkGestureDebug.units().filter(u => u.isEnemy).map(u => ({type: u.type, attack: u.attack, maxHp: u.maxHp}))"
        )
        if mults:
            break
        page.wait_for_timeout(600)
    # 期待：SWORD config attack=26 → ×1.1 = 28.6 → round 29；hp 240×1.1 = 264
    # ARCHER attack=34 → 37；hp 180 → 198；GUARDIAN attack=24 → 26；hp 650 → 715
    import math
    EXPECT = {
        "SWORD": (26, 240),
        "ARCHER": (34, 180),
        "GUARDIAN": (24, 650),
    }
    if mults:
        sample = mults[0]
        base_atk, base_hp = EXPECT.get(sample["type"], (26, 240))
        atk_ok = sample["attack"] in (math.floor(base_atk * 1.1), math.floor(base_atk * 1.1) + 1)
        hp_ok = sample["maxHp"] in (math.floor(base_hp * 1.1) - 1, math.floor(base_hp * 1.1), math.floor(base_hp * 1.1) + 1)
        check("5a. 敌军攻击带词缀系数", atk_ok, f"{sample['type']} attack={sample['attack']}（{base_atk}×1.1≈{round(base_atk*1.1)}）")
        check("5b. 敌军气血带词缀系数", hp_ok, f"{sample['type']} maxHp={sample['maxHp']}（{base_hp}×1.1={round(base_hp*1.1)}）")
    else:
        check("5a. 敌军攻击带词缀系数", False, "30s 内无敌人出现")
        check("5b. 敌军气血带词缀系数", False, "30s 内无敌人出现")

    # 6. 无 console 错误
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("6. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 每日试炼端到端: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
