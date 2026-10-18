# -*- coding: utf-8 -*-
"""连招体验大升级 · 无头浏览器端到端实测 v12
覆盖：
  C0 dev 测试钩子（comboInfo 观测）
  C1 连墨累积（普攻连点 → 连墨≥3 进入段位）
  C2 HUD 同步（连墨数 + 伤 × 倍率文本与真相源一致）
  C3 段位↔伤害倍率映射一致性（全程采样）
  C4 衔招：普攻命中后 1.1s 内接技能 → 窗口亮起并随之消耗
  C5 暴击延窗（timer/maxTimer > 1.0 采样验证）
  C6 柔性连断（12 连以上断连保留四成墨势，续击从保留值继续）
  C7 突进补位（点远处敌人 → 跨步贴近并命中）
  C8 字诀文思连段（8s 内连写 → 文思2段/3段 增伤）
  M 系 移动端 390x844：连点落墨 + 触摸写「山」文思连段
全程 0 真实 JS 异常。
"""
import asyncio
import math
import re
import time
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'

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
BLESSING_NAMES = ['剑气纵横', '疾风诗步', '墨甲如山', '点墨成金', '连墨永驻', '文光护阁', '笔势如虹', '星辉汲取']
# 段位↔倍率映射（与 BattleView COMBO_TIERS 同源）
TIER_MAP = [
    (45, 'TRANSCEND', 1.35), (30, 'DIVINE', 1.26), (20, 'DRAGON', 1.18),
    (12, 'FLOW', 1.12), (7, 'PROGRESS', 1.08), (3, 'ENTRY', 1.04),
]

def expect_tier(count):
    for mn, tier, dmg in TIER_MAP:
        if count >= mn:
            return tier, dmg
    return 'NONE', 1.0

results = []
def log(name, ok, extra=''):
    results.append((name, ok))
    print(f"{'✓' if ok else '✗'} {name}{(' | ' + extra) if extra else ''}")

async def combo_info(page):
    return await page.evaluate("() => window.__inkGestureDebug?.comboInfo?.() || null")

async def hero_pos(page):
    return await page.evaluate("() => window.__inkGestureDebug?.heroPos?.() || null")

async def handle_blessing(page):
    """墨灵祝福三选一弹窗出现时随机选一个（长测试不中断）"""
    try:
        btn = page.locator('button', has_text=re.compile('|'.join(BLESSING_NAMES))).first
        if await btn.count() > 0 and await btn.is_visible():
            await btn.click(timeout=1200)
            await page.wait_for_timeout(500)
            return True
    except Exception:
        pass
    return False

async def spam_attack(page, duration_ms, interval=85):
    """JS 定时器连点「落墨」，Python 侧采样 + 处理祝福弹窗；返回采样列表"""
    ok = await page.evaluate(
        """() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('落墨'));
        if (!btn) return false;
        window.__spamStop = false;
        window.__spamTimer = setInterval(() => { if (!window.__spamStop) btn.click(); }, 85);
        return true;
    }""")
    if not ok:
        return []
    samples = []
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < duration_ms:
        await page.wait_for_timeout(110)
        await handle_blessing(page)
        info = await combo_info(page)
        if info:
            samples.append(info)
        if (await page.evaluate("() => document.body.innerText.includes('败北')")):
            break
    await page.evaluate("() => { window.__spamStop = true; if (window.__spamTimer) clearInterval(window.__spamTimer); }")
    return samples

async def norm_stroke(page, tpl_pts, cx, cy, scale=150):
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

async def find_hint(page, token, budget_ms=800, poll=40):
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < budget_ms:
        txt = await page.evaluate(
            """(tok) => [...document.querySelectorAll('div')]
                .map(d => d.textContent || '')
                .find(t => t.includes(tok) && t.length < 80) || ''""",
            token)
        if token in txt:
            return True, (time.monotonic() - t0) * 1000, txt
        await page.wait_for_timeout(poll)
    return False, budget_ms, ''

async def ensure_alive(page):
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

async def ensure_hero_alive(page, max_ms=12000):
    """英雄阵亡则等自动复活（每场复活 ~8s）"""
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        info = await combo_info(page)
        if info and info.get('heroAlive'):
            return True
        await page.wait_for_timeout(500)
    return False

async def wait_enemy_near(page, max_ms=70000, dist=130):
    """等首波敌军行军入攻击圈（开局敌人从右阵远道而来，~15s+）"""
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        await ensure_alive(page)
        await handle_blessing(page)
        info = await combo_info(page)
        if info and info.get('nearestEnemy') and info['nearestEnemy']['dist'] <= dist and info.get('heroAlive'):
            return info['nearestEnemy']
        await page.wait_for_timeout(500)
    return None

