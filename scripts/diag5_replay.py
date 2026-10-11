# -*- coding: utf-8 -*-
"""终极诊断：记录真实收到的 pointer 事件 → 重构笔画 → 离线重放"""
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
            await page.wait_for_timeout(300)
        except Exception:
            pass

        await page.evaluate("""() => {
            window.__strokes = [];
            window.__cur = null;
            const c = document.querySelector('canvas');
            c.addEventListener('pointerdown', (e) => {
                window.__cur = { x: e.clientX, y: e.clientY, t: performance.now() };
            });
            c.addEventListener('pointermove', (e) => {
                if (window.__cur) window.__cur.x = e.clientX, window.__cur.y = e.clientY;
            });
            window.addEventListener('pointerup', (e) => {
                if (window.__cur) {
                    window.__strokes.push({ x0: window.__cur.x, y0: window.__cur.y, x1: e.clientX, y1: e.clientY, dt: Math.round(performance.now() - window.__cur.t) });
                    window.__cur = null;
                }
            }, true);
        }""")

        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2200)

        cx, cy = 640, 416

        async def stroke(x0, y0, x1, y1, steps=6):
            await page.mouse.move(x0, y0)
            await page.mouse.down()
            for i in range(1, steps + 1):
                await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, steps=1)
            await page.mouse.up()

        t0 = asyncio.get_event_loop().time()
        await stroke(cx - 6, cy - 62, cx - 6, cy + 58)
        await stroke(cx - 84, cy - 56, cx - 84, cy + 52, steps=5)
        await page.mouse.down()
        for i in range(1, 11):
            await page.mouse.move(cx - 84 + i * 15, cy + 58, steps=1)
        await page.mouse.up()
        t_stroke4_start = asyncio.get_event_loop().time()
        await stroke(cx + 74, cy - 58, cx + 74, cy + 56)
        t_stroke4_end = asyncio.get_event_loop().time()
        gap_ms = (t_stroke4_start - t_stroke4_end) * 0  # placeholder
        await page.wait_for_timeout(2500)

        ups = await page.evaluate("() => window.__strokes")
        await browser.close()

    print(json.dumps(ups, ensure_ascii=False, indent=1))

asyncio.run(main())
