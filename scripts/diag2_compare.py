# -*- coding: utf-8 -*-
"""对照诊断：手势模式回归 + 字诀单笔预览截图"""
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

        # A. 手势模式回归：横划 → 「横」徽章
        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52
        await stroke(page, cx - 170, cy, cx + 170, cy, steps=14)
        await page.wait_for_timeout(500)
        h_badge = await page.evaluate(
            "() => [...document.querySelectorAll('div')].some(d => d.textContent.includes('「横」'))")

        # B. 字诀模式：单笔竖 → 立刻截图看墨稿预览 + 轮询浮签 3 秒
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2200)  # 等「字诀 · 开」提示散去
        await stroke(page, cx - 6, cy - 62, cx - 6, cy + 58)
        await page.wait_for_timeout(120)  # 430ms 判定窗内截图：应见墨稿预览
        await page.screenshot(path='/home/z/my-project/download/diag_stroke1.png')
        seq = []
        for _ in range(20):
            await page.wait_for_timeout(200)
            texts = await page.evaluate(
                "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('墨渍') || t.includes('已书') || (t.includes('「') && t.includes('」') && t.length < 60))")
            key = '|'.join(texts)[:80]
            if key and (not seq or seq[-1] != key):
                seq.append(key)
        await page.screenshot(path='/home/z/my-project/download/diag_after_commit.png')
        await browser.close()
    print(json.dumps({'hBadge': h_badge, 'timeline': seq, 'consoleErrors': errors},
                     ensure_ascii=False, indent=2))

asyncio.run(main())
