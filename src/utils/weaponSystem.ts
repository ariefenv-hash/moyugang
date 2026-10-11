// ============================================================
// 矢量武器系统（SVG Path Data → Canvas Path2D）
// ------------------------------------------------------------
// 主角的武器以 SVG path 数据描述（贝塞尔矢量轮廓，任意分辨率无损），
// 经 Path2D 进入 Canvas 渲染管线：不改动画姿势库、不改命中判定，
// 仅替换武器视觉层；战斗中可实时切换（青霜剑 ⇄ 青罗伞），
// 招式差异由 BattleView 按 getActiveWeaponId() 分派。
// 武器注册表：
//   QINGSHUANG_JIAN 墨锋·青霜剑（墨钢渐变 + 青辉剑锋 + 朱红剑穗）
//   QINGLUO_SAN   青罗伞（黛青伞面 + 伞骨辐条 + 弯钩柄 + 朱红伞穗）
//   预留：惊鸿枪（长枪）/ 春秋笔（软剑）等，新增仅需追加定义。
// reachPx 供渲染器剑气轨迹采样对齐（手→尖端世界距离）。
// ============================================================

export type WeaponId = 'QINGSHUANG_JIAN' | 'QINGLUO_SAN';

interface WeaponLayerDef {
  d?: string;
  kind: 'fill' | 'stroke' | 'grad' | 'circles';
  gradStops?: [number, string][];
  fill?: string;
  stroke?: string;
  lw?: number;
  alpha?: number;
  /** 辉光驱动：glow 越高该层越亮（叠加青辉） */
  glowPass?: boolean;
  circles?: { x: number; y: number; r: number; fill: string; stroke?: string; lw?: number }[];
}

interface WeaponDef {
  id: WeaponId;
  name: string;
  /** HUD 短名（按钮用） */
  short: string;
  /** 握持锚点（局部坐标，渲染时平移到掌心） */
  handX: number;
  handY: number;
  /** 局部坐标 → 世界像素 缩放 */
  scale: number;
  layers: WeaponLayerDef[];
  /** 尖端局部坐标 */
  tipLocal: { x: number; y: number };
  /** 手→尖端 世界距离（剑气轨迹采样对齐） */
  reachPx: number;
  /** 辉光色（重斩蓄力/技能加持时的光晕色调） */
  glowColor?: string;
}

// —— 墨锋·青霜剑：局部空间 0..122 × 0..24，握点 (10,12)，剑尖 (118,12) ——
const QINGSHUANG_JIAN: WeaponDef = {
  id: 'QINGSHUANG_JIAN',
  name: '墨锋·青霜剑',
  short: '青霜',
  handX: 10,
  handY: 12,
  scale: 0.5,
  tipLocal: { x: 118, y: 12 },
  reachPx: (118 - 10) * 0.5, // = 54
  layers: [
    // 剑穗（朱红三缕，坠于剑首之后）
    {
      kind: 'stroke', d: 'M1.8 13.8 Q-1.5 19 -5.5 21.5',
      stroke: '#dc2626', lw: 1.6, alpha: 0.92,
    },
    {
      kind: 'stroke', d: 'M1.4 14.2 Q-0.5 20.5 -3.8 23',
      stroke: '#ef4444', lw: 1.3, alpha: 0.8,
    },
    {
      kind: 'stroke', d: 'M2.2 14 Q1 20 -0.6 22.8',
      stroke: '#991b1b', lw: 1.2, alpha: 0.85,
    },
    // 剑刃本体（墨钢 → 白锋 → 青辉渐变）
    {
      kind: 'grad',
      d: 'M18 10.6 L34 9.6 L92 8.2 L110 10.4 L118 12 L110 13.6 L92 15.8 L34 14.4 L18 13.4 Z',
      gradStops: [
        [0, '#1e293b'],
        [0.3, '#64748b'],
        [0.62, '#cbd5e1'],
        [0.85, '#f1f5f9'],
        [1, '#7dd3fc'],
      ],
      glowPass: true,
    },
    // 剑脊（中轴线，暗色压韵）
    {
      kind: 'stroke', d: 'M19 12 L112 12',
      stroke: 'rgba(15, 23, 42, 0.75)', lw: 0.9,
    },
    // 上刃高光（白热线，辉光驱动）
    {
      kind: 'stroke', d: 'M18 10.6 L34 9.6 L92 8.2 L110 10.4 L118 12',
      stroke: 'rgba(255, 255, 255, 0.8)', lw: 0.7, glowPass: true,
    },
    // 剑格（菱形玉格）
    {
      kind: 'fill', d: 'M12 4.6 L17 12 L12 19.4 L7 12 Z',
      fill: '#1f2937', stroke: '#0f172a', lw: 0.8,
    },
    {
      kind: 'circles',
      circles: [{ x: 12, y: 12, r: 1.3, fill: '#06b6d4' }],
    },
    // 剑茎（缠绳柄身）
    {
      kind: 'fill', d: 'M2.5 10.2 L11.5 10.2 L11.5 13.8 L2.5 13.8 Z',
      fill: '#0f172a',
    },
    {
      kind: 'stroke', d: 'M4.5 10.2 L4.5 13.8 M6.5 10.2 L6.5 13.8 M8.5 10.2 L8.5 13.8 M10.5 10.2 L10.5 13.8',
      stroke: '#334155', lw: 1,
    },
    // 剑首（配重球）
    {
      kind: 'circles',
      circles: [{ x: 1.6, y: 12, r: 2.4, fill: '#0f172a', stroke: '#475569', lw: 0.8 }],
    },
  ],
};

