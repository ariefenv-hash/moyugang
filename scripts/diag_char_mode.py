# -*- coding: utf-8 -*-
"""诊断：字诀书写的指针管线与判定结果"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

async def stroke(page, x0, y0, x1, y1, steps=8):
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for i in range(1, steps + 1):
        await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, steps=1)
    await page.mouse.up()

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1400)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(800)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2000)

        # 字诀按钮状态（点击前后 class 对比）
        char_btn = page.get_by_role('button', name='字诀')
        cls_before = await char_btn.get_attribute('class')
        await char_btn.click()
        await page.wait_for_timeout(300)
        cls_after = await char_btn.get_attribute('class')

        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52

        # 画一笔，立刻读浮签（430ms 窗口内）
        await stroke(page, cx - 6, cy - 62, cx - 6, cy + 58)
        pill_now = await page.evaluate(
            "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('已书')).pop() || null")

        # 写完整「山」
        await stroke(page, cx - 84, cy - 56, cx - 84, cy + 52)
        await page.mouse.down()
        for i in range(1, 13):
            await page.mouse.move(cx - 84 + i * 12, cy + 58, steps=1)
        await page.mouse.up()
        await stroke(page, cx + 74, cy - 58, cx + 74, cy + 56)

        # 采样判定窗口内的所有浮签文本
        seen = []
        for _ in range(14):
            await page.wait_for_timeout(150)
            texts = await page.evaluate(
                "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('墨渍') || t.includes('「') || t.includes('已书'))")
            for t in texts:
                if t not in seen:
                    seen.append(t)

        await browser.close()
    print(json.dumps({'clsBefore': cls_before, 'clsAfter': cls_after,
                      'pillAfterStroke1': pill_now, 'seenHints': seen[:6],
                      'consoleErrors': errors}, ensure_ascii=False, indent=2))

asyncio.run(main())
