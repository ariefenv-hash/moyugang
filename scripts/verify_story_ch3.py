# -*- coding: utf-8 -*-
"""第三章《漱玉词·断弦遗音》剧情大升级全链路无头实测 v1
覆盖：
  A 组 章签导航与剧情文本（A1 章签 / A2 默认落章 / A3 卷首诗 / A4 引子自动弹出
      / A5 五折卡 / A6 首领战×2 / A7 边塞引未启）
  B 组 开战卷首语（溪亭暮弦）
  C 组 五折新氛围像素采样 + 两两互异
  D 组 折三 Boss「焦尾琴魅·断章」（banner / 在阵 / 出场粒子）
  E 组 技能特效强化（断水斩/竹影墨盾/星河笔阵粒子迸发）
  F 组 终折全流程（断弦夫人出场 / 尾声 / 漱玉绝响成就 / 无启下一章）
  G 组 移动端 390px 选章
全程 0 真实 JS 异常。
"""
import asyncio, json, time
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'
STORAGE = 'ink_and_steel_progress_v1'

def make_progress(unlocked, completed, story_seen):
    return json.dumps({
        'unlockedLevel': unlocked,
        'completedLevels': completed,
        'storySeen': story_seen,
        'jadeSparks': 5000,
        'heroUpgrades': {'attackLevel': 2, 'hpLevel': 2, 'cooldownLevel': 1, 'resonanceLevel': 1},
        'unitUpgrades': {'SCRIBE': 0, 'SWORD': 1, 'ARCHER': 1, 'GUARDIAN': 0, 'HARPIST': 0},
        'citadelUpgrades': {'baseHpLevel': 1, 'gatherSpeedLevel': 1},
        'levelStars': {},
        'endlessBest': 0,
        'achievements': [],
        'tutorialDone': True,
        'totalKills': 0,
    })

results = []
def log(name, ok_flag, extra=''):
    results.append((name, ok_flag))
    print(f"{'✓' if ok_flag else '✗'} {name}{(' | ' + extra) if extra else ''}")

ok = lambda name, cond, extra='': log(name, cond, extra)

async def sky_rgb(page, y0_frac=0.0, y1_frac=0.12):
    return await page.evaluate(
        """([y0f, y1f]) => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const g = c.getContext('2d');
            const w = Math.min(240, c.width);
            const y0 = Math.round(c.height * y0f), y1 = Math.max(y0 + 4, Math.round(c.height * y1f));
            const d = g.getImageData(0, y0, w, y1 - y0).data;
            let r=0, gg=0, b=0, n=0;
            for (let i=0; i<d.length; i+=4) { r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++; }
            return [Math.round(r/n), Math.round(gg/n), Math.round(b/n)];
        }""", [y0_frac, y1_frac])

async def bs(page):
    return await page.evaluate("() => window.__inkGestureDebug?.battleState?.() || null")

async def fx(page):
    return await page.evaluate("() => window.__inkGestureDebug?.fxStats?.() || null")

async def poly_stroke(page, pts, steps_per_seg=6):
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for i in range(1, len(pts)):
        await page.mouse.move(pts[i][0], pts[i][1], steps=steps_per_seg)
    await page.mouse.up()

async def close_tutorial(page):
    try:
        close_btn = page.locator('div.pointer-events-none', has_text='初入战场').get_by_role('button').first
        await close_btn.click(timeout=2000)
        await page.wait_for_timeout(300)
    except Exception:
        pass

async def leave_battle(page):
    await page.keyboard.press('Escape')
    await page.wait_for_timeout(400)
    await page.get_by_text('撤离战场').click()
    await page.wait_for_timeout(900)

