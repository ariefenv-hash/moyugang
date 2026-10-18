# -*- coding: utf-8 -*-
"""全遥测：山→川 全程 pointer 事件时间线"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1400)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(800)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2000)
        try:
            await page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first.click(timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(300)

        await page.evaluate("""() => {
            window.__log = [];
            const t0 = performance.now();
            const log = (type, x, y) => window.__log.push([type, Math.round(performance.now() - t0), Math.round(x), Math.round(y)]);
            window.addEventListener('pointerdown', (e) => log('D', e.clientX, e.clientY), true);
            window.addEventListener('pointerup', (e) => log('U', e.clientX, e.clientY), true);
        }""")

        # 武器切换 + 三次落墨（复刻 verify 流程）
        await page.keyboard.press('v')
        await page.wait_for_timeout(400)
        for _ in range(3):
            await page.get_by_role('button', name='落墨').click()
            await page.wait_for_timeout(260)

        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2200)

        cx, cy = 640, 416

        async def stroke(x0, y0, x1, y1, steps=12):
            await page.mouse.move(x0, y0)
            await page.mouse.down()
            await page.mouse.move(x1, y1, steps=steps)
            await page.mouse.up()

        # 山
        await stroke(cx - 6, cy - 62, cx - 6, cy + 58)
        await stroke(cx - 84, cy - 56, cx - 84, cy + 52)
        await page.mouse.move(cx - 84, cy + 58)
        await page.mouse.down()
        await page.mouse.move(cx + 66, cy + 58, steps=10)
        await page.mouse.up()
        await stroke(cx + 74, cy - 58, cx + 74, cy + 56)
        await page.wait_for_timeout(900)
        await page.wait_for_timeout(2600)

        # 川
        await stroke(cx - 78, cy - 70, cx - 86, cy + 66)
        await stroke(cx - 6, cy - 74, cx - 6, cy + 74)
        await stroke(cx + 66, cy - 74, cx + 66, cy + 74)
        await page.wait_for_timeout(1000)

        hints = await page.evaluate(
            "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('「') && t.length < 40).pop() || ''")
        log = await page.evaluate("() => window.__log")
        await browser.close()

    # 只打印战斗区事件（y < 600 的 D/U）
    combat = [e for e in log if e[0] in 'DU' and e[3] < 620]
    print('HINT:', hints[:50])
    for e in combat:
        print(e)

asyncio.run(main())
