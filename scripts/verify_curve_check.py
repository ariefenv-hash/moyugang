#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Task 52 验证脚本：export_difficulty_curve.mjs 产物 diff 提示（池序⑦）
------------------------------------------------------------------------
A 段（静态锚）：--check 语义 / diffPaths 深比对 / 容错三态 exit 码 / package script 接线
B 段（实跑六态）：
  B1 自洽 check exit 0 · B2 零副作用（sha256 前后一致）
  B3 篡改单值 exit 1 + 精确路径 diff · B4 check 不写盘（篡改值持久）
  B5 产物缺失态 exit 1 · B6 产物损坏态 exit 1
  B7 生成模式恢复闭环 · B8 bun run check:curve 通路
沿 Task 49/50 方法学：静态锚 + 真实进程退出码语义（本项为纯工具脚本，无浏览器面）。
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / 'scripts' / 'export_difficulty_curve.mjs'
PKG = REPO / 'package.json'
JSON_OUT = REPO / 'docs' / 'difficulty-curve.json'
BASELINE = Path('/tmp/curve.baseline.json')

results = []

def check(name, ok, note=''):
    results.append((name, bool(ok), note))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f'  [{note}]' if note else ''))

def run_check():
    r = subprocess.run(
        ['bun', 'scripts/export_difficulty_curve.mjs', '--check'],
        cwd=REPO, capture_output=True, text=True, timeout=60,
    )
    return r

def run_generate():
    r = subprocess.run(
        ['bun', 'scripts/export_difficulty_curve.mjs'],
        cwd=REPO, capture_output=True, text=True, timeout=60,
    )
    return r

def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

# ---------------- A 段：静态锚 ----------------
src = SCRIPT.read_text(encoding='utf-8')
pkg = json.loads(PKG.read_text(encoding='utf-8'))

check('A1 --check 语义在册', "process.argv.includes('--check')" in src and 'CHECK_MODE' in src)
check('A2 diffPaths 深比对在册（含 200 上限）', 'function diffPaths' in src and 'report.length >= 200' in src)
check('A3 readFileSync 容错读入库产物', 'readFileSync' in src)
check('A4 退出码三态+一致态', src.count('process.exit(1)') >= 3 and 'process.exit(0)' in src)
check('A5 刷新提示语在册', '刷新 docs/difficulty-curve.json 后再提交' in src)
check('A6 package.json check:curve 接线',
      pkg.get('scripts', {}).get('check:curve') == 'bun scripts/export_difficulty_curve.mjs --check')
check('A7 头部 docstring 核对段', '核对：bun scripts/export_difficulty_curve.mjs --check' in src)
check('A8 生成模式原行为保留', 'mkdirSync(dirname(OUT), { recursive: true })' in src and
      "JSON.stringify(out, null, 2) + '\\n'" in src)

# ---------------- B 段：实跑 ----------------
if not BASELINE.exists():
    BASELINE.write_bytes(JSON_OUT.read_bytes())

# B1 自洽
r = run_check()
check('B1 自洽 check exit 0', r.returncode == 0 and '一致（10 章 50 折）' in r.stdout,
      f'rc={r.returncode}')

# B2 零副作用
h_before = sha(JSON_OUT)
r = run_check()
check('B2 --check 零副作用（sha256 不变）', sha(JSON_OUT) == h_before)

# B3 篡改单值 → exit 1 + 精确路径
d = json.loads(JSON_OUT.read_text(encoding='utf-8'))
d['difficultyCurve']['chapters'][0]['folds'][0]['enemyBaseHp'] = 1001
JSON_OUT.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')
tampered_sha = sha(JSON_OUT)
r = run_check()
ok3 = (r.returncode == 1
       and 'difficultyCurve.chapters[0].folds[0].enemyBaseHp' in r.stderr
       and '1000' in r.stderr and '1001' in r.stderr
       and '1 处不一致' in r.stderr)
check('B3 篡改态 exit 1 + 精确路径 diff', ok3, f'rc={r.returncode}')

# B4 check 不写盘
check('B4 --check 不写盘（篡改值持久）', sha(JSON_OUT) == tampered_sha)

# B5 产物缺失态
bak = JSON_OUT.with_suffix('.json.bak')
JSON_OUT.rename(bak)
r = run_check()
check('B5 产物缺失态 exit 1 + 提示', r.returncode == 1 and '未找到入库产物' in r.stderr, f'rc={r.returncode}')
bak.rename(JSON_OUT)

# B6 产物损坏态
orig_bytes = JSON_OUT.read_bytes()
JSON_OUT.write_bytes(b'{"difficultyCurve": broken!!!', )
r = run_check()
check('B6 产物损坏态 exit 1 + 解析失败提示', r.returncode == 1 and '解析失败' in r.stderr, f'rc={r.returncode}')
JSON_OUT.write_bytes(orig_bytes)

# B7 生成模式恢复闭环
r = run_generate()
r2 = run_check()
check('B7 生成恢复闭环（check 复归 exit 0）', r.returncode == 0 and r2.returncode == 0 and '一致' in r2.stdout)
check('B7b 恢复后与基线逐字节一致', sha(JSON_OUT) == sha(BASELINE))

# B8 bun run check:curve 通路
r = subprocess.run(['bun', 'run', 'check:curve'], cwd=REPO, capture_output=True, text=True, timeout=60)
check('B8 bun run check:curve 通路 exit 0', r.returncode == 0 and '一致' in r.stdout, f'rc={r.returncode}')

# ---------------- 汇总 ----------------
fails = [n for n, ok, _ in results if not ok]
print(f"\n{'='*46}\nTOTAL: {len(results)} · PASS: {len(results) - len(fails)} · FAIL: {len(fails)}")
if fails:
    print('FAILED:', *fails, sep='\n  - ')
    sys.exit(1)
print('ALL PASS ✓')
