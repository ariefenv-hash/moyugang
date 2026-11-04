#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_puppet_armor.py — 锁纹墨傀（PUPPET · Task 46 第二新敌兵种）无头验证

覆盖链路：
  A. 静态源锚（文件直读）：UnitType/UnitInstance 墨甲三字段/Projectile.source/
     PUPPET 数值配置/敌池 wave>=11/applyDamage 三源签名与透甲分支/弹体透传/
     QUILL+双 INK_BLADE ability 标记/重凝块/验证缝/canvas PUPPET case/playArmorBreak
  B. e2e（playwright + dev :3000，调试缝走真实 applyDamage 管线）：
     spawnPuppet → 甲满 150 → 弹体 50 承甲（甲 100 血不动）→ 近战 40 承甲
     （甲 60 血不动）→ 字诀 30 透甲（甲碎血 -30 + 凝甲倒计时 ≈6s）→
     六息重凝甲满 → 弹体 999（甲承 150 + 溢出 849 斩落）→ 尸检 null
  C. 全程零 console error / pageerror

用法：python3 scripts/verify_puppet_armor.py（需 dev server 已在 :3000）
"""
import io
import json
import sys
import time

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
    "heroUpgrades": {
        "attackLevel": 5,
        "hpLevel": 5,
        "cooldownLevel": 3,
        "resonanceLevel": 3,
        "runeLevel": 3,
        "blessingLuckLevel": 2,
    },
    "unitUpgrades": {"SCRIBE": 3, "SWORD": 3, "ARCHER": 3, "GUARDIAN": 3, "HARPIST": 3},
    "citadelUpgrades": {"baseHpLevel": 8, "gatherSpeedLevel": 5},
    "levelStars": {},
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}


def static_anchors():
    print("—— A 组 静态源锚 ——")
    rd = lambda p: io.open(p, encoding="utf-8").read()
    types_s = rd("src/types/game.ts")
    data_s = rd("src/data/gameData.ts")
    bv_s = rd("src/components/BattleView.tsx")
    cv_s = rd("src/utils/canvasRenderer.ts")
    au_s = rd("src/utils/audio.ts")

    check("A1 UnitType 收编 PUPPET", "'RUNECASTER' | 'PUPPET'" in types_s)
    check(
        "A2 UnitInstance 墨甲三字段",
        all(
            k in types_s
            for k in ("runeArmorHp?: number", "runeArmorMax?: number", "runeArmorRegenCd?: number")
        ),
    )
    check(
        "A3 Projectile.source 三源标记",
        "source?: 'melee' | 'projectile' | 'ability'" in types_s,
    )
    check(
        "A4 PUPPET 数值配置（锁纹墨傀 380/30/88·玄机遗铸）",
        all(
            k in data_s
            for k in ("PUPPET: {", "'锁纹墨傀'", "maxHp: 380", "attack: 30", "speed: 88", "'玄机遗铸'")
        ),
    )
    check(
        "A5 敌池 wave>=11 入池（RUNECASTER 9 波后顺延）",
        "if (waveNo >= 9) pool.push('RUNECASTER');" in bv_s
        and "if (waveNo >= 11) pool.push('PUPPET');" in bv_s,
    )
    check(
        "A6 applyDamage 三源签名 + 字诀透甲分支 + 甲承短路",
        all(
            k in bv_s
            for k in (
                "dmgSource: 'melee' | 'projectile' | 'ability' = 'melee'",
                "breakPuppetArmor(unit);",
                "text: '甲承',",
                "unit.type === 'PUPPET' && (unit.runeArmorHp ?? 0) > 0",
            )
        ),
    )
    check(
        "A7 弹体命中透传 proj.source（缺省 projectile）",
        "applyDamage(u, proj.damage, false, proj.x, proj.y, proj.source ?? 'projectile');" in bv_s,
    )
    check(
        "A8 字诀弹体标记 ×3（QUILL + 双 INK_BLADE：星辉/剑气逆寒/江河流波）",
        bv_s.count("source: 'ability',") == 3
        and "type: 'QUILL',\n          pierce: true,\n          source: 'ability'," in bv_s,
    )
    check(
        "A9 六息重凝块 + 甲碎演出（破印/金石铮鸣/金砂）",
        all(
            k in bv_s
            for k in ("锁纹墨甲重凝（Task 46）", "triggerSealStamp(u.x, u.y - 58, '破')", "sound.playArmorBreak()")
        ),
    )
    check(
        "A10 验证缝三件套（spawnPuppet/puppetStrike/puppetState）",
        all(k in bv_s for k in ("spawnPuppet", "puppetStrike", "puppetState")),
    )
    check("A11 canvas PUPPET 绘制 case（锁纹环+甲值弧+破甲芯闪）", "case 'PUPPET': {" in cv_s and "armorPct" in cv_s)
    check("A12 破甲专属音效 playArmorBreak", "public playArmorBreak()" in au_s)
    check(
        "A13 spawnUnit 入场覆甲（150×statScale 波次缩放）",
        "runeArmorMax: Math.round(150 * statScale)," in bv_s,
    )


def e2e():
    print("—— B 组 e2e（真实 applyDamage 管线） ——")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1024, "height": 768})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(BASE, wait_until="domcontentloaded")
        page.evaluate("(p) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(p))", PRESET)
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
        check("B0 战场已入", page.locator("canvas").count() > 0)
        page.keyboard.press("1")  # 防守军令：全军固守，防误伤试验体

        # B1 素体墨傀入场（x=2500 远离战团）
        ok = page.evaluate("() => window.__inkGestureDebug.spawnPuppet(2500)")
        page.wait_for_timeout(300)
        st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check(
            "B1 spawnPuppet 在场且满甲入场（甲=150=上限·血=380）",
            ok is True and st and st["armor"] == 150 and st["armorMax"] == 150 and st["hp"] == 380,
            json.dumps(st, ensure_ascii=False),
        )

        # B2 弹体 50：承甲（甲 100，血不动）
        page.evaluate("() => window.__inkGestureDebug.puppetStrike('projectile', 50)")
        st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check(
            "B2 弹体承甲（甲 150→100·血 380 不动·无凝甲倒计时）",
            st and st["armor"] == 100 and st["hp"] == 380 and st["regenCd"] == 0,
            json.dumps(st, ensure_ascii=False),
        )

        # B3 近战 40：承甲（甲 60，血不动）
        page.evaluate("() => window.__inkGestureDebug.puppetStrike('melee', 40)")
        st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check("B3 近战承甲（甲 100→60·血不动）", st and st["armor"] == 60 and st["hp"] == 380, json.dumps(st, ensure_ascii=False))

        # B4 字诀 30：透甲——甲即刻碎裂，伤害全额入体
        page.evaluate("() => window.__inkGestureDebug.puppetStrike('ability', 30)")
        st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check(
            "B4 字诀透甲（甲碎 0·血 380→350·凝甲倒计时 ≈6s）",
            st and st["armor"] == 0 and st["hp"] == 350 and 4.5 <= st["regenCd"] <= 6.01,
            json.dumps(st, ensure_ascii=False),
        )

        # B5 六息重凝：轮询至甲满（≤9s）
        regened = None
        t0 = time.time()
        while time.time() - t0 < 9.0:
            st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
            if st and st["armor"] == 150 and st["regenCd"] == 0:
                regened = time.time() - t0
                break
            time.sleep(0.4)
        check("B5 甲碎六息后重凝满甲（150/0 倒计时）", regened is not None, f"耗时 {regened and round(regened, 1)}s")

        # B6 弹体 999：甲承 150 后溢出 849 → 斩落（尸检为空）
        page.evaluate("() => window.__inkGestureDebug.puppetStrike('projectile', 999)")
        page.wait_for_timeout(400)
        st = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check("B6 溢出斩落（甲承 150 + 溢出入体 → 尸检 null）", st is None, json.dumps(st, ensure_ascii=False))

        # B7 spawnTestBoss 调试缝兼容 PUPPET（known 列表收编）
        ok2 = page.evaluate("() => window.__inkGestureDebug.spawnTestBoss('PUPPET', 2400)")
        page.wait_for_timeout(200)
        st2 = page.evaluate("() => window.__inkGestureDebug.puppetState()")
        check("B7 spawnTestBoss('PUPPET') 兼容（debug 缝 known 收编）", ok2 is True and st2 is not None)

        browser.close()


def main():
    static_anchors()
    e2e()
    print("—— C 组 零异常 ——")
    check("C1 全程零 console error / pageerror", len(console_errors) == 0, "; ".join(console_errors[:3]))

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n===== verify_puppet_armor: {passed}/{total} {'ALL PASS' if passed == total else 'FAIL'} =====")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