async def ensure_combo_visible(page, max_ms=30000):
    """等敌入圈后连点落墨直到连墨≥3（供 HUD 检查前重建连击）"""
    await wait_enemy_near(page, max_ms=max_ms)
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        info = await combo_info(page)
        if info and info['count'] >= 3:
            return info
        await page.evaluate(
            """() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('落墨')); b && b.click(); }""")
        await page.wait_for_timeout(280)
        await handle_blessing(page)
        await ensure_alive(page)
    return None

async def farm_combo(page, target=14, max_ms=50000):
    """主动追击攒连：敌在 280 内则点其身位（补位+命中），更远则点地趋近；返回峰值连墨"""
    peak = 0
    t0 = time.monotonic()
    while (time.monotonic() - t0) * 1000 < max_ms:
        await handle_blessing(page)
        await ensure_alive(page)
        info = await combo_info(page)
        if not info or not info.get('heroAlive'):
            await page.wait_for_timeout(500)
            continue
        peak = max(peak, info['count'])
        if peak >= target and info['count'] >= target - 2:
            break
        ne = info.get('nearestEnemy')
        hero_screen_x = info['heroX'] - info['cameraX']
        if ne and ne['dist'] <= 280:
            tap_x = min(1240, max(40, hero_screen_x + ne['dist'] + 6))
            tap_y = min(760, max(80, ne['y']))
            await page.mouse.click(tap_x, tap_y)
            await page.wait_for_timeout(340)
        elif ne:
            # 点地趋近：朝敌军方向滑步
            tap_x = min(1240, max(40, hero_screen_x + 300))
            await page.mouse.click(tap_x, min(700, max(120, ne['y'])))
            await page.wait_for_timeout(650)
        else:
            await page.wait_for_timeout(600)
    return peak