async def start_fold(page, nth, expect_title):
    await page.get_by_role('button', name='启程试炼').nth(nth).click()
    await page.wait_for_timeout(2400)
    await page.wait_for_selector('canvas', timeout=9000)
    await close_tutorial(page)
    st = await bs(page)
    ok(f'战场载入 {expect_title}', bool(st) and st['levelTitle'] == expect_title,
       f"title={st and st['levelTitle']}")

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ============ 主页面：解锁 15 折（三章全开） ============
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.evaluate(
            """([key, val]) => localStorage.setItem(key, val)""",
            [STORAGE, make_progress(15, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2])],
        )
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1400)

        # ============ A 组 ============
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        body = await page.evaluate("() => document.body.innerText")
        ok('A1 漱玉词章签出现', '漱玉词' in body)
        ok('A2 默认落在第叁大章（已启诗卷·5 折连战）', '第叁大章' in body and '5 折连战' in body)
        ok('A3 第三章卷首诗「寻寻觅觅字成灰」', '寻寻觅觅字成灰' in body)

        intro_visible = await page.evaluate(
            "() => document.body.innerText.includes('卷宗 · 引子') && document.body.innerText.includes('断弦夫人') && document.body.innerText.includes('广陵散')")
        log('A4 第三章章前引子自动弹出（断弦夫人/广陵散）', intro_visible)
        await page.screenshot(path=f'{OUT}/verify_ch3_intro.png')
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2500)
            await page.wait_for_timeout(400)
        except Exception:
            pass

        body = await page.evaluate("() => document.body.innerText")
        for t in ['溪亭暮弦', '雁字西楼', '黄花瘦影', '声声慢雨', '绝响广陵']:
            ok(f'A5 折卡「{t}」', t in body)
        boss_cnt = await page.locator('span.seal', has_text='首领战').count()
        ok('A6 首领战标记 ×2（折三琴魅/折五断弦夫人）', boss_cnt == 2, f'count={boss_cnt}')

        await page.get_by_text('边塞引').first.click()
        await page.wait_for_timeout(500)
        body = await page.evaluate("() => document.body.innerText")
        ok('A7 边塞引仍为未启之卷（敬请期待）', '敬请期待' in body)
        await page.get_by_text('漱玉词').first.click()
        await page.wait_for_timeout(500)

        # ============ B + C1 + E：第一折 溪亭暮弦（LOTUS） ============
        await start_fold(page, 0, '溪亭暮弦')
        body = await page.evaluate("() => document.body.innerText")
        ok('B1 开战卷首语「弦音过处…断弦夫人的琴音」', '弦音过处' in body)
        await page.screenshot(path=f'{OUT}/verify_ch3_lotus_battle.png')

        rgb = await sky_rgb(page)
        log('C1 LOTUS 天空呈紫玫暮色（r>g 且 b>g）', bool(rgb) and rgb[0] > rgb[1] and rgb[2] > rgb[1], f'rgb={rgb}')
        samples = [rgb] if rgb else []

        # E1 断水斩
        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cy = box['y'] + box['height'] * 0.72
        cx = box['x'] + box['width'] * 0.42
        f0 = await fx(page)
        await poly_stroke(page, [(cx - 120, cy), (cx + 120, cy)])
        await page.wait_for_timeout(300)
        f1 = await fx(page)
        ok('E1 断水斩粒子迸发', bool(f1) and bool(f0) and f1['particles'] > f0['particles'] + 5,
           f"{f0['particles']}→{f1['particles']}")

        # E2 竹影墨盾（画圆）
        await page.wait_for_timeout(800)
        g0 = await fx(page)
        circ = [(cx + 46, cy - 4), (cx + 30, cy - 34), (cx - 12, cy - 42), (cx - 44, cy - 16),
                (cx - 40, cy + 24), (cx - 6, cy + 44), (cx + 36, cy + 26), (cx + 46, cy - 4)]
        await poly_stroke(page, circ)
        await page.wait_for_timeout(300)
        g1 = await fx(page)
        ok('E2 竹影墨盾粒子迸发', bool(g1) and bool(g0) and g1['particles'] > g0['particles'] + 5,
           f"{g0['particles']}→{g1['particles']}")

        # E3 星河笔阵（折划）
        await page.wait_for_timeout(900)
        z0 = await fx(page)
        zz = [(cx - 110, cy - 44), (cx + 104, cy - 44), (cx - 110, cy + 34), (cx + 110, cy + 34)]
        await poly_stroke(page, zz)
        await page.wait_for_timeout(420)
        z1 = await fx(page)
        ok('E3 星河笔阵粒子迸发', bool(z1) and bool(z0) and z1['particles'] > z0['particles'] + 5,
           f"{z0['particles']}→{z1['particles']}")

        # ============ C2-C4：撤离后按折序切换采样 ============
        for nth, fold, name, cond in [
            (1, '雁字西楼', 'C2 GOOSE 蓝紫月夜（b≥r）', lambda v: v[2] >= v[0]),
            (2, '黄花瘦影', 'C3 CHRYS 琥珀黄昏（r>g>b 且 r-b≥14）', lambda v: v[0] > v[1] > v[2] and v[0] - v[2] >= 14),
            (3, '声声慢雨', 'C4 GLOOM 青灰暮雨（g≥r-5）', lambda v: v[1] >= v[0] - 5),
        ]:
            await leave_battle(page)
            await start_fold(page, nth, fold)
            rgb = await sky_rgb(page)
            ok(name, bool(rgb) and cond(rgb), f'rgb={rgb}')
            await page.screenshot(path=f'{OUT}/verify_ch3_{fold}.png')
            if rgb:
                samples.append(rgb)

        # C5 折五绝响广陵（STRING）——也是 F 组战场
        await leave_battle(page)
        await start_fold(page, 4, '绝响广陵')
        rgb5 = await sky_rgb(page)
        log('C5 STRING 寒墨琴台（暗且 b≥r）', bool(rgb5) and sum(rgb5) / 3 < 110 and rgb5[2] >= rgb5[0], f'rgb={rgb5}')
        await page.screenshot(path=f'{OUT}/verify_ch3_string_battle.png')

        # C6 两两互异（五折顶部均色 10 对：LOTUS/GOOSE/CHRYS/GLOOM/STRING，至少 5 对显著）
        samples.append(rgb5)
        pairs = 0
        sig = 0
        for i in range(len(samples)):
            for j in range(i + 1, len(samples)):
                pairs += 1
                d = sum(abs(samples[i][k] - samples[j][k]) for k in range(3))
                if d > 30:
                    sig += 1
        ok('C6 五折氛围两两互异（≥5/10 对显著差异）', sig >= 5, f'{sig}/{pairs}')

        # ============ F 组：终折 Boss + 尾声 + 成就 ============
        t0 = time.monotonic()
        banner15 = boss15 = False
        while time.monotonic() - t0 < 40:
            await page.wait_for_timeout(500)
            body = await page.evaluate("() => document.body.innerText")
            if '断弦夫人·绝响' in body:
                banner15 = True
            f = await fx(page)
            if f and f['bossOnField']:
                boss15 = True
            if banner15 and boss15:
                break
        ok('F1 终折 Boss banner「断弦夫人·绝响」+ 在阵', banner15 and boss15, f'banner={banner15} boss={boss15}')
        await page.screenshot(path=f'{OUT}/verify_ch3_boss15.png')

        ok('F2 速胜触发结算', await page.evaluate("() => window.__inkGestureDebug?.forceVictory?.() ?? false"))
        await page.wait_for_timeout(1400)
        vbody = await page.evaluate("() => document.body.innerText")
        ok('F2 结算含第三章尾声「无声之曲…广陵散遗谱七页合一」', '无声之曲' in vbody and '广陵散遗谱七页合一' in vbody)
        ok('F3 新成就「漱玉绝响」首次通关即解锁', '漱玉绝响' in vbody)
        nxt = await page.get_by_role('button', name='启下一章').count()
        log('F4 终折无「启下一章」按钮（当前上界内最后大章）', nxt == 0)
        await page.screenshot(path=f'{OUT}/verify_ch3_victory.png')

        # ============ D 组：折三 Boss 焦尾琴魅（重新载入 → 第三折） ============
        await page.evaluate("() => { location.reload(); }")
        await page.wait_for_timeout(1500)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2000)
            await page.wait_for_timeout(300)
        except Exception:
            pass
        await start_fold(page, 2, '黄花瘦影')

        t0 = time.monotonic()
        banner13 = boss13 = False
        p_before = (await fx(page))['particles']
        p_max = p_before
        while time.monotonic() - t0 < 50:
            await page.wait_for_timeout(500)
            body = await page.evaluate("() => document.body.innerText")
            if '焦尾琴魅·断章' in body:
                banner13 = True
            f = await fx(page)
            if f:
                p_max = max(p_max, f['particles'])
                if f['bossOnField']:
                    boss13 = True
            if banner13 and boss13:
                break
        ok('D1 Boss banner「焦尾琴魅·断章」', banner13)
        ok('D2 bossOnField 琴魅在阵', boss13)
        ok('D3 Boss 出场特效粒子迸发', p_max - p_before >= 8, f'{p_before}→{p_max}')
        await page.screenshot(path=f'{OUT}/verify_ch3_boss13.png')

        # ============ G 组：移动端 390px ============
        mob = await browser.new_page(viewport={'width': 390, 'height': 780})
        mob.on('pageerror', lambda e: errors.append(str(e)))
        await mob.goto(URL, wait_until='networkidle')
        await mob.evaluate(
            """([key, val]) => localStorage.setItem(key, val)""",
            [STORAGE, make_progress(11, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3])],
        )
        await mob.goto(URL, wait_until='networkidle')
        await mob.wait_for_timeout(1200)
        await mob.get_by_text('启卷入战').click()
        await mob.wait_for_timeout(900)
        mbody = await mob.evaluate("() => document.body.innerText")
        ok('G1 移动端 390px 选章含漱玉词五折', '溪亭暮弦' in mbody and '绝响广陵' in mbody)
        await mob.screenshot(path=f'{OUT}/verify_ch3_mobile.png')
        await mob.close()

        await browser.close()

    real_errors = [e for e in errors if 'favicon' not in e.lower() and '404' not in e]
    print(f"\nJS 异常 {len(real_errors)} 条")
    for e in real_errors[:5]:
        print('  !', e[:200])
    passed = sum(1 for _, o in results if o)
    print(f"\n===== 第三章验证 {passed}/{len(results)} PASS =====")
    if real_errors or passed < len(results):
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
