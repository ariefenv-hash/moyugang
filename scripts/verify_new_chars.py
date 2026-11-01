"""
新字诀「墨」「龙」端到端验证
验证项：
  1. 进入第一折战斗
  2. 上区写「墨」→ skillCds.ink_nova > 0（万墨归一施放）
  3. 万墨归一特效：全场墨渍贴花增加 / 粒子涌现
  4. 上区写「龙」→ skillCds.dragon_sweep > 0（唤墨龙施放）
  5. 三墨龙品字阵：fxStats().dragons ≥ 3（三龙齐飞）
  6. G/H 键盘快捷键等效触发
  7. 无 console/page 错误
前置：bun run dev 已在 3000 端口
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def draw_stroke(page, pts, step_ms=14):
    """字诀单笔"""
    page.mouse.move(pts[0][0], pts[0][1])
    page.mouse.down()
    for p in pts[1:]:
        page.mouse.move(p[0], p[1])
        page.wait_for_timeout(step_ms)
    page.mouse.up()
    page.wait_for_timeout(120)


def draw_char_mo(page, cx=640, cy=230, s=1.0):
    """写「墨」六笔（简化模板：口框+中竖+底土），s 缩放"""
    # 顶横
    draw_stroke(page, [(cx - 90*s, cy - 60*s), (cx + 70*s, cy - 62*s)])
    # 左竖
    draw_stroke(page, [(cx - 86*s, cy - 56*s), (cx - 90*s, cy - 8*s)])
    # 右竖
    draw_stroke(page, [(cx + 66*s, cy - 58*s), (cx + 72*s, cy - 6*s)])
    # 中竖（贯穿）
    draw_stroke(page, [(cx - 8*s, cy - 68*s), (cx - 6*s, cy + 88*s)])
    # 土底横
    draw_stroke(page, [(cx - 108*s, cy + 132*s), (cx + 118*s, cy + 128*s)])
    # 土竖
    draw_stroke(page, [(cx + 14*s, cy + 96*s), (cx + 12*s, cy + 168*s)])


def draw_char_long(page, cx=640, cy=240, s=1.0):
    """写「龙」五笔（简化模板：顶横+左撇+大竖弯钩+内撇+点）"""
    # 顶横
    draw_stroke(page, [(cx - 72*s, cy - 52*s), (cx + 80*s, cy - 56*s)])
    # 左撇
    draw_stroke(page, [(cx + 50*s, cy - 44*s), (cx + 16*s, cy + 8*s), (cx - 6*s, cy + 52*s)])
    # 大竖弯钩
    draw_stroke(page, [(cx + 88*s, cy - 50*s), (cx + 96*s, cy + 4*s),
                       (cx + 84*s, cy + 62*s), (cx + 42*s, cy + 100*s),
                       (cx - 22*s, cy + 108*s), (cx - 84*s, cy + 88*s)])
    # 内小撇
    draw_stroke(page, [(cx - 6*s, cy + 40*s), (cx - 58*s, cy + 82*s)])
    # 点
    draw_stroke(page, [(cx + 16*s, cy + 58*s), (cx + 34*s, cy + 82*s)])


def wait_cd(page, key, timeout_ms=20000):
    import time
    t0 = time.time()
    while (time.time() - t0) * 1000 < timeout_ms:
        cd = page.evaluate(
            "() => window.__inkGestureDebug.battleState().skillCds"
        ).get(key, 0)
        if cd <= 0:
            return True
        page.wait_for_timeout(400)
    return False


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 进入战斗
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.click("text=启卷入战")
    page.wait_for_timeout(1200)
    try:
        page.click("button:has-text('启 卷')", timeout=4000)
        page.wait_for_timeout(800)
    except Exception:
        pass
    page.click("text=启程试炼 >> nth=0")
    page.wait_for_timeout(2000)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    check("1. 进入第一折战斗", in_battle)

    # 2. 写「墨」→ 万墨归一
    splats_before = page.evaluate("() => window.__inkGestureDebug.fxStats().inkSplats")
    draw_char_mo(page)
    page.wait_for_timeout(900)
    cds = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    check("2. 写「墨」施放万墨归一", cds.get("ink_nova", 0) > 12.5,
          f"cd={cds.get('ink_nova', 0):.2f}（满 CD 14）")
    splats_after = page.evaluate("() => window.__inkGestureDebug.fxStats().inkSplats")
    check("3. 天地泼墨墨渍", splats_after > splats_before,
          f"inkSplats {splats_before}->{splats_after}")

    # 4. 写「龙」→ 唤墨龙
    if not wait_cd(page, "dragon_sweep"):
        pass  # 未入 CD 也继续实测
    draw_char_long(page)
    page.wait_for_timeout(1500)
    cds2 = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    check("4. 写「龙」施放唤墨龙", cds2.get("dragon_sweep", 0) > 15,
          f"cd={cds2.get('dragon_sweep', 0):.2f}（满 CD 18，检查前已等 1.5s）")
    dragons = page.evaluate("() => window.__inkGestureDebug.fxStats().dragons")
    check("5. 三墨龙品字阵", dragons >= 3, f"dragons={dragons}（应≥3）")

    # 6. 键盘快捷键：G=万墨归一 / H=唤墨龙（等 CD）
    ok_g = wait_cd(page, "ink_nova")
    page.keyboard.press("g")
    page.wait_for_timeout(400)
    cds3 = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    check("6a. G 键万墨归一", ok_g and cds3.get("ink_nova", 0) > 12.5,
          f"cd={cds3.get('ink_nova', 0):.2f}")
    ok_h = wait_cd(page, "dragon_sweep")
    page.keyboard.press("h")
    page.wait_for_timeout(1500)
    cds4 = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    dragons2 = page.evaluate("() => window.__inkGestureDebug.fxStats().dragons")
    check("6b. H 键唤墨龙", ok_h and cds4.get("dragon_sweep", 0) > 15 and dragons2 >= 3,
          f"cd={cds4.get('dragon_sweep', 0):.2f} dragons={dragons2}")

    # 7. 无 console 错误
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("7. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 新字诀验证: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
