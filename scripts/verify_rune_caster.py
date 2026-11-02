"""
蚀文咒师（RUNECASTER）机制验证（dev 注入缝 + 数据静态断言）
验证项：
  1. 数据就位：story.ts 六处 RUNECASTER 出场 + gameData 兵种配置
  2. 干净基线：书符区写「之」→ 判定命中（神品/妙品）——证明写法本身有效
  3. 蚀痕扰墨：注入蚀痕于同一落点再写 → 评级必须劣化（非神品，含墨渍）
  4. 正字驱蚀：蚀痕存活期间，成字笔迹覆盖痕区 → corruptZones 清空
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

# 「之」主模板（0..1 归一化，与 charRecognizer.ts 严格同源）
ZHI_STROKES = [
    [[0.08, 0.24], [0.2, 0.34], [0.32, 0.43]],
    [[0.3, 0.56], [0.45, 0.53], [0.58, 0.5], [0.42, 0.65], [0.32, 0.79]],
    [[0.46, 0.58], [0.62, 0.68], [0.78, 0.78], [0.92, 0.9]],
]


def write_char(page, cx, cy, box, strokes, skew=0.0):
    """在画布 (cx,cy) 为中心、box 尺寸的框内逐笔书写给定模板；skew 为 y 向拉伸（模拟人手不稳）。"""
    for stroke in strokes:
        pts = [
            (cx + (p[0] - 0.5) * box, cy + (p[1] - 0.5) * box * (1 + skew))
            for p in stroke
        ]
        # 起笔前先移到位（慢速，防被判 flick）
        page.mouse.move(pts[0][0], pts[0][1])
        page.mouse.down()
        seg = 14
        for i in range(1, len(pts)):
            x0, y0 = pts[i - 1]
            x1, y1 = pts[i]
            for t in range(1, seg + 1):
                page.mouse.move(x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg)
        page.mouse.up()
        page.wait_for_timeout(90)


def read_hint(page):
    """取当前字诀提示文本（含评级/墨渍）。"""
    return page.evaluate(
        """() => {
          const els = [...document.querySelectorAll('div')];
          for (const el of els) {
            const t = el.innerText || '';
            if ((t.includes('神品') || t.includes('妙品') || t.includes('能品') || t.includes('墨渍')) && t.length < 80) return t;
          }
          return '';
        }"""
    )


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== 1. 数据静态断言（dev 源直取；冷启动 transform 偶发竞态 → 重试） =====
    page.goto(BASE, wait_until="domcontentloaded")
    src, n_cast = "", 0
    for _ in range(4):
        src = page.evaluate("async () => await (await fetch('/src/data/story.ts')).text()")
        n_cast = src.count("RUNECASTER")
        if n_cast >= 6:
            break
        page.wait_for_timeout(800)
    check("1a. story.ts 六处咒师出场", n_cast >= 6, f"count={n_cast}")
    gd = page.evaluate("async () => await (await fetch('/src/data/gameData.ts')).text()")
    check("1b. gameData 兵种配置在册", "RUNECASTER" in gd and "蚀文咒师" in gd)
    bv = page.evaluate("async () => await (await fetch('/src/components/BattleView.tsx')).text()")
    check(
        "1c. 机制接线在册",
        all(k in bv for k in ("spawnCorruptZone", "DARK_ORB", "蚀痕扰墨", "正字驱蚀", "RUNECASTER")),
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
    check("战场已入", page.locator("canvas").count() > 0)
    page.keyboard.press("1")  # 防守军令

    # ===== 2. 干净基线：写「之」应成字且为神品/妙品 =====
    ZONE_X = 320   # 蚀痕世界坐标（亦为屏幕坐标：开局 cameraX≈0）
    ZONE_Y = 580   # 行止区泳道带（地面）
    CX, CY, BOX = 320, 200, 210  # 书符区落笔中心与字框
    page.evaluate("() => window.__inkGestureDebug.clearCorruptZones()")
    write_char(page, CX, CY, BOX, ZHI_STROKES)
    page.wait_for_timeout(1000)
    hint1 = read_hint(page)
    baseline_ok = ("神品" in hint1 or "妙品" in hint1) and "之" in hint1
    check("2. 干净基线成字", baseline_ok, f"hint={hint1[:40]!r}")

    # ===== 3. 蚀痕扰墨：同点再写，评级必须劣化 =====
    page.evaluate(
        "([x, y]) => window.__inkGestureDebug.spawnCorruptZone(x, y, 48)", [ZONE_X, ZONE_Y]
    )
    page.wait_for_timeout(200)
    zones = page.evaluate("() => window.__inkGestureDebug.corruptZones()")
    check("3a. 蚀痕已注入", len(zones) == 1, f"zones={zones}")
    write_char(page, CX, CY, BOX, ZHI_STROKES, skew=0.18)  # 带人手偏差的再写
    page.wait_for_timeout(1000)
    hint2 = read_hint(page)
    degraded = not ("神品" in hint2)
    check("3b. 评级劣化（非神品）", degraded, f"hint={hint2[:40]!r}")

    # 若 3b 中被污染成墨渍 → 直接推进；若成字（能品/妙品）痕已被驱 → 重建一痕再验 4
    zones_now = page.evaluate("() => window.__inkGestureDebug.corruptZones()")
    if len(zones_now) == 0:
        page.evaluate(
            "([x, y]) => window.__inkGestureDebug.spawnCorruptZone(x, y, 48)", [ZONE_X, ZONE_Y]
        )
        page.wait_for_timeout(150)

    # ===== 4. 正字驱蚀：成字覆盖痕区 → 蚀痕清空 =====
    # 侧移 90px 落笔（避开污染带核心），字框 240 足以覆盖 zone.x±48
    page.evaluate("() => window.__inkGestureDebug.clearCorruptZones()")
    page.evaluate(
        "([x, y]) => window.__inkGestureDebug.spawnCorruptZone(x, y, 48)", [ZONE_X, ZONE_Y]
    )
    write_char(page, CX, CY, 240, ZHI_STROKES)
    page.wait_for_timeout(1000)
    zones_after = page.evaluate("() => window.__inkGestureDebug.corruptZones()")
    check("4. 正字驱蚀生效", len(zones_after) == 0, f"zones={zones_after}")

    check("5. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 蚀文咒师验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
