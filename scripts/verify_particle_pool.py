# -*- coding: utf-8 -*-
"""
粒子对象池（Task 41）验证（dev 注入缝 + 静态接线断言）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  1. 静态接线：particlePool.ts 在册（class/acquire/release/stats/FREE_CAP）
     + BattleView 十九处生成点全部改道 spawnParticle（旧 push 归零）
     + 池化回收换出移除 + 溢出归还 + 无头缝在册
  2. 动态生发：实战数手横划突刺 → pool stats acquired > 0 且 live ≤ 420
  3. 池化收益：首批粒子死亡后 → released > 0 且 reused > 0（复用率 > 0）
  4. 无 console/page 错误
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
    "endlessBest": 0,
    "achievements": [],
    "tutorialDone": True,
    "totalKills": 900,
}


def flick_dash(page, cx, cy):
    """横划突刺：行止区中心左→右快划（与生产冒烟 P4 同法），出招时溅起粒子。"""
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
    pool_src = ""
    for _ in range(4):
        pool_src = page.evaluate(
            "async () => await (await fetch('/src/utils/particlePool.ts')).text()"
        )
        if "ParticlePool" in pool_src:
            break
        page.wait_for_timeout(800)
    check(
        "1a. particlePool.ts 在册",
        all(
            k in pool_src
            for k in ("class ParticlePool", "acquire", "release", "stats", "FREE_CAP", "reuseRate")
        ),
    )
    bv = ""
    for _ in range(4):
        bv = page.evaluate("async () => await (await fetch('/src/components/BattleView.tsx')).text()")
        if "spawnParticle" in bv:
            break
        page.wait_for_timeout(800)
    n_spawn = bv.count("spawnParticle(particlesRef.current, {")
    n_old_push = bv.count("particlesRef.current.push(")
    check(
        "1b. 生成点全量改道（spawnParticle ≥ 15 且旧 push 归零）",
        n_spawn >= 15 and n_old_push == 0,
        f"spawn={n_spawn} old_push={n_old_push}",
    )
    check(
        "1c. 回收换出/溢出归还/无头缝在册",
        all(
            k in bv
            for k in (
                "particlePool.release(p)",
                "for (const rp of removed) particlePool.release(rp)",
                "__inkGestureDebug.particlePool",
            )
        ),
    )

    # ===== 进入第一折战场 =====
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

    # ===== 2-3. 动态：数手横划突刺 + 等待交战生发 → 生发/帽子/归还/复用 =====
    canvas = page.locator("canvas").last.bounding_box()
    ly = canvas["y"] + canvas["height"] * 0.82
    lx = canvas["x"] + canvas["width"] / 2
    for i in range(8):  # 八手突刺，间隔 1.2s：首批粒子死亡后即产生复用
        flick_dash(page, lx, ly)
        page.wait_for_timeout(1150)

    stats = page.evaluate("() => window.__inkGestureDebug.particlePool()")
    check("3a. 粒子生发 acquired>0", stats and stats["acquired"] > 0, f"stats={stats}")
    check(
        "3b. 同屏帽遵守 live≤420",
        stats and 0 <= stats["live"] <= 420,
        f"live={stats and stats['live']}",
    )
    check(
        "4a. 死亡归还 released>0",
        stats and stats["released"] > 0,
        f"released={stats and stats['released']}",
    )
    check(
        "4b. 复用发生 reused>0 且复用率>0",
        stats and stats["reused"] > 0 and stats["reuseRate"] > 0,
        f"reused={stats and stats['reused']} rate={stats and round(stats['reuseRate'], 3)}",
    )

    check("5. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 粒子对象池验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
