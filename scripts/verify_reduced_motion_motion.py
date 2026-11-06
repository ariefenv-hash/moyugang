# -*- coding: utf-8 -*-
"""
无障碍第肆例（Task 57）验证：motion/react JS 动画面 reduced-motion 接入
（方法学沿 Task 54/56：静态锚 + 双模式 computed 断言；新增「时窗对照」黑盒
 —— 入场进行中（opacity<1 采样锁）同一时刻 transform 终态差分）
前置：vite dev 已起服于 localhost:3000（仓库惯例：验证脚本不自起服）。
验证项：
  A 段静态锚（main.tsx + 六组件使用面）：
    1. MotionConfig reducedMotion="user" 包裹在册（main.tsx）+ import 在册
    2. 设计语义注释在录（去位移留淡入 / positionalKeys / live 切换不追溯语义）
    3. 六组件 motion 使用面在册（import 六文件——Context 全树传递保证覆盖）
  B 段 e2e（时窗对照 × 双模式，采样点 150ms 在 h1 delay 0.08s 后 /
      duration 0.55s 窗口内——区分窗口）：
    4. 默认模式：主菜单 motion.h1 入场进行中（opacity<1 采样锁）transform
       非恒等（y 位移中间态）——位置动画在播实证
    5. 同样本 opacity < 1（采样锁有效性：确在入场窗口内）
    6. 入场播完后 live 切 reduce（不重载）：已完成动画不追溯（transform
       仍终态，opacity=1）——VisualElement 构造期定终身语义
    7. reduce 模式重载（挂载期即 reduce）：同法采样 transform 已恒等终态
       （none 或 identity matrix）且 opacity < 1——去位移、留淡入双实证
    8. 同样本 opacity < 1（reduce 侧采样锁有效性）
    9. 无 console/page 错误
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "..", "src", "main.tsx"), encoding="utf-8") as f:
    main_tsx = f.read()


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def is_identity(tf):
    if tf is None or tf == "none":
        return True
    if tf.startswith("matrix"):
        nums = [float(x) for x in tf.replace("matrix(", "").replace(")", "").split(",")]
        return nums == [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    return False


def sample_h1(page):
    """采样主菜单标题 motion.h1 的 transform/opacity（含样式优先取内联）"""
    return page.evaluate(
        """() => {
        const els = [...document.querySelectorAll('h1')];
        const el = els.find((e) => e.textContent.includes('一砚清霜'));
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tf: cs.transform, op: parseFloat(cs.opacity) };
    }"""
    )


def sample_with_lock(page, tries=6, gap_ms=60):
    """时窗采样锁：首样前先等 150ms——采样点落在 h1 delay(0.08s) 之后、
    duration(0.55s) 窗口内（区分窗口：默认模式 y 位移在途 / reduce 模式
    y 已跳终态，且两侧 opacity 均 <1）。取第一个 opacity<1 样本；
    全部 opacity==1 视为错过窗口（机器过慢），返回 None 由调用方重试。
    （首帧即采会捕到挂载初值 y=18 —— 早于 motion 首个动画 tick，
    reduce 跳变尚未发生，初版脚本第 7 项假阴即此因，在录。）"""
    page.wait_for_timeout(150)
    for _ in range(tries):
        s = sample_h1(page)
        if s and s["op"] < 1.0:
            return s
        page.wait_for_timeout(gap_ms)
    return None


# ===== A 段静态锚 =====
check(
    "1. MotionConfig reducedMotion='user' 包裹在册（main.tsx）",
    "import { MotionConfig } from 'motion/react';" in main_tsx
    and "<MotionConfig reducedMotion=\"user\">" in main_tsx
    and "<App />" in main_tsx,
)
check(
    "2. 设计语义注释在录（去位移留淡入 / positionalKeys / live 不追溯）",
    "去位移" in main_tsx
    and "positionalKeys" in main_tsx
    and "不追溯" in main_tsx
    and "verify_reduced_motion_motion.py" in main_tsx,
)

six = [("App.tsx", "src"), ("ChapterSelect.tsx", "src/components"),
       ("BlessingModal.tsx", "src/components"), ("PavilionArchive.tsx", "src/components"),
       ("StoryIntroModal.tsx", "src/components"), ("AchievementToast.tsx", "src/components")]
src_dir = os.path.join(here, "..")
missing_import = []
for rel, sub in six:
    p = os.path.join(src_dir, sub, rel)
    if os.path.exists(p):
        text = open(p, encoding="utf-8").read()
        if "from 'motion/react'" not in text:
            missing_import.append(rel)
    else:
        missing_import.append(rel + "(缺席)")
check(
    "3. 六组件 motion 使用面在册（Context 全树传递保证覆盖）",
    not missing_import,
    f"missing={missing_import}",
)

# ===== B 段 e2e =====
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ---- 默认模式：入场进行中 transform 非恒等 ----
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("text=一砚清霜", state="attached", timeout=8000)
    s_def = sample_with_lock(page)
    if s_def is None:  # 错过窗口（过慢）：重载重试一次
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("text=一砚清霜", state="attached", timeout=8000)
        s_def = sample_with_lock(page)
    check(
        "4. 默认模式入场进行中 transform 非恒等（y 位移在途）",
        s_def is not None and not is_identity(s_def["tf"]),
        f"tf={s_def['tf'] if s_def else 'MISSED_WINDOW'}",
    )
    check(
        "5. 同样本 opacity<1（采样锁有效性：确在入场窗口内）",
        s_def is not None and s_def["op"] < 1.0,
        f"op={s_def['op'] if s_def else 'MISSED_WINDOW'}",
    )

    # ---- 入场播完后 live 切 reduce：已完成动画不追溯 ----
    done = False
    for _ in range(30):  # 轮询至入场完成（op==1），上限 ~3s
        s_done = sample_h1(page)
        if s_done and s_done["op"] == 1.0 and is_identity(s_done["tf"]):
            done = True
            break
        page.wait_for_timeout(100)
    page.emulate_media(reduced_motion="reduce")
    page.wait_for_timeout(400)
    s_live = sample_h1(page)
    check(
        "6. 入场播完后 live 切 reduce 不回退（transform 终态 + opacity=1；不追溯语义）",
        done and s_live is not None and is_identity(s_live["tf"]) and s_live["op"] == 1.0,
        f"done={done} tf={s_live['tf'] if s_live else None} op={s_live['op'] if s_live else None}",
    )

    # ---- reduce 模式挂载期：去位移 + 留淡入双实证 ----
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("text=一砚清霜", state="attached", timeout=8000)
    s_red = sample_with_lock(page)
    check(
        "7. reduce 挂载期 transform 已恒等终态（去位移实证）",
        s_red is not None and is_identity(s_red["tf"]),
        f"tf={s_red['tf'] if s_red else 'MISSED_WINDOW'}",
    )
    check(
        "8. reduce 挂载期 opacity 仍 <1（留淡入实证——采样锁同证入场在途）",
        s_red is not None and s_red["op"] < 1.0,
        f"op={s_red['op'] if s_red else 'MISSED_WINDOW'}",
    )
    check("9. 无 console/page 错误", len(console_errors) == 0, f"errors={console_errors[:2]}")
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n===== 无障碍第肆例（motion/react reducedMotion 接入）验证: {passed}/{total} PASS =====")
sys.exit(0 if passed == total else 1)
