// ============================================================
// 字诀 · 汉字手势识别器（$P Point-Cloud Recognizer 变体）
// ------------------------------------------------------------
// 玩家以指尖/鼠标逐笔书写汉字，多笔轨迹汇聚为点云后与字模板匹配。
// 采用 $P 贪心点云匹配：对笔画顺序天然不敏感（书写顺序自由），
// 归一化采用包围盒对角线缩放（尺寸无关）+ 小角度旋转桶（运笔歪斜容忍）。
//
// 朱印评级（识别质量 → 技能威力；阈值与实现严格同步，勿再漂移）：
//   神品（分 ≤ 0.048，GRADE_SHEN）→ 威力 ×1.35
//   妙品（分 ≤ 0.068，GRADE_MIAO）→ 威力 ×1.15
//   能品（分 > 0.068）→ 威力 ×1.00
//   超过 0.078（FAIL_SCORE）视为不成字（墨渍），予以驳回。
//
// 七字诀全集：之（断水斩）山（竹影墨盾）火（星河笔阵）水（墨荷灵阵）
//             川（三江引）心（墨心归元）王（临江仙）
// 连笔宽容：之/山附连笔变体模板（潦草快写同样可识）。
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
  | 'river_waves' // 川 → 三江引
  | 'heart_heal' // 心 → 墨心归元
  | 'ultimate_landscape'; // 王 → 临江仙

/** 字诀定义：char = 展示用汉字；strokes = 0..1 归一化空间的手工模板折线；
 *  alt = 连笔/简写变体（潦草快写宽容，共享同一字诀） */
interface CharTemplateDef {
  char: string;
  ability: CharAbilityId;
  name: string;
  poetic: string;
  strokes: number[][][];
  alt?: number[][][][];
}

