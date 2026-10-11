# -*- coding: utf-8 -*-
"""第二章《山河谣·蚀文惊变》剧情大升级全链路验证：
十章总纲章签 / 章前引子卷轴 / 未启之卷预告 / 新氛围(烟雨·雷雨·蚀月) / 卷首语 / 跨章解锁与存档迁移"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'
OUT = '/home/z/my-project/download'
STORAGE = 'ink_and_steel_progress_v1'

def make_progress(unlocked, completed, story_seen):
    return json.dumps({
        'unlockedLevel': unlocked,
        'completedLevels': completed,
        'storySeen': story_seen,
        'jadeSparks': 3000,
        'heroUpgrades': {'attackLevel': 0, 'hpLevel': 0, 'cooldownLevel': 0, 'resonanceLevel': 0},
        'unitUpgrades': {'SCRIBE': 0, 'SWORD': 0, 'ARCHER': 0, 'GUARDIAN': 0, 'HARPIST': 0},
        'citadelUpgrades': {'baseHpLevel': 0, 'gatherSpeedLevel': 0},
        'levelStars': {},
        'endlessBest': 0,
        'achievements': [],
        'tutorialDone': True,
        'totalKills': 0,
    })

async def canvas_avg_rgb(page):
    return await page.evaluate(
        """() => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const g = c.getContext('2d');
            const d = g.getImageData(0, 0, Math.min(120, c.width), Math.min(80, c.height)).data;
            let r=0, gg=0, b=0, n=0;
            for (let i=0; i<d.length; i+=4) { r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++; }
            return [Math.round(r/n), Math.round(gg/n), Math.round(b/n)];
        }"""
    )

async def main():
    errors = []
    results = []
    ok = lambda name, cond: results.append((name, bool(cond)))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ============ A. 新玩家流程（干净存档） ============
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1400)

        # A1 主菜单十章文案
        body = await page.evaluate("() => document.body.innerText")
        ok('A1 主菜单「主线十章」文案', '十章' in body)

        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(1100)

        # A2 十章章签全部渲染
        tab_texts = await page.evaluate(
            "() => [...document.querySelectorAll('button')].map(b => b.textContent).join('|')")
        for name in ['风雅集', '山河谣', '漱玉词', '边塞引', '离骚赋', '桃花源', '长安幻', '赤壁赋', '墨梅图', '文心雕龙']:
            ok(f'A2 章签「{name}」', name in tab_texts)

        # A3 首次进入第一大章 → 章前引子自动弹出
        await page.wait_for_timeout(600)
        intro_visible = await page.evaluate(
            "() => document.body.innerText.includes('卷宗 · 引子') && document.body.innerText.includes('幻墨残影自冰川苏醒')")
        ok('A3 第一大章章前引子自动弹出', intro_visible)
        await page.screenshot(path=f'{OUT}/verify10_ch1_intro.png')
        await page.get_by_role('button', name='启 卷').click()
        await page.wait_for_timeout(500)

        # A4 第一大章五折卡 + 无尽卡
        body = await page.evaluate("() => document.body.innerText")
        for t in ['踏雪寻梅', '竹林清幽', '月下独酌', '流水落花', '破晓之决', '万墨长夜']:
            ok(f'A4 第一大章卡「{t}」', t in body)

        # A5 切到第二大章：未解锁章不自动弹引子（防剧透），但可手动「卷首」打开
        await page.get_by_role('button', name='山河谣').first.click()
        await page.wait_for_timeout(900)
        modal_open = await page.evaluate("() => document.body.innerText.includes('卷宗 · 引子')")
        ok('A5a 未解锁章不自动弹引子', not modal_open)
        await page.screenshot(path=f'{OUT}/verify10_ch2_locked.png')
        await page.get_by_text('卷首 · 重温章前引子').click()
        await page.wait_for_timeout(700)
        intro2 = await page.evaluate(
            "() => document.body.innerText.includes('洗墨之乱') && document.body.innerText.includes('文心四魄')")
        ok('A5b 第二大章章前引子（洗墨之乱/文心四魄）', intro2)
        await page.screenshot(path=f'{OUT}/verify10_ch2_intro.png')
        await page.get_by_role('button', name='启 卷').click()
        await page.wait_for_timeout(400)

        # A6 第二章五折卡渲染且未解锁（新玩家）
        body = await page.evaluate("() => document.body.innerText")
        for t in ['烟雨断桥', '枫林晚渡', '雷峰夕照', '寒潭鹤影', '文枢归一']:
            ok(f'A6 第二章折卡「{t}」', t in body)
        ok('A6b 新玩家第二章锁定', '尚未感悟' in body)

        # A7 未启之卷（第三章）预告
        await page.get_by_role('button', name='漱玉词').first.click()
        await page.wait_for_timeout(700)
        body = await page.evaluate("() => document.body.innerText")
        ok('A7 未启之卷预告（断弦夫人/敬请期待）', ('断弦' in body and '敬请期待' in body))
        await page.screenshot(path=f'{OUT}/verify10_upcoming.png')

        # A8 第一章战斗：卷首语 + 诗签
        await page.get_by_role('button', name='风雅集').first.click()
        await page.wait_for_timeout(500)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2400)
        body = await page.evaluate("() => document.body.innerText")
        ok('A8 第一折卷首语（幻墨残影）', '幻墨残影自冰川苏醒' in body)
        ok('A8b HUD 章节标签', ('风雅集·第一折' in body and '踏雪寻梅' in body))
        await page.screenshot(path=f'{OUT}/verify10_ch1_battle.png')
        # 退出战斗
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(500)
        await page.get_by_text('撤离战场').click()
        await page.wait_for_timeout(800)
        await page.close()

        # ============ B. 老玩家跨章流程（已通第一章） ============
        page2 = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page2.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page2.on('pageerror', lambda e: errors.append(str(e)))
        await page2.add_init_script(f"window.localStorage.setItem('{STORAGE}', {json.dumps(make_progress(6, [1,2,3,4,5], [1,2]))});")
        await page2.goto(URL, wait_until='networkidle')
        await page2.wait_for_timeout(1500)

        # B1 主菜单进度 = 第贰章·第壹折
        body = await page2.evaluate("() => document.body.innerText")
        ok('B1 菜单进度显示第贰章·第壹折', ('第贰章' in body and '第壹折' in body))

        await page2.get_by_text('启卷入战').click()
        await page2.wait_for_timeout(1100)

        # B2 默认落在第二大章，且引子已读过（不自动弹）
        intro_again = await page2.evaluate("() => document.body.innerText.includes('卷宗 · 引子')")
        body = await page2.evaluate("() => document.body.innerText")
        ok('B2 默认章=贰 & 引子不重复弹', (not intro_again) and '烟雨断桥' in body)

        # B3 第二章第一折可进入
        await page2.get_by_role('button', name='启程试炼').first.click()
        await page2.wait_for_timeout(2600)
        body = await page2.evaluate("() => document.body.innerText")
        ok('B3 烟雨断桥战斗开始', ('山河谣·第一折' in body and '烟雨断桥' in body))
        ok('B3b 卷首语（名字已被洗去）', '名字已被洗去' in body)
        await page2.wait_for_timeout(4000)  # 卷首语自散

        rgb_mist = await canvas_avg_rgb(page2)
        print('[MIST 烟雨断桥 顶部均色] =', rgb_mist)
        ok('B4 MIST 氛围（灰青中调）', rgb_mist and 60 <= rgb_mist[0] <= 150 and abs(rgb_mist[0]-rgb_mist[2]) < 40)
        await page2.screenshot(path=f'{OUT}/verify10_mist_battle.png')

        # 撤离 → 进第三折雷峰夕照（STORM）
        await page2.keyboard.press('Escape')
        await page2.wait_for_timeout(400)
        await page2.get_by_text('撤离战场').click()
        await page2.wait_for_timeout(900)
        # 直接改存档解锁到 10，快进验证后三折氛围（add_init_script 会在 reload 时重跑，
        # 故需再次注册覆盖为更高进度，后注册者后执行、后写胜出）
        await page2.evaluate(f"window.localStorage.setItem('{STORAGE}', {json.dumps(make_progress(10, [1,2,3,4,5,6,7,8,9], [1,2]))});")
        await page2.add_init_script(f"window.localStorage.setItem('{STORAGE}', {json.dumps(make_progress(10, [1,2,3,4,5,6,7,8,9], [1,2]))});")
        await page2.reload(wait_until='networkidle')
        await page2.wait_for_timeout(1400)
        await page2.get_by_text('启卷入战').click()
        await page2.wait_for_timeout(900)
        await page2.get_by_role('button', name='启程试炼').nth(2).click()
        await page2.wait_for_timeout(2600)
        rgb_storm = await canvas_avg_rgb(page2)
        print('[STORM 雷峰夕照 顶部均色] =', rgb_storm)
        ok('B5 STORM 氛围（深蓝压顶）', rgb_storm and rgb_storm[2] > rgb_storm[0])
        await page2.screenshot(path=f'{OUT}/verify10_storm_battle.png')

        await page2.keyboard.press('Escape')
        await page2.wait_for_timeout(400)
        await page2.get_by_text('撤离战场').click()
        await page2.wait_for_timeout(900)
        await page2.get_by_role('button', name='启程试炼').nth(4).click()
        await page2.wait_for_timeout(2600)
        rgb_void = await canvas_avg_rgb(page2)
        print('[VOID 文枢归一 顶部均色] =', rgb_void)
        ok('B6 VOID 氛围（紫墨渊）', rgb_void and rgb_void[2] > rgb_void[1] + 6 and rgb_void[0] > rgb_void[1])
        body = await page2.evaluate("() => document.body.innerText")
        ok('B6b 文枢归一卷首语', '以剑锋为笔锋' in body)
        await page2.screenshot(path=f'{OUT}/verify10_void_battle.png')

        # B7 章签切回第一大章：无尽卷可见（第一章已通）
        await page2.keyboard.press('Escape')
        await page2.wait_for_timeout(400)
        await page2.get_by_text('撤离战场').click()
        await page2.wait_for_timeout(900)
        await page2.get_by_role('button', name='风雅集').first.click()
        await page2.wait_for_timeout(700)
        body = await page2.evaluate("() => document.body.innerText")
        ok('B7 老玩家无尽卷解锁', '入夜坚守' in body)

        # B8 移动端 390x844 章签横滚
        page3 = await browser.new_page(viewport={'width': 390, 'height': 844})
        page3.on('pageerror', lambda e: errors.append(str(e)))
        await page3.add_init_script(f"window.localStorage.setItem('{STORAGE}', {json.dumps(make_progress(6, [1,2,3,4,5], [1,2]))});")
        await page3.goto(URL, wait_until='networkidle')
        await page3.wait_for_timeout(1200)
        await page3.get_by_text('启卷入战').click()
        await page3.wait_for_timeout(1000)
        body = await page3.evaluate("() => document.body.innerText")
        ok('B8 移动端章签+折卡', ('山河谣' in body and '烟雨断桥' in body))
        await page3.screenshot(path=f'{OUT}/verify10_mobile_select.png')
        await page3.close()

        await browser.close()

    print('\n===== 验证结果 =====')
    fails = 0
    for name, cond in results:
        print(('PASS  ' if cond else 'FAIL  ') + name)
        fails += 0 if cond else 1
    real_errors = [e for e in errors if 'favicon' not in e.lower()]
    print(f'\n控制台真实错误: {len(real_errors)}')
    for e in real_errors[:8]:
        print('  !', e[:180])
    print(f'\n总计: {len(results) - fails}/{len(results)} PASS')
    raise SystemExit(0 if fails == 0 and not real_errors else 1)

asyncio.run(main())
