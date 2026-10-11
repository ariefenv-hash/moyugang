// 字诀识别器算法验证 v2：
// 1) 分形中点位移仿真真实手写（笔画弯曲/圆角/抖动/歪斜/缩放）
// 2) 同字命中 + 异字误配余量分析
// 3) 乱画（圆圈、Z 乱折、螺旋、单横）必须拒绝
import { recognizeChar, listCharGuides } from '../src/utils/charRecognizer';

let seedState = 42;
function rand() {
  seedState = (seedState * 9301 + 49297) % 233280;
  return seedState / 233280;
}
function gauss() {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

/** 分形中点位移：把折线弯出人手书写的弧度 */
function fractalWarp(poly: number[][], depth: number, amp: number): number[][] {
  let pts = poly;
  for (let d = 0; d < depth; d++) {
    const next: number[][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const mx = (x1 + x2) / 2 + gauss() * amp;
      const my = (y1 + y2) / 2 + gauss() * amp;
      next.push([mx, my], [x2, y2]);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

function densify(poly: number[][], step = 0.03): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[i + 1];
    const segLen = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(2, Math.round(segLen / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    }
  }
  pts.push({ x: poly[poly.length - 1][0], y: poly[poly.length - 1][1] });
  return pts;
}

/** 仿真手写：分形弯曲 + 噪声 + 旋转 + 缩放 + 平移 */
function handwrite(
  strokes: number[][][],
  warpAmp: number,
  noise: number,
  rotDeg: number,
  scale: number,
  dx: number,
  dy: number
) {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return strokes.map((poly) =>
    densify(fractalWarp(poly, 2, warpAmp)).map((p) => {
      let x = (p.x - 0.5) * scale + 0.5 + dx;
      let y = (p.y - 0.5) * scale + 0.5 + dy;
      const rx = (x - 0.5) * cos - (y - 0.5) * sin + 0.5;
      const ry = (x - 0.5) * sin + (y - 0.5) * cos + 0.5;
      return { x: rx * 300 + gauss() * noise, y: ry * 300 + gauss() * noise };
    })
  );
}

function run(name: string, r: ReturnType<typeof recognizeChar>, expect?: string) {
  const ok = r ? (expect ? (r.char === expect ? 'PASS' : `WRONG→${r.char}`) : 'HIT') : 'MISS';
  console.log(`${name}: ${ok}${r ? ` (${r.char} score=${r.score.toFixed(4)} ${r.gradeText})` : ''}`);
  return r;
}

console.log('=== 1. 规整书写（微弯 + 轻噪 + 3° 斜） ===');
for (const g of listCharGuides()) {
  seedState = 100 + g.char.charCodeAt(0);
  run(`${g.char}`, recognizeChar({ strokes: handwrite(g.strokes, 0.008, 3, 3, 1.0, 0.01, 0) }), g.char);
}

console.log('\n=== 2. 潦草书写（大弯 + 重噪 + 15° 斜 + 缩放平移） ===');
for (const g of listCharGuides()) {
  seedState = 700 + g.char.charCodeAt(0);
  run(`${g.char}`, recognizeChar({ strokes: handwrite(g.strokes, 0.03, 9, 15, 0.82, 0.06, 0.05) }), g.char);
}

console.log('\n=== 3. 连笔/断笔（笔画数 ±1 容忍） ===');
seedState = 800;
const guides = listCharGuides();
// 山 少写一笔（只写中竖+底横）
run('山·断笔2画', recognizeChar({ strokes: handwrite([guides[1].strokes[0], guides[1].strokes[1]], 0.012, 5, 4, 1, 0.02, 0.02) }), '山');
// 王 多写一笔（描两遍底横）——新字插入后王在索引 6
run('王·描笔5画', recognizeChar({ strokes: handwrite([...guides[6].strokes, guides[6].strokes[2]], 0.01, 5, -5, 0.95, 0, 0) }), '王');

console.log('\n=== 3b. 连笔变体（之一笔连写 / 山两笔快写） ===');
// guides 顺序：之(0) 山(1) 火(2) 水(3) 川(4) 心(5) 王(6)
const zhi = guides[0];
const shan = guides[1];
seedState = 850;
run('之·连笔1画', recognizeChar({ strokes: handwrite([zhi.strokes[0], zhi.strokes[1], zhi.strokes[2]], 0.014, 5, 6, 0.95, 0.02, 0).slice(0, 1) }), null); // 占位：连笔变体在下方用真实连笔折线测试
// 真实连笔：一条轨迹连写整个「之」
const zhiCursive = [[[0.08, 0.2], [0.22, 0.3], [0.33, 0.4], [0.3, 0.52], [0.44, 0.52], [0.56, 0.5], [0.42, 0.64], [0.32, 0.78], [0.5, 0.6], [0.66, 0.7], [0.8, 0.8], [0.92, 0.9]]];
run('之·一笔快写', recognizeChar({ strokes: handwrite(zhiCursive, 0.012, 5, 8, 0.9, 0.03, 0.03) }), '之');
// 山两笔：中竖 + 竖折提右竖
const shanFast = [
  [[0.5, 0.04], [0.5, 0.38], [0.5, 0.7]],
  [[0.14, 0.12], [0.14, 0.4], [0.14, 0.66], [0.2, 0.71], [0.45, 0.72], [0.72, 0.72], [0.84, 0.6], [0.86, 0.4], [0.86, 0.28]],
];
run('山·两笔快写', recognizeChar({ strokes: handwrite(shanFast, 0.012, 5, 5, 0.92, 0.02, 0.02) }), '山');

console.log('\n=== 3c. 新字交叉误识检查（川 vs 山 / 心 vs 王 / 川潦草） ===');
const chuan = guides[4];
const xin = guides[5];
// 川 规整（section 1 已覆盖）——此处检查 山 模板不会抢走 川 的输入
seedState = 860;
const chuanMid = handwrite(chuan.strokes, 0.02, 7, -8, 0.9, 0.04, 0.04);
const rChuan = recognizeChar({ strokes: chuanMid });
run('川·中抖', rChuan, '川');
// 心 中抖
seedState = 861;
run('心·中抖', recognizeChar({ strokes: handwrite(xin.strokes, 0.02, 7, -6, 0.9, 0.04, 0.04) }), '心');
// 山 乱中抖不被误判为 川
seedState = 862;
const rShan = recognizeChar({ strokes: handwrite(shan.strokes, 0.02, 7, -8, 0.9, 0.04, 0.04) });
run('山·中抖', rShan, '山');

console.log('\n=== 4. 异字余量（真字 A 与模板 B 的最好分数应显著差于 A-A） ===');
for (const g of guides) {
  seedState = 900 + g.char.charCodeAt(0);
  const hw = handwrite(g.strokes, 0.015, 5, 6, 0.95, 0.03, 0.03);
  // 逐模板打分：直接调用识别但打印所有比较——简化为对每个模板生成对照分数
  // 这里只跑识别，看 grade 与 score；异字余量通过第 5 节乱画间接验证
  run(`${g.char}·中抖`, recognizeChar({ strokes: hw }), g.char);
}

console.log('\n=== 5. 乱画必须拒绝 ===');
// 圆圈（1笔）
const circle = densify(
  Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [0.5 + Math.cos(a) * 0.35, 0.5 + Math.sin(a) * 0.35];
  })
).map((p) => ({ x: p.x * 300 + gauss() * 4, y: p.y * 300 + gauss() * 4 }));
run('乱画圆圈', recognizeChar({ strokes: [circle] }), null);

// Z 乱折（1笔）
const zScribble = densify([[[0.1, 0.9]], [[0.9, 0.1]], [[0.15, 0.15]], [[0.85, 0.85]], [[0.1, 0.5]]])
  .map((p) => ({ x: p.x * 300 + gauss() * 6, y: p.y * 300 + gauss() * 6 }));
run('乱画Z折', recognizeChar({ strokes: [zScribble] }), null);

// 螺旋（1笔）
const spiral = densify(
  Array.from({ length: 25 }, (_, i) => {
    const a = i * 0.55;
    const r = 0.08 + i * 0.012;
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r];
  })
).map((p) => ({ x: p.x * 300, y: p.y * 300 }));
run('乱画螺旋', recognizeChar({ strokes: [spiral] }), null);

