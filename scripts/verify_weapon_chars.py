# -*- coding: utf-8 -*-
"""验证三合一：双武器切换（青霜剑/青罗伞）+ 七字诀（含川/心）+ 退笔/重写浮签"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'

async def stroke(page, x0, y0, x1, y1, steps=12):
    # 单次调用插值（浏览器端连续补间），模拟真实手指的连续运笔，
    # 避免 CDP 往返开销把笔间间隙拉到判定阈值之外
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(x1, y1, steps=steps)
    await page.mouse.up()

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)

        # 进战斗
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        # 新增：首次进入选折页会自动弹出「章前引子」卷轴，先启卷再选折
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2500)
            await page.wait_for_timeout(400)
        except Exception:
            pass
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2200)

        # 关闭首战教学卡（避免遮挡书写区，也验证教学可关闭）
        try:
            close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
            await close_btn.click(timeout=2000)
            await page.wait_for_timeout(400)
        except Exception:
            pass

        btns = lambda: page.evaluate(
            "() => [...document.querySelectorAll('button')].map(b => b.textContent.trim())")

        # 1) 武器按钮初始为青霜剑
        w0 = await btns()
        has_sword_btn = any('青霜' in t for t in w0)

        # 2) V 键切换 → 青罗伞
        await page.keyboard.press('v')
        await page.wait_for_timeout(400)
        w1 = await btns()
        umbrella_btn = any('青罗' in t for t in w1)
        badge_umbrella = await page.evaluate(
            "() => [...document.querySelectorAll('div')].some(d => d.textContent.includes('「伞」'))")
        await page.screenshot(path=f'{OUT}/verify8_umbrella.png')

        # 3) 伞三式：连点落墨 3 次（第三式应触发旋伞回雪，无报错即可）
        for _ in range(3):
            await page.get_by_role('button', name='落墨').click()
            await page.wait_for_timeout(260)

        # 4) 字诀模式：写「山」（4 笔）→ 竹影墨盾
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2200)
        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52
        # 中竖
        await stroke(page, cx - 6, cy - 62, cx - 6, cy + 58)
        # 左竖
        await stroke(page, cx - 84, cy - 56, cx - 84, cy + 52)
        # 底横（左→右）
        await page.mouse.move(cx - 84, cy + 58)
        await page.mouse.down()
        await page.mouse.move(cx + 66, cy + 58, steps=10)
        await page.mouse.up()
        # 右竖
        await stroke(page, cx + 74, cy - 58, cx + 74, cy + 56)
        await page.wait_for_timeout(900)
        hint_shan_text = await page.evaluate(
            "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('「') && t.length < 40).pop() || ''")
        hint_shan = '「山」' in hint_shan_text
        await page.screenshot(path=f'{OUT}/verify8_char_shan.png')
        await page.wait_for_timeout(2600)

        # 5) 写「川」（撇+两竖，首笔带真人左掠弧度）→ 三江引
        await page.mouse.move(cx - 20, cy - 74)
        await page.mouse.down()
        await page.mouse.move(cx - 46, cy - 10, steps=5)
        await page.mouse.move(cx - 68, cy + 50, steps=5)
        await page.mouse.move(cx - 74, cy + 76, steps=3)
        await page.mouse.up()
        await stroke(page, cx + 4, cy - 74, cx + 4, cy + 76)
        await stroke(page, cx + 76, cy - 74, cx + 76, cy + 76)
        await page.wait_for_timeout(900)
        hint_chuan_text = await page.evaluate(
            "() => [...document.querySelectorAll('div')].map(d => d.textContent).filter(t => t.includes('「') && t.length < 40).pop() || ''")
        hint_chuan = '「川」' in hint_chuan_text
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/verify8_river_waves.png')
        await page.wait_for_timeout(1800)

        # 6) 字诀浮签：退笔/重写按钮存在
        pill = await page.evaluate(
            "() => ({ back: [...document.querySelectorAll('button')].some(b => b.textContent.includes('退笔')),"
            " clear: [...document.querySelectorAll('button')].some(b => b.textContent.includes('重写')) })")

        # 7) V 键切回青霜剑
        await page.keyboard.press('v')
        await page.wait_for_timeout(300)
        w2 = await btns()
        sword_back = any('青霜' in t for t in w2)

        await page.screenshot(path=f'{OUT}/verify8_final_sword.png')
        await browser.close()

    result = {
        'swordBtnInit': has_sword_btn,
        'umbrellaAfterV': umbrella_btn,
        'badgeUmbrella': badge_umbrella,
        'hintShan': hint_shan,
        'shanHintText': hint_shan_text,
        'hintChuan': hint_chuan,
        'chuanHintText': hint_chuan_text,
        'undoClearBtns': pill,
        'swordBack': sword_back,
        'consoleErrors': errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    ok = (has_sword_btn and umbrella_btn and badge_umbrella and hint_shan
          and hint_chuan and pill['back'] and pill['clear'] and sword_back and not errors)
    print('VERIFY', 'PASS' if ok else 'FAIL')

asyncio.run(main())