// —— 青罗伞：局部空间 -4..120 × -10..34，握点 (8,14)，尖端 (116,14) ——
const QINGLUO_SAN: WeaponDef = {
  id: 'QINGLUO_SAN',
  name: '青罗伞',
  short: '青罗',
  handX: 8,
  handY: 14,
  scale: 0.5,
  tipLocal: { x: 116, y: 14 },
  reachPx: (116 - 8) * 0.5, // = 54，与青霜剑同长，轨迹/残影采样无需另调
  glowColor: '#2dd4bf',
  layers: [
    // 伞穗（朱红三缕，坠于弯钩柄之后）
    {
      kind: 'stroke', d: 'M7 25 Q3.5 30 0.5 32.5',
      stroke: '#dc2626', lw: 1.6, alpha: 0.92,
    },
    {
      kind: 'stroke', d: 'M6.6 25.4 Q4.6 31 2.4 33.8',
      stroke: '#ef4444', lw: 1.3, alpha: 0.8,
    },
    {
      kind: 'stroke', d: 'M7.4 25.2 Q9 30.5 8.2 33.4',
      stroke: '#991b1b', lw: 1.2, alpha: 0.85,
    },
    // 伞杆（暗墨长杆）
    {
      kind: 'fill', d: 'M6 12.4 L114 12.4 L114 15.6 L6 15.6 Z',
      fill: '#0f172a',
    },
    // 杆身缠绳纹
    {
      kind: 'stroke', d: 'M9 12.4 L9 15.6 M11.5 12.4 L11.5 15.6 M14 12.4 L14 15.6',
      stroke: '#334155', lw: 1,
    },
    // 伞面（黛青→青瓷→水色渐变，裙边三重波浪）
    {
      kind: 'grad',
      d: 'M48 14 Q82 -10 116 14 Q107.5 20.5 100 14.5 Q91.5 21.5 82 14.5 Q72.5 21.5 64 14.5 Q56.5 20.5 48 14 Z',
      gradStops: [
        [0, '#0f3d3a'],
        [0.38, '#134e4a'],
        [0.68, '#0d9488'],
        [0.9, '#5eead4'],
        [1, '#ccfbf1'],
      ],
      glowPass: true,
    },
    // 伞骨辐条（自伞顶辐射七骨，暗色压韵）
    {
      kind: 'stroke',
      d: 'M82 14 L52 11.2 M82 14 L62 6.8 M82 14 L72 3.8 M82 14 L82 2.6 M82 14 L92 3.8 M82 14 L102 6.8 M82 14 L112 11.2',
      stroke: 'rgba(15, 23, 42, 0.55)', lw: 0.8,
    },
    // 伞面上缘高光（辉光驱动）
    {
      kind: 'stroke', d: 'M48 14 Q82 -10 116 14',
      stroke: 'rgba(255, 255, 255, 0.72)', lw: 0.8, glowPass: true,
    },
    // 弯钩伞柄（J 形，墨色厚描）
    {
      kind: 'stroke', d: 'M7 14 Q1.5 14 1.5 19.5 Q1.5 25 7.5 25',
      stroke: '#0f172a', lw: 2.6,
    },
    // 柄尾玉珠
    {
      kind: 'circles',
      circles: [{ x: 2.4, y: 21.5, r: 1.2, fill: '#0d9488' }],
    },
    // 伞顶宝珠（尖端）
    {
      kind: 'circles',
      circles: [
        { x: 116, y: 14, r: 2, fill: '#134e4a', stroke: '#5eead4', lw: 0.8 },
        { x: 118.6, y: 14, r: 0.9, fill: '#ccfbf1' },
      ],
    },
  ],
};

const WEAPONS: Record<WeaponId, WeaponDef> = {
  QINGSHUANG_JIAN: QINGSHUANG_JIAN,
  QINGLUO_SAN: QINGLUO_SAN,
};

// —— 活动武器（战斗中实时切换；渲染器读此状态，无需加渲染参数） ——
let activeWeapon: WeaponId = 'QINGSHUANG_JIAN';

