# -*- coding: utf-8 -*-
"""PWA 冒烟测试：页面加载零报错 + Service Worker 注册成功 + manifest 可达"""
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

async def main():
    errors, sw_state = [], {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1500)

        sw_state = await page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            const manifest = await fetch('/manifest.webmanifest').then(r => r.status);
            let controller = !!navigator.serviceWorker.controller;
            return {
                swRegistered: !!reg,
                swScope: reg ? reg.scope : null,
                swActive: reg ? !!(reg.active || reg.installing || reg.waiting) : false,
                manifestStatus: manifest,
                controller,
                installableChecks: {
                    hasManifest: !!document.querySelector('link[rel=manifest]'),
                    hasSW: 'serviceWorker' in navigator,
                },
            };
        }""")
        # PWA 安装判定（Chrome 内部指标近似检查）
        title = await page.title()
        await browser.close()

    print(json.dumps({'title': title, **sw_state, 'consoleErrors': errors},
                     ensure_ascii=False, indent=2))
    ok = sw_state.get('swRegistered') and sw_state.get('manifestStatus') == 200 and not errors
    print('SMOKE', 'PASS' if ok else 'FAIL')

asyncio.run(main())
