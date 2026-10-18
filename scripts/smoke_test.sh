#!/bin/bash
# 冒烟测试 v3：snapshot refs 定位按钮
set -u
cd /home/z/my-project

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null; done
}
trap cleanup EXIT

echo "== 1. 启动 dev 服务器 =="
npx vite --port=3000 --host=127.0.0.1 > scripts/vite_dev.log 2>&1 &
PIDS+=($!)
code=000
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "server http_code=$code"
[ "$code" != "200" ] && { echo "SERVER FAILED"; exit 1; }

agent-browser set viewport 1280 800
agent-browser open http://127.0.0.1:3000
agent-browser wait 2200
agent-browser eval "localStorage.clear(); 'CLEARED'"
agent-browser reload
agent-browser wait 2400

echo "== 2. snapshot 定位「启卷入战」 =="
agent-browser snapshot -i -c | rg -i "启卷|试炼" | head -5
REF=$(agent-browser snapshot -i -c --json | python3 -c "
import json,sys
data = json.load(sys.stdin)
def walk(node):
    if isinstance(node, dict):
        if '启卷入战' in str(node.get('name','')) or '启卷入战' in str(node.get('text','')):
            return node.get('ref')
        for v in node.values():
            r = walk(v)
            if r: return r
    elif isinstance(node, list):
        for item in node:
            r = walk(item)
            if r: return r
    return None
print(walk(data) or '')
")
echo "REF_START=$REF"
if [ -n "$REF" ]; then agent-browser click "$REF"; else agent-browser eval "document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('启卷入战'))b.click()});'JSCLICK'"; fi
agent-browser wait 1500

echo "== 3. 点「启程试炼」开战 =="
agent-browser eval "document.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('启程试炼'))b.click()});'JSCLICK2'"
agent-browser wait 2800
agent-browser screenshot download/verify2_battle.png
agent-browser eval "!!document.querySelector('canvas') ? 'CANVAS_OK' : 'NO_CANVAS'"

echo "== 4. 切双区模式 =="
agent-browser eval "document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='双区'||b.textContent.includes('双区'))b.click()});'DUAL_SET'"
agent-browser wait 600
agent-browser screenshot download/verify2_dual.png

echo "== 5. 键盘施法 =="
agent-browser press j
agent-browser wait 250
agent-browser press q
agent-browser wait 600
agent-browser press e
agent-browser wait 500
agent-browser screenshot download/verify2_skills.png
agent-browser press Escape
agent-browser wait 700
agent-browser screenshot download/verify2_pause.png
agent-browser press Escape
agent-browser wait 400

echo "== 6. 窄屏 390x844 =="
agent-browser set viewport 390 844
agent-browser wait 1300
agent-browser screenshot download/verify2_narrow.png

echo "== 7. 超宽屏 1720x760 =="
agent-browser set viewport 1720 760
agent-browser wait 1300
agent-browser screenshot download/verify2_ultrawide.png

echo "== 8. 移动端双区触控：左半屏拖住生成摇杆 =="
agent-browser set viewport 780 800
agent-browser wait 900
agent-browser eval "
(() => {
  const c = document.querySelector('canvas');
  if (!c) return 'NO_CANVAS';
  const r = c.getBoundingClientRect();
  const opts = (x, y, id) => ({ bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true });
  c.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + r.width*0.2, r.top + r.height*0.62, 7)));
  for (let i = 1; i <= 6; i++) {
    c.dispatchEvent(new PointerEvent('pointermove', opts(r.left + r.width*0.2 + i*6, r.top + r.height*0.62 - i*7, 7)));
  }
  return 'JOY_ACTIVE';
})()
"
agent-browser wait 500
agent-browser screenshot download/verify2_joy.png
agent-browser eval "
(() => {
  const c = document.querySelector('canvas');
  if (!c) return 'NO_CANVAS';
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.left + r.width*0.2 + 36, clientY: r.top + r.height*0.62 - 42 }));
  return 'JOY_RELEASED';
})()
"

echo "== 9. 战斗 25s 后：验证祝福触发（普通关 45s 才触发，此处先验证无报错） =="
agent-browser wait 6000
agent-browser screenshot download/verify2_late_battle.png
agent-browser errors | head -8
echo "== SMOKE3 DONE =="
