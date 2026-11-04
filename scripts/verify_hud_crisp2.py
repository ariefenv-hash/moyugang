"""
Task 49 — HUD 细描边第贰阶段：单边线（border-b/t/l/r）纳入 .hud-crisp
验证项：
  A. 静态锚（源码级）
    A1. index.css 四条单边线规则齐备（border-b/t/l/r × max(0.5px, calc(1px / var(--dpr))))
    A2. 壹阶段全边规则保留（[class~='border'] + border-width:）
    A3. 注释注明贰阶段与整词匹配语义
    A4. BattleView 顶条锚串 border-b border-stone-800（.hud-crisp 根下）
    A5. BattleView 粗单边线计数 = 0（零破坏面：border-b-2/border-t-4 等不进折算）
    A6. BattleView 单边线整词计数：border-b ≥2 · border-t ≥4
  B. e2e（dev :3000 · CSSOM + 选择器作用域矩阵）
    B1. .hud-crisp 根存在
    B2. CSSOM 五规则在册且均含发丝折算表达式（壹阶段 1 + 贰阶段 4）
    B3. 作用域命中矩阵（探针 div × matches）：
        border → 壹阶段选择器 true / 单边选择器 false
        border-b/t/l/r → 对应单边选择器 true / 其它单边与全边选择器 false
        border-b-2 → 全部折算选择器 false（整词豁免实证）
    B4. 真实 HUD 元素命中：顶条 border-b / 浮层 border-t / 全边技能按钮
    B5. --dpr 变量链可用（root 上可写读，规则表达式依赖成立）
    B6. 全程零 console / page 错误

  注：不采用 getComputedStyle / 物理像素断言——本沙箱 Chromium 对 border-width
  的 used value 无视 dsf 一律取整到整 CSS px（最小页面实测 0.5px→1px
  @dsf=1/1.5/2，内联/!important/渲染厚度均然），subpixel 差异被内核吞没；
  故以「规则在册 + 作用域命中正确 + 表达式语义（A 段）」为折算生效的完备判据。
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
CSS = "src/index.css"
BV = "src/components/BattleView.tsx"

results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


# ========== A. 静态锚 ==========
print("== A. 静态锚 ==")
css = open(CSS, encoding="utf-8").read()
bv = open(BV, encoding="utf-8").read()

hairline = "max(0.5px, calc(1px / var(--dpr)))"
a1_pairs = [
    ("border-b", "border-bottom-width"),
    ("border-t", "border-top-width"),
    ("border-l", "border-left-width"),
    ("border-r", "border-right-width"),
]
a1_ok = all(f"[class~='{tok}']" in css for tok, _ in a1_pairs) and all(
    f"{prop}: {hairline}" in css for _, prop in a1_pairs
)
check("A1. 四条单边线规则齐备且均含发丝折算", a1_ok)

check("A2. 壹阶段全边规则保留", "[class~='border']" in css and f"border-width: {hairline}" in css)

a3_ok = "贰阶段（Task 49）" in css and "整词匹配" in css
check("A3. 注释注明贰阶段与整词匹配语义", a3_ok)

a4_ok = "border-b border-stone-800" in bv
check("A4. BattleView 顶条锚串 border-b border-stone-800", a4_ok)

a5 = len(re.findall(r"\bborder-[btlr]-\d", bv))
check("A5. BattleView 粗单边线计数=0（零破坏面）", a5 == 0, f"count={a5}")

nb, nt = len(re.findall(r"\bborder-b\b", bv)), len(re.findall(r"\bborder-t\b", bv))
check("A6. 单边线整词计数 border-b≥2 · border-t≥4", nb >= 2 and nt >= 4, f"b={nb} t={nt}")

# ========== B. e2e ==========
print("== B. e2e ==")

MATRICES_JS = """() => {
    const root = document.querySelector('.hud-crisp');
    if (!root) return { root: false };
    const mk = (cls) => {
        const d = document.createElement('div');
        d.className = cls;
        root.appendChild(d);
        return d;
    };
    const SEL_ALL = ".hud-crisp [class~='border']";
    const SEL = { b: ".hud-crisp [class~='border-b']", t: ".hud-crisp [class~='border-t']",
                  l: ".hud-crisp [class~='border-l']", r: ".hud-crisp [class~='border-r']" };
    const probe = (cls) => {
        const el = mk(cls);
        const m = { all: el.matches(SEL_ALL), b: el.matches(SEL.b), t: el.matches(SEL.t),
                    l: el.matches(SEL.l), r: el.matches(SEL.r) };
        el.remove();
        return m;
    };
    // CSSOM 在册检查
    const want = ['border', 'border-b', 'border-t', 'border-l', 'border-r'];
    const found = {};
    for (const ss of document.styleSheets) {
        let rules;
        try { rules = ss.cssRules; } catch (e) { continue; }
        const walk = (list) => {
            for (const r of list) {
                // CSS Nesting 内核下 CSSStyleRule.cssRules 也非空（空列表），
                // 必须先查 selectorText 再递归，否则普通规则被 continue 吞掉
                if (r.selectorText) {
                    for (const w of want) {
                        if (r.selectorText.includes(`[class~="${w}"]`) && r.selectorText.includes('hud-crisp')) {
                            found[w] = (found[w] || 0) + (r.cssText.includes('calc(1px / var(--dpr))') ? 1 : 0);
                        }
                    }
                }
                if (r.cssRules && r.cssRules.length) walk(r.cssRules);
            }
        };
        walk(rules);
    }
    return {
        root: true,
        cssom: found,
        m_all: probe('border'),
        m_b: probe('border-b'),
        m_t: probe('border-t'),
        m_l: probe('border-l'),
        m_r: probe('border-r'),
        m_b2: probe('border-b-2'),
        topbar: (() => {
            const el = document.querySelector(".hud-crisp [class~='border-b']");
            return el ? el.matches(".hud-crisp [class~='border-b']") && el.className.includes('border-stone-800') : false;
        })(),
        alledge: (() => {
            const el = document.querySelector(".hud-crisp [class~='border']");
            return el ? el.matches(".hud-crisp [class~='border']") : false;
        })(),
    };
}"""


def enter_battle(page):
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


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    enter_battle(page)
    R = page.evaluate(MATRICES_JS)

    check("B1. .hud-crisp 根存在", R.get("root") is True)

    cs = R.get("cssom", {})
    check(
        "B2. CSSOM 五规则在册且含发丝折算表达式",
        all(cs.get(k, 0) >= 1 for k in ("border", "border-b", "border-t", "border-l", "border-r")),
        f"counts={cs}",
    )

    # 作用域命中矩阵
    ma, mb, mt, ml, mr, mb2 = (R.get(f"m_{k}") for k in ("all", "b", "t", "l", "r", "b2"))
    ok_all = ma["all"] and not (ma["b"] or ma["t"] or ma["l"] or ma["r"])
    check("B3a. 全边探针：壹阶段 true / 单边 false", ok_all, f"{ma}")
    ok_b = mb["b"] and not mb["all"] and not (mb["t"] or mb["l"] or mb["r"])
    ok_t = mt["t"] and not mt["all"] and not (mt["b"] or mt["l"] or mt["r"])
    ok_l = ml["l"] and not ml["all"] and not (ml["b"] or ml["t"] or ml["r"])
    ok_r = mr["r"] and not mr["all"] and not (mr["b"] or mr["t"] or mr["l"])
    check("B3b. 单边探针：各命中己侧 / 互不串扰 / 不误入全边", ok_b and ok_t and ok_l and ok_r,
          f"b={mb} t={mt} l={ml} r={mr}")
    ok_b2 = not (mb2["all"] or mb2["b"] or mb2["t"] or mb2["l"] or mb2["r"])
    check("B3c. 粗单边探针 border-b-2：全部折算选择器 false（整词豁免）", ok_b2, f"{mb2}")

    check("B4a. 真实顶条（border-b border-stone-800）命中贰阶段选择器", R.get("topbar") is True)
    check("B4b. 真实全边元素命中壹阶段选择器（回归）", R.get("alledge") is True)

    # 浮层 border-t 真实元素
    page.click("button[title='手势指南']")
    page.wait_for_timeout(600)
    guide_ok = page.evaluate(
        """() => {
            const els = [...document.querySelectorAll(".hud-crisp [class~='border-t']")];
            return els.length >= 3 && els.every((e) => e.matches(".hud-crisp [class~='border-t']"));
        }"""
    )
    check("B4c. 手势指南浮层 border-t 分段线 ≥3 且全数命中贰阶段选择器", guide_ok)
    page.click("button[title='手势指南']")
    page.wait_for_timeout(400)

    dpr_ok = page.evaluate(
        """() => {
            const root = document.documentElement;
            root.style.setProperty('--dpr', '2');
            const v = getComputedStyle(root).getPropertyValue('--dpr');
            root.style.setProperty('--dpr', '1');
            return v === '2';
        }"""
    )
    check("B5. --dpr 变量链可写读（规则表达式依赖成立）", dpr_ok)

    browser.close()

err_n = len(console_errors)
check("B6. 零 console / page 错误", err_n == 0, f"errors={console_errors[:3]}")

# ========== 汇总 ==========
fails = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n总计 {len(results)} 项 · PASS {len(results) - len(fails)} · FAIL {len(fails)}")
sys.exit(1 if fails else 0)
