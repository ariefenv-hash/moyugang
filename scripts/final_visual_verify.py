# -*- coding: utf-8 -*-
"""有图生产构建终验：修复后视觉 + 超宽屏镜像平铺 + 视口变化画布自愈"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
OUT = '/home/z/my-project/download'


async def battle(page):
    await page.get_by_text('启卷入战').click()
    await page.wait_for_timeout(900)
    await page.get_by_text('启程试炼').first.click()
    await page.wait_for_timeout(2400)
    try:
        close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
        await close_btn.click(timeout=2000)
        await page.wait_for_timeout(300)
    except Exception:
        pass


async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # A) 360x780 移动视口（用户手机比例）修复后画面
        ctx = await browser.new_context(viewport={'width': 360, 'height': 780},
                                        device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1800)
        await battle(page)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/final_mobile_battle.png')

        # 视口动态变化（模拟地址栏伸缩 780→736→800）：画布自愈应即时跟随
        await page.set_viewport_size({'width': 360, 'height': 736})
        await page.wait_for_timeout(800)
        d1 = await page.evaluate("() => { const c = document.querySelector('canvas'); return [c.width, c.height, c.clientWidth, c.clientHeight]; }")
        await page.screenshot(path=f'{OUT}/final_mobile_736.png')
        await page.set_viewport_size({'width': 360, 'height': 800})
        await page.wait_for_timeout(800)
        d2 = await page.evaluate("() => { const c = document.querySelector('canvas'); return [c.width, c.height, c.clientWidth, c.clientHeight]; }")
        await page.screenshot(path=f'{OUT}/final_mobile_800.png')
        await ctx.close()

        # B) 1720x760 超宽屏：镜像平铺无缝验证
        ctx2 = await browser.new_context(viewport={'width': 1720, 'height': 760})
        page2 = await ctx2.new_page()
        page2.on('pageerror', lambda e: errors.append(str(e)))
        await page2.goto(URL, wait_until='networkidle')
        await page2.wait_for_timeout(1500)
        await battle(page2)
        await page2.wait_for_timeout(1500)
        await page2.screenshot(path=f'{OUT}/final_ultrawide_battle.png')
        # 横向移动后平铺接缝应无硬切（截图留证）
        await page2.keyboard.down('d')
        await page2.wait_for_timeout(1600)
        await page2.keyboard.up('d')
        await page2.wait_for_timeout(400)
        await page2.screenshot(path=f'{OUT}/final_ultrawide_scrolled.png')
        await ctx2.close()
        await browser.close()

    print(json.dumps({
        'viewport736_bitmap_client': d1,
        'viewport800_bitmap_client': d2,
        'selfheal_ok': d1[0] == d1[2] * 2 and d1[1] == d1[3] * 2 and d2[0] == d2[2] * 2 and d2[1] == d2[3] * 2,
        'pageerrors': errors,
    }, ensure_ascii=False))
    print('FINAL VISUAL', 'PASS' if not errors else 'FAIL')

asyncio.run(main())
