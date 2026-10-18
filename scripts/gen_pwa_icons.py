# -*- coding: utf-8 -*-
"""
PWA 图标生成器「墨韵朱印」：
- 朱砂白文印 + 霞鹜文楷「墨」字（fontTools 转 SVG path，零字体运行时依赖）
- 暗墨底（与 theme-color #1F2629 同族）+ 淡纸色圆相（enso）+ 墨点飞溅
- 产物：public/favicon.svg / public/icons/icon-{192,512}.png /
        public/icons/maskable-512.png / public/apple-touch-icon.png
"""
import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
import cairosvg

ROOT = '/home/z/my-project'
PUBLIC = os.path.join(ROOT, 'public')
ICONS = os.path.join(PUBLIC, 'icons')
os.makedirs(ICONS, exist_ok=True)

FONT = '/usr/share/fonts/truetype/lxgw-wenkai/LXGWWenKai-Medium.ttf'
CHAR = '墨'

# ── 设计令牌（与 index.css @theme 对齐）───────────────────────────
INK_BG_IN = '#263034'   # 暗墨中心
INK_BG_OUT = '#161C1E'  # 暗墨边缘
PAPER = '#F2EDE4'       # 宣纸
CINNABAR = '#B3382C'    # 朱砂
CINNABAR_EDGE = '#83261C'  # 朱砂暗棱

# ── 「墨」字 → 纯路径 ─────────────────────────────────────────────
font = TTFont(FONT)
upem = font['head'].unitsPerEm
cmap = font.getBestCmap()
gname = cmap[ord(CHAR)]
glyph_set = font.getGlyphSet()

spen = SVGPathPen(glyph_set)
glyph_set[gname].draw(spen)
glyph_path = spen.getCommands()

bpen = BoundsPen(glyph_set)
glyph_set[gname].draw(bpen)
(x_min, y_min, x_max, y_max) = bpen.bounds
g_w, g_h = (x_max - x_min), (y_max - y_min)

def glyph_group(cx, cy, target_h, color, fatten_px):
    """把字放在以 (cx,cy) 为中心、字高 target_h 的位置；fatten_px 为加粗像素宽"""
    s = target_h / g_h
    tx = cx - (g_w * s) / 2 - s * x_min
    ty = cy - (g_h * s) / 2 + s * y_max   # 字体 Y 轴向上 → SVG Y 轴向下
    sw = fatten_px / s                    # 加粗宽度换算回字体单位
    return (f'<g transform="translate({tx:.2f},{ty:.2f}) scale({s:.6f},{-s:.6f})">'
            f'<path d="{glyph_path}" fill="{color}" stroke="{color}" '
            f'stroke-width="{sw:.1f}" stroke-linejoin="round"/></g>')

def svg_doc(seal, glyph_h, enso_r, enso_w, enso_dash, enso_rot,
            splats, inner_frame=True):
    """组装一枚图标 SVG（512 视窗）
    seal: 印面边长; glyph_h: 字高; enso_*: 圆相参数; splats: [(x,y,r,alpha),...]"""
    cx = cy = 256
    half = seal / 2
    frame_inset = seal * 0.055
    parts = []
    # 背景：径向渐变暗墨
    parts.append(f'''<defs><radialGradient id="bg" cx="50%" cy="42%" r="75%">
<stop offset="0%" stop-color="{INK_BG_IN}"/><stop offset="100%" stop-color="{INK_BG_OUT}"/>
</radialGradient></defs>
<rect width="512" height="512" fill="url(#bg)"/>''')
    # 圆相（enso）：留缺口、圆头笔触
    circ = 2 * math.pi * enso_r
    parts.append(
        f'<circle cx="{cx}" cy="{cy - 6}" r="{enso_r}" fill="none" stroke="{PAPER}" '
        f'stroke-opacity="0.09" stroke-width="{enso_w}" stroke-linecap="round" '
        f'stroke-dasharray="{enso_dash} {circ:.0f}" transform="rotate({enso_rot} {cx} {cy - 6})"/>')
    # 墨点飞溅
    for (sx, sy, sr, sa) in splats:
        parts.append(f'<circle cx="{sx}" cy="{sy}" r="{sr}" fill="{PAPER}" fill-opacity="{sa}"/>')
    # 印章：暗棱垫底 → 朱砂印面 → 内框细线 → 白文墨字（整体微旋 -3°）
    edge_drop = 7
    seal_shapes = (
        f'<rect x="{cx - half}" y="{cy - half + edge_drop}" width="{seal}" height="{seal}" '
        f'rx="{seal * 0.085}" fill="{CINNABAR_EDGE}"/>'
        f'<rect x="{cx - half}" y="{cy - half}" width="{seal}" height="{seal}" '
        f'rx="{seal * 0.085}" fill="{CINNABAR}"/>'
    )
    if inner_frame:
        fi = frame_inset
        seal_shapes += (
            f'<rect x="{cx - half + fi}" y="{cy - half + fi}" width="{seal - 2 * fi}" '
            f'height="{seal - 2 * fi}" rx="{seal * 0.055}" fill="none" '
            f'stroke="{PAPER}" stroke-opacity="0.30" stroke-width="{max(2.0, seal * 0.012)}"/>'
        )
    glyph = glyph_group(cx, cy + 2, glyph_h, PAPER, 3.2)
    parts.append(f'<g transform="rotate(-3 {cx} {cy})">{seal_shapes}{glyph}</g>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
            'viewBox="0 0 512 512">' + ''.join(parts) + '</svg>')

# ── 标准图标（视觉满幅，印面 340）────────────────────────────────
icon_svg = svg_doc(
    seal=340, glyph_h=224, enso_r=212, enso_w=26, enso_dash=1050, enso_rot=-64,
    splats=[(96, 88, 7, 0.20), (430, 118, 5, 0.16), (118, 428, 5, 0.15),
            (408, 408, 9, 0.18), (74, 268, 4, 0.13)],
)
# ── maskable（内容缩进安全区：印面 272，全出血背景）────────────────
mask_svg = svg_doc(
    seal=272, glyph_h=180, enso_r=170, enso_w=22, enso_dash=840, enso_rot=-64,
    splats=[(140, 122, 6, 0.16), (378, 146, 4, 0.14), (150, 392, 4, 0.13),
            (368, 372, 7, 0.15)],
)

with open(os.path.join(PUBLIC, 'favicon.svg'), 'w') as f:
    f.write(icon_svg)

for name, svg, size in [
    ('icons/icon-512.png', icon_svg, 512),
    ('icons/icon-192.png', icon_svg, 192),
    ('icons/maskable-512.png', mask_svg, 512),
    ('apple-touch-icon.png', icon_svg, 180),
]:
    cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(PUBLIC, name),
                     output_width=size, output_height=size)
    print('OK', name, size)
print('DONE — 墨韵朱印 PWA 图标套件生成完毕')
