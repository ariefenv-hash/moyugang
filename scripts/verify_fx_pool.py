# -*- coding: utf-8 -*-
"""
次级对象池（Task 43）验证：剑气轨迹/特效环池化（dev 注入缝 + 静态接线断言）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  1. 静态接线：canvasRenderer.ts 池化在册（SwordTrailSample/FxRing/FX_FREE_CAP/
     acquireSwordTrail/acquireFxRing/releaseSwordTrail/releaseFxRing/fxPoolStats）
     + 五处生成点字面量直推归零（fxRings.push{/swordTrail.push{ ）
     + stepFX 死亡归还 + 溢出归还 + BattleView 无头缝在册
  2. 动态生发：预置 high 画质（无头 detectLowEndDevice 恒低配，行云会跳过轨迹采样）
     → 实战数手横划突刺 → trailAcquired>0 且 ringAcquired>0
  3. 池化收益：首批对象死亡后 → released>0 且 reused>0（两池复用率>0）
  4. 帽遵守：trailLive≤40 且 ringLive≤40
  5. 无 console/page 错误
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

# 本地源（类型接口等 type-only 符号会被 vite/esbuild 转译剥离，查本地文件）
with open(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "utils", "canvasRenderer.ts"),
    encoding="utf-8",
) as f:
    local_src = f.read()


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


def flick_dash(page, cx, cy):
    """横划突刺：行止区中心左→右快划（与生产冒烟 P4 同法），出招时溅起轨迹/尘环。"""
    page.mouse.move(cx - 160, cy)
    page.mouse.down()
    page.mouse.move(cx + 160, cy, steps=5)
    page.mouse.up()
    page.wait_for_timeout(60)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== 1. 静态接线断言（dev 源直取；冷启动 transform 偶发竞态 → 重试） =====
    page.goto(BASE, wait_until="domcontentloaded")
    cr_src = ""
    for _ in range(4):
        cr_src = page.evaluate(
            "async () => await (await fetch('/src/utils/canvasRenderer.ts')).text()"
        )
        if "acquireFxRing" in cr_src:
            break
        page.wait_for_timeout(800)
    check(
        "1a. canvasRenderer.ts 池化在册（值符号查 dev 转译源/类型接口查本地源）",
        all(
            k in cr_src
            for k in (
                "FX_FREE_CAP",
                "acquireSwordTrail",
                "acquireFxRing",
                "releaseSwordTrail",
                "releaseFxRing",
                "fxPoolStats",
            )
        )
        and "export interface SwordTrailSample" in local_src
        and "export interface FxRing" in local_src,
    )
    n_ring_direct = cr_src.count("this.fxRings.push({")
    n_trail_direct = cr_src.count("this.swordTrail.push({")
    check(
        "1b. 五处生成点字面量直推归零（池取改道）",
        n_ring_direct == 0 and n_trail_direct == 0,
        f"ring_direct={n_ring_direct} trail_direct={n_trail_direct}",
    )
    check(
        "1c. 死亡归还/溢出归还接线在册",
        "releaseSwordTrail(this.swordTrail.splice(i, 1)[0])" in cr_src
        and "releaseFxRing(this.fxRings.splice(i, 1)[0])" in cr_src
        and "for (const o of cut) this.releaseFxRing(o)" in cr_src
        and "for (const o of cut) this.releaseSwordTrail(o)" in cr_src,
    )
    bv = ""
    for _ in range(4):
        bv = page.evaluate("async () => await (await fetch('/src/components/BattleView.tsx')).text()")
        if "__inkGestureDebug.fxPool" in bv:
            break
        page.wait_for_timeout(800)
    check("1d. BattleView 无头缝 fxPool 在册", "__inkGestureDebug.fxPool" in bv)

    # ===== 进入第一折战场（预置 high 画质防行云跳过轨迹采样） =====
    page.evaluate("() => localStorage.setItem('ink_steel_quality', 'high')")
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
    check("2. 战场已入", page.locator("canvas").count() > 0)
    page.keyboard.press("1")  # 防守军令

    # ===== 2-4. 动态：八手横划突刺（轨迹 0.2s / 环 ≤0.55s，首批死亡即产生复用） =====
    canvas = page.locator("canvas").last.bounding_box()
    ly = canvas["y"] + canvas["height"] * 0.82
    lx = canvas["x"] + canvas["width"] / 2
    for i in range(8):
        flick_dash(page, lx, ly)
        page.wait_for_timeout(1150)

    st = page.evaluate("() => window.__inkGestureDebug.fxPool()")
    check("3a. 轨迹池生发 trailAcquired>0", st and st["trailAcquired"] > 0, f"st={st}")
    check("3b. 冲击环池生发 ringAcquired>0", st and st["ringAcquired"] > 0, "")
    check(
        "4a. 双池归还 released>0",
        st and st["trailReleased"] > 0 and st["ringReleased"] > 0,
        "",
    )
    check(
        "4b. 双池复用 reused>0 且复用率>0",
        st
        and st["trailReused"] > 0
        and st["trailReuseRate"] > 0
        and st["ringReused"] > 0
        and st["ringReuseRate"] > 0,
        f"trailRate={st and round(st['trailReuseRate'], 3)} ringRate={st and round(st['ringReuseRate'], 3)}",
    )
    check(
        "4c. 帽遵守 trailLive≤40 且 ringLive≤40",
        st and st["trailLive"] <= 40 and st["ringLive"] <= 40,
        f"trailLive={st and st['trailLive']} ringLive={st and st['ringLive']}",
    )
    check(
        "4d. 空闲池有界 trailFree≤64 且 ringFree≤64",
        st and st["trailFree"] <= 64 and st["ringFree"] <= 64,
        "",
    )

    check("5. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 次级对象池验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
