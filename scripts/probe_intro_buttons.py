# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto('http://localhost:3000/', wait_until='networkidle')
        await page.wait_for_timeout(1200)
        await page.get_by_text('启卷入战').click()
        await page.wait_for_timeout(1500)
        names = await page.evaluate("""() =>
            [...document.querySelectorAll('button')].map(b => JSON.stringify(b.innerText))
        """)
        for n in names:
            print(n)
        await browser.close()

asyncio.run(main())
