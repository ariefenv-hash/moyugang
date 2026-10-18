# -*- coding: utf-8 -*-
"""无图浏览器从头到尾全链路实测
- 拦截全部图片资源（模拟 Lemur 无图模式 / 弱网图片失败）
- 桌面 1280x800 + 移动 360x780@2x 双上下文
- 流程：菜单 → 心诀 → 印谱 → 墨阁 → 选折 → 战斗 → 招募/移动/连击/手势/字诀/切武器/暂停
  → 祝福三选一 → AFK 至败北结算 → 再试一局 → 撤离 → 无尽锁定验证
"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'  # 生产构建预览（与 GitHub Pages 同构）
OUT = '/home/z/my-project/download'
IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif')


async def stroke(page, x0, y0, x1, y1, steps=12):
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    await page.mouse.move(x1, y1, steps=steps)
    await page.mouse.up()


async def dismiss_blessing(page):
    """祝福三选一弹窗出现则点第一张灵符"""
    try:
        marker = page.get_by_text('三择其一').first
        if not await marker.is_visible():
            return False
        await page.locator('div.z-50 button').first.click(timeout=1500)
        await page.wait_for_timeout(500)
        return True
    except Exception:
        return False


async def close_modal(page):
    """通用关闭右上角 X（aria-label=关闭）"""
    try:
        await page.locator('[aria-label="关闭"]').first.click(timeout=2000)
        await page.wait_for_timeout(450)
        return True
    except Exception:
        return False


async def run_flow(ctx, tag, is_mobile):
    errors, blocked = [], []
    shots = []

    async def block_images(route):
        req = route.request
        if req.resource_type == 'image' or req.url.split('?')[0].lower().endswith(IMG_EXT):
            blocked.append(req.url)
            await route.abort()
        else:
            await route.continue_()

    await ctx.route('**/*', block_images)
    page = await ctx.new_page()
    js_errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: js_errors.append(str(e)))

    R = {}

    # 1) 主菜单（无图）
    await page.goto(URL, wait_until='domcontentloaded')
    await page.wait_for_timeout(2200)
    R['menu_title'] = await page.get_by_text('墨韵战纪 · 风雅篇').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_1_menu.png'); shots.append(1)

    # 2) 心诀开合
    await page.get_by_text('兵法心诀').last.click()
    await page.wait_for_timeout(700)
    R['lore_open'] = await page.get_by_text('风雅卷宗').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_2_lore.png')
    await close_modal(page)
    R['lore_closed'] = not await page.get_by_text('风雅卷宗').first.is_visible()

    # 3) 印谱开合
    await page.get_by_text('文心宝箓').first.click()
    await page.wait_for_timeout(700)
    R['achv_open'] = await page.get_by_text('文心印谱').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_3_achv.png')
    await close_modal(page)
    await page.wait_for_timeout(300)

    # 4) 墨阁进出
    await page.get_by_text('翰墨赋诗阁').first.click()
    await page.wait_for_timeout(900)
    R['upgrades_open'] = await page.get_by_text('返回选折').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_4_upgrades.png')
    await page.get_by_text('返回选折').first.click()
    await page.wait_for_timeout(800)
    # 新档（0 通关）墨阁返回会落回主菜单，此时再点启卷入战进选折
    if await page.get_by_text('启卷入战').first.is_visible():
        await page.get_by_text('启卷入战').first.click()
        await page.wait_for_timeout(900)

    # 5) 选折 → 出战第一折（首次进入会自动弹「章前引子」卷轴，先启卷再选折）
    R['select_page'] = await page.get_by_text('启程试炼').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_5_select.png')
    try:
        await page.get_by_role('button', name='启 卷').click(timeout=2500)
        await page.wait_for_timeout(400)
    except Exception:
        pass
    await page.get_by_text('启程试炼').first.click()
    await page.wait_for_timeout(2500)

    # 6) 关教学卡
    try:
        close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
        await close_btn.click(timeout=2500)
        await page.wait_for_timeout(400)
    except Exception:
        pass
    R['battle_canvas'] = await page.evaluate("() => !!document.querySelector('canvas')")
    await page.wait_for_timeout(1200)
    await page.screenshot(path=f'{OUT}/noimg_{tag}_6_battle.png')

    # 7) 招募数值变化（染墨 50 → 采墨侍消耗 50 → 染墨减少）
    get_ink = "() => { const t = document.body.textContent.replace(/\\s+/g, ''); const m = t.match(/墨韵(\\d+)/); return m ? parseInt(m[1]) : -1; }"
    ink0 = await page.evaluate(get_ink)
    await page.get_by_text('采墨', exact=True).first.click()
    await page.wait_for_timeout(900)
    ink1 = await page.evaluate(get_ink)
    R['recruit_ink_drop'] = (ink1 < ink0) if ink0 > 0 else None
    R['ink_values'] = [ink0, ink1]

    # 8) 键盘：WASD 移动 + J 三连击
    await page.keyboard.down('d'); await page.wait_for_timeout(700); await page.keyboard.up('d')
    for _ in range(3):
        await page.keyboard.press('j')
        await page.wait_for_timeout(240)
    await page.wait_for_timeout(600)
    await page.screenshot(path=f'{OUT}/noimg_{tag}_7_attack.png')

    # 9) 手势：横划 / 画圆 / V 字
    box = await page.locator('canvas').last.bounding_box()
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    await stroke(page, cx - 120, cy - 40, cx + 120, cy - 40, steps=8)
    await page.wait_for_timeout(500)
    body_text = await page.evaluate('() => document.body.innerText')
    R['gesture_heng'] = '横' in body_text
    # 画圆（8 点近似）
    import math
    await page.mouse.move(cx + 60 * math.cos(0), cy + 60 * math.sin(0))
    await page.mouse.down()
    for i in range(1, 13):
        await page.mouse.move(cx + 60 * math.cos(i * math.pi / 6), cy + 60 * math.sin(i * math.pi / 6), steps=2)
    await page.mouse.up()
    await page.wait_for_timeout(500)
    body_text = await page.evaluate('() => document.body.innerText')
    R['gesture_circle'] = ('盾' in body_text) or ('竹影' in body_text) or ('圆' in body_text)
    await page.screenshot(path=f'{OUT}/noimg_{tag}_8_gesture.png')
    # V 字（折线引星）
    await stroke(page, cx - 60, cy - 60, cx, cy + 40, steps=6)
    await stroke(page, cx, cy + 40, cx + 60, cy - 60, steps=6)
    await page.wait_for_timeout(500)

    # 10) 字诀写「山」
    await page.get_by_role('button', name='字诀').click()
    await page.wait_for_timeout(1000)
    await stroke(page, cx - 6, cy - 62, cx - 6, cy + 58)
    await stroke(page, cx - 84, cy - 56, cx - 84, cy + 52)
    await page.mouse.move(cx - 84, cy + 58)
    await page.mouse.down()
    await page.mouse.move(cx + 66, cy + 58, steps=10)
    await page.mouse.up()
    await stroke(page, cx + 74, cy - 58, cx + 74, cy + 56)
    await page.wait_for_timeout(1000)
    body_text = await page.evaluate('() => document.body.innerText')
    R['char_shan'] = '「山」' in body_text
    await page.screenshot(path=f'{OUT}/noimg_{tag}_9_char.png')
    await page.wait_for_timeout(2400)
    # 关字诀
    await page.get_by_role('button', name='字诀').click()
    await page.wait_for_timeout(400)

    # 11) 武器切换往返
    await page.keyboard.press('v')
    await page.wait_for_timeout(400)
    t1 = await page.evaluate('() => document.body.innerText')
    has_umbrella = '青罗' in t1
    await page.keyboard.press('v')
    await page.wait_for_timeout(400)
    t2 = await page.evaluate('() => document.body.innerText')
    R['weapon_switch'] = has_umbrella and ('青霜' in t2)

    # 12) ESC 暂停 / 恢复
    await page.keyboard.press('Escape')
    await page.wait_for_timeout(600)
    R['pause_open'] = await page.get_by_text('战局暂歇').first.is_visible()
    await page.screenshot(path=f'{OUT}/noimg_{tag}_10_pause.png')
    await page.keyboard.press('Escape')
    await page.wait_for_timeout(500)
    R['pause_closed'] = not await page.get_by_text('战局暂歇').first.is_visible()

    # 13) AFK 至败北结算（处理祝福弹窗），上限 300s
    ended = False
    for i in range(150):
        await page.wait_for_timeout(2000)
        await dismiss_blessing(page)
        t = await page.evaluate('() => document.body.innerText')
        if '再试一局' in t or '败北' in t:
            ended = True
            break
    R['defeat_reached'] = ended
    await page.screenshot(path=f'{OUT}/noimg_{tag}_11_result.png')
    body_text = await page.evaluate('() => document.body.innerText')
    R['result_stats'] = all(k in body_text for k in ['击破', '连墨', '用时'])

    # 14) 再试一局 → 撤离返回
    if ended:
        await page.get_by_text('再试一局').first.click()
        await page.wait_for_timeout(2200)
        try:
            close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
            await close_btn.click(timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(600)
        # 顶栏退出（ChevronLeft 按钮 = 第一个 header 按钮）
        await page.locator('header button').first.click()
        await page.wait_for_timeout(900)
        R['exit_to_select'] = await page.get_by_text('启程试炼').first.is_visible()

        # 15) 无尽锁定验证（未通关第五折）
        t = await page.evaluate('() => document.body.innerText')
        R['endless_locked_hint'] = ('通关第五折' in t)
        await page.screenshot(path=f'{OUT}/noimg_{tag}_12_endless.png')

    # 拦截图片产生的 ERR_FAILED 属预期噪音，仅统计真实 JS 异常
    R['console_errors'] = js_errors[:8]
    R['resource_errors_n'] = len([e for e in errors if 'ERR_FAILED' in e or 'Failed to load resource' in e])
    R['blocked_img_count'] = len(blocked)
    R['blocked_sample'] = blocked[:3]
    return R


async def main():
    results = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        # 桌面（屏蔽 SW：避免预缓存请求绕过路由拦截干扰无图统计）
        ctx_d = await browser.new_context(viewport={'width': 1280, 'height': 800}, service_workers='block')
        results['desktop'] = await run_flow(ctx_d, 'desktop', False)
        await ctx_d.close()
        # 移动
        ctx_m = await browser.new_context(viewport={'width': 360, 'height': 780},
                                          device_scale_factor=2, is_mobile=True, has_touch=True,
                                          service_workers='block')
        results['mobile'] = await run_flow(ctx_m, 'mobile', True)
        await ctx_m.close()
        await browser.close()

    print(json.dumps(results, ensure_ascii=False, indent=1))
    ok = True
    for tag, R in results.items():
        checks = ['menu_title', 'lore_open', 'lore_closed', 'achv_open', 'upgrades_open',
                  'select_page', 'battle_canvas', 'gesture_heng', 'char_shan',
                  'weapon_switch', 'pause_open', 'pause_closed', 'defeat_reached', 'result_stats']
        for k in checks:
            if R.get(k) is not True:
                ok = False
                print(f'[{tag}] FAIL: {k} = {R.get(k)}')
        if R.get('console_errors'):
            ok = False
            print(f'[{tag}] CONSOLE ERRORS: {R["console_errors"]}')
        if (R.get('blocked_img_count') or 0) < 3:
            ok = False
            print(f'[{tag}] 图片拦截数异常: {R.get("blocked_img_count")}（无图模式未生效？）')
    print('NOIMG FULL PLAYTHROUGH', 'PASS' if ok else 'FAIL')

asyncio.run(main())
