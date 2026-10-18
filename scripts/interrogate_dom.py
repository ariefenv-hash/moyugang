# -*- coding: utf-8 -*-
""" interrogation：亮区元素来源 + 画布位图内容回读 """
import asyncio, json
from playwright.async_api import async_playwright

URL = 'http://localhost:3000/'

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 360, 'height': 780},
                                        device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(1200)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(800)
        await page.get_by_text('启程试炼').first.click()
        await page.wait_for_timeout(2500)

        info = await page.evaluate(
            """() => {
              const out = {};
              // 1) 亮区(CSS 280,200) 与 黑区(CSS 280,600) 的元素栈
              out.stackBright = document.elementsFromPoint(280, 200).map(e =>
                e.tagName + '.' + (e.className && e.className.toString ? e.className.toString().slice(0,60) : ''));
              out.stackBlack = document.elementsFromPoint(280, 600).map(e =>
                e.tagName + '.' + (e.className && e.className.toString ? e.className.toString().slice(0,60) : ''));
              // 2) 画布位图回读：右半是否透明
              const c = document.querySelector('canvas');
              const g = c.getContext('2d');
              const probe = (x, y) => {
                const d = g.getImageData(x, y, 1, 1).data;
                return [d[0], d[1], d[2], d[3]];
              };
              out.px_leftTop = probe(100, 300);      // 暗区（应不透明）
              out.px_rightTop = probe(600, 300);     // 亮画区（位图坐标 600 = CSS 300）
              out.px_rightBottom = probe(600, 1400); // 黑区
              // 3) 有多少 img 元素在 DOM
              out.imgs = [...document.querySelectorAll('img')].map(i =>
                ({ src: i.src.split('/').pop(), rect: i.getBoundingClientRect().toJSON(), visible: i.offsetWidth > 0 }));
              return out;
            }"""
        )
        print(json.dumps(info, ensure_ascii=False, indent=1))
        await browser.close()

asyncio.run(main())
