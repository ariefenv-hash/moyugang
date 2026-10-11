# -*- coding: utf-8 -*-
"""定位拦截 pointerup 的元素"""
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

        # 记录 window 级 pointerup 的真实目标
        await page.evaluate("""() => {
            window.__ups = [];
            window.addEventListener('pointerup', (e) => {
                window.__ups.push({
                    tag: e.target.tagName,
                    cls: (e.target.className || '').toString().slice(0, 60),
                    text: (e.target.textContent || '').slice(0, 24),
                });
            }, true);
        }""")

        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(300)
        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52

        await page.mouse.move(cx - 6, cy - 62)
        await page.mouse.down()
        for i in range(9):
            await page.mouse.move(cx - 6, cy - 62 + i * 14, steps=1)
        await page.mouse.up()
        await page.wait_for_timeout(300)

        ups = await page.evaluate("() => window.__ups")
        # 采样几个关键点的 elementFromPoint
        probes = {}
        for dy in (-62, 0, 30, 50, 58, 66, 74):
            r = await page.evaluate(
                f"""() => {{
                    const el = document.elementFromPoint({cx - 6}, {cy + dy});
                    return el ? {{tag: el.tagName, cls: (el.className||'').toString().slice(0,50), text: (el.textContent||'').slice(0,18)}} : null;
                }}""")
            probes[dy] = r
        await browser.close()
    print(json.dumps({'pointerUps': ups, 'elementAt': probes}, ensure_ascii=False, indent=2))

asyncio.run(main())
