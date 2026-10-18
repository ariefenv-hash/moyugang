# -*- coding: utf-8 -*-
"""手势体验全面强化 · 无头浏览器端到端实测 v11
覆盖：
  T01 经典拖动引路（角色跟随）
  T02-T06 横/竖/提/圆/折 五经典手势
  T07 斜向快扫（新容差 1.22，旧 1.35 会拒）
  T08 长按点按（600ms 内仍算「点」）
  T09 字诀写「山」→ 自信早判立即施放 + 书写时角色站定不被笔尖牵引
  T10 字诀写「之」→ 早判
  T11 退笔 / 重写
  T12 多指守卫（第二指触碰不毁正在写的字，CDP 双指触摸）
  T13 pointercancel 弃笔（半截笔画不误发，后续笔画可续写）
  T14 指针捕获（笔画滑到顶栏 HUD 不断笔，横划照常触发）
  T15 右键 contextmenu 拦截
  M 系 移动端 390x844：点按移动 + CDP 触摸写「山」
全程 0 真实 JS 异常。
"""
import asyncio
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'

# —— 字诀模板（归一化坐标，与 src/utils/charRecognizer.ts 同源） ——
SHAN = [
    [[0.5, 0.04], [0.5, 0.4], [0.5, 0.74]],
    [[0.14, 0.1], [0.14, 0.42], [0.14, 0.72], [0.45, 0.72], [0.78, 0.72]],
    [[0.86, 0.26], [0.86, 0.5], [0.86, 0.74]],
]
ZHI = [
    [[0.08, 0.24], [0.2, 0.34], [0.32, 0.43]],
    [[0.3, 0.56], [0.45, 0.53], [0.58, 0.5], [0.42, 0.65], [0.32, 0.79]],
    [[0.46, 0.58], [0.62, 0.68], [0.78, 0.78], [0.92, 0.9]],
]

results = []
def log(name, ok, extra=''):
    results.append((name, ok))
    print(f"{'✓' if ok else '✗'} {name}{(' | ' + extra) if extra else ''}")

async def norm_stroke(page, tpl_pts, cx, cy, scale=150):
    """按模板归一化折线书写一笔（多段连续插值）"""
    pts = [(cx + (p[0] - 0.5) * scale, cy + (p[1] - 0.5) * scale) for p in tpl_pts]
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for i in range(1, len(pts)):
        await page.mouse.move(pts[i][0], pts[i][1], steps=6)
    await page.mouse.up()

async def poly_stroke(page, pts, steps_per_seg=6):
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for i in range(1, len(pts)):
        await page.mouse.move(pts[i][0], pts[i][1], steps=steps_per_seg)
    await page.mouse.up()

async def find_hint(page, token, budget_ms=600, poll=40):
    """轮询查找含 token 的提示浮签文本，返回 (found, elapsed_ms, text)"""
    import time
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < budget_ms:
        txt = await page.evaluate(
            """(tok) => [...document.querySelectorAll('div')]
                .map(d => d.textContent || '')
                .find(t => t.includes(tok) && t.length < 70) || ''""",
            token)
        if token in txt:
            return True, (time.monotonic() - t0) * 1000, txt
        await page.wait_for_timeout(poll)
    return False, budget_ms, ''

async def hero_pos(page):
    return await page.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")

async def ensure_alive(page):
    """本套测试不刻意防守，据点可能被 AFK 攻破——检测到结算面板则重开一局继续测"""
    body = await page.evaluate("() => document.body.innerText || ''")
    if ('败北' in body) or ('再试一局' in body) or ('大捷' in body):
        btn = page.get_by_role('button', name='再试一局')
        if await btn.count() > 0:
            await btn.first.click()
            await page.wait_for_timeout(2400)
            try:
                close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
                await close_btn.click(timeout=1500)
                await page.wait_for_timeout(300)
            except Exception:
                pass

