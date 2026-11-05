"""
Task 50 — 结算页（VictoryDefeatModal）视觉精修
验证项：
  A. 静态锚（源码级）
    A1. index.css 双 keyframes 在册（vd-rise / vd-star-pop）
    A2. 双 utility 在册（animate-vd-rise / animate-vd-star-pop）
    A3. hud-crisp-vd 面板折算规则在册（panel-paper/panel-paper-deep × 发丝表达式）
    A4. prefers-reduced-motion 降级块在册（media + 双类 + animation:none）
    A5. Modal 根挂 hud-crisp-vd；rise 阶梯 ≥8 处；点亮星 pop（s<=stars 条件）；
        未点亮星无 pop；delay 常量阶梯 0.16→0.62 单调不减
    A6. App __vdDebug DEV 缝在册（DEV 守卫 + preview 三形态 + ACHIEVEMENTS mock）
    A7. 设计粗线保留：Modal 内 border-l-2 计数 = 2（题跋/尾声，整词豁免不受折算）
  B. e2e（dev :3000 · __vdDebug.preview 三形态 · CSSOM + 作用域矩阵）
    B1. preview('VICTORY') → 大捷标题 + .hud-crisp-vd 根在 DOM
    B2. CSSOM 在册：双 keyframes + hud-crisp-vd 折算规则含表达式 + reduced-motion 媒体规则
    B3. 命中矩阵：真实 chip/成就面板命中折算选择器；题跋 border-l-2 对折算选择器 false
    B4. 星印弹出：3 颗点亮星全带 pop 类，delay 0.34/0.47/0.60s 严格阶梯
    B5. rise 链：8 区块 delay 序列 = 0.16/0.22/0.28/0.36/0.44/0.50/0.56/0.62
    B6. preview('ENDLESS_DEFEAT') → 长夜标题 + 波次条 + 无星区
    B7. preview('DEFEAT') → 折戟标题 + 无星区无灵玉
    B8. reduced-motion 模拟 → 点亮星 computed animationName 'none'（静置降级）
    B9. 全程零 console / page 错误

  注：沿用 Task 49 判据三件套（CSSOM 在册 + 作用域命中 + 表达式语义静态锚），
  不做 border-width computed/物理像素断言（本沙箱 Chromium used value 取整坑，在录）。
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
CSS = "src/index.css"
MODAL = "src/components/VictoryDefeatModal.tsx"
APP = "src/App.tsx"

results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


# ========== A. 静态锚 ==========
print("== A. 静态锚 ==")
css = open(CSS, encoding="utf-8").read()
mx = open(MODAL, encoding="utf-8").read()
app = open(APP, encoding="utf-8").read()
hairline = "max(0.5px, calc(1px / var(--dpr)))"

check(
    "A1. 双 keyframes 在册",
    "@keyframes vd-rise" in css and "@keyframes vd-star-pop" in css,
)
check(
    "A2. 双 utility 在册",
    "@utility animate-vd-rise" in css and "@utility animate-vd-star-pop" in css,
)
a3_ok = (
    ".hud-crisp-vd .panel-paper" in css
    and ".hud-crisp-vd .panel-paper-deep" in css
    # 精确子串 border-width: max(...) 仅存在于：壹阶段全边规则 + vd 面板规则
    # （单边规则的属性名是 border-bottom-width 等，不含 border-width 子串）
    and css.count(f"border-width: {hairline}") >= 2
)
check("A3. hud-crisp-vd 面板折算规则在册（含发丝表达式）", a3_ok)
a4_ok = (
    "prefers-reduced-motion: reduce" in css
    and ".animate-vd-rise" in css.split("prefers-reduced-motion: reduce")[1]
    and ".animate-vd-star-pop" in css.split("prefers-reduced-motion: reduce")[1]
    and "animation: none" in css.split("prefers-reduced-motion: reduce")[1]
)
check("A4. prefers-reduced-motion 降级块在册", a4_ok)

a5_root = 'className="hud-crisp-vd' in mx
a5_rise_n = mx.count("animate-vd-rise")  # 10 处：互斥区块（星区/波次区·尾声/成就）源码各一
a5_pop = "animate-vd-star-pop fill-tenghuang text-tenghuang" in mx
a5_empty_star = (
    "'text-paper-edge'" in mx
    and a5_pop
    and "s <= stars ? { animationDelay" in mx  # pop 类与 delay 仅限点亮分支，空星 undefined
    and "['0.34s', '0.47s', '0.60s']" in mx  # 写死阶梯字面量（免浮点误差）
)
delays = [float(m) for m in re.findall(r"animationDelay: '([0-9.]+)s'", mx)]
a5_delay_ok = (
    delays == [0.16, 0.22, 0.28, 0.28, 0.36, 0.44, 0.5, 0.5, 0.56, 0.62]
)
check(
    "A5. 根挂 hud-crisp-vd + rise=10 + 点亮星 pop/空星豁免 + delay 阶梯精确",
    a5_root and a5_rise_n >= 10 and a5_pop and a5_empty_star and a5_delay_ok,
    f"rise={a5_rise_n} delays={delays}",
)

a6_ok = (
    "__vdDebug" in app
    and "import.meta.env.DEV" in app
    and "'VICTORY' | 'DEFEAT' | 'ENDLESS_DEFEAT'" in app
    and "ACHIEVEMENTS[0]" in app
)
check("A6. App __vdDebug DEV 缝（守卫 + 三形态 + mock）", a6_ok)

a7 = len(re.findall(r"\bborder-l-2\b", mx))
check("A7. 设计粗线 border-l-2 保留 2 处（题跋/尾声，不进折算）", a7 == 2, f"count={a7}")

# ========== B. e2e ==========
print("== B. e2e ==")

B_MAIN_JS = """() => {
    const root = document.querySelector('.hud-crisp-vd');
    if (!root) return { root: false };
    const out = { root: true };

    // 标题
    out.title = root.querySelector('h2')?.textContent || '';

    // B2: CSSOM 在册
    const kf = new Set();
    let vd_rule = false, media_ok = false;
    const walk = (list) => {
        for (const r of list) {
            if (r.type === CSSRule.KEYFRAMES_RULE) kf.add(r.name);
            if (r.selectorText && r.selectorText.includes('.hud-crisp-vd')
                && r.selectorText.includes('.panel-paper')
                && r.cssText.includes('calc(1px / var(--dpr))')) vd_rule = true;
            if (r.conditionText && r.conditionText.includes('prefers-reduced-motion')) {
                const inner = [...r.cssRules].map(x => x.selectorText || '').join('|');
                if (inner.includes('animate-vd-rise') && inner.includes('animate-vd-star-pop')) media_ok = true;
            }
            if (r.cssRules && r.cssRules.length) walk(r.cssRules);
        }
    };
    for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch (e) { continue; }
        walk(rules);
    }
    out.cssom = { kf: [...kf].filter(n => n.startsWith('vd-')), vd_rule, media_ok };

    // B3: 命中矩阵（真实元素）
    const chip = root.querySelector('.panel-paper-deep');       // 战报 chip 或波次条
    const paper = root.querySelector('.panel-paper');           // 成就面板
    out.chip_hit = chip ? chip.matches('.hud-crisp-vd .panel-paper-deep') : false;
    out.paper_hit = paper ? paper.matches('.hud-crisp-vd .panel-paper') : false;
    const quote = [...root.querySelectorAll('div')].find(d => d.className.includes('border-l-2'));
    out.quote_hit = quote ? !quote.matches(".hud-crisp-vd [class~='border']")
                                    && !quote.matches("[class~='border-l']") : false;
    out.quote_exists = !!quote;

    // B4: 星印弹出（lucide Star 为 SVG 元素，className 是 SVGAnimatedString，
    // 必须用 classList.contains / getAttribute('class')，不能用 className.includes）
    const lit = [...root.querySelectorAll('.animate-vd-star-pop')];
    out.lit_stars = lit.map(s => ({
        lit: s.classList.contains('fill-tenghuang'),
        delay: s.style.animationDelay,
    }));

    // B5: rise 链
    out.rise = [...root.querySelectorAll('.animate-vd-rise')].map(e => e.style.animationDelay || '0s');

    // 灵玉行
    out.jade = root.textContent.includes('获赠文心灵玉');
    return out;
}"""

B_STATE_JS = """() => {
    const root = document.querySelector('.hud-crisp-vd');
    if (!root) return null;
    const t = root.textContent;
    return {
        title: root.querySelector('h2')?.textContent || '',
        stars: root.querySelectorAll('.animate-vd-star-pop').length,
        hasStarsArea: !!root.querySelector('.animate-vd-star-pop') || t.includes('坚守至第'),
        waveBar: t.includes('坚守至第') && t.includes('波'),
        jade: t.includes('获赠文心灵玉'),
    };
}"""


def preview(page, kind):
    page.evaluate(f"() => window.__vdDebug?.preview('{kind}')")
    page.wait_for_timeout(900)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)

    has_seam = page.evaluate("() => typeof window.__vdDebug?.preview === 'function'")
    check("B0. __vdDebug DEV 缝在页面暴露", has_seam)

    # —— 胜局全景 ——
    preview(page, "VICTORY")
    R = page.evaluate(B_MAIN_JS)
    check("B1. 大捷标题 + .hud-crisp-vd 根在 DOM", R.get("root") is True and "大捷" in R.get("title", ""),
          f"title={R.get('title', '')[:18]}")

    cs = R.get("cssom", {})
    check("B2. CSSOM：双 keyframes + 折算规则含表达式 + reduced-motion 媒体规则",
          set(cs.get("kf", [])) == {"vd-rise", "vd-star-pop"} and cs.get("vd_rule") and cs.get("media_ok"),
          f"{cs}")

    check("B3. 命中矩阵：chip/panel 命中折算选择器 · 题跋 border-l-2 豁免实证",
          R.get("chip_hit") is True and R.get("paper_hit") is True
          and R.get("quote_hit") is True and R.get("quote_exists") is True,
          f"chip={R.get('chip_hit')} paper={R.get('paper_hit')} quote_hit={R.get('quote_hit')} quote_ex={R.get('quote_exists')}")

    lit = R.get("lit_stars", [])
    lit_delays = [float(d["delay"].rstrip("s")) for d in lit if d.get("delay")]
    b4_ok = (
        len(lit) == 3
        and all(d["lit"] for d in lit)
        and lit_delays == [0.34, 0.47, 0.60]
    )
    check("B4. 三颗点亮星全带 pop + delay 0.34/0.47/0.60s 严格阶梯",
          b4_ok, f"lit={lit_delays}")

    rise = R.get("rise", [])
    rise_f = [float(d.rstrip("s")) for d in rise]
    b5_ok = rise_f == [0.16, 0.22, 0.28, 0.36, 0.44, 0.50, 0.56, 0.62]
    check("B5. rise 链 8 区块 delay 序列精确匹配", b5_ok, f"rise={rise_f}")
    check("B5b. 胜局灵玉行在卷", R.get("jade") is True)

    # —— 无尽负 ——
    preview(page, "ENDLESS_DEFEAT")
    S = page.evaluate(B_STATE_JS)
    check("B6. 长夜标题 + 波次条 + 无星区",
          S and "长夜未尽" in S["title"] and S["waveBar"] and S["stars"] == 0 and not S["jade"],
          f"title={S['title'][:14]} stars={S['stars']} wave={S['waveBar']}")

    # —— 普通负 ——
    preview(page, "DEFEAT")
    S2 = page.evaluate(B_STATE_JS)
    check("B7. 折戟标题 + 无星区无波次条无灵玉",
          S2 and "折戟" in S2["title"] and S2["stars"] == 0 and not S2["waveBar"] and not S2["jade"],
          f"title={S2['title'][:14]}")

    # —— reduced-motion 降级 ——
    page.emulate_media(reduced_motion="reduce")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    preview(page, "VICTORY")
    rm_ok = page.evaluate(
        """() => {
            const s = document.querySelector('.hud-crisp-vd .animate-vd-star-pop');
            const r = document.querySelector('.hud-crisp-vd h2.animate-vd-rise');
            if (!s || !r) return false;
            return getComputedStyle(s).animationName === 'none'
                && getComputedStyle(r).animationName === 'none';
        }"""
    )
    check("B8. reduced-motion 下 pop/rise computed animationName='none'（静置降级）", rm_ok)

    browser.close()

err_n = len(console_errors)
check("B9. 零 console / page 错误", err_n == 0, f"errors={console_errors[:3]}")

# ========== 汇总 ==========
fails = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n总计 {len(results)} 项 · PASS {len(results) - len(fails)} · FAIL {len(fails)}")
sys.exit(1 if fails else 0)
