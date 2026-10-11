// ============================================================
// 字诀 · 汉字手势识别器（$P Point-Cloud Recognizer 变体）
// ------------------------------------------------------------
// 玩家以指尖/鼠标逐笔书写汉字，多笔轨迹汇聚为点云后与字模板匹配。
// 采用 $P 贪心点云匹配：对笔画顺序天然不敏感（书写顺序自由），
// 归一化采用包围盒对角线缩放（尺寸无关）+ 小角度旋转桶（运笔歪斜容忍）。
//
// 朱印评级（识别质量 → 技能威力）：
//   神品（分 ≤ 0.14）→ 威力 ×1.35
//   妙品（分 ≤ 0.20）→ 威力 ×1.15
//   能品（分 ≤ 0.28）→ 威力 ×1.00
//   超过 0.34 视为不成字（墨渍），予以驳回。
// ============================================================

export interface CharStrokePoint {
  x: number;
  y: number;
}

export type CharGrade = 'SHEN' | 'MIAO' | 'NENG';

export interface CharMatchResult {
  char: string;
  ability: CharAbilityId;
  name: string;
  poetic: string;
  score: number;
  grade: CharGrade;
  gradeText: string;
  powerMult: number;
}

export type CharAbilityId =
  | 'dash_slash' // 之 → 断水斩
  | 'bamboo_shield' // 山 → 竹影墨盾
  | 'starlight_barrage' // 火 → 星河笔阵
  | 'lotus_trap' // 水 → 墨荷灵阵
  | 'ultimate_landscape'; // 王 → 临江仙

/** 字诀定义：char = 展示用汉字；strokes = 0..1 归一化空间的手工模板折线 */
interface CharTemplateDef {
  char: string;
  ability: CharAbilityId;
  name: string;
  poetic: string;
  strokes: number[][][];
}

// —— 五字模板（坐标 0..1，y 向下；形状彼此差异显著，避免误识） ——
const CHAR_TEMPLATES: CharTemplateDef[] = [
  {
    char: '之',
    ability: 'dash_slash',
    name: '断水斩',
    poetic: '之字如流，断水一闪',
    strokes: [
      [[0.08, 0.24], [0.2, 0.34], [0.32, 0.43]],
      [[0.3, 0.56], [0.45, 0.53], [0.58, 0.5], [0.42, 0.65], [0.32, 0.79]],
      [[0.46, 0.58], [0.62, 0.68], [0.78, 0.78], [0.92, 0.9]],
    ],
  },
  {
    char: '山',
    ability: 'bamboo_shield',
    name: '竹影墨盾',
    poetic: '山岳镇守，稳如磐石',
    strokes: [
      [[0.5, 0.04], [0.5, 0.4], [0.5, 0.74]],
      [[0.14, 0.1], [0.14, 0.42], [0.14, 0.72], [0.45, 0.72], [0.78, 0.72]],
      [[0.86, 0.26], [0.86, 0.5], [0.86, 0.74]],
    ],
  },
  {
    char: '火',
    ability: 'starlight_barrage',
    name: '星河笔阵',
    poetic: '星火燎原，万毫齐发',
    strokes: [
      [[0.3, 0.14], [0.25, 0.28], [0.2, 0.4]],
      [[0.55, 0.06], [0.46, 0.34], [0.38, 0.62], [0.32, 0.88]],
      [[0.62, 0.36], [0.59, 0.47], [0.56, 0.58]],
      [[0.68, 0.42], [0.76, 0.55], [0.84, 0.66], [0.92, 0.78]],
    ],
  },
  {
    char: '水',
    ability: 'lotus_trap',
    name: '墨荷灵阵',
    poetic: '上善若水，墨荷自生',
    strokes: [
      [[0.5, 0.02], [0.5, 0.36], [0.5, 0.7], [0.44, 0.82], [0.38, 0.94]],
      [[0.12, 0.26], [0.26, 0.25], [0.38, 0.25], [0.24, 0.42], [0.08, 0.6]],
      [[0.6, 0.28], [0.55, 0.4], [0.5, 0.52]],
      [[0.62, 0.34], [0.72, 0.48], [0.82, 0.62], [0.9, 0.76]],
    ],
  },
  {
    char: '王',
    ability: 'ultimate_landscape',
    name: '临江仙',
    poetic: '王者临世，水墨山河',
    strokes: [
      [[0.16, 0.1], [0.5, 0.09], [0.84, 0.1]],
      [[0.2, 0.46], [0.5, 0.45], [0.8, 0.46]],
      [[0.12, 0.85], [0.5, 0.86], [0.88, 0.85]],
      [[0.5, 0.04], [0.5, 0.34], [0.5, 0.64], [0.5, 0.94]],
    ],
  },
];

const GRADE_META: Record<CharGrade, { text: string; powerMult: number }> = {
  SHEN: { text: '神品', powerMult: 1.35 },
  MIAO: { text: '妙品', powerMult: 1.15 },
  NENG: { text: '能品', powerMult: 1.0 },
};

/** 不成字分数线（超过则驳回；实测潦草同字上限≈0.033，乱画下限≈0.087，取中间） */
const FAIL_SCORE = 0.085;
/** 朱印评级分数线（基于 $P 贪心点云距离 + 笔画数惩罚的实测标定） */
const GRADE_SHEN = 0.048;
const GRADE_MIAO = 0.068;

/** 字诀共几笔（取模板最大笔画数，UI 提示用） */
export const CHAR_MAX_STROKES = CHAR_TEMPLATES.reduce(
  (m, t) => Math.max(m, t.strokes.length),
  0
);

export function listCharGuides() {
  return CHAR_TEMPLATES.map((t) => ({
    char: t.char,
    ability: t.ability,
    name: t.name,
    poetic: t.poetic,
    strokes: t.strokes,
  }));
}