export function setActiveWeapon(id: WeaponId) {
  if (WEAPONS[id]) activeWeapon = id;
}

export function getActiveWeaponId(): WeaponId {
  return activeWeapon;
}

/** 武器图鉴元数据（HUD / 指南用） */
export const WEAPON_LIST: {
  id: WeaponId;
  name: string;
  short: string;
  verse: string;
  desc: string;
}[] = [
  {
    id: 'QINGSHUANG_JIAN',
    name: '墨锋·青霜剑',
    short: '青霜',
    verse: '剑气纵横三万里',
    desc: '墨钢为骨，青霜为锋。三段连击第三式震退敌军，断水斩势大力沉。',
  },
  {
    id: 'QINGLUO_SAN',
    name: '青罗伞',
    short: '青罗',
    verse: '一伞烟雨任平生',
    desc: '黛青为面，朱穗为坠。第三式化作「旋伞回雪」周身击退，护盾加厚，身法轻捷。',
  },
];

// —— Path2D 缓存（同一武器只解析一次 SVG path 字符串） ——
const pathCache = new Map<WeaponId, (Path2D | null)[]>();

function ensurePaths(def: WeaponDef): (Path2D | null)[] {
  let cached = pathCache.get(def.id);
  if (!cached) {
    cached = def.layers.map((l) => (l.d ? new Path2D(l.d) : null));
    pathCache.set(def.id, cached);
  }
  return cached;
}

/** 武器手→尖端的世界距离（供剑气轨迹/残影采样对齐） */
export function getWeaponReach(id: WeaponId): number {
  return WEAPONS[id]?.reachPx ?? 46;
}

/**
 * 在已 translate/rotate 到掌心 + 剑身角度的画布上下文中绘制矢量武器。
 * glow: 0..1 剑锋辉光（重斩蓄力/技能加持时升高）。
 */
export function drawVectorWeapon(
  ctx: CanvasRenderingContext2D,
  id: WeaponId,
  glow: number
) {
  const def = WEAPONS[id];
  if (!def) return;
  const paths = ensurePaths(def);
  const g = Math.max(0, Math.min(1, glow));

  ctx.save();
  ctx.scale(def.scale, def.scale);
  ctx.translate(-def.handX, -def.handY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  def.layers.forEach((layer, i) => {
    ctx.save();
    if (layer.alpha !== undefined) ctx.globalAlpha *= layer.alpha;

    // 辉光层：glow 升高时叠加武器色投影与提亮
    if (layer.glowPass && g > 0.15) {
      ctx.shadowColor = def.glowColor ?? '#38bdf8';
      ctx.shadowBlur = 3 + g * 13;
    }

    if (layer.kind === 'grad' && paths[i]) {
      const grad = ctx.createLinearGradient(10, 0, def.tipLocal.x, 0);
      layer.gradStops?.forEach(([stop, color]) => grad.addColorStop(stop, color));
      ctx.fillStyle = grad;
      ctx.fill(paths[i]!);
    } else if (layer.kind === 'fill') {
      if (layer.circles) {
        layer.circles.forEach((c) => {
          ctx.fillStyle = c.fill;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          ctx.fill();
          if (c.stroke) {
            ctx.strokeStyle = c.stroke;
            ctx.lineWidth = c.lw ?? 1;
            ctx.stroke();
          }
        });
      } else if (paths[i]) {
        ctx.fillStyle = layer.fill ?? '#000';
        ctx.fill(paths[i]!);
        if (layer.stroke) {
          ctx.strokeStyle = layer.stroke;
          ctx.lineWidth = layer.lw ?? 1;
          ctx.stroke(paths[i]!);
        }
      }
    } else if (layer.kind === 'stroke' && paths[i]) {
      ctx.strokeStyle = layer.stroke ?? '#000';
      ctx.lineWidth = layer.lw ?? 1;
      ctx.stroke(paths[i]!);
    }

    ctx.restore();
  });

  // 剑锋/伞尖端火（glow 驱动，重斩/技能时炽亮；色调随武器）
  if (g > 0.18) {
    const tipX = def.tipLocal.x;
    const tipY = def.tipLocal.y;
    const sparkR = 2.2 + g * 3.4;
    const sparkGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, sparkR * 2.2);
    sparkGrad.addColorStop(0, `rgba(224, 247, 255, ${0.55 + g * 0.4})`);
    sparkGrad.addColorStop(0.45, `rgba(125, 211, 252, ${0.3 + g * 0.35})`);
    sparkGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = sparkGrad;
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    // 武器专属辉光晕（青罗伞为青碧色）
    const glowC = def.glowColor ?? '#38bdf8';
    ctx.globalAlpha = 0.35 + g * 0.3;
    ctx.fillStyle = glowC;
    ctx.beginPath();
    ctx.arc(tipX, tipY, sparkR * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
