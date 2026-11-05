# -*- coding: utf-8 -*-
"""
天气层粒子池化归并审计（Task 55）验证：调色板常量提升 + 四层池化一致性收口锚
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  A 段静态锚（canvasRenderer.ts 本地源）：
    1. 12 组调色板模块级常量在册（值逐字节等于原内联字面量）
    2. 函数体内联字面量归零（petals/palette/petalColors/cols/sandCols/
       fuzzCols/orchidCols = [ ... ] 全库 0 处）
    3. 12 处常量别名改道在册
    4. 渐变保留分类在录（MIST 位置随帧变 / LUNAR/CRIMSON/FROST 停靠色随淡变，
       沿 Task 51 分类保留——在录即可，不判消失）
    5. 四层池化一致性锚：Task 41 ParticlePool FREE_CAP=480 + Task 43
       FX_FREE_CAP=64 + Task 53 AFTERIMAGE_FREE_CAP=40 + fxPoolStats ghost 组
       + BattleView 双无头缝（particlePool/fxPool）在册
  B 段 e2e：
    6. 战场已入 + 暂停冻结帧确定性（渲染路径零扰动：两次冻结读数逐位差 ≤20）
    7. 无 console/page 错误
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "utils", "canvasRenderer.ts"), encoding="utf-8") as f:
    cr = f.read()
with open(os.path.join(here, "..", "src", "components", "BattleView.tsx"), encoding="utf-8") as f:
    bv = f.read()


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

CONSTS = {
    "PLUM_RAIN_PETAL_COLORS": "['#e8b7c6', '#dda4b7', '#f2cdd8']",
    "AUTUMN_LEAF_PALETTE": "['#b45824', '#8a2f1d', '#d97b3f', '#a83a2a', '#c9552e']",
    "LOTUS_PETAL_COLORS": "['#f2c4cd', '#e8a7b7', '#f7dde2']",
    "GOOSE_PETAL_COLORS": "['#a34a52', '#8a3a44', '#c4707a']",
    "CHRYS_PETAL_COLORS": "['#e8b84a', '#d8a428', '#f0d070', '#c4922a']",
    "GLOOM_LEAF_COLORS": "['#3d4a34', '#4a5540', '#2e3a28']",
    "DESERT_SAND_COLORS": "['#d8b070', '#c49a52', '#e8cc90']",
    "WITHER_FUZZ_COLORS": "['rgba(196, 198, 176, 0.55)', 'rgba(168, 172, 148, 0.5)', 'rgba(214, 214, 194, 0.45)']",
    "ORCHID_PETAL_COLORS": "['#a8b8d8', '#8a9ac8', '#c4cee4']",
    "RIVULET_PETAL_COLORS": "['#f4b4c8', '#e894ac', '#f8d0da']",
    "PEACHDAWN_PETAL_COLORS": "['#f4a8bc', '#e88aa4', '#f8ccd6', '#d8708e']",
    "QUJIANG_PETAL_COLORS": "['#f8d4d0', '#f0b0b4', '#fce8e0']",
}


def js_sample(page, name):
    """canvas 像素快照页内持久化（canvas_alloc 同法）"""
    return page.evaluate(
        """(name) => {
          const cv = document.querySelector('canvas');
          if (!cv) return 0;
          const tc = document.createElement('canvas');
          tc.width = cv.width; tc.height = cv.height;
          tc.getContext('2d').drawImage(cv, 0, 0);
          const d = tc.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          (window.__wxFrames = window.__wxFrames || {})[name] = d;
          return d.length;
        }""",
        name,
    )


def js_diff(page, a, b):
    """页内两帧差分：任一通道 |Δ|>10 的像素数（canvas_alloc 同口径）"""
    return page.evaluate(
        """([a, b]) => {
          const A = window.__wxFrames[a], B = window.__wxFrames[b];
          if (!A || !B) return null;
          let n = 0;
          for (let i = 0; i < A.length; i += 4) {
            if (Math.abs(A[i] - B[i]) > 10 || Math.abs(A[i+1] - B[i+1]) > 10
                || Math.abs(A[i+2] - B[i+2]) > 10) n++;
          }
          return n;
        }""",
        [a, b],
    )


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ===== A 段静态锚 =====
    missing = [k for k, v in CONSTS.items() if f"const {k} = {v};" not in cr]
    check("1. 12 组调色板模块级常量在册（值逐字节）", len(missing) == 0, f"missing={missing}")
    import re
    n_inline = len(re.findall(r"const (?:petals|palette|petalColors|cols|sandCols|fuzzCols|orchidCols) = \[", cr))
    check("2. 函数体内联字面量归零", n_inline == 0, f"inline={n_inline}")
    n_alias = sum(1 for k in CONSTS if cr.count(f"= {k};") >= 1)
    check("3. 常量别名改道在册（12 分支）", n_alias == 12, f"alias_branches={n_alias}")
    check(
        "4. 渐变保留分类在录（MIST 等位置变 + LUNAR/CRIMSON/FROST 停靠色随淡变，沿 Task 51 分类保留）",
        cr.count("createRadialGradient(W * 0.78") == 1
        and cr.count("createRadialGradient(W / 2, H / 2") == 1
        and cr.count("createLinearGradient(0, H * 0.55, 0, H)") == 1
        and cr.count("createLinearGradient(drift - 180") == 2,
    )
    check(
        "5. 四层池化一致性锚（41/43/53 池帽 + 统计缝 + 双无头缝）",
        "const FREE_CAP = 480;" in open(os.path.join(here, "..", "src", "utils", "particlePool.ts"), encoding="utf-8").read()
        and "FX_FREE_CAP = 64" in cr
        and "AFTERIMAGE_FREE_CAP = 40" in cr
        and "ghostReuseRate" in cr
        and "__inkGestureDebug.particlePool" in bv
        and "__inkGestureDebug.fxPool" in bv,
    )

    # ===== B 段 e2e =====
    page.goto(BASE, wait_until="domcontentloaded")
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
    in_battle = page.locator("canvas").count() > 0
    check("6a. 战场已入", in_battle)
    page.keyboard.press("1")  # 防守军令降噪声（canvas_alloc 协议同法）
    page.wait_for_timeout(600)
    page.keyboard.press("p")  # 暂停冻结（天气层纯 gameTime 函数自然凝滞）
    page.wait_for_timeout(500)
    paused_ok = page.locator("text=战局暂歇").first.is_visible()
    if paused_ok:
        js_sample(page, "base")
        page.wait_for_timeout(400)
        js_sample(page, "base2")
        diff = js_diff(page, "base", "base2")
        check(
            "6b. 暂停冻结帧确定性（|Δ|>10 差异像素 ≤20 = 渲染路径零扰动）",
            diff is not None and diff <= 20,
            f"diff={diff}",
        )
    else:
        check("6b. 暂停冻结帧确定性", False, "暂停遮罩未现")
    check("7. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 天气层审计收口验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
