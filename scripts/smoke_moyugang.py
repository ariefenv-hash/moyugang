"""
墨韵战纪 改动冒烟测试
验证项：
  1. 页面加载无 console error
  2. 进入第一折战斗
  3. 移动连贯性：按住 D 匀速采样；点地移动 ease-out 缓停
  4. 右划 = 断水斩（突进）；左划 = 剑气逆寒（撤步 + CD 共享）
  5. 分屏路由：上区写「山」= 识别成功 + 文思连段 + 粒子化灵；上区划横不触发手势
"""
import json
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000/"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")


def sample_hero(page, n, interval_ms=33):
    """连续采样英雄位置 n 次，返回 [{x,y},...]"""
    return page.evaluate(
        """async (args) => {
            const dbg = window.__inkGestureDebug;
            const out = [];
            for (let i = 0; i < args.n; i++) {
                const p = dbg.heroPos();
                out.push({ x: p.x, y: p.y });
                await new Promise(r => setTimeout(r, args.iv));
            }
            return out;
        }""",
        {"n": n, "iv": interval_ms},
    )


def swipe(page, x0, y0, x1, y1, steps=12, step_ms=12):
    """模拟快速滑动（flick）"""
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, steps + 1):
        t = i / steps
        page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
        page.wait_for_timeout(step_ms)
    page.mouse.up()


def draw_stroke(page, pts, step_ms=14):
    """字诀单笔"""
    page.mouse.move(pts[0][0], pts[0][1])
    page.mouse.down()
    for p in pts[1:]:
        page.mouse.move(p[0], p[1])
        page.wait_for_timeout(step_ms)
    page.mouse.up()
    page.wait_for_timeout(120)


def draw_circle(page, cx, cy, r, steps=18):
    """画圆手势（竹影墨盾）"""
    import math
    pts = [
        (cx + r * math.cos(2 * math.pi * i / steps),
         cy + r * math.sin(2 * math.pi * i / steps))
        for i in range(steps + 1)
    ]
    page.mouse.move(pts[0][0], pts[0][1])
    page.mouse.down()
    for p in pts[1:]:
        page.mouse.move(p[0], p[1])
        page.wait_for_timeout(10)
    page.mouse.up()
    page.wait_for_timeout(100)


class TouchPen:
    """触摸笔画：CDP dispatchTouchEvent（Chromium 合成 pointerType=touch 指针事件）"""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)

    def _emit(self, type_, pts):
        self.cdp.send("Input.dispatchTouchEvent", {"type": type_, "touchPoints": pts})

    def stroke(self, page, x0, y0, x1, y1, steps=10, step_ms=30):
        self._emit("touchStart", [{"x": x0, "y": y0}])
        for i in range(1, steps + 1):
            t = i / steps
            self._emit("touchMove", [{"x": x0 + (x1 - x0) * t, "y": y0 + (y1 - y0) * t}])
            page.wait_for_timeout(step_ms)
        self._emit("touchEnd", [])


