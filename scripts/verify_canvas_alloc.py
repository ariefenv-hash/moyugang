"""
Task 51 — canvas 分层第贰阶段：动态层每帧分配审计（render 主链槽位复用）
验证项：
  A. 静态锚（canvasRenderer.ts 源码级）
    A1. 模块级 RenderItem type + compareRenderY 常量在册（每帧排序闭包 → 0）
    A2. 实例槽位池字段 private renderList 在册
    A3. 槽位复用三锚：rl[rlLen] ?? ( ×2（hero/unit 槽）· rl.length = rlLen（n 回落截断）
        · rl.sort(compareRenderY)（常量比较器）
    A4. render 主链 forEach 清零（public render( → 墨滞滤镜段间零 .forEach(）
    A5. 函数内旧 type RenderItem 定义已移除（类型上移模块级唯一真源）
  B. e2e（真开局 · 暂停冻结帧差分协议，Task 48 在录）
    B1. 战场已入（canvas 在屏）
    B2. 首次暂停冻结噪声 ≤20（帧级确定性——槽位复用零视觉输出位移的直接实证）
    B3. 解除暂停运行 2s（单位 y 变化 → 槽位 sort 重排 → 复用写入）后再冻结，
        冻结噪声仍 ≤20（覆盖复用槽位跨帧轮转正确性）
    B4. 全程零 console / page 错误

  审计报告（剩余分配源，视觉等价约束下保留，录以为鉴）：
    - 模板字符串 rgba(...)（描边/填充色逐元素变化，消除需改绘制风格，违背零回归底线）
    - 章节/天体光晕 createRadialGradient（位置每帧微动，对象随参数变化不可缓存；
      天空/地面主渐变已于 Task 32 离屏化）
    - 动效循环内小对象（segment 局部 const 均为标量，V8 标量替换可消化）
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
CR = "src/utils/canvasRenderer.ts"

# 进度预置（同 verify_weather_expansion）：跳过章前引子弹层，直达第肆章选折
PRESET = {
    "unlockedLevel": 8,
    "completedLevels": [1, 2, 3, 4, 5, 6, 7],
    "storySeen": [1, 2, 3],
    "jadeSparks": 900,
    "heroUpgrades": {
        "attackLevel": 3, "hpLevel": 3, "cooldownLevel": 3,
        "resonanceLevel": 3, "runeLevel": 3, "blessingLuckLevel": 3,
    },
    "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
    "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
    "levelStars": {},
    "endlessBest": 0,
    "achievements": ["daily_streak_3", "daily_streak_7", "rune_adept", "rune_master",
                     "blessing_charm", "blessing_fortune", "kills_5000", "kills_20000",
                     "endless_40", "upgrade_zenith"],
    "tutorialDone": True,
    "totalKills": 25000,
    "dailyStreak": 8,
}

results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


# ========== A. 静态锚 ==========
print("== A. 静态锚 ==")
src = open(CR, encoding="utf-8").read()

check(
    "A1. 模块级 RenderItem type + compareRenderY 常量在册",
    "type RenderItem =" in src.split("class ")[0]
    and "const compareRenderY = (a: RenderItem, b: RenderItem) => a.y - b.y;" in src.split("class ")[0],
)

check("A2. 实例槽位池字段 private renderList 在册", "private renderList: RenderItem[] = [];" in src)

a3 = (
    src.count("rl[rlLen] ?? (rl[rlLen] = { type:") == 2
    and "rl.length = rlLen;" in src
    and "rl.sort(compareRenderY);" in src
)
check("A3. 槽位复用三锚（hero/unit 槽 + 截断 + 常量比较器）", a3)

render_seg = src.split("public render(")[1].split("// 12. 墨滞时刻全屏滤镜")[0]
check("A4. render 主链 forEach 清零", ".forEach(" not in render_seg,
      f"count={render_seg.count('.forEach(')}")

check("A5. 函数内旧 type RenderItem 定义移除（模块级唯一真源）", "type RenderItem" not in render_seg)

# ========== B. e2e ==========
print("== B. e2e（暂停冻结帧差分协议） ==")


def js_sample(page, name):
    """全分辨率画布帧采样：帧数据驻留页内 window.__allocFrames，避免跨桥序列化。"""
    return page.evaluate(
        """(name) => {
          const cv = document.querySelector('canvas');
          if (!cv) return null;
          const t = document.createElement('canvas');
          t.width = cv.width; t.height = cv.height;
          const tc = t.getContext('2d');
          tc.drawImage(cv, 0, 0);
          const d = tc.getImageData(0, 0, cv.width, cv.height).data;
          (window.__allocFrames = window.__allocFrames || {})[name] = d;
          return d.length;
        }""",
        name,
    )


def js_diff(page, a, b):
    """页内两帧差分：返回任一通道 |Δ|>10 的像素数。"""
    return page.evaluate(
        """([a, b]) => {
          const A = window.__allocFrames[a], B = window.__allocFrames[b];
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
    page = browser.new_page(viewport={"width": 1280, "height": 720})
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
    check("B1. 战场已入（canvas 在屏）", page.locator("canvas").count() > 0)

    # B2 首次冻结
    page.keyboard.press("1")  # 防守军令降噪声
    page.wait_for_timeout(600)
    page.keyboard.press("p")
    page.wait_for_timeout(500)
    paused_ok = page.locator("text=战局暂歇").first.is_visible()
    if paused_ok:
        js_sample(page, "base")
        page.wait_for_timeout(400)
        js_sample(page, "base2")
        noise1 = js_diff(page, "base", "base2")
        check("B2. 首次冻结噪声 ≤20（帧级确定性实证）", noise1 is not None and noise1 <= 20, f"noise={noise1}")

        # B3 运行扰动 → 槽位轮转 → 再冻结
        page.keyboard.press("p")
        page.wait_for_timeout(2000)  # 单位移动，renderList 排序随 y 变化轮转
        page.keyboard.press("p")
        page.wait_for_timeout(500)
        js_sample(page, "run1")
        page.wait_for_timeout(400)
        js_sample(page, "run2")
        noise2 = js_diff(page, "run1", "run2")
        check("B3. 槽位轮转后再冻结噪声 ≤20（复用池跨帧正确性）", noise2 is not None and noise2 <= 20, f"noise={noise2}")
    else:
        check("B2. 首次冻结噪声 ≤20", False, "暂停遮罩未现")
        check("B3. 槽位轮转后再冻结噪声 ≤20", False, "跳过")

    browser.close()

err_n = len(console_errors)
check("B4. 零 console / page 错误", err_n == 0, f"errors={console_errors[:3]}")

# ========== 汇总 ==========
fails = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n总计 {len(results)} 项 · PASS {len(results) - len(fails)} · FAIL {len(fails)}")
sys.exit(1 if fails else 0)
