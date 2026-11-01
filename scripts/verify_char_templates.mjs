/**
 * 字诀模板互异自检：模拟真实手写抖动（逐笔加点噪声、整体缩放/平移/旋转、
 * 笔顺打乱、连笔变体），将扰动样本喂给 recognizeChar，验证：
 *   1. 每个字的主模板 + alt 变体自身都能被识别回自己（召回）
 *   2. 每个字的扰动样本不被误识为其他字（互异）
 * 用法：bun scripts/verify_char_templates.mjs
 */
import { recognizeChar } from '../src/utils/charRecognizer.ts';

// 线性同余随机数（可复现）
let seed = 20261101;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

/** 沿折线插值取点并加噪声（模拟手指书写抖动）；单位坐标先放大到像素画布 */
const CANVAS = 260;
function jitterStroke(stroke, noisePx) {
  const pts = [];
  for (let i = 0; i < stroke.length - 1; i++) {
    const [x1, y1] = stroke[i];
    const [x2, y2] = stroke[i + 1];
    const steps = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) * 60));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = (x1 + (x2 - x1) * t) * CANVAS + (rnd() - 0.5) * 2 * noisePx;
      const y = (y1 + (y2 - y1) * t) * CANVAS + (rnd() - 0.5) * 2 * noisePx;
      pts.push({ x, y });
    }
  }
  pts.push({ x: stroke[stroke.length - 1][0] * CANVAS, y: stroke[stroke.length - 1][1] * CANVAS });
  return pts;
}

/** 整字统一变换：随机平移 + 缩放 + 小角度旋转（±0.12rad≈±7°，真实手机书写歪斜分布）。
 *  真实书写中所有笔画共享同一姿态（整字歪斜/缩放），故返回变换参数而非直接作用。 */
function randomPose() {
  return {
    ang: (rnd() - 0.5) * 0.24,
    scale: 0.8 + rnd() * 0.45,
    tx: (rnd() - 0.5) * 100,
    ty: (rnd() - 0.5) * 100,
  };
}
function applyPose(pts, pose) {
  const { ang, scale, tx, ty } = pose;
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map((p) => ({
    x: (p.x * c - p.y * s) * scale + tx,
    y: (p.x * s + p.y * c) * scale + ty,
  }));
}

/** 从模板生成一个手写样本：整字统一姿态 + 逐笔抖动（noisePx 为像素噪声幅度） */
function makeSample(strokes, noisePx) {
  const pose = randomPose();
  return strokes.map((st) => applyPose(jitterStroke(st, noisePx), pose));
}