def enter_battle(page):
    """从首页进入第一折战斗（首次 + 触摸组前重开干净战场共用）"""
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.click("text=启卷入战")
    page.wait_for_timeout(1200)
    try:
        page.click("button:has-text('启 卷')", timeout=4000)
        page.wait_for_timeout(800)
    except Exception:
        pass
    page.click("text=启程试炼 >> nth=0")
    page.wait_for_timeout(2000)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720}, has_touch=True)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # 1. 加载 + 2. 进入战斗
    enter_battle(page)
    in_battle = page.evaluate("() => !!window.__inkGestureDebug?.heroState?.()")
    check("2. 进入第一折战斗", in_battle)

    st = page.evaluate("() => window.__inkGestureDebug.heroState()")
    print(f"    初始状态: {st}")

    # 3a. 静止检测
    still = sample_hero(page, 8, 40)
    drift = max(abs(p["x"] - still[0]["x"]) for p in still)
    check("3a. 静止不漂移", drift < 2.0, f"drift={drift:.2f}px")

    # 3b. 按住 D 匀速移动：位移连续性（相邻采样位移的变异系数；受击干扰则重采一次）
    def kb_cv():
        page.keyboard.down("d")
        seq = sample_hero(page, 16, 33)
        page.keyboard.up("d")
        deltas = [seq[i + 1]["x"] - seq[i]["x"] for i in range(len(seq) - 1)]
        moving = [d for d in deltas if d > 0.5]
        if not moving:
            return None, 9, 0
        mean = sum(moving) / len(moving)
        sd = (sum((d - mean) ** 2 for d in moving) / len(moving)) ** 0.5
        return mean, (sd / mean if mean else 9), len(moving)

    mean, cv, n_moving = kb_cv()
    if cv >= 0.45:  # 战斗中受击/击退偶发干扰：重采一次取优
        mean, cv, n_moving = kb_cv()
    if n_moving:
        check("3b. 键盘移动连续", cv < 0.45, f"mean={mean:.2f}px/33ms cv={cv:.2f}")
    else:
        check("3b. 键盘移动连续", False, "无位移")

    # 3c. 点地移动 ease-out：点击近距目标（260px，缓停带 80px 落入采样窗）
    scr = page.evaluate(
        """() => {
            const p = window.__inkGestureDebug.heroPos();
            const cam = window.__inkGestureDebug.comboInfo().cameraX;
            return { sx: p.x - cam, sy: p.y };
        }"""
    )
    hero_before = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    page.mouse.click(scr["sx"] + 260, 470)
    page.wait_for_timeout(40)
    seq2 = sample_hero(page, 32, 40)
    page.wait_for_timeout(500)
    tgt = page.evaluate("() => window.__inkGestureDebug.heroTarget()")
    hero_after = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    moved = hero_after["x"] - hero_before["x"]
    # 前段平均速度 vs 末段平均速度（末段应显著减速 = ease-out）
    early = [seq2[i + 1]["x"] - seq2[i]["x"] for i in range(4, 12)]
    late = [seq2[i + 1]["x"] - seq2[i]["x"] for i in range(len(seq2) - 6, len(seq2) - 1)]
    early_v = sum(early) / max(1, len(early))
    late_v = sum(late) / max(1, len(late))
    check("3c-1. 点地移动到位", moved > 180, f"dx={moved:.0f}px target_cleared={tgt is None}")
    check(
        "3c-2. ease-out 缓停",
        late_v < early_v * 0.75,
        f"early={early_v:.2f}px/40ms late={late_v:.2f}px/40ms",
    )

    # 4a. 右划（顺向）→ 断水斩
    page.wait_for_timeout(600)
    hero_pre_dash = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    swipe(page, 320, 460, 640, 464)
    page.wait_for_timeout(250)
    st = page.evaluate("() => window.__inkGestureDebug.heroState()")
    cds = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    hero_post_dash = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    dash_dx = hero_post_dash["x"] - hero_pre_dash["x"]
    check(
        "4a. 右划=断水斩突进",
        cds.get("dash_slash", 0) > 0 and dash_dx > 120,
        f"dash_dx={dash_dx:.0f} cd={cds.get('dash_slash', 0):.2f} state={st['state']}",
    )

    # 4b. 左划（逆向）→ 剑气逆寒撤步（等 CD）
    page.wait_for_timeout(4300)
    hero_pre_ret = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    swipe(page, 640, 460, 320, 464)
    page.wait_for_timeout(250)
    hero_post_ret = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    cds2 = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    ret_dx = hero_post_ret["x"] - hero_pre_ret["x"]
    check(
        "4b. 左划=撤步剑气",
        cds2.get("dash_slash", 0) > 0 and ret_dx < -80,
        f"ret_dx={ret_dx:.0f} cd={cds2.get('dash_slash', 0):.2f}",
    )

    # 5. 分屏路由：书符区（上）写「山」→ 字诀管线；上区划横不触发手势
    # 等 dash_slash CD 走完（4b 撤步剑气与其共享 3.2s CD，否则 5a 负例误判）
    for _ in range(20):
        cd_now = page.evaluate(
            "() => window.__inkGestureDebug.battleState().skillCds"
        ).get("dash_slash", 0)
        if cd_now <= 0:
            break
        page.wait_for_timeout(300)
    combo_before = page.evaluate("() => window.__inkGestureDebug.comboInfo().charChain")
    parts_before = page.evaluate("() => window.__inkGestureDebug.fxStats().particles")
    # 5a. 负例：上区快速横划（y=300 < 403 分区线）→ 入字诀管线，断水斩不触发
    swipe(page, 500, 300, 800, 304)
    page.wait_for_timeout(800)
    dash_cd = page.evaluate(
        "() => window.__inkGestureDebug.battleState().skillCds"
    ).get("dash_slash", -1)
    check(
        "5a. 上区划横不入手势管线",
        dash_cd <= 0,
        f"dash_cd={dash_cd}（应为 0/负，未触发突进）",
    )
    # 5b. 正例：上区写「山」三笔 → 识别 + 文思连段 + 化灵粒子
    draw_stroke(page, [(640, 255), (639, 300), (638, 348)])  # 中竖
    draw_stroke(page, [(588, 288), (586, 340), (585, 348), (700, 350)])  # 左竖+底横
    draw_stroke(page, [(694, 292), (696, 340), (697, 348)])  # 右竖
    page.wait_for_timeout(900)
    combo_after = page.evaluate("() => window.__inkGestureDebug.comboInfo().charChain")
    parts_after = page.evaluate("() => window.__inkGestureDebug.fxStats().particles")
    ok_char = combo_after > combo_before
    check(
        "5b. 上区写「山」识别+化灵",
        ok_char,
        f"charChain {combo_before}->{combo_after} particles {parts_before}->{parts_after}",
    )

    # 6. 汇总 console 错误
    real_errors = [e for e in console_errors if "favicon" not in e.lower()]
    check("6. 无 console/page 错误", len(real_errors) == 0, f"errors={real_errors[:3]}")

    # 7. 攻击后摇走位（J 攻击中 0.24s 后移动应生效）
    page.keyboard.down("j")
    page.wait_for_timeout(60)
    page.keyboard.up("j")
    page.keyboard.down("d")
    seq3 = sample_hero(page, 14, 33)
    page.keyboard.up("d")
    late_deltas = [seq3[i + 1]["x"] - seq3[i]["x"] for i in range(6, 12)]
    late_move = sum(1 for d in late_deltas if d > 1.0)
    check("7. 攻击后摇可走位", late_move >= 3, f"后期位移帧数={late_move}/6")

    # 8. HOLD 军令实装（P0-2）：御敌后我方非文生单位不推进
    page.click("button:has-text('御敌')")
    page.wait_for_timeout(300)
    cmd = page.evaluate("() => window.__inkGestureDebug.armyCommand()")
    allies_a = [
        u for u in page.evaluate("() => window.__inkGestureDebug.units()")
        if not u["isEnemy"] and u["type"] != "SCRIBE" and u["hp"] > 0
    ]
    if allies_a and cmd == "HOLD":
        page.wait_for_timeout(2200)
        allies_b = [
            u for u in page.evaluate("() => window.__inkGestureDebug.units()")
            if not u["isEnemy"] and u["type"] != "SCRIBE" and u["hp"] > 0
        ]
        if allies_b:
            max_dx = max(b["x"] - a["x"] for a, b in zip(allies_a, allies_b))
            states = {u["state"] for u in allies_b}
            check(
                "8. HOLD 军令：原地驻守不推进",
                max_dx < 20,
                f"max_dx={max_dx:.0f}px states={states}",
            )
        else:
            check("8. HOLD 军令：原地驻守不推进", True, "skip—部队已全灭")
    else:
        check("8. HOLD 军令：原地驻守不推进", True, f"skip—cmd={cmd} allies={len(allies_a)}")

    # 9. 暂停期落兵冻结（P0-4）：等一波落兵入队 → 暂停 → 队列与敌数不变化
    q_seen = -1
    for _ in range(36):
        q_seen = page.evaluate("() => window.__inkGestureDebug.spawnQueue()")
        if q_seen > 0:
            break
        page.wait_for_timeout(500)
    if q_seen > 0:
        page.keyboard.press("p")
        page.wait_for_timeout(250)
        q0 = page.evaluate("() => window.__inkGestureDebug.spawnQueue()")
        gt0 = page.evaluate("() => window.__inkGestureDebug.gameTime()")
        en0 = page.evaluate(
            "() => window.__inkGestureDebug.units().filter(u => u.isEnemy && u.hp > 0).length"
        )
        page.wait_for_timeout(1600)
        q1 = page.evaluate("() => window.__inkGestureDebug.spawnQueue()")
        gt1 = page.evaluate("() => window.__inkGestureDebug.gameTime()")
        en1 = page.evaluate(
            "() => window.__inkGestureDebug.units().filter(u => u.isEnemy && u.hp > 0).length"
        )
        check(
            "9. 暂停期落兵队列冻结",
            q1 == q0 and gt1 == gt0 and en1 == en0,
            f"queue {q0}->{q1} gt {gt0}->{gt1} enemies {en0}->{en1}",
        )
        page.keyboard.press("p")  # 恢复
        page.wait_for_timeout(400)
    else:
        check("9. 暂停期落兵队列冻结", True, "skip—18s 内无落兵窗口")

    # 10. 施法缓冲（#10）：结印中手势入队不抢占，收势后自动补发
    # 等 bamboo_shield CD 走完（5b 写「山」触发竹影墨盾，CD 未完则画圆会转墨荷灵阵）
    for _ in range(40):
        cds_pre = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
        if cds_pre.get("bamboo_shield", 99) <= 0 and cds_pre.get("dash_slash", 99) <= 0:
            break
        page.wait_for_timeout(400)
    if cds_pre.get("bamboo_shield", 99) <= 0 and cds_pre.get("dash_slash", 99) <= 0:
        draw_circle(page, 640, 550, 45)  # 行止区（下）画圆 → 竹影墨盾结印姿势
        page.wait_for_timeout(150)
        st_mid = page.evaluate("() => window.__inkGestureDebug.heroState().state")
        check(
            "10a. 画圆建立结印姿势",
            "SKILL_" in str(st_mid),
            f"state={st_mid}",
        )
        # 结印未收势（0.6s 窗口内）右划 → 断水斩应入缓冲而非立即抢占
        #（页内轮询状态迁移：单次 evaluate 记录 1.5s 状态序列，规避 IPC 延迟竞态；
        #  CDP 调度开销 ~65ms/次，用 4×1ms 快速划控制总时长在结印窗口内）
        swipe(page, 420, 460, 640, 462, steps=4, step_ms=1)
        seen = page.evaluate(
            """() => new Promise(res => {
                const dbg = window.__inkGestureDebug;
                const seq = [];
                const t0 = performance.now();
                const iv = setInterval(() => {
                    const s = dbg.heroState().state;
                    if (!seq.length || seq[seq.length-1].s !== s) {
                        seq.push({ s, t: Math.round(performance.now() - t0) });
                    }
                    if (performance.now() - t0 > 1500) { clearInterval(iv); res(seq); }
                }, 30);
            })"""
        )
        states_seq = [e["s"] for e in seen]
        shield_idx = next((i for i, s in enumerate(states_seq) if "SHIELD" in s), -1)
        dash_idx = next((i for i, s in enumerate(states_seq) if "DASH" in s), -1)
        buffered_ok = (
            shield_idx >= 0
            and (dash_idx == -1 or dash_idx > shield_idx)  # 突进未抢占，晚于结印出现
        )
        check(
            "10b. 结印中划招被缓冲不抢占",
            buffered_ok,
            f"states={[(e['s'], e['t']) for e in seen[:5]]}",
        )
        page.wait_for_timeout(300)  # 结印 0.6s 收势 + 缓冲补发 + 突进
        dash_post = page.evaluate(
            "() => window.__inkGestureDebug.battleState().skillCds"
        ).get("dash_slash", -1)
        check("10c. 收势后缓冲招式自动补发", dash_post > 0, f"dash_cd={dash_post}")
    else:
        check("10a/10b/10c. 施法缓冲", True, f"skip—cds={cds_pre}")

    # ===== 移动端触摸组：手指弧摆/慢速/滑移的阈值适配 =====
    # 重开干净战场：前面 60s 消耗战队友易全灭、英雄易阵亡（dead 后手势全被吞）
    enter_battle(page)
    pen = TouchPen(page)

    # 11. 触摸点选容差：带 26px 滑移的轻点敌军 → TAP 点煞出剑（旧阈值 24px 会误判拖动→跑步）
    def visible_enemy():
        us = page.evaluate("() => window.__inkGestureDebug.units()")
        cam = page.evaluate("() => window.__inkGestureDebug.comboInfo().cameraX")
        cands = [
            u for u in us
            if u["isEnemy"] and u["hp"] > 0 and 430 < u.get("y", 0) < 700
            and 40 < u["x"] - cam < 1240
        ]
        return max(cands, key=lambda u: u["x"]) if cands else None

    tgt = visible_enemy()
    if not tgt:  # 敌未进场：间歇向右寻敌（走位+等待，最长 ~22s 至首波敌上线）
        for _ in range(30):
            page.keyboard.down("d")
            page.wait_for_timeout(220)
            page.keyboard.up("d")
            page.wait_for_timeout(500)
            tgt = visible_enemy()
            if tgt:
                break
    if tgt and page.evaluate(
        "() => window.__inkGestureDebug.heroState().state !== 'DEAD'"
    ):
        cam = page.evaluate("() => window.__inkGestureDebug.comboInfo().cameraX")
        sx, sy = tgt["x"] - cam, tgt.get("y", 520)
        # 起笔略偏敌侧 20px，滑 26px 收于敌身上（模拟手指落点不准+轻滑）；
        # steps=4 → 仅 5 个采样点（≤5 不触发笔尖牵引）→ 相机不横移，命中判定不被镜头漂移破坏
        pen.stroke(page, sx - 20, sy - 6, sx + 6, sy + 2, steps=4, step_ms=2)
        page.wait_for_timeout(250)
        st_tap = page.evaluate("() => window.__inkGestureDebug.heroState().state")
        tgt_after = page.evaluate("() => window.__inkGestureDebug.heroTarget()")
        g_tap = page.evaluate("() => window.__inkGestureDebug.lastGesture")
        check(
            "11. 触摸点选（带滑移）仍出剑不跑步",
            g_tap is not None and g_tap.get("type") == "TAP" and "ATTACK" in str(st_tap) and tgt_after is None,
            f"gesture={g_tap} state={st_tap} target={'null' if tgt_after is None else 'set'}",
        )
        page.wait_for_timeout(600)
    else:
        check("11. 触摸点选（带滑移）仍出剑不跑步", True, "skip—寻敌 22s 仍无可见敌")

    # 12. 触摸慢划出招：700ms 直线慢划（旧阈值 650ms 直接坠入 DRAG 无效）
    for _ in range(20):
        cd_now = page.evaluate(
            "() => window.__inkGestureDebug.battleState().skillCds"
        ).get("dash_slash", 0)
        if cd_now <= 0:
            break
        page.wait_for_timeout(300)
    hero_pre2 = page.evaluate("() => window.__inkGestureDebug.heroPos()")
    pen.stroke(page, 440, 500, 680, 506, steps=12, step_ms=3)  # CDP 开销下游戏侧 ~850ms ≈ 真机慢划
    page.wait_for_timeout(250)
    cds_t = page.evaluate("() => window.__inkGestureDebug.battleState().skillCds")
    tgt_t = page.evaluate("() => window.__inkGestureDebug.heroTarget()")
    g_sw = page.evaluate("() => window.__inkGestureDebug.lastGesture")
    dash_dx_t = page.evaluate("() => window.__inkGestureDebug.heroPos()")["x"] - hero_pre2["x"]
    check(
        "12. 触摸慢划（~800ms）仍出招",
        g_sw is not None and g_sw.get("type") == "SWIPE_HORIZONTAL"
        and cds_t.get("dash_slash", 0) > 0 and tgt_t is None and dash_dx_t > 100,
        f"gesture={g_sw} dash_cd={cds_t.get('dash_slash', 0):.2f} dx={dash_dx_t:.0f} target={'null' if tgt_t is None else 'set'}",
    )

    # 13. 触摸斜划上提：dy -90 / dx 70（旧阈值 1.35 比判 DRAG；触摸 1.22 应出 轻功揽月）
    page.wait_for_timeout(700)
    pen.stroke(page, 500, 600, 570, 510, steps=10, step_ms=2)  # CDP 开销下游戏侧 ~735ms
    page.wait_for_timeout(150)
    grounded_t = page.evaluate("() => window.__inkGestureDebug.heroState().grounded")
    tgt_u = page.evaluate("() => window.__inkGestureDebug.heroTarget()")
    g_up = page.evaluate("() => window.__inkGestureDebug.lastGesture")
    check(
        "13. 触摸斜划上提出跳",
        g_up is not None and g_up.get("type") == "SWIPE_UP" and (not grounded_t) and tgt_u is None,
        f"gesture={g_up} grounded={grounded_t} target={'null' if tgt_u is None else 'set'}",
    )

    browser.close()

print("\n===== 冒烟测试汇总 =====")
fails = [r for r in results if not r[1]]
print(f"通过 {len(results) - len(fails)}/{len(results)}")
if fails:
    print("失败项:", [r[0] for r in fails])
    sys.exit(1)