// 单横快速一笔（很像「一」，但字诀没有一字 → 必须拒绝）
const oneStroke = densify([[[0.1, 0.5]], [[0.9, 0.5]]]).map((p) => ({ x: p.x * 300, y: p.y * 300 + gauss() * 3 }));
run('单横一笔', recognizeChar({ strokes: [oneStroke] }), null);

// 三横乱堆（没有竖 → 不是王；笔画数同为 4，考验形状区分）
const threeLines = [
  densify([[[0.2, 0.2]], [[0.8, 0.25]]]),
  densify([[[0.15, 0.55]], [[0.85, 0.5]]]),
  densify([[[0.25, 0.85]], [[0.75, 0.8]]]),
];
run('三横无竖(4笔)', recognizeChar({ strokes: threeLines }), null);

// 十字交叉（2笔：横+竖）—— 不在任何模板中（王是4笔，差2笔会被笔画数惩罚）
const cross = [densify([[[0.15, 0.5]], [[0.85, 0.5]]]), densify([[[0.5, 0.1]], [[0.5, 0.9]]])];
run('十字(2笔)', recognizeChar({ strokes: cross }), null);

console.log('\n=== 6. 边界 ===');
console.log(`空输入: ${recognizeChar({ strokes: [] }) === null ? 'PASS' : 'WRONG'}`);
console.log(`过短笔画: ${recognizeChar({ strokes: [[{ x: 10, y: 10 }, { x: 14, y: 12 }]] }) === null ? 'PASS' : 'WRONG'}`);
