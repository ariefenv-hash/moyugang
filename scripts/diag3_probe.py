# -*- coding: utf-8 -*-
"""探针诊断：原生 pointer 事件计数 + React 处理器活性"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

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

        # 原生事件探针
        await page.evaluate("""() => {
            const c = document.querySelector('canvas');
            window.__ev = {down: 0, up: 0, move: 0, cancel: 0};
            c.addEventListener('pointerdown', () => window.__ev.down++);
            c.addEventListener('pointerup', () => window.__ev.up++);
            c.addEventListener('pointercancel', () => window.__ev.cancel++);
            c.addEventListener('pointermove', () => window.__ev.move++);
        }""")

        # 开字诀
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(400)

        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52

        # 单笔竖线
        await page.mouse.move(cx - 6, cy - 62)
        await page.mouse.down()
        for i in range(9):
            await page.mouse.move(cx - 6, cy - 62 + i * 14, steps=1)
        await page.mouse.up()
        await page.wait_for_timeout(700)

        ev = await page.evaluate("() => window.__ev")

        # 读取 React 处理器是否真的挂在 canvas 上（React 19 用 root 委托，检查 props 键）
        props = await page.evaluate("""() => {
            const c = document.querySelector('canvas');
            const keys = Object.keys(c);
            const propKey = keys.find(k => k.startsWith('__reactProps'));
            const p = propKey ? c[propKey] : null;
            return {
                hasProps: !!p,
                hasDown: !!(p && p.onPointerDown),
                hasUp: !!(p && p.onPointerUp),
            };
        }""")

        # 立即再写一笔并马上查 pill（压缩时序）
        await page.mouse.move(cx + 60, cy - 50)
        await page.mouse.down()
        for i in range(9):
            await page.mouse.move(cx + 60, cy - 50 + i * 13, steps=1)
        await page.mouse.up()
        pill_fast = await page.evaluate(
            "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('已书')).pop() || null")

        await page.wait_for_timeout(2000)
        await browser.close()
    print(json.dumps({'nativeEvents': ev, 'reactProps': props,
                      'pillFast': pill_fast, 'consoleErrors': errors},
                     ensure_ascii=False, indent=2))

asyncio.run(main())
