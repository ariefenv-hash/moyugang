# -*- coding: utf-8 -*-
"""
粒子对象池化（Task 53）验证：残影 afterimages 池化（dev 注入缝 + 静态接线断言）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  1. 静态接线：canvasRenderer.ts 残影池在册（Afterimage/AFTERIMAGE_FREE_CAP/
     acquireAfterimage/releaseAfterimage/fxPoolStats ghost 组）+ 生成点字面量直推
     归零（afterimages.push{ ）+ stepFX 死亡归还/溢出归还 + copyPose 原位覆写接线
     （animationSystem 本地源）+ BattleView 无头缝在册
  2. 动态生发：预置 high 画质（行云跳过轨迹采样则残影同跳）→ 实战数手横划突刺
     → ghostAcquired>0（SKILL_DASH 为主发源）
  3. 池化收益：首批残影死亡（life 0.26s < 手势间隔 1.15s）→ ghostReleased>0 且
     ghostReused>0 且 ghostReuseRate>0（容器与内嵌 pose 一体复用实证）
  4. 帽遵守：ghostLive≤26 且 ghostFree≤40
  5. 无 console/page 错误
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

# 本地源（类型接口等 type-only 符号会被 vite/esbuild 转译剥离，查本地文件）
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "utils", "canvasRenderer.ts"), encoding="utf-8") as f:
    cr_local = f.read()
with open(os.path.join(here, "..", "src", "utils", "animationSystem.ts"), encoding="utf-8") as f:
    anim_local = f.read()


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
    """横划突刺：行止区中心左→右快划（Task 43 验证同法），SKILL_DASH 为主残影发源。"""
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
        if "acquireAfterimage" in cr_src:
            break
        page.wait_for_timeout(800)
    check(
        "1a. canvasRenderer.ts 残影池在册（值符号查 dev 转译源/类型接口查本地源）",
        all(
            k in cr_src
            for k in (
                "AFTERIMAGE_FREE_CAP",
                "acquireAfterimage",
                "releaseAfterimage",
                "ghostAcquired",
                "ghostFree",
            )
        )
        and "export interface Afterimage" in cr_local,
    )
    n_ghost_direct = cr_src.count("this.afterimages.push({")
    check(
        "1b. 生成点字面量直推归零（池取改道）",
        n_ghost_direct == 0 and "copyPose(g.pose, pose)" in cr_src,
        f"ghost_direct={n_ghost_direct} copyPose_sites={cr_src.count('copyPose(g.pose, pose)')}",
    )
    check(
        "1c. 死亡归还/溢出归还接线在册",
        "this.releaseAfterimage(this.afterimages.splice(i, 1)[0])" in cr_src
        and "for (const o of cut) this.releaseAfterimage(o)" in cr_src,
    )
    check(
        "1d. copyPose 原位覆写在册（animationSystem 本地源，POSE_KEYS 全字段覆写）",
        "export function copyPose(out: StickPose, p: StickPose): StickPose" in anim_local
        and "for (const k of POSE_KEYS)" in anim_local,
    )
    bv = ""
    for _ in range(4):
        bv = page.evaluate("async () => await (await fetch('/src/components/BattleView.tsx')).text()")
        if "__inkGestureDebug.fxPool" in bv:
            break
        page.wait_for_timeout(800)
    check("1e. BattleView 无头缝 fxPool 在册（ghost 组自动透出）", "__inkGestureDebug.fxPool" in bv)

    # ===== 进入第一折战场（预置 high 画质防行云跳过残影采样） =====
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

    # ===== 2-4. 动态：八手横划突刺（残影 life 0.26s < 间隔 1.15s，首批死亡即复用） =====
    canvas = page.locator("canvas").last.bounding_box()
    ly = canvas["y"] + canvas["height"] * 0.82
    lx = canvas["x"] + canvas["width"] / 2
    for i in range(8):
        flick_dash(page, lx, ly)
        page.wait_for_timeout(1150)

    st = page.evaluate("() => window.__inkGestureDebug.fxPool()")
    check("3a. 残影池生发 ghostAcquired>0", st and st["ghostAcquired"] > 0, f"st={st}")
    check(
        "3b. 残影归还+复用 ghostReleased>0 且 ghostReused>0 且复用率>0",
        st
        and st["ghostReleased"] > 0
        and st["ghostReused"] > 0
        and st["ghostReuseRate"] > 0,
        f"rate={st and round(st['ghostReuseRate'], 3)}",
    )
    check(
        "4. 帽遵守 ghostLive≤26 且 ghostFree≤40",
        st and st["ghostLive"] <= 26 and st["ghostFree"] <= 40,
        f"live={st and st['ghostLive']} free={st and st['ghostFree']}",
    )
    check("5. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 粒子对象池化（残影）验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