async def enter_battle(page):
    await page.goto(URL, wait_until='networkidle')
    await page.wait_for_timeout(1500)
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

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await enter_battle(page)

        # C0 钩子
        info = await combo_info(page)
        log('C0 comboInfo 观测钩子注入', info is not None and 'count' in (info or {}))

        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.52

        # —— C1/C3/C5 等首波敌军入圈后连点 4.5s：累积 + 段位映射 + 暴击延窗采样 ——
        foe = await wait_enemy_near(page)
        log('C0b 首波敌军入攻击圈', foe is not None, f'dist={foe["dist"] if foe else "?"}')
        samples = await spam_attack(page, 4500)
        s_max = max((s['count'] for s in samples), default=0)
        log('C1 连墨累积（连点落墨 → ≥3 入段位）', s_max >= 3, f'peak={s_max}')
        map_bad = [s for s in samples if abs(s['dmgMult'] - expect_tier(s['count'])[1]) > 1e-9]
        tiers_seen = sorted(set(s['tier'] for s in samples))
        log('C3 段位↔伤害倍率映射一致', len(samples) > 20 and not map_bad,
            f'samples={len(samples)} tiers={tiers_seen}')
        max_ratio = max((s['timer'] / s['maxTimer'] for s in samples if s['maxTimer'] > 0), default=0)
        log('C5 暴击延长连墨窗（ratio>1.01 采样）', max_ratio > 1.01, f'maxRatio={max_ratio:.3f}')

        # —— C2 HUD 同步（重建连击后验） ——
        info = await ensure_combo_visible(page)
        if info and info['count'] >= 3:
            hud = await page.evaluate(
                """() => [...document.querySelectorAll('div')]
                    .map(d => d.textContent || '')
                    .find(t => t.includes('连墨') && t.includes('伤 ×') && t.length < 80) || ''""")
            hud_ok = (f"伤 ×{info['dmgMult']:.2f}" in hud) and (str(info['count']) in hud)
            log('C2 HUD 连墨/伤×文本与真相源一致', hud_ok, f"{hud[:40]} info={info['count']}/{info['dmgMult']}")
        else:
            log('C2 HUD 连墨/伤×文本与真相源一致', False, 'combo<3')

        # —— C4 衔招：普攻命中后窗口亮起 → 接「断水」消耗 ——
        await ensure_alive(page)
        chain_seen = any(s['chainReady'] for s in samples)
        armed = False
        for _ in range(6):
            info = await combo_info(page)
            if info and info['chainReady']:
                armed = True
                break
            await page.evaluate(
                """() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('落墨')); b && b.click(); }""")
            await page.wait_for_timeout(260)
            await handle_blessing(page)
        chain_seen = chain_seen or armed
        log('C4a 普攻命中后「衔」窗口亮起', chain_seen)
        consumed = False
        if armed:
            await page.evaluate(
                """() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('断水')); b && b.click(); }""")
            t0 = time.monotonic()
            while (time.monotonic() - t0) * 1000 < 900:
                info = await combo_info(page)
                if info and not info['chainReady']:
                    consumed = True
                    break
                await page.wait_for_timeout(60)
        log('C4b 接技能后衔招窗口消耗', consumed)
        await page.wait_for_timeout(1500)
        await ensure_alive(page)

        # —— C6 柔性连断：主动追击攒 14 连 → 停手等超时 → 保留四成 → 续击不归零 ——
        c0 = await farm_combo(page, target=14, max_ms=55000)
        await handle_blessing(page)
        log('C6a 攒连至行云流水(≥12)', c0 >= 12, f'peak={c0}')
        if c0 >= 12:
            await ensure_hero_alive(page)
            await page.wait_for_timeout(2000)   # 弹道/残效落定
            kept = max(3, math.floor(c0 * 0.4))
            # 停手后轮询等连墨回落（15s 窗；友军仍在战场输出属我方攻势，允许 ±8 噪声）
            # 判定：出现 count ∈ [kept-2, kept+8] 且明显低于峰值（≤峰值七成）且 ≥3 的样本
            kept_ok = False
            now_count = None
            t0 = time.monotonic()
            while (time.monotonic() - t0) * 1000 < 15000:
                await handle_blessing(page)
                await ensure_alive(page)
                info = await combo_info(page)
                now_count = info['count'] if info else None
                if now_count is not None and kept - 2 <= now_count <= kept + 8 \
                        and now_count >= 3 and now_count <= c0 * 0.7:
                    kept_ok = True
                    break
                await page.wait_for_timeout(300)
            log('C6b 断连保留部分墨势（非清零）', bool(kept_ok),
                f"before={c0} kept={kept} now={now_count}")
            # 续击从保留值继续，不归零重来
            climb_ok = True
            prev = info['count'] if info else 0
            for _ in range(7):
                await page.evaluate(
                    """() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('落墨')); b && b.click(); }""")
                await page.wait_for_timeout(300)
                await handle_blessing(page)
                cur = (await combo_info(page) or {}).get('count', 0)
                if cur < prev or cur <= 2:
                    climb_ok = False
                    break
                prev = max(prev, cur)
            log('C6c 续击从保留值继续（不归零）', climb_ok, f'final={prev}')
        await ensure_alive(page)

        # —— C7 突进补位：自纠偏逼近/拉开 → 在 100-280px 窗口点其身位验证跨步命中 ——
        lunge_ok = False
        detail = ''
        t0 = time.monotonic()
        while (time.monotonic() - t0) * 1000 < 60000:
            await ensure_alive(page)
            await handle_blessing(page)
            info = await combo_info(page)
            if not info or not info.get('heroAlive') or not info.get('nearestEnemy'):
                await page.wait_for_timeout(400)
                continue
            enemy = info['nearestEnemy']
            hero_screen_x = info['heroX'] - info['cameraX']
            if enemy['dist'] > 280:
                # 主动趋近：点地朝敌军方向滑步
                await page.mouse.click(min(1240, max(40, hero_screen_x + 300)),
                                       min(700, max(120, enemy['y'])))
                await page.wait_for_timeout(500)
                continue
            if enemy['dist'] < 100:
                # 贴脸则拉开重开窗口（敌追击/行军会重新穿越频带）
                await page.mouse.click(min(1240, max(40, hero_screen_x - 200)),
                                       min(700, max(120, enemy['y'])))
                await page.wait_for_timeout(650)
                continue
            # 敌在 [100, 280]：点其身位 → 跨步 + 命中
            tap_x = min(1240, max(40, hero_screen_x + enemy['dist'] + 6))
            tap_y = min(760, max(80, enemy['y']))   # 敌军世界 y ≈ 画布 y（画布全屏）
            before_count = info['count']
            before_x = info['heroX']
            await page.mouse.click(tap_x, tap_y)
            await page.wait_for_timeout(420)
            after = await combo_info(page)
            if after and (after['heroX'] - before_x >= 15) and after['count'] > before_count:
                lunge_ok = True
                detail = f"dist={enemy['dist']} dx={after['heroX']-before_x} combo {before_count}→{after['count']}"
                break
        log('C7 突进补位（点远处敌人跨步命中）', lunge_ok, detail)
        await ensure_alive(page)

        # —— C8 字诀文思连段 ——
        await ensure_alive(page)
        await ensure_hero_alive(page)
        await handle_blessing(page)
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(2100)
        in_char = await page.evaluate("() => window.__inkGestureDebug?.isCharMode?.()")
        log('C8a-0 字诀模式开启', bool(in_char))

        async def write_shan():
            await ensure_hero_alive(page)
            await handle_blessing(page)
            await norm_stroke(page, SHAN[0], cx, cy)
            await page.wait_for_timeout(120)
            await poly_stroke(page,
                [(cx + (0.14-0.5)*150, cy + (0.10-0.5)*150),
                 (cx + (0.14-0.5)*150, cy + (0.72-0.5)*150),
                 (cx + (0.78-0.5)*150, cy + (0.72-0.5)*150)])
            await page.wait_for_timeout(120)
            await norm_stroke(page, SHAN[2], cx, cy)

        await write_shan()
        found1, _, _ = await find_hint(page, '「山」', budget_ms=700)
        log('C8a 写「山」施放', found1)
        await page.wait_for_timeout(1200)
        await norm_stroke(page, ZHI[0], cx, cy)
        await page.wait_for_timeout(120)
        await poly_stroke(page,
            [(cx + (0.3-0.5)*150, cy + (0.56-0.5)*150),
             (cx + (0.58-0.5)*150, cy + (0.50-0.5)*150),
             (cx + (0.32-0.5)*150, cy + (0.79-0.5)*150)])
        await page.wait_for_timeout(120)
        await norm_stroke(page, ZHI[2], cx, cy)
        found2, _, txt2 = await find_hint(page, '文思2段', budget_ms=800)
        log('C8b 8s 内连写触发文思2段(+10%)', found2, txt2[:46])
        await page.wait_for_timeout(1100)
        await write_shan()
        found3, _, txt3 = await find_hint(page, '文思3段', budget_ms=800)
        if not found3:
            diag = await page.evaluate(
                """() => ({ chain: window.__inkGestureDebug?.comboInfo?.().charChain,
                     alive: window.__inkGestureDebug?.comboInfo?.().heroAlive,
                     hint: [...document.querySelectorAll('div')].map(d => d.textContent || '').find(t => (t.includes('「') || t.includes('墨渍')) && t.length < 80) || '' })""")
            log('C8c 诊断', False, str(diag))
        log('C8c 三连写触发文思3段(+20%)', found3, txt3[:46])
        await page.get_by_role('button', name='字诀').click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/verify12_desktop_combo.png')

        # —— M 系移动端 ——
        mpage = await browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True,
                                       user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        mpage.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        mpage.on('pageerror', lambda e: errors.append(str(e)))
        await enter_battle(mpage)
        await wait_enemy_near(mpage)
        msamples = await spam_attack(mpage, 4200)
        m_max = max((s['count'] for s in msamples), default=0)
        log('M1 移动端连点落墨累积连墨(≥3)', m_max >= 3, f'peak={m_max}')
        minfo = await ensure_combo_visible(mpage)
        m_hud = ''
        if minfo and minfo['count'] >= 3:
            m_hud = await mpage.evaluate(
            """() => [...document.querySelectorAll('div')]
                .map(d => d.textContent || '')
                .find(t => t.includes('连墨') && t.length < 80) || ''""")
        log('M2 移动端连墨 HUD 展示', '连墨' in m_hud, m_hud[:36])

        mbox = await mpage.locator('canvas').last.bounding_box()
        mcx, mcy = mbox['x'] + mbox['width']/2, mbox['y'] + mbox['height']*0.42
        await mpage.get_by_role('button', name='字诀').tap()
        await mpage.wait_for_timeout(2100)
        mcdp = await mpage.context.new_cdp_session(mpage)
        async def mtouch_poly(tpl_pts):
            p = [(mcx + (q[0]-0.5)*110, mcy + (q[1]-0.5)*110) for q in tpl_pts]
            await mcdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': p[0][0], 'y': p[0][1]}]})
            for q in p[1:]:
                await mcdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': q[0], 'y': q[1]}]})
            await mcdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        await mtouch_poly(SHAN[0])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[1])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[2])
        found_m1, _, _ = await find_hint(mpage, '「山」', budget_ms=900)
        log('M3 触摸写「山」施放', found_m1)
        await mpage.wait_for_timeout(1300)
        await mtouch_poly(SHAN[0])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[1])
        await mpage.wait_for_timeout(90)
        await mtouch_poly(SHAN[2])
        found_m2, _, txt_m2 = await find_hint(mpage, '文思2段', budget_ms=900)
        log('M4 移动端文思连段(+10%)', found_m2, txt_m2[:46])
        await mpage.screenshot(path=f'{OUT}/verify12_mobile_combo.png')

        real_errors = [e for e in errors if 'favicon' not in e.lower()]
        log('全程 0 真实 JS 异常', len(real_errors) == 0, '; '.join(real_errors[:3]))
        passed = sum(1 for _, ok in results if ok)
        print(f"\n===== 连招升级实测：{passed}/{len(results)} PASS =====")
        await browser.close()
        if passed != len(results):
            raise SystemExit(1)

asyncio.run(main())
