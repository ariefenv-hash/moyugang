# -*- coding: utf-8 -*-
"""快笔诊断：山书写全程时序采样"""
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

        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2200)

        cx, cy = 640, 416

        async def snap(tag):
            t = await page.evaluate(
                "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('已书') || t.includes('墨渍') || (t.includes('「') && t.length < 40)).pop() || ''")
            print(f"[{tag}] {t[:70]}")

        async def stroke(x0, y0, x1, y1, steps=12):
            await page.mouse.move(x0, y0)
            await page.mouse.down()
            await page.mouse.move(x1, y1, steps=steps)
            await page.mouse.up()

        await stroke(cx - 6, cy - 62, cx - 6, cy + 58)
        await snap('s1')
        await stroke(cx - 84, cy - 56, cx - 84, cy + 52)
        await snap('s2')
        await page.mouse.move(cx - 84, cy + 58)
        await page.mouse.down()
        await page.mouse.move(cx + 66, cy + 58, steps=10)
        await page.mouse.up()
        await snap('s3')
        await stroke(cx + 74, cy - 58, cx + 74, cy + 56)
        for i in range(12):
            await page.wait_for_timeout(180)
            await snap(f'+{180*(i+1)}ms')
        await page.screenshot(path='/home/z/my-project/download/diag_shan_fast.png')
        await browser.close()

asyncio.run(main())
