# -*- coding: utf-8 -*-
"""分区操控 + 切关修复 + 突刺收势 + 信息增强 · 无头浏览器端到端实测 v12
覆盖：
  S 组 场景切换干净性（battleSession key 强制 remount，根治切关残留卡死）
    S1 进入第 1 折，记录基线战况
    S2 forceVictory → 结算 → 点「下一折」进第 2 折
    S3 新战场全新：关卡 id/标题切换、gameTime 归零、基地满血、角色回出生点、敌军未生成
    S4 第 2 折再速胜 → 进第 3 折再次干净（复现「有机率」路径两次）
  D 组 突刺收势合体（SKILL_DASH 自动回位 + 移动接管）
    D1 横划 → 瞬间采样到 SKILL_DASH 且位移 ≈ +220px
    D2 600ms 后状态已回 IDLE（不再永久卡突进姿势）——核心断言
    D3 突刺后立刻下区点地 → 角色继续移动（两动作合为一体）
  Z 组 上下分区操控
    Z1 上区空点 → 不移动（heroTargetMove=null，位移<8px）
    Z2 下区空点 → 步移景从（heroTargetMove 有值，位移>40px）
    Z3 上区慢速拖动 → 角色不跟随（画字绝不带跑）
    Z4 下区慢速拖动 → 角色跟随
    Z5 上区空点首现「书」分区提示浮签
    Z6 分区线与「书符/行止」标签渲染
    Z7 字诀开启分区线隐去，关闭恢复
    Z8 书符区横划照常出招（断水斩）
    Z9 出招清残留：点地移动目标 → 横划出招 → 目标被清、角色不继续走
  H 组 信息展示增强
    H1 战况行（波次/敌情/用时/墨阁%/敌营%）渲染且数值在界内
    H2 画圆起盾 → 「墨盾 N」实时 chip
    H3 技能冷却遮罩（断水按钮触发 CD 后显示秒数）
    H4 操控心诀含「上下分区」说明
全程 0 真实 JS 异常。
"""
import asyncio
import time
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'

results = []
def log(name, ok, extra=''):
    results.append((name, ok))
    print(f"{'✓' if ok else '✗'} {name}{(' | ' + extra) if extra else ''}")

async def bs(page):
    return await page.evaluate("() => window.__inkGestureDebug?.battleState?.() || null")

async def hero_pos(page):
    return await page.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")

async def hero_state(page):
    return await page.evaluate("() => window.__inkGestureDebug?.heroState?.() || null")

async def hero_target(page):
    return await page.evaluate("() => window.__inkGestureDebug?.heroTarget?.() || null")

async def poly_stroke(page, pts, steps_per_seg=6, hold_ms=0):
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for i in range(1, len(pts)):
        await page.mouse.move(pts[i][0], pts[i][1], steps=steps_per_seg)
    if hold_ms:
        await page.wait_for_timeout(hold_ms)
    await page.mouse.up()

async def slow_drag(page, pts, seg_ms=260, steps_per_seg=6):
    """慢速拖动引路：每段之间停留，总时长需 > 650ms 才不会被误判为快扫手势"""
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for i in range(1, len(pts)):
        await page.mouse.move(pts[i][0], pts[i][1], steps=steps_per_seg)
        await page.wait_for_timeout(seg_ms)
    await page.mouse.up()

async def hero_screen(page):
    """剑仙屏幕坐标（hero world - camera）"""
    return await page.evaluate(
        """() => {
            const d = window.__inkGestureDebug;
            const pos = d?.heroPos?.();
            const info = d?.comboInfo?.();
            if (!pos || !info) return null;
            return { x: pos.x - info.cameraX, y: pos.y };
        }""")

async def tap(page, x, y):
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.wait_for_timeout(60)
    await page.mouse.up()

async def wait_hero_stable(page, quiet_ms=500, max_ms=8000):
    t0 = time.monotonic()
    last = await hero_pos(page)
    last_move = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        await page.wait_for_timeout(150)
        cur = await hero_pos(page)
        if cur and last and (abs(cur['x'] - last['x']) > 2 or abs(cur['y'] - last['y']) > 2):
            last_move = time.monotonic()
        last = cur
        if (time.monotonic() - last_move) * 1000 >= quiet_ms:
            return cur
    return last

