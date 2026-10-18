# -*- coding: utf-8 -*-
"""复现用户截图问题：360x780 移动视口进入第一折战斗，检查画布尺寸/半屏暗区"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(
            viewport={'width': 360, 'height': 780},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        page = await ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/repro_1_menu.png')

        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/repro_2_battle.png')

        # 关教学卡
        try:
            close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
            await close_btn.click(timeout=2000)
            await page.wait_for_timeout(400)
        except Exception:
            pass
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f'{OUT}/repro_3_battle.png')

        # 诊断：画布位图尺寸 vs 元素尺寸 vs 渲染器逻辑尺寸
        diag = await page.evaluate(
            """() => {
              const c = document.querySelector('canvas');
              const r = c.getBoundingClientRect();
              return {
                bitmap: [c.width, c.height],
                cssRect: [r.width, r.height],
                client: [c.clientWidth, c.clientHeight],
                inner: [window.innerWidth, window.innerHeight],
                vv: window.visualViewport ? [window.visualViewport.width, window.visualViewport.height] : null,
                docEl: [document.documentElement.clientWidth, document.documentElement.clientHeight],
                dpr: window.devicePixelRatio,
              };
            }"""
        )
        print('DIAG:', json.dumps(diag))
        await browser.close()
    print('consoleErrors:', errors)

asyncio.run(main())
