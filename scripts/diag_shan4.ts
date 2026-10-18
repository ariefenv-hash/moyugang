// 复现 verify 脚本的 4 笔写山：中竖 / 左竖 / 底横 / 右竖
import { recognizeChar } from '../src/utils/charRecognizer';

// 屏幕坐标（viewport 1280x800, cx=640, cy=416）
const cx = 640, cy = 416;
const toPts = (poly: number[][]) =>
  poly.map(([x, y]) => ({ x: cx + x, y: cy + y }));

const midV = toPts([[-6, -62], [-6, 0], [-6, 58]]);
const leftV = toPts([[-84, -56], [-84, 0], [-84, 52]]);
const bottomH = toPts([[-84, 58], [-30, 58], [20, 58], [60, 58]]);
const rightV = toPts([[74, -58], [74, 0], [74, 56]]);

for (const [name, strokes] of [
  ['4笔山(左竖/底横分书)', [midV, leftV, bottomH, rightV]],
  ['3笔山(左竖连底横)', [midV, [...leftV, ...bottomH], rightV]],
  ['2笔山(中竖+其余连笔)', [midV, [...leftV, ...bottomH, ...rightV]]],
] as [string, { x: number; y: number }[][]][]) {
  const r = recognizeChar({ strokes });
  console.log(name, '→', r ? `${r.char} ${r.gradeText} score=${r.score.toFixed(4)}` : 'REJECTED(墨渍)');
}