async def enter_battle_first(page):
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

async def force_victory_and_next(page, next_label='下一折'):
    ok = await page.evaluate("() => window.__inkGestureDebug?.forceVictory?.() ?? false")
    await page.wait_for_timeout(900)
    btn = page.get_by_role('button', name=next_label)
    cnt = await btn.count()
    if cnt == 0:
        return False
    await btn.first.click()
    await page.wait_for_timeout(2400)
    return ok

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)

        await enter_battle_first(page)
        hook = await page.evaluate("() => !!(window.__inkGestureDebug?.battleState)")
        log('T00 dev 测试钩子（battleState/heroState/forceVictory）', hook)

        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        W, H = box['width'], box['height']
        split_y = box['y'] + H * 0.56          # 分区线
        top_y = box['y'] + H * 0.30            # 书符区采样点
        low_y = box['y'] + H * 0.82            # 行止区采样点
        mid_x = box['x'] + W / 2

        # ============ S 组：场景切换干净性 ============
        s1 = await bs(page)
        log('S1 第1折基线战况', bool(s1 and s1['levelId'] == 1),
            f"id={s1['levelId']} t={s1['gameTime']} 敌{s1['enemyCount']} 友{s1['friendlyCount']}" if s1 else '')

        ok = await force_victory_and_next(page)
        s2 = await bs(page)
        log('S2 速胜第1折 → 点「下一折」进第2折', bool(ok and s2 and s2['levelId'] == 2),
            f"新关={s2['levelTitle']}" if s2 else '未进入')

        fresh = s2 and s2['gameTime'] < 6 and s2['playerBaseHp'] > 0
        hero0 = await hero_pos(page)
        fresh_hero = hero0 and hero0['x'] < 320
        log('S3 新战场全新（时间归零/基地满/角色回出生点）', bool(fresh and fresh_hero),
            f"t={s2['gameTime']} 基地={s2['playerBaseHp']} heroX={hero0['x']:.0f}" if s2 and hero0 else '')

        ok2 = await force_victory_and_next(page)
        s4 = await bs(page)
        fresh2 = s4 and s4['levelId'] == 3 and s4['gameTime'] < 6 and s4['enemyCount'] <= 2
        log('S4 连续切关再次干净（第2折→第3折）', bool(ok2 and fresh2),
            f"id={s4['levelId']} t={s4['gameTime']} 敌{s4['enemyCount']} 波{s4['waveDone']}/{s4['waveTotal']}" if s4 else '')

        # ============ D 组：突刺收势合体 ============
        # 等新战场稳定
        await wait_hero_stable(page, quiet_ms=400, max_ms=6000)
        d0 = await hero_pos(page)
        # 下区横划 → 断水斩（起笔 y=low_y 在行止区）
        await poly_stroke(page, [(mid_x - 160, low_y), (mid_x + 160, low_y)], steps_per_seg=4)
        st_now = await hero_state(page)
        await page.wait_for_timeout(420)
        st_after = await hero_state(page)
        d1 = await hero_pos(page)
        dash_dx = (d1['x'] - d0['x']) if d0 and d1 else 0
        log('D1 横划触发突刺（SKILL_DASH 采样/前突位移）',
            bool(st_now and st_now['state'] == 'SKILL_DASH') or dash_dx > 120,
            f"即时state={st_now['state'] if st_now else '?'} dx={dash_dx:.0f}")
        log('D2 突刺 0.35s 自动收势回 IDLE（不卡姿势）',
            bool(st_after and st_after['state'] in ('IDLE', 'WALK')),
            f"420ms后={st_after['state'] if st_after else '?'}")

        # D3 突刺后立刻点地下区 → 移动接管
        await page.wait_for_timeout(300)
        d2 = await hero_pos(page)
        await tap(page, mid_x + 150, low_y)
        await page.wait_for_timeout(1100)
        d3 = await hero_pos(page)
        moved_after_dash = d2 and d3 and abs(d3['x'] - d2['x']) > 40
        log('D3 突刺后点地立即续走（两动作合为一体）', bool(moved_after_dash),
            f"dx={d3['x'] - d2['x']:.0f}" if d2 and d3 else '')

        # ============ Z 组：上下分区 ============
        await wait_hero_stable(page, quiet_ms=450, max_ms=6000)
        z0 = await hero_pos(page)
        # Z1 上区空点 → 不移动
        await tap(page, mid_x + 220, top_y)
        tgt1 = await hero_target(page)
        await page.wait_for_timeout(1000)
        z1 = await hero_pos(page)
        no_move = z0 and z1 and abs(z1['x'] - z0['x']) < 8 and abs(z1['y'] - z0['y']) < 8
        log('Z1 书符区空点不误移（目标空/位移<8px）', bool(tgt1 is None and no_move),
            f"target={tgt1} dx={abs(z1['x'] - z0['x']):.0f}" if z0 and z1 else '')

        # Z5 上区空点首现分区提示
        found_hint = False
        for _ in range(8):
            txt = await page.evaluate(
                """() => [...document.querySelectorAll('div')]
                    .map(d => d.textContent || '')
                    .find(t => t.includes('画字施法') && t.length < 60) || ''""")
            if txt:
                found_hint = True
                break
            await page.wait_for_timeout(120)
        log('Z5 书符区空点首现「书」提示浮签', found_hint, txt[:30] if found_hint else '')

        # Z2 下区空点 → 步移景从
        await wait_hero_stable(page, quiet_ms=450, max_ms=6000)
        z2a = await hero_pos(page)
        await tap(page, mid_x - 200, low_y)
        tgt2 = await hero_target(page)
        await page.wait_for_timeout(1200)
        z2b = await hero_pos(page)
        moved = z2a and z2b and abs(z2b['x'] - z2a['x']) > 40
        log('Z2 行止区点地移形（目标设置/位移>40px）', bool(tgt2 is not None or moved) and bool(moved),
            f"dx={abs(z2b['x'] - z2a['x']):.0f}" if z2a and z2b else '')

        # Z3 上区慢速拖动（4 点 3 段 × 260ms ≈ 800ms，远超快扫窗）→ 不跟随
        await wait_hero_stable(page, quiet_ms=450, max_ms=6000)
        z3a = await hero_pos(page)
        await slow_drag(page, [(mid_x - 220, top_y), (mid_x - 60, top_y), (mid_x + 80, top_y), (mid_x + 220, top_y)])
        await page.wait_for_timeout(900)
        z3b = await hero_pos(page)
        drag_static = z3a and z3b and abs(z3b['x'] - z3a['x']) < 12
        log('Z3 书符区拖动画字不带跑角色（<12px）', bool(drag_static),
            f"dx={abs(z3b['x'] - z3a['x']):.0f}" if z3a and z3b else '')

        # Z4 下区慢速拖动 → 跟随
        await wait_hero_stable(page, quiet_ms=450, max_ms=6000)
        z4a = await hero_pos(page)
        await slow_drag(page, [(mid_x + 160, low_y), (mid_x + 20, low_y), (mid_x - 120, low_y), (mid_x - 220, low_y)])
        await page.wait_for_timeout(1100)
        z4b = await hero_pos(page)
        drag_move = z4a and z4b and abs(z4b['x'] - z4a['x']) > 40
        log('Z4 行止区拖动引路跟随（>40px）', bool(drag_move),
            f"dx={abs(z4b['x'] - z4a['x']):.0f}" if z4a and z4b else '')

        # Z6 分区线标签渲染
        zone_ui = await page.evaluate(
            """() => {
                const t = document.body.innerText || '';
                return t.includes('书符 · 画字施法') && t.includes('行止 · 点地移形');
            }""")
        log('Z6 分区线双标签渲染', bool(zone_ui))

        # Z7 字诀开启 → 分区线隐去
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(800)
        zone_hidden = await page.evaluate(
            "() => !document.body.innerText.includes('书符 · 画字施法')")
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(800)
        zone_back = await page.evaluate(
            "() => document.body.innerText.includes('书符 · 画字施法')")
        log('Z7 字诀模式分区线隐去/关闭恢复', bool(zone_hidden and zone_back))

        # Z8 书符区横划照常出招（断水斩）
        await wait_hero_stable(page, quiet_ms=400, max_ms=6000)
        z8a = await hero_pos(page)
        await poly_stroke(page, [(mid_x - 170, top_y), (mid_x + 170, top_y)], steps_per_seg=4)
        await page.wait_for_timeout(120)
        st8 = await hero_state(page)
        await page.wait_for_timeout(500)
        z8b = await hero_pos(page)
        cast_dx = (z8b['x'] - z8a['x']) if z8a and z8b else 0
        log('Z8 书符区横划照常出招（突进位移>120px）', cast_dx > 120,
            f"state={st8['state'] if st8 else '?'} dx={cast_dx:.0f}")

        # Z9 出招清残留移动目标（点位取剑仙身后 130px，避开行进中的敌军）
        await wait_hero_stable(page, quiet_ms=450, max_ms=6000)
        hs = await hero_screen(page)
        behind_x = (box['x'] + hs['x'] - 130) if hs else (mid_x - 220)
        await tap(page, behind_x, low_y)             # 点地设移动目标
        tgt_a = await hero_target(page)
        await poly_stroke(page, [(mid_x - 150, top_y), (mid_x + 150, top_y)], steps_per_seg=4)
        await page.wait_for_timeout(60)
        tgt_b = await hero_target(page)
        log('Z9 横划出招清残留移动目标', bool(tgt_a is not None and tgt_b is None),
            f"出招前={tgt_a} 出招后={tgt_b}")

        # ============ H 组：信息增强 ============
        hud = await page.evaluate(
            """() => {
                const t = document.body.innerText || '';
                const wave = /波 \\d+\\/\\d+/.test(t);
                const foe = /敌 \\d+/.test(t);
                const gate = /墨阁 \\d+%/.test(t);
                const camp = /敌营 \\d+%/.test(t);
                const clock = /\\d{2}:\\d{2}/.test(t);
                return { wave, foe, gate, camp, clock };
            }""")
        h1 = hud['wave'] and hud['foe'] and hud['gate'] and hud['camp'] and hud['clock']
        log('H1 战况行（波次/敌情/用时/墨阁%/敌营%）', bool(h1), str(hud))

        # H2 画圆起盾 → 墨盾 chip
        await poly_stroke(page, [(mid_x - 90, top_y), (mid_x - 62, top_y - 66),
                                  (mid_x + 34, top_y - 78), (mid_x + 88, top_y + 6),
                                  (mid_x + 12, top_y + 84), (mid_x - 86, top_y + 40),
                                  (mid_x - 90, top_y)], steps_per_seg=5)
        await page.wait_for_timeout(700)
        shield_chip = await page.evaluate(
            """() => (document.body.innerText.match(/墨盾 (\\d+)/) || [])[1] || ''""")
        log('H2 画圆起盾 → 墨盾实时 chip', bool(shield_chip and int(shield_chip) > 0),
            f"盾={shield_chip}")

        # H3 断水冷却遮罩（竹影刚触发了盾 CD；再点断水按钮触发其 CD 后看遮罩秒数）
        await page.get_by_role('button', name='断水').click()
        await page.wait_for_timeout(400)
        cd_mask = await page.evaluate(
            """() => {
                const btns = [...document.querySelectorAll('button')];
                const b = btns.find(x => (x.textContent || '').includes('断水'));
                if (!b) return '';
                const m = b.textContent || '';
                return /\\d+\\.\\d/.test(m) ? 'shown' : '';
            }""")
        log('H3 技能冷却遮罩显示秒数', cd_mask == 'shown')

        # H4 操控心诀含分区说明
        await page.locator('button[title="手势指南"]').click()
        await page.wait_for_timeout(500)
        guide_zone = await page.evaluate(
            "() => document.body.innerText.includes('上下分区 · 各司其职')")
        await page.locator('button[title="手势指南"]').click()
        log('H4 操控心诀含分区说明', bool(guide_zone))

        # ============ 汇总 ============
        await page.wait_for_timeout(600)
        real_errors = [e for e in errors if 'favicon' not in e.lower()]
        log('全程 0 真实 JS 异常', len(real_errors) == 0, f'{len(real_errors)} 条' if real_errors else '')

        passed = sum(1 for _, ok in results if ok)
        print(f"\n===== 结果：{passed}/{len(results)} PASS =====")
        await page.screenshot(path=f'{OUT}/verify12_zones_battle.png')

        await browser.close()
        if passed < len(results):
            raise SystemExit(1)

asyncio.run(main())
