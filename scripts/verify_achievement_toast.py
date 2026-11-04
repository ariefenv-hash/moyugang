#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_achievement_toast.py — 成就解锁浮提示（Task 47）无头验证

覆盖链路：
  A. 静态源锚：AchievementToast 组件在册 / App 接线（import+render）/ 首跑静默闸
     / 队列入栈与上限 / playAchievementChime 音效在册 / TTL 与同屏上限
  B. e2e 首跑静默：高值预置（存量补账 10 枚）→ reload 全入档但浮提示零出现
     （老玩家回归不被刷屏——Task 47 核心行为约束）
  C. e2e 即时浮提示：低值预置 → 墨阁购买字诀精研至 Lv3（不出战斗）→
     rune_adept 浮签 ≤2s 内可见且入档（静默缺口补上实证）
  D. e2e 自动退场：rune_adept 浮签 ~5.5s 后消失（队列出栈）
  E. e2e 双解锁入队：字诀/祝福两线各 Lv5→6 快捷连购 → 两枚浮签同屏
     （队列机制 + 静默首跑不误发，data-attribute 区分）
  F. 390px 移动端可见性：浮签不溢出视口
  G. 全程零 console error / pageerror

用法：python3 scripts/verify_achievement_toast.py（需 dev :3000）
"""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def make_progress(**over):
    base = {
        "unlockedLevel": 8,
        "completedLevels": [1, 2, 3, 4, 5, 6, 7],
        "storySeen": [1, 2, 3],
        "jadeSparks": 2000,
        "heroUpgrades": {
            "attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0,
            "resonanceLevel": 0, "runeLevel": 0, "blessingLuckLevel": 0,
        },
        "unitUpgrades": {"SCRIBE": 0, "SWORD": 0, "ARCHER": 0, "GUARDIAN": 0, "HARPIST": 0},
        "citadelUpgrades": {"baseHpLevel": 0, "gatherSpeedLevel": 0},
        "levelStars": {},
        "endlessBest": 0,
        "achievements": [],
        "tutorialDone": True,
        "totalKills": 0,
        "dailyStreak": 0,
    }
    base.update(over)
    return base


def set_progress(page, p):
    page.evaluate(
        "(v) => localStorage.setItem('ink_and_steel_progress_v1', JSON.stringify(v))", p
    )


def read_saved(page):
    return page.evaluate(
        "() => JSON.parse(localStorage.getItem('ink_and_steel_progress_v1') || '{}')"
    )


def toast_count(page, tid=None):
    sel = "[data-achievement-toast]" if tid is None else f'[data-achievement-toast="{tid}"]'
    return page.locator(sel).count()


def run_static():
    print("A. 静态源锚")
    try:
        comp = open("src/components/AchievementToast.tsx", encoding="utf-8").read()
        check("A1 AchievementToast 组件在册", "export function AchievementToast" in comp)
        check("A2 AnimatePresence 滑入滑出在册",
              "AnimatePresence" in comp and "motion.div" in comp
              and "initial={{ opacity: 0, x: 56 }}" in comp
              and "exit={{ opacity: 0, x: 56 }}" in comp)
        check("A3 TTL 4500 / 同屏上限 3 / 队列 role=status",
              "TOAST_TTL_MS = 4500" in comp and "MAX_VISIBLE = 3" in comp
              and 'role="status"' in comp and "data-achievement-toast" in comp)
    except FileNotFoundError:
        check("A1 AchievementToast 组件在册", False, "文件缺失")
        return
    ap = open("src/App.tsx", encoding="utf-8").read()
    check("A4 App 接线（import + render + 队列 state）",
          "import { AchievementToast } from './components/AchievementToast';" in ap
          and "<AchievementToast toasts={achievementToasts} onExpire={handleToastExpire} />" in ap
          and "useState<AchievementDef[]>([])" in ap)
    check("A5 首跑静默闸（存量补账不打扰）",
          "progressEffectFirstRun = useRef(true)" in ap
          and "if (!firstRun) {" in ap and "sound.playAchievementChime();" in ap)
    check("A6 队列入栈与上限（slice(0, 6)）",
          "setAchievementToasts((q) => [...q, ...newly].slice(0, 6));" in ap
          and "q.filter((t) => t.id !== id)" in ap)
    au = open("src/utils/audio.ts", encoding="utf-8").read()
    check("A7 playAchievementChime 音效在册（五声上行双音）",
          "public playAchievementChime()" in au and "523.25" in au and "783.99" in au)


def run_e2e_first_run_silent(page):
    print("B. e2e 首跑静默：存量补账 10 枚 → 零浮签")
    high = make_progress(
        heroUpgrades={"attackLevel": 3, "hpLevel": 3, "cooldownLevel": 3,
                      "resonanceLevel": 3, "runeLevel": 6, "blessingLuckLevel": 6},
        totalKills=25000, endlessBest=45, dailyStreak=8, jadeSparks=2000,
    )
    set_progress(page, high)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    saved = read_saved(page)
    got = set(saved.get("achievements", []))
    newly_ids = ["daily_streak_3", "daily_streak_7", "rune_adept", "rune_master",
                 "blessing_charm", "blessing_fortune", "kills_5000", "kills_20000",
                 "endless_40", "upgrade_zenith"]
    missing = [i for i in newly_ids if i not in got]
    check("B1 存量补账 10/10 入档", not missing, str(missing))
    check("B2 补账全程零浮签（静默不打扰）", toast_count(page) == 0,
          f"浮签数 {toast_count(page)}")


def run_e2e_instant_toast(page):
    print("C. e2e 即时浮提示：墨阁购买 → rune_adept 浮签")
    set_progress(page, make_progress())
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    check("C1 低值首跑零浮签", toast_count(page) == 0, f"浮签数 {toast_count(page)}")
    page.get_by_text("赋诗研习", exact=True).first.click()
    page.wait_for_timeout(700)
    rune_card = page.locator("div.panel-paper", has_text="字诀精研").first
    for _ in range(3):  # Lv0 → 3：50+75+113=238 灵玉（2000 充足）
        rune_card.get_by_role("button").click()
        page.wait_for_timeout(300)
    page.wait_for_timeout(1200)  # effect → 入栈 → 滑入动画窗口
    saved = read_saved(page)
    check("C2 rune_adept 即时入档", "rune_adept" in saved.get("achievements", []),
          str(saved.get("achievements", [])))
    check("C3 rune_adept 浮签可见（不出战斗）", toast_count(page, "rune_adept") == 1,
          f"rune_adept 浮签 {toast_count(page, 'rune_adept')} 枚")


def run_e2e_expire(page):
    print("D. e2e 浮签自动退场（TTL ~4.5s）")
    page.wait_for_timeout(4600)  # C 段浮签入屏后再候满 TTL + 退场动画余量
    check("D1 rune_adept 浮签已退场", toast_count(page, "rune_adept") == 0,
          f"rune_adept 浮签 {toast_count(page, 'rune_adept')} 枚")


def run_e2e_queue(page):
    print("E. e2e 双解锁入队：两线各 Lv5→6 连购 → 两枚同屏")
    set_progress(page, make_progress(
        heroUpgrades={"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0,
                      "resonanceLevel": 0, "runeLevel": 5, "blessingLuckLevel": 5},
        achievements=["rune_adept", "blessing_charm"],  # 首跑潜在补账先入档，隔离变量
        jadeSparks=2000,
    ))
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1000)
    check("E1 首跑静默（预置成就隔离后零浮签）", toast_count(page) == 0,
          f"浮签数 {toast_count(page)}")
    page.get_by_text("赋诗研习", exact=True).first.click()
    page.wait_for_timeout(700)
    # Lv5→6 单价 380 × 2 = 760 ≤ 2000
    rune_card = page.locator("div.panel-paper", has_text="字诀精研").first
    rune_card.get_by_role("button").click()
    page.wait_for_timeout(250)
    luck_card = page.locator("div.panel-paper", has_text="祝福气运").first
    luck_card.get_by_role("button").click()
    page.wait_for_timeout(1200)
    saved = read_saved(page)
    got = set(saved.get("achievements", []))
    check("E2 rune_master + blessing_fortune 双入档",
          "rune_master" in got and "blessing_fortune" in got, str(sorted(got)))
    c_rune, c_luck = toast_count(page, "rune_master"), toast_count(page, "blessing_fortune")
    check("E3 两枚浮签同屏（队列机制）", c_rune == 1 and c_luck == 1,
          f"rune_master {c_rune} 枚 / blessing_fortune {c_luck} 枚")


def run_e2e_mobile(page):
    print("F. 390px 移动端浮签可见性")
    sel = '[data-achievement-toast="blessing_fortune"]'
    if page.locator(sel).count() == 0:
        # E 段浮签可能已退场：干净低值重置 → 单次购买复现浮签
        # （不能沿用 E 段账面：两线已 Lv6，再购不触发任何新成就）
        set_progress(page, make_progress(
            heroUpgrades={"attackLevel": 0, "hpLevel": 0, "cooldownLevel": 0,
                          "resonanceLevel": 0, "runeLevel": 0, "blessingLuckLevel": 2},
            jadeSparks=2000))
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(900)
        page.get_by_text("赋诗研习", exact=True).first.click()
        page.wait_for_timeout(600)
        card = page.locator("div.panel-paper", has_text="祝福气运").first
        card.get_by_role("button").click()
        page.wait_for_timeout(1200)
        sel = '[data-achievement-toast="blessing_charm"]'
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(400)
    box = page.locator(sel).first.bounding_box()
    ok = box is not None and box["x"] >= 0 and box["x"] + box["width"] <= 390 and box["y"] >= 0
    check("F1 浮签在 390px 视口内完整可见", ok, str(box))


def main():
    run_static()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(600)
        run_e2e_first_run_silent(page)
        run_e2e_instant_toast(page)
        run_e2e_expire(page)
        run_e2e_queue(page)
        run_e2e_mobile(page)
        browser.close()
    n_fail = sum(1 for _, ok, _ in results if not ok)
    print(f"\n==== verify_achievement_toast: {len(results) - n_fail}/{len(results)} PASS ====")
    if console_errors:
        print("console/page errors:")
        for e in console_errors[:8]:
            print("  -", e[:200])
    sys.exit(1 if (n_fail or console_errors) else 0)


if __name__ == "__main__":
    main()
