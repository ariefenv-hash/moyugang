# -*- coding: utf-8 -*-
"""
无障碍第贰例（Task 54）验证：全局 fade-in / seal-stamp 静置降级
（dev 注入缝 + 双模式 computed animationName 断言，方法学同 Task 50 B8）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  A 段静态锚（index.css 本地源）：
    1. 双 keyframes + 双 utility 在册（fade-in / seal-stamp）
    2. 第贰例降级块在册（media 含 .animate-fade-in + .animate-seal-stamp + animation: none）
    3. Task 50 结算块原样在册（首个 media 块含 vd-rise/vd-star-pop/animation:none，
       split[1] 断言语义保持）
    4. .seal 基类 rotate(-2deg) 真源在册（静置终态等价性依据）
  B 段 e2e（双模式矩阵 × 双观测面）：
    5. 主菜单 LoreModal（animate-fade-in 面）：默认模式 animationName === 'fade-in'
    6. 同页 emulate reduce（不重载，live 切换）：同元素 === 'none'，切回后复活
    7. 战场暂停遮罩：默认模式 root='fade-in' 且 seal='seal-stamp'
    8. reduce 模式：root 与 seal 均 'none'，且 seal computed transform 仍含
       rotate(-2°) 矩阵分量 -0.0348（.seal 基类回落实证 = 静置钤印歪斜保留）
    9. 无 console/page 错误
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "index.css"), encoding="utf-8") as f:
    css = f.read()


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


def anim_name(page, sel):
    return page.evaluate(
        "(s) => { const el = document.querySelector(s);"
        " return el ? getComputedStyle(el).animationName : null; }",
        sel,
    )


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== A 段静态锚 =====
    check(
        "1a. 双 keyframes 在册",
        "@keyframes fade-in" in css and "@keyframes seal-stamp" in css,
    )
    check(
        "1b. 双 utility 在册",
        "@utility animate-fade-in" in css and "@utility animate-seal-stamp" in css,
    )
    segs = css.split("prefers-reduced-motion: reduce")
    check(
        "2. 第贰例降级块在册（fade-in/seal-stamp → animation: none）",
        len(segs) >= 3
        and ".animate-fade-in" in segs[2]
        and ".animate-seal-stamp" in segs[2]
        and "animation: none" in segs[2],
        f"media_blocks={len(segs) - 1}",
    )
    first_media = css.split("prefers-reduced-motion: reduce")[1]
    check(
        "3. Task 50 结算块原样在册（首 media 块 vd 双类 + animation:none）",
        ".animate-vd-rise" in first_media
        and ".animate-vd-star-pop" in first_media
        and "animation: none" in first_media,
    )
    check("4. .seal 基类 rotate(-2deg) 真源在册", "transform: rotate(-2deg)" in css)

    # ===== B 段 e2e：主菜单 LoreModal 面 =====
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    lore_btn = page.locator("button:has-text('兵法心诀')").first
    if lore_btn.is_visible():
        lore_btn.click()
        page.wait_for_timeout(600)
    n1 = anim_name(page, ".animate-fade-in")
    check("5. 默认模式 LoreModal 根 animationName='fade-in'", n1 == "fade-in", f"got={n1}")
    page.emulate_media(reduced_motion="reduce")  # live 切换，不重载
    page.wait_for_timeout(250)
    n2 = anim_name(page, ".animate-fade-in")
    check("6a. reduce 模式同元素 'none'（live 媒体切换实证）", n2 == "none", f"got={n2}")
    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_timeout(250)
    n3 = anim_name(page, ".animate-fade-in")
    check("6b. 切回默认后动画复活", n3 == "fade-in", f"got={n3}")
    close = page.locator("button:has-text('合卷'), button:has-text('返回'), button:has-text('关闭')")
    if close.count() > 0 and close.first.is_visible():
        close.first.click()
        page.wait_for_timeout(400)

    # ===== B 段 e2e：战场暂停遮罩面（fade-in + seal-stamp 同屏） =====
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
    check("7a. 战场已入", page.locator("canvas").count() > 0)
    page.keyboard.press("p")  # 暂停（smoke 第 9 项同法）
    page.wait_for_timeout(700)  # 等 seal-stamp 0.42s 播完（both 填充终态）
    n_root = anim_name(page, ".animate-fade-in")
    n_seal = anim_name(page, ".animate-seal-stamp")
    check(
        "7b. 默认模式暂停遮罩 root='fade-in' 且 seal='seal-stamp'",
        n_root == "fade-in" and n_seal == "seal-stamp",
        f"root={n_root} seal={n_seal}",
    )
    tf_normal = page.evaluate(
        "() => { const el = document.querySelector('.animate-seal-stamp');"
        " return el ? getComputedStyle(el).transform : null; }"
    )
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(250)
    r_root = anim_name(page, ".animate-fade-in")
    r_seal = anim_name(page, ".animate-seal-stamp")
    tf_reduce = page.evaluate(
        "() => { const el = document.querySelector('.animate-seal-stamp');"
        " return el ? getComputedStyle(el).transform : null; }"
    )
    check(
        "8a. reduce 模式暂停遮罩 root 与 seal 均 'none'",
        r_root == "none" and r_seal == "none",
        f"root={r_root} seal={r_seal}",
    )
    check(
        "8b. 静置终态等价：reduce 下 seal computed transform 仍含 rotate(-2°) 分量（基类回落）",
        tf_reduce is not None
        and "-0.0348" in tf_reduce
        and tf_normal is not None
        and "-0.0348" in tf_normal,
        f"normal={tf_normal} reduce={tf_reduce}",
    )
    check("9. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 无障碍第贰例（全局静置降级）验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
