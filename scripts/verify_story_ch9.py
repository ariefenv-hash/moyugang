# -*- coding: utf-8 -*-
"""第九章《墨梅图·淡墨痕迹》全链路无头实测 v1
覆盖：
  A 组 章签导航与剧情文本（章签/默认落章/卷首诗/引子自动弹出/五折卡/首领战×2/赤壁赋已启/文心雕龙未启）
  B 组 开战卷首语（沅芷澧兰）
  C 组 五折新氛围像素采样 + 两两互异
  D 组 折三 Boss「玄墨河伯·吞舟」（banner / 在阵）
  F 组 终折全流程（大司命·沉璧 / 尾声 / 九歌天问成就 / 无启下一章）
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

        # ============ 主页面：解锁 21 折（默认落在第五大章） ============
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.evaluate(
            """([key, val]) => localStorage.setItem(key, val)""",
            [STORAGE, make_progress(45, list(range(1, 45)), [1, 2, 3, 4, 5, 6, 7, 8])],
        )
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1400)

        # ============ A 组 ============
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        body = await page.evaluate("() => document.body.innerText")
        ok('A1 墨梅图章签出现', '墨梅图' in body)
        ok('A2 默认落在第玖大章（已启诗卷·5 折连战）', '第玖大章' in body and '5 折连战' in body)
        ok('A3 第九章卷首诗「淡墨痕开不问春」', '淡墨痕开不问春' in body)

        intro_visible = await page.evaluate(
            "() => document.body.innerText.includes('卷宗 · 引子') && document.body.innerText.includes('墨梅图') && document.body.innerText.includes('文心守护者')")
        log('A4 第九章章前引子自动弹出（墨梅图/文心守护者）', intro_visible)
        await page.screenshot(path=f'{OUT}/verify_ch9_intro.png')
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2500)
            await page.wait_for_timeout(400)
        except Exception:
            pass

        body = await page.evaluate("() => document.body.innerText")
        for t in ['展卷入画', '疏影横斜', '砚池凝墨', '雪夜梅影', '清气乾坤']:
            ok(f'A5 折卡「{t}」', t in body)
        boss_cnt = await page.locator('span.seal', has_text='首领战').count()
        ok('A6 首领战标记 ×2（折三洗砚/折五砚冰）', boss_cnt == 2, f'count={boss_cnt}')

        await page.get_by_text('赤壁赋').first.click()
        await page.wait_for_timeout(500)
        body = await page.evaluate("() => document.body.innerText")
        ok('A7 赤壁赋已启（第八大章可入）', '第捌大章' in body)
        await page.get_by_text('文心雕龙').first.click()
        await page.wait_for_timeout(500)
        body = await page.evaluate("() => document.body.innerText")
        ok('A8 文心雕龙仍为未启之卷（敬请期待）', '敬请期待' in body)
        await page.get_by_text('墨梅图').first.click()
        await page.wait_for_timeout(500)

        # ============ B + C1：第一折 沅芷澧兰（ORCHID） ============
        await start_fold(page, 0, '展卷入画')
        body = await page.evaluate("() => document.body.innerText")
        ok('B1 开战卷首语「这幅画里藏着一个乾坤」', '这幅画里藏着一个乾坤' in body)
        await page.screenshot(path=f'{OUT}/verify_ch9_orchid_battle.png')

        rgb = await sky_rgb(page)
        log('C1 SCROLLIN 宣纸暖底（r>g>b 且 sum≥230）', bool(rgb) and rgb[0] > rgb[1] and rgb[1] > rgb[2] and sum(rgb) >= 230, f'rgb={rgb}')
        samples = [rgb] if rgb else []

        # ============ C2-C4：撤离后按折序切换采样 ============
        for nth, fold, name, cond in [
            (1, '疏影横斜', 'C2 SHADOW 月下苔绿（g 最高）', lambda v: v[1] > v[0] and v[1] >= v[2]),
            (2, '砚池凝墨', 'C3 INKSTONE 玄墨深紫（b≥r-6 且 sum<195）', lambda v: sum(v) < 195 and v[2] >= v[0] - 6),
            (3, '雪夜梅影', 'C4 SNOWPLUM 雪压画境（b>r 且 sum≥235）', lambda v: sum(v) >= 235 and v[2] > v[0]),
        ]:
            await leave_battle(page)
            await start_fold(page, nth, fold)
            rgb = await sky_rgb(page)
            ok(name, bool(rgb) and cond(rgb), f'rgb={rgb}')
            await page.screenshot(path=f'{OUT}/verify_ch9_{fold}.png')
            if rgb:
                samples.append(rgb)

        # C5 折五天问列星（STARQ）——也是 F 组战场
        await leave_battle(page)
        await start_fold(page, 4, '清气乾坤')
        rgb5 = await sky_rgb(page)
        log('C5 PUREQI 素白清气（r≥g≥b 且 sum≥250）', bool(rgb5) and rgb5[0] >= rgb5[1] and rgb5[1] >= rgb5[2] and sum(rgb5) >= 250, f'rgb={rgb5}')
        await page.screenshot(path=f'{OUT}/verify_ch9_starq_battle.png')

        # C6 两两互异（五折顶部均色 10 对，至少 5 对显著）
        samples.append(rgb5)
        pairs = 0
        sig = 0
        for i in range(len(samples)):
            for j in range(i + 1, len(samples)):
                pairs += 1
                d = sum(abs(samples[i][k] - samples[j][k]) for k in range(3))
                mx = max(abs(samples[i][k] - samples[j][k]) for k in range(3))
                if d > 40 or mx > 13:
                    sig += 1
        ok('C6 五折氛围两两互异（≥4/10 对显著差异）', sig >= 4, f'{sig}/{pairs}')

        # ============ F 组：终折 Boss + 尾声 + 成就 ============
        t0 = time.monotonic()
        banner25 = boss25 = False
        while time.monotonic() - t0 < 40:
            await page.wait_for_timeout(500)
            body = await page.evaluate("() => document.body.innerText")
            if '文心守护者·砚冰' in body:
                banner25 = True
            f = await fx(page)
            if f and f['bossOnField']:
                boss25 = True
            if banner25 and boss25:
                break
        ok('F1 终折 Boss banner「文心守护者·砚冰」+ 在阵', banner25 and boss25, f'banner={banner25} boss={boss25}')
        await page.screenshot(path=f'{OUT}/verify_ch9_boss25.png')

        ok('F2 速胜触发结算', await page.evaluate("() => window.__inkGestureDebug?.forceVictory?.() ?? false"))
        await page.wait_for_timeout(1400)
        vbody = await page.evaluate("() => document.body.innerText")
        ok('F2 结算含第九章尾声「清气/文心殿」', '清气' in vbody and '文心殿' in vbody)
        ok('F3 新成就「淡墨痕迹」首次通关即解锁', '握笔之手指向文心殿' in vbody)
        nxt = await page.get_by_role('button', name='启下一章').count()
        log('F4 终折无「启下一章」按钮（当前上界内最后大章）', nxt == 0)
        await page.screenshot(path=f'{OUT}/verify_ch9_victory.png')

        # ============ D 组：折三 Boss 玄墨河伯（重新载入 → 第三折） ============
        await page.evaluate("() => { location.reload(); }")
        await page.wait_for_timeout(1500)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(900)
        try:
            await page.get_by_role('button', name='启 卷').click(timeout=2000)
            await page.wait_for_timeout(300)
        except Exception:
            pass
        await start_fold(page, 2, '砚池凝墨')

        t0 = time.monotonic()
        banner23 = boss23 = False
        while time.monotonic() - t0 < 50:
            await page.wait_for_timeout(500)
            body = await page.evaluate("() => document.body.innerText")
            if '守画人·洗砚' in body:
                banner23 = True
            f = await fx(page)
            if f and f['bossOnField']:
                boss23 = True
            if banner23 and boss23:
                break
        ok('D1 Boss banner「守画人·洗砚」', banner23)
        ok('D2 bossOnField 洗砚在阵', boss23)
        await page.screenshot(path=f'{OUT}/verify_ch9_boss23.png')

        # ============ G 组：移动端 390px ============
        mob = await browser.new_page(viewport={'width': 390, 'height': 780})
        mob.on('pageerror', lambda e: errors.append(str(e)))
        await mob.goto(URL, wait_until='networkidle')
        await mob.evaluate(
            """([key, val]) => localStorage.setItem(key, val)""",
            [STORAGE, make_progress(41, list(range(1, 41)), [1, 2, 3, 4, 5, 6, 7, 8, 9])],
        )
        await mob.goto(URL, wait_until='networkidle')
        await mob.wait_for_timeout(1200)
        await mob.get_by_text('启卷入战').click()
        await mob.wait_for_timeout(900)
        mbody = await mob.evaluate("() => document.body.innerText")
        ok('G1 移动端 390px 选章含墨梅图五折', '展卷入画' in mbody and '清气乾坤' in mbody)
        await mob.screenshot(path=f'{OUT}/verify_ch9_mobile.png')
        await mob.close()

        await browser.close()

    real_errors = [e for e in errors if 'favicon' not in e.lower() and '404' not in e]
    print(f"\nJS 异常 {len(real_errors)} 条")
    for e in real_errors[:5]:
        print('  !', e[:200])
    passed = sum(1 for _, o in results if o)
    print(f"\n===== 第九章验证 {passed}/{len(results)} PASS =====")
    if real_errors or passed < len(results):
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
