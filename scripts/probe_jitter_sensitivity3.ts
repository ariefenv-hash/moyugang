/* 蚀断量测：痕内笔迹整段缺失（洗墨蚀断）→ recognizeChar 得分 */
import { recognizeChar } from '../src/utils/charRecognizer';

const ZHI: number[][][] = [
  [[0.08, 0.24], [0.2, 0.34], [0.32, 0.43]],
  [[0.3, 0.56], [0.45, 0.53], [0.58, 0.5], [0.42, 0.65], [0.32, 0.79]],
  [[0.46, 0.58], [0.62, 0.68], [0.78, 0.78], [0.92, 0.9]],
];

function buildStrokes(thresh: number, phase: number, warpA: number) {
  const box = 210;
  const cx = 320, cy = 200;
  return ZHI.map((stroke) => {
    const pts: { x: number; y: number }[] = [];
    const dense: number[][] = [];
    for (let i = 0; i < stroke.length - 1; i++) {
      const [x1, y1] = stroke[i];
      const [x2, y2] = stroke[i + 1];
      for (let t = 0; t < 14; t++) {
        dense.push([x1 + ((x2 - x1) * t) / 14, y1 + ((y2 - y1) * t) / 14]);
      }
    }
    dense.push(stroke[stroke.length - 1]);
    for (const [nx, ny] of dense) {
      const x0 = cx + (nx - 0.5) * box;
      const y0 = cy + (ny - 0.5) * box * 1.18;
      // 蚀断场：y 依赖正弦过阈 → 该段被洗去（整段连续缺失）
      const eat = Math.sin(y0 / 30 + phase) + Math.sin(x0 / 47 - phase * 0.7) * 0.6;
      if (eat > thresh) continue;
      let x = x0 + Math.sin(y0 / 34 + phase) * warpA;
      let y = y0 + Math.cos(x0 / 40 + phase) * warpA * 0.4;
      pts.push({ x, y });
    }
    return pts;
  });
}

for (const [thresh, A] of [[99, 0], [0.9, 0], [0.6, 0], [0.4, 0], [0.2, 0], [0.6, 8], [0.4, 8], [0.2, 8]] as const) {
  const out: string[] = [];
  for (let trial = 0; trial < 6; trial++) {
    const strokes = buildStrokes(thresh, trial * 0.9, A).filter((s) => s.length >= 2);
    const m = strokes.length ? recognizeChar({ strokes }) : null;
    out.push(m ? `${m.grade}:${m.score.toFixed(3)}` : 'FAIL');
  }
  console.log(`thresh=${thresh} A=${A}: ${out.join('  ')}`);
}