async def wait_hero_stable(page, quiet_ms=500, max_ms=8000):
    """等角色停止移动（滑行/击退余波），返回静止位置"""
    import time
    t0 = time.monotonic()
    last = await hero_pos(page)
    last_move = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        await page.wait_for_timeout(150)
        cur = await hero_pos(page)
        if cur and last and (abs(cur['x']-last['x']) > 2 or abs(cur['y']-last['y']) > 2):
            last_move = time.monotonic()
        last = cur
        if (time.monotonic() - last_move) * 1000 >= quiet_ms:
            return cur
    return last

async def badge(page):
    return await page.evaluate(
        """() => [...document.querySelectorAll('div')]
            .map(d => d.textContent || '')
            .find(t => t.startsWith('「') && t.length < 30) || ''""")

async def clear_badge_wait(page, ms):
    await page.wait_for_timeout(ms)

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)

        # —— 进入战斗 ——
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2500)
            await page.wait_for_timeout(400)
        except Exception:
            pass
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2200)
        try:
            close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
            await close_btn.click(timeout=2000)
            await page.wait_for_timeout(300)
        except Exception:
            pass

        hook = await page.evaluate("() => !!window.__inkGestureDebug")
        log('T00 dev 测试钩子注入', hook)

        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52

        # —— T01 经典拖动引路 ——
        p0 = await hero_pos(page)
        await poly_stroke(page, [(cx - 200, cy + 40), (cx + 60, cy + 40)], steps_per_seg=14)
        await page.wait_for_timeout(1300)
        p1 = await hero_pos(page)
        moved = p0 and p1 and (p1['x'] - p0['x']) > 50
        log('T01 拖动引路角色跟随', bool(moved), f"dx={p1['x']-p0['x']:.0f}" if p0 and p1 else '')

        # —— T09/T10 字诀：书写站定 + 自信早判 ——
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2100)
        in_char = await page.evaluate("() => window.__inkGestureDebug?.isCharMode?.()")
        log('T09a 字诀模式开启', bool(in_char))

        await wait_hero_stable(page)          # 等 T01 滑行余波结束，角色静止后计时
        p0 = await hero_pos(page)
        await norm_stroke(page, SHAN[0], cx, cy)          # 中竖
        await page.wait_for_timeout(120)
        await poly_stroke(page,                            # 竖折（左竖+底横一笔）
            [(cx + (0.14-0.5)*150, cy + (0.10-0.5)*150),
             (cx + (0.14-0.5)*150, cy + (0.72-0.5)*150),
             (cx + (0.78-0.5)*150, cy + (0.72-0.5)*150)])
        await page.wait_for_timeout(120)
        await norm_stroke(page, SHAN[2], cx, cy)          # 右竖
        found, ms, txt = await find_hint(page, '「山」', budget_ms=450)
        log('T09b 「山」自信早判立即施放(<450ms)', found, f'{ms:.0f}ms {txt[:26]}')
        p1 = await hero_pos(page)
        drift = max(abs(p1['x']-p0['x']), abs(p1['y']-p0['y'])) if p0 and p1 else 999
        log('T09c 书写时角色站定(漂移<22px)', drift < 22, f'drift={drift:.0f}px')
        await page.wait_for_timeout(2600)

        await norm_stroke(page, ZHI[0], cx, cy)
        await page.wait_for_timeout(120)
        await poly_stroke(page,
            [(cx + (0.3-0.5)*150, cy + (0.56-0.5)*150),
             (cx + (0.58-0.5)*150, cy + (0.50-0.5)*150),
             (cx + (0.32-0.5)*150, cy + (0.79-0.5)*150)])
        await page.wait_for_timeout(120)
        await norm_stroke(page, ZHI[2], cx, cy)
        found, ms, txt = await find_hint(page, '「之」', budget_ms=450)
        log('T10 「之」自信早判立即施放(<450ms)', found, f'{ms:.0f}ms')
        await page.wait_for_timeout(2600)

        # —— T11 退笔 / 重写 ——
        await norm_stroke(page, SHAN[0], cx, cy)
        await page.wait_for_timeout(250)
        pill0 = await page.evaluate(
            "() => [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t.includes('已书')) || ''")
        await page.get_by_role('button', name='退笔').click()
        await page.wait_for_timeout(250)
        pill1 = await page.evaluate(
            "() => [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t.includes('已书')) || ''")
        undo_ok = '1 笔' in pill0 and '0 笔' in pill1
        await norm_stroke(page, SHAN[0], cx, cy)
        await page.wait_for_timeout(250)
        await page.get_by_role('button', name='重写').click()
        await page.wait_for_timeout(250)
        pill2 = await page.evaluate(
            "() => [...document.querySelectorAll('span')].map(s => s.textContent).find(t => t.includes('已书')) || ''")
        clear_ok = '0 笔' in pill2
        log('T11 退笔/重写', undo_ok and clear_ok, f'{pill0}→{pill1}→{pill2}')

        # —— T12 多指守卫（CDP 双指触摸） ——
        cdp = await page.context.new_cdp_session(page)
        async def touch(type_, points):
            await cdp.send('Input.dispatchTouchEvent',
                           {'type': type_, 'touchPoints': points})
        async def touch_poly(stroke_pts, extra_finger_at=None):
            """书写一笔；extra_finger_at=(x,y) 在运笔中途落下第二指再抬起"""
            p = stroke_pts
            await touch('touchStart', [{'x': p[0][0], 'y': p[0][1]}])
            await touch('touchMove', [{'x': p[1][0], 'y': p[1][1]}])
            if extra_finger_at:
                await touch('touchStart', [{'x': p[1][0], 'y': p[1][1]},
                                           {'x': extra_finger_at[0], 'y': extra_finger_at[1]}])
                await touch('touchEnd',   [{'x': p[1][0], 'y': p[1][1]}])  # 抬第二指
            for q in p[2:]:
                await touch('touchMove', [{'x': q[0], 'y': q[1]}])
            await touch('touchEnd', [])
        def tpl_to_px(tpl_pts):
            return [(cx + (q[0]-0.5)*150, cy + (q[1]-0.5)*150) for q in tpl_pts]
        await touch_poly(tpl_to_px(SHAN[0]), extra_finger_at=(cx + 260, cy - 200))
        await page.wait_for_timeout(80)
        await touch_poly(tpl_to_px(SHAN[1]))
        await page.wait_for_timeout(80)
        await touch_poly(tpl_to_px(SHAN[2]))
        found, ms, txt = await find_hint(page, '「山」', budget_ms=700)
        log('T12 多指触碰不毁字（第二指中途落下仍成「山」）', found, txt[:26])
        await page.wait_for_timeout(2600)

        # —— T13 pointercancel 弃笔 ——
        await touch_poly(tpl_to_px(SHAN[0]))            # 第1笔正常
        await page.wait_for_timeout(80)
        await touch('touchStart', [{'x': cx, 'y': cy}]) # 第2笔起笔
        await touch('touchMove', [{'x': cx + 40, 'y': cy + 30}])
        await touch('touchCancel', [])                  # 浏览器接管 → 弃笔
        await page.wait_for_timeout(150)
        await touch_poly(tpl_to_px(SHAN[1]))            # 补第2笔
        await page.wait_for_timeout(80)
        await touch_poly(tpl_to_px(SHAN[2]))            # 第3笔
        found, ms, txt = await find_hint(page, '「山」', budget_ms=900)
        log('T13 pointercancel 弃笔后续写仍成「山」', found, txt[:26])
        await page.wait_for_timeout(2600)
        await page.get_by_role('button', name='字诀').click()  # 关字诀
        await page.wait_for_timeout(2100)

        # —— T02 横 ——
        await poly_stroke(page, [(cx-140, cy), (cx+140, cy)], steps_per_seg=9)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T02 横划→断水斩', '「横」' in b, b)
        await clear_badge_wait(page, 1900)

        # —— T07 斜向快扫（dx=200, dy=155，比例1.29：新1.22过 / 旧1.35拒） ——
        await poly_stroke(page, [(cx-100, cy-78), (cx+100, cy+77)], steps_per_seg=9)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T07 斜向快扫（1.29 比例）仍判横', '「横」' in b, b)
        await clear_badge_wait(page, 1900)

        # —— T03 竖 ——
        await poly_stroke(page, [(cx, cy-40), (cx, cy+130)], steps_per_seg=9)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T03 竖划→笔落惊风', '「竖」' in b, b)
        await clear_badge_wait(page, 1900)

        # —— T04 提 ——
        await poly_stroke(page, [(cx, cy+80), (cx, cy-110)], steps_per_seg=9)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T04 提划→轻功腾跃', '「提」' in b, b)
        await clear_badge_wait(page, 1900)

        # —— T05 圆 ——
        import math
        circ = [(cx + 80*math.cos(a), cy + 70*math.sin(a))
                for a in [i*math.pi/9 for i in range(19)]]
        await poly_stroke(page, circ, steps_per_seg=2)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T05 画圆→墨盾/墨荷', ('「圆」' in b) or ('「周」' in b), b)
        await clear_badge_wait(page, 1900)

        # —— T06 折（真 Z：x 向三次变向；首尾距/路径比 0.59 > 0.33 不会被圆抢判） ——
        await poly_stroke(page, [(cx-130, cy-70), (cx+30, cy-20), (cx-70, cy+30), (cx+90, cy+80)],
                          steps_per_seg=6)
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T06 Z 折→星河笔阵', '「折」' in b, b)
        await clear_badge_wait(page, 1900)

        # —— T08 长按点按（450ms 仍算「点」；点地→「行」点敌→「点」） ——
        await ensure_alive(page)
        await page.mouse.move(cx - 60, cy + 60)
        await page.mouse.down()
        await page.wait_for_timeout(450)
        await page.mouse.up()
        await page.wait_for_timeout(250)
        b = await badge(page)
        log('T08 长按450ms→仍判点按', ('「点」' in b) or ('「行」' in b), b)
        await clear_badge_wait(page, 1900)

        # —— T14 指针捕获（滑过顶栏 HUD 不断笔；提速防 duration>650ms 落入 DRAG） ——
        await ensure_alive(page)
        await page.evaluate("() => { window.__inkGestureDebug.trace.length = 0; }")
        await poly_stroke(page, [(1150, 150), (900, 80), (700, 34)], steps_per_seg=4)
        await page.wait_for_timeout(250)
        b = await badge(page)
        if '「横」' in b:
            log('T14 笔画滑出画布至顶栏仍判横（指针捕获）', True, b)
        else:
            tr = await page.evaluate("() => window.__inkGestureDebug.trace.slice(-12)")
            log('T14 笔画滑出画布至顶栏仍判横（指针捕获）', False,
                f"badge={b!r} trace={[(e['ev'],e['x'],e['y']) for e in tr]}")
        await clear_badge_wait(page, 1900)

        # —— T15 右键 contextmenu 拦截（window 监听 + 延迟读取：preventDefault 发生在后续派发阶段） ——
        await ensure_alive(page)
        await page.evaluate(
            "() => { window.__ctxPrevented = null; window.addEventListener('contextmenu',"
            " e => { setTimeout(() => { window.__ctxPrevented = e.defaultPrevented; }, 30); },"
            " { once: true, capture: true }); }")
        await page.mouse.click(cx, cy, button='right')
        await page.wait_for_timeout(350)
        ctx = await page.evaluate("() => window.__ctxPrevented")
        log('T15 右键菜单已拦截', ctx is True)

        await page.screenshot(path=f'{OUT}/verify11_desktop_final.png')

        # —— M 系：移动端 390x844 触摸 ——
        mpage = await browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True,
                                       user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        mpage.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        mpage.on('pageerror', lambda e: errors.append(str(e)))
        await mpage.goto(URL, wait_until='networkidle')
        await mpage.wait_for_timeout(1500)
        await mpage.get_by_text('启卷入战').click()
        await mpage.wait_for_timeout(900)
        try:
            await mpage.get_by_role('button', name='启 卷').click(timeout=2500)
            await mpage.wait_for_timeout(400)
        except Exception:
            pass
        await mpage.get_by_text('启程试炼').first.click()
        await mpage.wait_for_timeout(2200)
        try:
            close_btn = mpage.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
            await close_btn.click(timeout=2000)
            await mpage.wait_for_timeout(300)
        except Exception:
            pass
        mbox = await mpage.locator('canvas').last.bounding_box()
        mcx, mcy = mbox['x'] + mbox['width']/2, mbox['y'] + mbox['height']*0.45

        # M1 触摸点按移动（分区后点地移形须点在下方行止区：>56% 屏高）
        mp0 = await mpage.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")
        await mpage.touchscreen.tap(mcx - 130, mbox['y'] + mbox['height'] * 0.82)
        await mpage.wait_for_timeout(1200)
        mp1 = await mpage.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")
        m_moved = mp0 and mp1 and abs(mp1['x'] - mp0['x']) > 30
        log('M1 触摸点按移动', bool(m_moved), f"dx={mp1['x']-mp0['x']:.0f}" if mp0 and mp1 else '')

        # M2 触摸写「山」（含早判） + 书写站定
        await mpage.get_by_role('button', name='字诀').tap()
        await mpage.wait_for_timeout(2100)
        await wait_hero_stable(mpage)   # 等 M1 滑行余波结束
        mp0 = await mpage.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")
        mcdp = await mpage.context.new_cdp_session(mpage)
        async def mtouch(type_, points):
            await mcdp.send('Input.dispatchTouchEvent', {'type': type_, 'touchPoints': points})
        async def mtouch_poly(tpl_pts):
            p = [(mcx + (q[0]-0.5)*110, mcy + (q[1]-0.5)*110) for q in tpl_pts]
            await mtouch('touchStart', [{'x': p[0][0], 'y': p[0][1]}])
            for q in p[1:]:
                await mtouch('touchMove', [{'x': q[0], 'y': q[1]}])
            await mtouch('touchEnd', [])
        await mtouch_poly(SHAN[0])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[1])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[2])
        t0 = __import__('time').monotonic()
        found = False
        while (__import__('time').monotonic() - t0) * 1000 < 700:
            txt = await mpage.evaluate(
                """() => [...document.querySelectorAll('div')].map(d => d.textContent || '')
                    .find(t => t.includes('「山」') && t.length < 70) || ''""")
            if '「山」' in txt:
                found = True
                break
            await mpage.wait_for_timeout(40)
        ms = (__import__('time').monotonic() - t0) * 1000
        log('M2 触摸写「山」早判施放(<700ms)', found, f'{ms:.0f}ms')
        mp1 = await mpage.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")
        drift = max(abs(mp1['x']-mp0['x']), abs(mp1['y']-mp0['y'])) if mp0 and mp1 else 999
        log('M3 移动端书写角色站定(<24px)', drift < 24, f'drift={drift:.0f}px')
        await mpage.screenshot(path=f'{OUT}/verify11_mobile_char.png')

        # —— 汇总 ——
        real_errors = [e for e in errors if 'favicon' not in e.lower()]
        log('全程 0 真实 JS 异常', len(real_errors) == 0, '; '.join(real_errors[:3]))
        passed = sum(1 for _, ok in results if ok)
        print(f"\n===== 手势强化实测：{passed}/{len(results)} PASS =====")
        await browser.close()
        if passed != len(results):
            raise SystemExit(1)

asyncio.run(main())