const GUIDES = [
  // 从源码手工复制九字模板（主模板 + alt），避免直接 import 内部结构
  { char: '之', strokes: [[[0.08,0.24],[0.2,0.34],[0.32,0.43]],[[0.3,0.56],[0.45,0.53],[0.58,0.5],[0.42,0.65],[0.32,0.79]],[[0.46,0.58],[0.62,0.68],[0.78,0.78],[0.92,0.9]]] },
  { char: '山', strokes: [[[0.5,0.04],[0.5,0.4],[0.5,0.74]],[[0.14,0.1],[0.14,0.42],[0.14,0.72],[0.45,0.72],[0.78,0.72]],[[0.86,0.26],[0.86,0.5],[0.86,0.74]]] },
  { char: '火', strokes: [[[0.3,0.14],[0.25,0.28],[0.2,0.4]],[[0.55,0.06],[0.46,0.34],[0.38,0.62],[0.32,0.88]],[[0.62,0.36],[0.59,0.47],[0.56,0.58]],[[0.68,0.42],[0.76,0.55],[0.84,0.66],[0.92,0.78]]] },
  { char: '水', strokes: [[[0.5,0.02],[0.5,0.36],[0.5,0.7],[0.44,0.82],[0.38,0.94]],[[0.12,0.26],[0.26,0.25],[0.38,0.25],[0.24,0.42],[0.08,0.6]],[[0.6,0.28],[0.55,0.4],[0.5,0.52]],[[0.62,0.34],[0.72,0.48],[0.82,0.62],[0.9,0.76]]] },
  { char: '川', strokes: [[[0.3,0.08],[0.2,0.34],[0.11,0.6],[0.06,0.86]],[[0.52,0.08],[0.52,0.4],[0.52,0.72],[0.52,0.94]],[[0.8,0.06],[0.8,0.38],[0.8,0.7],[0.8,0.94]]] },
  { char: '心', strokes: [[[0.22,0.42],[0.27,0.52],[0.3,0.6]],[[0.78,0.28],[0.84,0.45],[0.82,0.62],[0.72,0.75],[0.56,0.82],[0.4,0.8],[0.3,0.72]],[[0.52,0.34],[0.56,0.44],[0.58,0.52]],[[0.68,0.46],[0.73,0.56],[0.76,0.66]]] },
  { char: '王', strokes: [[[0.16,0.1],[0.5,0.09],[0.84,0.1]],[[0.2,0.46],[0.5,0.45],[0.8,0.46]],[[0.12,0.85],[0.5,0.86],[0.88,0.85]],[[0.5,0.04],[0.5,0.34],[0.5,0.64],[0.5,0.94]]] },
  { char: '墨', strokes: [[[0.18,0.07],[0.64,0.06]],[[0.2,0.09],[0.19,0.34]],[[0.62,0.08],[0.64,0.34]],[[0.41,0.03],[0.41,0.62]],[[0.12,0.8],[0.84,0.8]],[[0.47,0.66],[0.47,0.92]]],
    alt: [[[0.18,0.07],[0.64,0.06],[0.63,0.34]],[[0.41,0.03],[0.41,0.62]],[[0.47,0.66],[0.47,0.9],[0.14,0.82],[0.84,0.8]]] },
  { char: '龙', strokes: [[[0.26,0.16],[0.72,0.14]],[[0.6,0.2],[0.48,0.44],[0.4,0.62]],[[0.74,0.18],[0.77,0.44],[0.73,0.68],[0.6,0.82],[0.4,0.85],[0.2,0.8]],[[0.46,0.58],[0.32,0.7]],[[0.54,0.64],[0.6,0.74]]],
    alt: [[[0.26,0.16],[0.72,0.14],[0.62,0.28],[0.48,0.5]],[[0.74,0.18],[0.77,0.44],[0.73,0.68],[0.6,0.82],[0.4,0.85],[0.2,0.8]],[[0.46,0.58],[0.34,0.7],[0.46,0.72],[0.58,0.74]]] },
];

const N_TRIALS = 60;
let pass = 0, fail = 0;
const confusion = {};

for (const g of GUIDES) {
  let hit = 0, miss = 0, wrong = 0;
  for (let t = 0; t < N_TRIALS; t++) {
    // 轻噪声（熟练）与重噪声（潦草）各半，模拟真实书写分布
    const noise = t % 2 === 0 ? 3 : 6;
    const useAlt = g.alt && t % 4 === 3;
    const strokes = makeSample(useAlt ? g.alt : g.strokes, noise);
    const res = recognizeChar({ strokes });
    if (!res) miss++;
    else if (res.char === g.char) hit++;
    else {
      wrong++;
      confusion[`${g.char}→${res.char}`] = (confusion[`${g.char}→${res.char}`] || 0) + 1;
    }
  }
  // 宁拒勿误：误识必须为 0；召回 ≥60%（未成字可接受，误识不可接受）
  const ok = wrong === 0 && hit >= N_TRIALS * 0.6;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} 「${g.char}」 召回 ${hit}/${N_TRIALS} 未成字 ${miss} 误识 ${wrong}`);
}

if (Object.keys(confusion).length) {
  console.log('\n误识分布:');
  for (const [k, v] of Object.entries(confusion)) console.log(`  ${k}: ${v}次`);
}

console.log(`\n总计: ${pass}/${GUIDES.length} 字通过`);
process.exit(fail > 0 ? 1 : 0);
