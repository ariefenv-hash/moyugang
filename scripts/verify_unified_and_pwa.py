# -*- coding: utf-8 -*-
"""验证二合一：PWA 更新巡检接线 + 摇杆移除后的战斗界面"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

async def main():
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1800)

        sw = await page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return { swRegistered: !!reg, manifest: (await fetch('/manifest.webmanifest')).status };
        }""")

        # 旧摇杆痕迹检查：三模式切换按钮不应存在
        legacy = await page.evaluate("""() => ({
            modeSwitchBtns: [...document.querySelectorAll('button')].filter(b => ['双区','经典'].includes(b.textContent.trim())).length,
            joystickDom: document.querySelectorAll('[class*="joystick" i]').length,
        })""")

        # 进入战斗（菜单 → 启卷入战 → 选折页 → 启程试炼 → 战斗），确认技能键常驻 + 挥毫提示
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(1000)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2500)
        battle = await page.evaluate("""() => ({
            hasCanvas: !!document.querySelector('canvas'),
            charModeBtn: !![...document.querySelectorAll('button')].find(b => b.textContent.includes('字诀')),
            skillCluster: ['腾跃','断水','竹影','笔阵','落墨','临江仙'].every(t =>
                [...document.querySelectorAll('button')].some(b => b.textContent.includes(t))),
            gestureHint: [...document.querySelectorAll('div')].some(d => d.textContent.includes('挥毫手势')),
            noDualText: ![...document.querySelectorAll('div')].some(d => d.textContent.includes('双区')),
        })""")

        # 画一笔横划（手势仍应触发断水斩徽标）
        canvas = page.locator('canvas').last
        box = await canvas.bounding_box()
        cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2
        await page.mouse.move(cx - 160, cy)
        await page.mouse.down()
        for i in range(12):
            await page.mouse.move(cx - 160 + i*27, cy, steps=2)
        await page.mouse.up()
        await page.wait_for_timeout(400)
        gesture_ok = await page.evaluate(
            "() => [...document.querySelectorAll('div')].some(d => d.textContent.includes('「横」'))")

        await page.screenshot(path='download/verify7_battle_unified.png')
        await browser.close()

    result = {'sw': sw, 'legacy': legacy, 'battle': battle,
              'horizontalGestureFired': gesture_ok, 'consoleErrors': errors}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    ok = (sw['swRegistered'] and sw['manifest'] == 200 and legacy['modeSwitchBtns'] == 0
          and legacy['joystickDom'] == 0 and battle['skillCluster'] and battle['noDualText']
          and gesture_ok and not errors)
    print('VERIFY', 'PASS' if ok else 'FAIL')

asyncio.run(main())
