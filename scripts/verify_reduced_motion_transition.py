# -*- coding: utf-8 -*-
"""
无障碍第叁例（Task 56）验证：全库 transition 时长归零降级
（方法学同 Task 54：静态分段断言 + 双模式 computed 断言 + live 媒体切换实证）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  A 段静态锚（index.css 本地源 + TSX 扫描）：
    1. 四作者类源 transition 行在册（归零不删源，仅媒体块覆盖）
    2. 第叁例降级块在册（segs[3] 含八选择器 + transition-duration/delay: 0s）
    3. 前两块原样在册（segs[1] Task 50 vd 双类 / segs[2] Task 54 fade-in+seal-stamp，
       追加不扰动前块分段断言）
    4. TSX transition utility 变体闭包 ⊆ 第叁块已列集（防未来新增变体漏列）
    5. 全库无 transitionend 依赖（归零无时序逻辑风险）
  B 段 e2e（双模式矩阵 × 主菜单 / 战场 HUD 两观测面）：
    6. 主菜单 .btn-seal 默认 '0.15s, 0.12s'
    7. 主菜单 .btn-ink / .btn-ink-quiet 默认 '0.15s, 0.15s'
    8. 主菜单 .transition-colors 导航链默认非零（150ms 口径）
    9. reduce 模式（live 切换）：四元素 computed transitionDuration 全零
   10. 切回 no-preference：四元素恢复默认（媒体查询即开关，无永久覆写）
   11. 战场 HUD [class*="transition-"] 全扫：reduce 下全零（transition-all/
       duration-150 等随行归零）
   12. 无 console/page 错误
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "index.css"), encoding="utf-8") as f:
    css = f.read()

src_dir = os.path.join(here, "..", "src")


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def all_zero(dur):
    """computed transitionDuration 逗号列表逐项 ∈ {0s, 0ms}"""
    if not dur:
        return False
    return all(t.strip() in ("0s", "0ms") for t in dur.split(","))


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


def dur(page, sel):
    return page.evaluate(
        "(s) => { const el = document.querySelector(s);"
        " return el ? getComputedStyle(el).transitionDuration : null; }",
        sel,
    )


# ===== A 段静态锚 =====
src_rows = [
    (".btn-seal", "transition: background-color 0.15s ease, transform 0.12s ease;"),
    (".btn-ink", "transition: background-color 0.15s ease, border-color 0.15s ease;"),
    (".btn-ink-quiet", "transition: color 0.15s ease, background-color 0.15s ease;"),
    (".btn-night", "transition: background-color 0.15s ease, border-color 0.15s ease;"),
]
check(
    "1. 四作者类源 transition 行在册（归零不删源）",
    all(row in css for _, row in src_rows),
)

segs = css.split("prefers-reduced-motion: reduce")
third = segs[3] if len(segs) >= 4 else ""
listed = [
    ".btn-seal", ".btn-ink", ".btn-ink-quiet", ".btn-night",
    ".transition,", ".transition-colors,", ".transition-all,", ".transition-transform",
]
check(
    "2. 第叁例降级块在册（八选择器 + duration/delay 归零）",
    bool(third)
    and all(sel in third for sel in listed)
    and "transition-duration: 0s" in third
    and "transition-delay: 0s" in third,
    f"media_blocks={len(segs) - 1}",
)
check(
    "3. 前两块原样（segs[1] Task 50 vd 双类 / segs[2] Task 54 fade-in+seal-stamp）",
    len(segs) >= 4
    and ".animate-vd-rise" in segs[1]
    and "animation: none" in segs[1]
    and ".animate-fade-in" in segs[2]
    and ".animate-seal-stamp" in segs[2]
    and "animation: none" in segs[2],
)

# TSX transition utility 变体闭包 ⊆ 已列集
# （transition-xxx 形式全量收集；裸 transition class 与 framer transition={{props}}
#   均不计入——前者零使用在册、后者属 JS 动画面另列第肆例候选）
used = set()
for root, dirs, files in os.walk(src_dir):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for fn in files:
        if not fn.endswith((".tsx", ".ts")):
            continue
        text = open(os.path.join(root, fn), encoding="utf-8").read()
        used |= set(re.findall(r"\btransition-(?:colors|all|transform|opacity|shadow|none|scale)\b", text))
allowed = {"transition-colors", "transition-all", "transition-transform"}
check(
    "4. TSX utility 变体闭包 ⊆ 第叁块已列集（防新增变体漏列）",
    used <= allowed,
    f"used={sorted(used)}",
)

te_count = 0
for root, dirs, files in os.walk(src_dir):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for fn in files:
        # 仅扫 JS 面（.ts/.tsx）：事件监听依赖属代码逻辑；.css 不扫，
        # 避免第叁例块注释自述「无 transitionend 依赖」字面量假阳性
        if not fn.endswith((".tsx", ".ts")):
            continue
        te_count += len(re.findall(r"transitionend|onTransitionEnd", open(os.path.join(root, fn), encoding="utf-8").read()))
check("5. 全库无 transitionend 依赖（归零无时序风险）", te_count == 0, f"hits={te_count}")

# ===== B 段 e2e =====
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    d_seal = dur(page, ".btn-seal")
    d_ink = dur(page, ".btn-ink")
    d_quiet = dur(page, ".btn-ink-quiet")
    d_nav = dur(page, ".transition-colors")
    check(
        "6. 默认模式 .btn-seal transitionDuration='0.15s, 0.12s'",
        d_seal == "0.15s, 0.12s",
        f"got={d_seal}",
    )
    check(
        "7. 默认模式 .btn-ink / .btn-ink-quiet '0.15s, 0.15s'",
        d_ink == "0.15s, 0.15s" and d_quiet == "0.15s, 0.15s",
        f"ink={d_ink} quiet={d_quiet}",
    )
    check(
        "8. 默认模式 .transition-colors 导航链非零（150ms 口径）",
        d_nav is not None and not all_zero(d_nav),
        f"got={d_nav}",
    )

    page.emulate_media(reduced_motion="reduce")  # live 切换，不重载
    page.wait_for_timeout(300)
    r4 = {sel: dur(page, sel) for sel in (".btn-seal", ".btn-ink", ".btn-ink-quiet", ".transition-colors")}
    check(
        "9. reduce 模式四元素 transitionDuration 全零（live 媒体切换实证）",
        all(all_zero(v) for v in r4.values()),
        f"seal={r4['.btn-seal']} ink={r4['.btn-ink']} nav={r4['.transition-colors']}",
    )

    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_timeout(300)
    b4 = {sel: dur(page, sel) for sel in (".btn-seal", ".btn-ink", ".btn-ink-quiet", ".transition-colors")}
    check(
        "10. 切回默认后四元素恢复（媒体查询即开关，无永久覆写）",
        b4[".btn-seal"] == "0.15s, 0.12s"
        and b4[".btn-ink"] == "0.15s, 0.15s"
        and b4[".btn-ink-quiet"] == "0.15s, 0.15s"
        and not all_zero(b4[".transition-colors"]),
        f"seal={b4['.btn-seal']} ink={b4['.btn-ink']} nav={b4['.transition-colors']}",
    )

    # 战场 HUD 面：入战后 reduce 下全量扫描 transition 元素
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
    check("11a. 战场已入", page.locator("canvas").count() > 0)

    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(300)
    hud_zero = page.evaluate(
        """() => {
        const els = [...document.querySelectorAll('[class*="transition-"]')];
        return els.map((el) => {
            const d = getComputedStyle(el).transitionDuration;
            return { cls: el.className.slice(0, 40), d, zero: d.split(',').every((t) => ['0s','0ms'].includes(t.trim())) };
        });
    }"""
    )
    nz = [e for e in hud_zero if not e["zero"]]
    check(
        "11b. reduce 下战场 HUD transition 元素全扫全零（all/duration-* 随行归零）",
        len(hud_zero) > 0 and not nz,
        f"scanned={len(hud_zero)} nonzero={[(e['cls'], e['d']) for e in nz[:2]]}",
    )

    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_timeout(300)
    hud_back = page.evaluate(
        """() => {
        const els = [...document.querySelectorAll('[class*="transition-"]')];
        return els.filter((el) => {
            const d = getComputedStyle(el).transitionDuration;
            return !d.split(',').every((t) => ['0s','0ms'].includes(t.trim()));
        }).length;
    }"""
    )
    check(
        "11c. 切回默认后 HUD 恢复非零（计数>0，无永久覆写）",
        hud_back > 0,
        f"restored={hud_back}",
    )
    check("12. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 无障碍第叁例（transition 时长归零）验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
