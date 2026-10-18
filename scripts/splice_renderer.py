#!/usr/bin/env python3
"""拼接 canvasRenderer.ts：替换英雄渲染段(709-979)与兵种渲染段(981-1166)"""
import sys

SRC = '/home/z/my-project/src/utils/canvasRenderer.ts'
HERO = '/home/z/my-project/scripts/hero_section.txt'
UNIT = '/home/z/my-project/scripts/unit_section.txt'

with open(SRC, encoding='utf-8') as f:
    lines = f.readlines()

# 边界锚点校验（1-based: 709 / 979 / 981 / 1166）
assert lines[708].strip().startswith('// Enhanced Multi-Joint Skeletal Hero Animation'), f'L709 锚点不符: {lines[708]!r}'
assert lines[978].rstrip() == '  }', f'L979 锚点不符: {lines[978]!r}'
assert lines[980].strip().startswith('// Draw Skeletal Soldiers'), f'L981 锚点不符: {lines[980]!r}'
assert lines[1165].rstrip() == '  }', f'L1166 锚点不符: {lines[1165]!r}'
assert lines[979].strip() == '', f'L980 应为空行: {lines[979]!r}'

with open(HERO, encoding='utf-8') as f:
    hero_lines = f.readlines()
with open(UNIT, encoding='utf-8') as f:
    unit_lines = f.readlines()

if hero_lines and hero_lines[-1] != '\n':
    hero_lines[-1] += '\n'
if unit_lines and unit_lines[-1] != '\n':
    unit_lines[-1] += '\n'

new_lines = lines[:708] + hero_lines + ['\n'] + unit_lines + lines[1166:]

with open(SRC, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'拼接完成: 总行数 {len(lines)} -> {len(new_lines)}')