// ------------------------------------------------------------
// $P 核心实现
// ------------------------------------------------------------

const RESAMPLE_N = 48;

function pathLength(pts: CharStrokePoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

/** 按弧长重采样为 n 点 */
function resample(raw: CharStrokePoint[], n: number): CharStrokePoint[] {
  const total = pathLength(raw);
  if (raw.length < 2 || total === 0) {
    const p = raw[0] || { x: 0, y: 0 };
    return Array.from({ length: n }, () => ({ ...p }));
  }
  const interval = total / (n - 1);
  const out: CharStrokePoint[] = [{ ...raw[0] }];
  let acc = 0;
  let prev = raw[0];
  for (let i = 1; i < raw.length; i++) {
    const cur = raw[i];
    let seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    while (acc + seg >= interval && seg > 0) {
      const t = (interval - acc) / seg;
      const nx = prev.x + t * (cur.x - prev.x);
      const ny = prev.y + t * (cur.y - prev.y);
      out.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      acc = 0;
    }
    acc += seg;
    prev = cur;
  }
  while (out.length < n) out.push({ ...out[out.length - 1] });
  return out.slice(0, n);
}

/** 包围盒对角线归一化：平移到质心、缩放至单位尺寸 */
function normalize(cloud: CharStrokePoint[]): CharStrokePoint[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of cloud) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const diag = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY));
  let cx = 0, cy = 0;
  for (const p of cloud) { cx += p.x; cy += p.y; }
  cx /= cloud.length; cy /= cloud.length;
  return cloud.map((p) => ({ x: (p.x - cx) / diag, y: (p.y - cy) / diag }));
}

function rotateCloud(cloud: CharStrokePoint[], rad: number): CharStrokePoint[] {
  const c = Math.cos(rad), s = Math.sin(rad);
  return cloud.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/** $P 贪心点云距离（双向最近邻均值，顺序无关） */
function greedyCloudDist(a: CharStrokePoint[], b: CharStrokePoint[]): number {
  let sum = 0;
  for (const p of a) {
    let best = Infinity;
    for (const q of b) {
      const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  sum /= a.length;

  let sum2 = 0;
  for (const q of b) {
    let best = Infinity;
    for (const p of a) {
      const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
      if (d < best) best = d;
    }
    sum2 += Math.sqrt(best);
  }
  sum2 /= b.length;

  return (sum + sum2) / 2;
}

// —— 预处理模板点云（多角度桶） ——
const ORI_BUCKETS = [-0.3, -0.15, 0, 0.15, 0.3];
const TEMPLATE_CLOUDS = CHAR_TEMPLATES.map((t) => {
  const raw: CharStrokePoint[] = [];
  t.strokes.forEach((stroke) => {
    const pts = stroke.map(([x, y]) => ({ x, y }));
    const dense = resample(pts, Math.max(6, Math.round(RESAMPLE_N / t.strokes.length)));
    dense.forEach((p) => raw.push(p));
  });
  const norm = normalize(resample(raw, RESAMPLE_N));
  return {
    def: t,
    clouds: ORI_BUCKETS.map((rad) => rotateCloud(norm, rad)),
  };
});

export interface CharStrokeInput {
  /** 每一笔的轨迹点（屏幕坐标即可，内部统一归一化） */
  strokes: CharStrokePoint[][];
}

/**
 * 识别多笔汉字。返回最佳匹配；分数超过 FAIL_SCORE 视为不成字（返回 null）。
 */
export function recognizeChar(input: CharStrokeInput): CharMatchResult | null {
  const valid = input.strokes.filter(
    (s) => s.length >= 2 && pathLength(s) >= 8
  );
  if (valid.length === 0) return null;

  // 合并为点云（笔画衔接处断开不影响 $P 最近邻匹配）
  const raw: CharStrokePoint[] = [];
  const per = Math.max(6, Math.round(RESAMPLE_N / valid.length));
  valid.forEach((s) => {
    resample(s, per).forEach((p) => raw.push(p));
  });
  const cloud = normalize(resample(raw, RESAMPLE_N));

  let bestScore = Infinity;
  let bestDef: CharTemplateDef | null = null;

  for (const tpl of TEMPLATE_CLOUDS) {
    // 笔画数失配惩罚：单笔乱画想冒充三笔「山」会被重罚，
    // 偶少/偶多一笔（连笔、断笔）只轻罚，宽容真实书写习惯
    const dStrokes = Math.abs(valid.length - tpl.def.strokes.length);
    const strokePenalty = dStrokes >= 2 ? 1.6 : dStrokes === 1 ? 1.18 : 1;

    for (let bi = 0; bi < tpl.clouds.length; bi++) {
      // 模板旋转桶 + 输入反向旋转，取最小（容忍运笔歪斜）
      const d1 = greedyCloudDist(cloud, tpl.clouds[bi]);
      const d2 = greedyCloudDist(rotateCloud(cloud, -ORI_BUCKETS[bi]), tpl.clouds[2]);
      const d = Math.min(d1, d2) * strokePenalty;
      if (d < bestScore) {
        bestScore = d;
        bestDef = tpl.def;
      }
    }
  }

  if (!bestDef || bestScore > FAIL_SCORE) return null;

  let grade: CharGrade;
  if (bestScore <= GRADE_SHEN) grade = 'SHEN';
  else if (bestScore <= GRADE_MIAO) grade = 'MIAO';
  else grade = 'NENG';

  const meta = GRADE_META[grade];
  return {
    char: bestDef.char,
    ability: bestDef.ability,
    name: bestDef.name,
    poetic: bestDef.poetic,
    score: bestScore,
    grade,
    gradeText: meta.text,
    powerMult: meta.powerMult,
  };
}
