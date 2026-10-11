# -*- coding: utf-8 -*-
"""行云性能模式验证：开关/持久化/低帧自动建议（CPU 节流模拟弱机）"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
OUT = '/home/z/my-project/download'


async def enter_battle(page):
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
        ctx = await browser.new_context(viewport={'width': 900, 'height': 700})
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)
        await enter_battle(page)

        # 1) 行云按钮存在（顶栏 title=行云模式）
        wind_btn = page.locator('header button[title*="行云"]')
        R = {'wind_btn': await wind_btn.count() == 1}

        # 2) 点击开启 → localStorage 持久化 + 按钮激活
        await wind_btn.click()
        await page.wait_for_timeout(400)
        R['persist'] = await page.evaluate("() => localStorage.getItem('ink_steel_quality')") == 'low'
        R['btn_active'] = 'emerald' in (await wind_btn.get_attribute('class') or '')
        await page.screenshot(path=f'{OUT}/verify9_xingyun_on.png')

        # 3) 刷新后仍保持
        await page.reload(wait_until='networkidle')
        await page.wait_for_timeout(1500)
        await enter_battle(page)
        R['persist_after_reload'] = await page.evaluate("() => localStorage.getItem('ink_steel_quality')") == 'low'
        wind_btn2 = page.locator('header button[title*="行云"]')
        R['btn_active_after_reload'] = 'emerald' in (await wind_btn2.get_attribute('class') or '')
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/verify9_xingyun_reload.png')

        # 4) 行云模式下战斗正常运行 3s（无 JS 错误即认为模拟+渲染链路健康）
        await page.keyboard.down('d')
        await page.wait_for_timeout(900)
        await page.keyboard.up('d')
        for _ in range(3):
            await page.keyboard.press('j')
            await page.wait_for_timeout(260)
        R['low_mode_playable'] = True

        # 5) 关闭行云 → 恢复 high
        await wind_btn2.click()
        await page.wait_for_timeout(300)
        R['toggle_back'] = await page.evaluate("() => localStorage.getItem('ink_steel_quality')") == 'high'

        # 6) CPU 节流 8x 模拟弱机 → 帧率巡检应在 ~6-14s 内弹建议浮签
        cdp = await ctx.new_cdp_session(page)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 8})
        await page.keyboard.down('d')
        await page.wait_for_timeout(700)
        await page.keyboard.up('d')
        tip_seen = False
        for _ in range(20):
            await page.wait_for_timeout(1000)
            if await page.get_by_text('检测到画面吃紧').count() > 0:
                tip_seen = True
                break
        R['lowfps_tip'] = tip_seen
        await page.screenshot(path=f'{OUT}/verify9_lowfps_tip.png')
        # 7) 点「开启」→ 浮签消失 + 模式激活
        if tip_seen:
            await page.get_by_text('开启', exact=True).first.click()
            await page.wait_for_timeout(400)
            R['tip_action_works'] = await page.get_by_text('检测到画面吃紧').count() == 0 and \
                'emerald' in (await page.locator('header button[title*="行云"]').get_attribute('class') or '')
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        await ctx.close()
        await browser.close()

    R['pageerrors'] = errors
    print(json.dumps(R, ensure_ascii=False, indent=1))
    ok = all(v is True for k, v in R.items() if k not in ('pageerrors',)) and not errors
    print('XINGYUN VERIFY', 'PASS' if ok else 'FAIL')

asyncio.run(main())
