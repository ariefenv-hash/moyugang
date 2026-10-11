// ============================================================
// 矢量武器系统（SVG Path Data → Canvas Path2D）
// ------------------------------------------------------------
// 主角的剑以 SVG path 数据描述（贝塞尔矢量轮廓，任意分辨率无损），
// 经 Path2D 进入 Canvas 渲染管线：不改动画姿势库、不改命中判定，
// 仅替换武器视觉层。武器注册表按 WeaponId 扩充：
//   当前：QINGSHUANG_JIAN 墨锋·青霜剑（主角佩剑，墨钢渐变 + 青辉剑锋 + 朱红剑穗）
//   预留：青罗伞（伞）/ 惊鸿枪（长枪）/ 春秋笔（软剑）等，新增仅需追加定义。
// reachPx 供渲染器剑气轨迹采样对齐（手→剑尖世界距离）。
// ============================================================

export type WeaponId = 'QINGSHUANG_JIAN';

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
  /** 握持锚点（局部坐标，渲染时平移到掌心） */
  handX: number;
  handY: number;
  /** 局部坐标 → 世界像素 缩放 */
  scale: number;
  layers: WeaponLayerDef[];
  /** 剑尖局部坐标 */
  tipLocal: { x: number; y: number };
  /** 手→剑尖 世界距离（剑气轨迹采样对齐） */
  reachPx: number;
}

// —— 墨锋·青霜剑：局部空间 0..122 × 0..24，握点 (10,12)，剑尖 (118,12) ——
const QINGSHUANG_JIAN: WeaponDef = {
  id: 'QINGSHUANG_JIAN',
  name: '墨锋·青霜剑',
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

const WEAPONS: Record<WeaponId, WeaponDef> = {
  QINGSHUANG_JIAN: QINGSHUANG_JIAN,
};

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

    // 辉光层：glow 升高时叠加青色投影与提亮
    if (layer.glowPass && g > 0.15) {
      ctx.shadowColor = '#38bdf8';
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

  // 剑锋青辉端火（glow 驱动，重斩/技能时炽亮）
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
  }

  ctx.restore();
}
