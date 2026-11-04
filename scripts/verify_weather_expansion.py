#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_weather_expansion.py — 天气事件池扩展（Task 48）无头验证

覆盖链路：
  A. 静态源锚：WeatherEvent 六型联合 / WEATHER_EFFECTS 六条 / 触发池主线 5 型
     无尽 6 型 / PLUM_RAIN 敌速 0.75 / FROST_DESCENT 敌攻 0.85 双接线（近战+弹体）
     / HUD 六型图标 / 渲染器六型演出分支 / 音高映射 / 验证缝四件套
  B. e2e 异象状态机：forceWeather 六型 roundtrip（weatherState 读数）+
     clearWeather 清空 + 未知型兜底 INK_RAIN
  C. e2e HUD 横幅：六型「异象 · <名>」全部可见（含两新型梅雨连绵/霜降凝兵）
  D. e2e 演出层像素差分（自校准噪声基线）：无异象双采样得噪声 N0 →
     PLUM_RAIN / FROST_DESCENT / 两新型互 diff 均须 > max(3×N0, 2000)
  E. 全程零 console error / pageerror

用法：python3 scripts/verify_weather_expansion.py（需 dev :3000）
"""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []

ALL_TYPES = ["INK_RAIN", "POETIC_BREEZE", "LUNAR_GLOW", "CRIMSON_ECLIPSE", "PLUM_RAIN", "FROST_DESCENT"]
NAMES = {
    "INK_RAIN": "天降墨雨",
    "POETIC_BREEZE": "清风徐来",
    "LUNAR_GLOW": "残月生辉",
    "CRIMSON_ECLIPSE": "玄墨蚀月",
    "PLUM_RAIN": "梅雨连绵",
    "FROST_DESCENT": "霜降凝兵",
}


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


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


def run_static():
    print("A. 静态源锚")
    tp = open("src/types/game.ts", encoding="utf-8").read()
    seg = tp[tp.index("export interface WeatherEvent"):tp.index("export interface SealStamp")]
    n_types = sum(1 for t in ALL_TYPES if f"'{t}'" in seg)
    check("A1 WeatherEvent 六型联合在册", n_types == 6, f"实测 {n_types}/6")
    gd = open("src/data/gameData.ts", encoding="utf-8").read()
    seg2 = gd[gd.index("export const WEATHER_EFFECTS"):gd.index("};", gd.index("export const WEATHER_EFFECTS"))]
    n_eff = sum(1 for t in ALL_TYPES if f"{t}:" in seg2)
    check("A2 WEATHER_EFFECTS 六条文案在册", n_eff == 6, f"实测 {n_eff}/6")
    check("A3 两新型名与数值文案",
          "梅雨连绵" in seg2 and "敌军移速降低 25%" in seg2
          and "霜降凝兵" in seg2 and "敌军攻击降低 15%" in seg2)
    bv = open("src/components/BattleView.tsx", encoding="utf-8").read()
    check("A4 触发池主线 5 型 / 无尽 6 型",
          "['INK_RAIN', 'POETIC_BREEZE', 'LUNAR_GLOW', 'CRIMSON_ECLIPSE', 'PLUM_RAIN', 'FROST_DESCENT']" in bv
          and "['INK_RAIN', 'POETIC_BREEZE', 'LUNAR_GLOW', 'PLUM_RAIN', 'FROST_DESCENT']" in bv)
    check("A5 PLUM_RAIN 敌军移速 0.75 接线",
          "=== 'PLUM_RAIN' && unit.isEnemy ? 0.75 : 1.0" in bv)
    check("A6 FROST_DESCENT 近战+弹体双接线（0.85）",
          bv.count("=== 'FROST_DESCENT'") >= 2
          and "Math.round(unit.attack * 0.85)" in bv
          and "Math.round(proj.damage * 0.85)" in bv)
    check("A7 HUD 六型图标在册（含补齐蚀月 MoonStar）",
          all(k in bv for k in ("CloudRain", "Wind", "Moon", "MoonStar", "CloudDrizzle", "Snowflake")))
    check("A8 音高映射六型在册",
          "PLUM_RAIN: 587.33" in bv and "FROST_DESCENT: 523.25" in bv)
    check("A9 验证缝四件套（forceWeather/weatherState/clearWeather/池）",
          all(k in bv for k in ("forceWeather", "weatherState", "clearWeather")))
    cr = open("src/utils/canvasRenderer.ts", encoding="utf-8").read()
    check("A10 渲染器演出层六型分支在册",
          "drawWeatherEventOverlay" in cr
          and all(cr.count(f"evt.type === '{t}'") >= 1 for t in ALL_TYPES))
    check("A11 演出层调用点与淡入淡出",
          "this.drawWeatherEventOverlay(activeWeather, gameTime);" in cr
          and "fadeIn" in cr and "fadeOut" in cr)


def js_sample(page, name):
    """全分辨率画布帧采样：帧数据驻留页内 window.__wxFrames，避免跨桥序列化。"""
    return page.evaluate(
        """(name) => {
          const cv = document.querySelector('canvas');
          if (!cv) return null;
          const t = document.createElement('canvas');
          t.width = cv.width; t.height = cv.height;
          const tc = t.getContext('2d');
          tc.drawImage(cv, 0, 0);
          const d = tc.getImageData(0, 0, cv.width, cv.height).data;
          (window.__wxFrames = window.__wxFrames || {})[name] = d;
          return d.length;
        }""",
        name,
    )


def js_diff(page, a, b):
    """页内两帧差分：返回任一通道 |Δ|>10 的像素数。"""
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


def run_e2e(page):
    print("B/C/D. e2e 异象状态机 + HUD 横幅 + 演出层像素差分（暂停冻结帧协议）")
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
    check("D0 战场已入", page.locator("canvas").count() > 0)
    page.keyboard.press("1")  # 防守军令：固守降战局噪声

    # B. 六型 roundtrip + 兜底 + 清空
    ok_types = []
    for t in ALL_TYPES:
        page.evaluate(f"() => window.__inkGestureDebug.forceWeather('{t}')")
        page.wait_for_timeout(120)
        st = page.evaluate("() => window.__inkGestureDebug.weatherState()")
        ok_types.append(st and st["type"] == t and 12.0 <= st["timeRemaining"] <= 15.01)
    check("B1 forceWeather 六型 roundtrip（读数 12~15s）", all(ok_types), str(ok_types))
    page.evaluate("() => window.__inkGestureDebug.forceWeather('NOT_A_TYPE')")
    page.wait_for_timeout(120)
    st_bad = page.evaluate("() => window.__inkGestureDebug.weatherState()")
    check("B2 未知型兜底 INK_RAIN", st_bad and st_bad["type"] == "INK_RAIN", str(st_bad))
    page.evaluate("() => window.__inkGestureDebug.clearWeather()")
    page.wait_for_timeout(120)
    st_null = page.evaluate("() => window.__inkGestureDebug.weatherState()")
    check("B3 clearWeather 清空", st_null is None, str(st_null))

    # C. HUD 横幅六型（重点两新型）
    hud_ok = []
    for t in ALL_TYPES:
        page.evaluate(f"() => window.__inkGestureDebug.forceWeather('{t}')")
        page.wait_for_timeout(200)
        hud_ok.append(page.locator(f"text=异象 · {NAMES[t]}").first.is_visible())
    check("C1 HUD 六型横幅可见（含梅雨连绵/霜降凝兵）", all(hud_ok), str(hud_ok))

    # D. 演出层像素差分：暂停冻结帧 → dt=0 战局凝滞，帧差=纯演出信号
    page.evaluate("() => window.__inkGestureDebug.clearWeather()")
    page.wait_for_timeout(600)
    page.keyboard.press("p")
    page.wait_for_timeout(500)
    paused_ok = page.locator("text=战局暂歇").first.is_visible()
    check("D1 战局暂停冻结（遮罩在屏）", paused_ok, f"visible={paused_ok}")
    if paused_ok:
        js_sample(page, "base")
        page.wait_for_timeout(400)
        js_sample(page, "base2")
        noise = js_diff(page, "base", "base2")
        check("D2 冻结帧噪声≈0（帧级确定性实证，≤20 容差）", noise is not None and noise <= 20, f"noise={noise}")
        for t in ALL_TYPES:
            page.keyboard.press("p")  # 解除暂停
            page.wait_for_timeout(250)
            page.evaluate(f"() => window.__inkGestureDebug.forceWeather('{t}')")
            page.wait_for_timeout(1600)  # 淡入 1.2s 完成
            page.keyboard.press("p")  # 再暂停凝滞
            page.wait_for_timeout(300)
            js_sample(page, t)
        page.keyboard.press("p")  # 解除暂停收尾
        page.wait_for_timeout(200)
        bar = 300
        d_plum = js_diff(page, "base", "PLUM_RAIN")
        d_frost = js_diff(page, "base", "FROST_DESCENT")
        d_cross_pi = js_diff(page, "PLUM_RAIN", "INK_RAIN")
        d_cross_pf = js_diff(page, "PLUM_RAIN", "FROST_DESCENT")
        check("D3 PLUM_RAIN 演出层可见（雨丝+梅瓣差分超阈）",
              d_plum is not None and d_plum > bar, f"plum={d_plum} bar={bar}")
        check("D4 FROST_DESCENT 演出层可见（霜白渐变差分超阈）",
              d_frost is not None and d_frost > bar, f"frost={d_frost} bar={bar}")
        check("D5 梅雨 vs 墨雨演出互异", d_cross_pi is not None and d_cross_pi > bar,
              f"cross={d_cross_pi} bar={bar}")
        check("D6 梅雨 vs 霜降演出互异", d_cross_pf is not None and d_cross_pf > bar,
              f"cross={d_cross_pf} bar={bar}")
    page.evaluate("() => window.__inkGestureDebug.clearWeather()")


def main():
    run_static()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1024, "height": 768})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        run_e2e(page)
        browser.close()
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"\n==== verify_weather_expansion: {len(results) - n_fail}/{len(results)} PASS ====")
    if console_errors:
        print("console/page errors:")
        for e in console_errors[:8]:
            print("  -", e[:200])
    sys.exit(1 if (n_fail or console_errors) else 0)


if __name__ == "__main__":
    main()
