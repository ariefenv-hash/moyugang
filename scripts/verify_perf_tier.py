"""
性能自动分档验证
验证项：
  1. deviceMemory=2（无显式偏好）→ 默认行云模式
  2. deviceMemory=2 + 显式 high → 高清（玩家偏好优先）
  3. deviceMemory=8 + cores=8（无偏好）→ 高清
  4. 无 console/page 错误
每例独立 page + add_init_script 硬编码覆写（导航持久生效）。
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def quality_low_state(page):
    return page.evaluate(
        """() => {
            const btns = Array.from(document.querySelectorAll('header button'));
            const b = btns.find(x => (x.title || '').includes('行云'));
            return b ? b.className.includes('emerald') : null;
        }"""
    )


def run_case(pw, mem_gb, cores, quality=None):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.add_init_script(
        f"Object.defineProperty(Navigator.prototype, 'deviceMemory', {{ get: () => {mem_gb}, configurable: true }});"
        f"Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {{ get: () => {cores}, configurable: true }});"
    )
    page.goto(BASE, wait_until="networkidle")
    if quality:
        page.evaluate("(q) => localStorage.setItem('ink_steel_quality', q)", quality)
    else:
        page.evaluate("() => localStorage.removeItem('ink_steel_quality')")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    page.click("text=启卷入战")
    page.wait_for_timeout(1400)
    try:
        b = page.locator("button:has-text('启 卷')").first
        if b.is_visible(timeout=1500):
            b.click()
            page.wait_for_timeout(400)
    except Exception:
        pass
    page.click("text=启程试炼 >> nth=0")
    page.wait_for_timeout(2200)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    q = quality_low_state(page)
    browser.close()
    return in_battle, q


with sync_playwright() as pw:
    ok, q = run_case(pw, 2, 4)
    check("1. deviceMemory=2 自动行云", ok and q is True, f"in_battle={ok} qualityLow={q}")

    ok, q = run_case(pw, 2, 4, quality='high')
    check("2. 显式high优先于低内存", ok and q is False, f"in_battle={ok} qualityLow={q}")

    ok, q = run_case(pw, 8, 8)
    check("3. deviceMemory=8+8核 默认高清", ok and q is False, f"in_battle={ok} qualityLow={q}")

    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("4. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n===== 性能分档: {passed}/{len(results)} PASS =====")
sys.exit(0 if passed == len(results) else 1)