// —— 七字模板（坐标 0..1，y 向下；形状彼此差异显著，避免误识） ——
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
    // 连笔变体：一笔快写（横折连捺一气呢成）
    alt: [
      [
        [[0.08, 0.2], [0.22, 0.3], [0.33, 0.4], [0.3, 0.52], [0.44, 0.52], [0.56, 0.5], [0.42, 0.64], [0.32, 0.78], [0.5, 0.6], [0.66, 0.7], [0.8, 0.8], [0.92, 0.9]],
      ],
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
    // 连笔变体：中竖 + 竖折提右竖（两笔快写）
    alt: [
      [
        [[0.5, 0.04], [0.5, 0.38], [0.5, 0.7]],
        [[0.14, 0.12], [0.14, 0.4], [0.14, 0.66], [0.2, 0.71], [0.45, 0.72], [0.72, 0.72], [0.84, 0.6], [0.86, 0.4], [0.86, 0.28]],
      ],
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
    char: '川',
    ability: 'river_waves',
    name: '三江引',
    poetic: '三江奔流，墨浪千叠',
    // 首笔为明显左掠的撇（与「山」的竖+底横结构拉开点云距离）
    strokes: [
      [[0.3, 0.08], [0.2, 0.34], [0.11, 0.6], [0.06, 0.86]],
      [[0.52, 0.08], [0.52, 0.4], [0.52, 0.72], [0.52, 0.94]],
      [[0.8, 0.06], [0.8, 0.38], [0.8, 0.7], [0.8, 0.94]],
    ],
  },
  {
    char: '心',
    ability: 'heart_heal',
    name: '墨心归元',
    poetic: '心如笔墨，万象归元',
    strokes: [
      [[0.22, 0.42], [0.27, 0.52], [0.3, 0.6]],
      [[0.78, 0.28], [0.84, 0.45], [0.82, 0.62], [0.72, 0.75], [0.56, 0.82], [0.4, 0.8], [0.3, 0.72]],
      [[0.52, 0.34], [0.56, 0.44], [0.58, 0.52]],
      [[0.68, 0.46], [0.73, 0.56], [0.76, 0.66]],
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

/** 不成字分数线（超过则驳回；实测潦草同字上限≈0.033，连笔变体入库后收紧至 0.078 保宁拒勿误） */
const FAIL_SCORE = 0.078;
/** 朱印评级分数线（基于 $P 贪心点云距离 + 笔画数惩罚的实测标定） */
const GRADE_SHEN = 0.048;
const GRADE_MIAO = 0.068;
/** 有效笔画最短轨迹（像素；心字短点也可成笔） */
const MIN_STROKE_PX = 6;
/** 自信早判分数线（无笔画惩罚原始距离；达到即无需停笔等待，立即施放）
 *  标定依据：规整书写实测 ≤0.033；缺整笔的残余点云实测 ≥0.05（如缺右竖的山 0.0517）——
 *  取 0.045 干净分离「笔正」与「缺笔」，防止标准笔顺被中途抢发 */
export const CHAR_EARLY_COMMIT_SCORE = 0.045;

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

// —— 预处理模板点云（多角度桶；主模板 + 连笔变体逐一体入） ——
const ORI_BUCKETS = [-0.3, -0.15, 0, 0.15, 0.3];
const TEMPLATE_CLOUDS = CHAR_TEMPLATES.flatMap((t) => {
  const variants: number[][][][] = [t.strokes, ...(t.alt ?? [])];
  return variants.map((strokes, vi) => {
    const raw: CharStrokePoint[] = [];
    strokes.forEach((stroke) => {
      const pts = stroke.map(([x, y]) => ({ x, y }));
      const dense = resample(pts, Math.max(6, Math.round(RESAMPLE_N / strokes.length)));
      dense.forEach((p) => raw.push(p));
    });
    const norm = normalize(resample(raw, RESAMPLE_N));
    return {
      def: t,
      strokeCount: strokes.length,
      isPrimary: vi === 0,
      clouds: ORI_BUCKETS.map((rad) => rotateCloud(norm, rad)),
    };
  });
});

export interface CharStrokeInput {
  /** 每一笔的轨迹点（屏幕坐标即可，内部统一归一化） */
  strokes: CharStrokePoint[][];
}

/**
 * 自信早判预览：免停笔即时施放的依据。
 * 与 recognizeChar 同管线，但返回「无笔画惩罚的原始距离」及模板元信息。
 * 判据：最佳字的「主模板笔数」== 有效笔数，且 rawScore 足够小 → 立即施放。
 * 注：$P 点云对同字连笔变体天然不敏感（同字形），标准笔顺的最佳匹配
 * 常落在自身 alt 变体上——因此只看「字的主模板笔数」而非命中变体是否主模板；
 * 变体快写（笔数少于主模板）则笔数不等 → 不早判，由 550ms 停笔判定兜底。
 */
export interface CharPeekResult {
  char: string;
  /** 最佳模板的无惩罚原始点云距离 */
  rawScore: number;
  /** 最佳字主模板的笔数（早判要求 validCount 与之一致） */
  primaryStrokes: number;
  /** 有效笔数（≥MIN_STROKE_PX 的轨迹） */
  validCount: number;
}

export function peekCharMatch(input: CharStrokeInput): CharPeekResult | null {
  const valid = input.strokes.filter(
    (s) => s.length >= 2 && pathLength(s) >= MIN_STROKE_PX
  );
  if (valid.length === 0) return null;

  const raw: CharStrokePoint[] = [];
  const per = Math.max(6, Math.round(RESAMPLE_N / valid.length));
  valid.forEach((s) => {
    resample(s, per).forEach((p) => raw.push(p));
  });
  const cloud = normalize(resample(raw, RESAMPLE_N));

  let bestScore = Infinity;
  let best: (typeof TEMPLATE_CLOUDS)[number] | null = null;
  for (const tpl of TEMPLATE_CLOUDS) {
    for (let bi = 0; bi < tpl.clouds.length; bi++) {
      const d1 = greedyCloudDist(cloud, tpl.clouds[bi]);
      const d2 = greedyCloudDist(rotateCloud(cloud, -ORI_BUCKETS[bi]), tpl.clouds[2]);
      const d = Math.min(d1, d2);
      if (d < bestScore) {
        bestScore = d;
        best = tpl;
      }
    }
  }
  if (!best) return null;
  return {
    char: best.def.char,
    rawScore: bestScore,
    primaryStrokes: best.def.strokes.length,
    validCount: valid.length,
  };
}

/**
 * 识别多笔汉字。返回最佳匹配；分数超过 FAIL_SCORE 视为不成字（返回 null）。
 */
export function recognizeChar(input: CharStrokeInput): CharMatchResult | null {
  const valid = input.strokes.filter(
    (s) => s.length >= 2 && pathLength(s) >= MIN_STROKE_PX
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
    // 笔画数失配惩罚（对应该变体的笔数）：单笔乱画想冒充三笔「山」会被重罚，
    // 偶少/偶多一笔（连笔、断笔）只轻罚，宽容真实书写习惯
    const dStrokes = Math.abs(valid.length - tpl.strokeCount);
    const strokePenalty = dStrokes >= 2 ? 1.6 : dStrokes === 1 ? 1.28 : 1;

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
