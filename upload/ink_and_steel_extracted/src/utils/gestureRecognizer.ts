export interface StrokePoint {
  x: number;
  y: number;
  time: number;
}

export type GestureType =
  | 'TAP' // Move or attack at target
  | 'SWIPE_HORIZONTAL' // 横 - 断水斩 (Dash Slash)
  | 'SWIPE_DOWN' // 竖 - 笔落惊风 (Aerial Plunge)
  | 'SWIPE_UP' // 提 - 轻功腾跃 (Jump)
  | 'CIRCLE' // 圆 - 竹影墨盾 / 墨荷阵 (Aegis / Lotus Domain)
  | 'ZIGZAG' // 撇捺 - 星河笔阵 (Starlight Barrage)
  | 'DRAG'; // 引导漫步 (Continuous Move)

export interface GestureResult {
  type: GestureType;
  name: string;
  poeticCalligraphy: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
}

export class GestureRecognizer {
  private points: StrokePoint[] = [];
  private isTracing = false;
  private strokeColor = '#09090b';

  public startStroke(x: number, y: number) {
    this.points = [{ x, y, time: performance.now() }];
    this.isTracing = true;
  }

  public addPoint(x: number, y: number) {
    if (!this.isTracing) return;
    const now = performance.now();
    const last = this.points[this.points.length - 1];
    // Throttle slight jitter
    if (!last || Math.hypot(x - last.x, y - last.y) >= 4) {
      this.points.push({ x, y, time: now });
    }
  }

  public getPoints(): StrokePoint[] {
    return this.points;
  }

  public getIsTracing(): boolean {
    return this.isTracing;
  }

  public endStroke(): GestureResult | null {
    if (!this.isTracing || this.points.length === 0) {
      this.isTracing = false;
      this.points = [];
      return null;
    }

    this.isTracing = false;
    const pts = this.points;
    const len = pts.length;
    const start = pts[0];
    const end = pts[len - 1];
    const duration = end.time - start.time;

    const totalDx = end.x - start.x;
    const totalDy = end.y - start.y;
    const totalDist = Math.hypot(totalDx, totalDy);

    // Calculate path length
    let pathLength = 0;
    for (let i = 1; i < len; i++) {
      pathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }

    // 1. Single Tap or Very Short Click
    if (pathLength < 18 && duration < 350) {
      return {
        type: 'TAP',
        name: '点',
        poeticCalligraphy: '点墨破阵',
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
      };
    }

    // 2. Check for Circle Gesture (圆 - 墨韵周天 / 竹影盾)
    if (pathLength > 150 && len >= 8) {
      // Circle check: start and end are close, but path is substantial
      const startEndDist = Math.hypot(end.x - start.x, end.y - start.y);
      if (startEndDist < pathLength * 0.35) {
        // Calculate bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pts.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
        const boxW = maxX - minX;
        const boxH = maxY - minY;
        const aspect = boxW / Math.max(1, boxH);
        if (aspect >= 0.45 && aspect <= 2.2 && boxW > 40 && boxH > 40) {
          return {
            type: 'CIRCLE',
            name: '圆',
            poeticCalligraphy: '墨韵周天',
            startX: (minX + maxX) / 2,
            startY: (minY + maxY) / 2,
            endX: end.x,
            endY: end.y,
          };
        }
      }
    }

    // 3. Check for Zigzag (撇捺折 - 星河笔阵)
    if (len >= 12 && pathLength > 180) {
      let directionChanges = 0;
      for (let i = 2; i < len - 1; i++) {
        const v1x = pts[i].x - pts[i - 1].x;
        const v2x = pts[i + 1].x - pts[i].x;
        if (v1x * v2x < -15) {
          directionChanges++;
        }
      }
      if (directionChanges >= 2) {
        return {
          type: 'ZIGZAG',
          name: '折',
          poeticCalligraphy: '星河引毫',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        };
      }
    }

    // 4. Directional Swipes (Fast stroke < 650ms, length > 45px)
    if (pathLength > 45 && duration < 650) {
      const absDx = Math.abs(totalDx);
      const absDy = Math.abs(totalDy);

      // Horizontal swipe (横 - 断水斩)
      if (absDx > absDy * 1.35) {
        return {
          type: 'SWIPE_HORIZONTAL',
          name: '横',
          poeticCalligraphy: totalDx > 0 ? '断水东流' : '剑气逆寒',
          direction: totalDx > 0 ? 'RIGHT' : 'LEFT',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        };
      }

      // Vertical Down swipe (竖 - 笔落惊风 / 凌空斩)
      if (totalDy > absDx * 1.35 && totalDy > 40) {
        return {
          type: 'SWIPE_DOWN',
          name: '竖',
          poeticCalligraphy: '笔落惊风',
          direction: 'DOWN',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        };
      }

      // Vertical Up swipe (提 - 轻功腾跃)
      if (totalDy < -absDx * 1.35 && totalDy < -40) {
        return {
          type: 'SWIPE_UP',
          name: '提',
          poeticCalligraphy: '轻功揽月',
          direction: 'UP',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        };
      }
    }

    // Default: Slow drag / guiding move
    return {
      type: 'DRAG',
      name: '行',
      poeticCalligraphy: '步移景从',
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    };
  }

  // Draw Wet Calligraphy Brush Trail directly onto canvas
  public drawBrushTrail(ctx: CanvasRenderingContext2D) {
    const pts = this.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const now = performance.now();

    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const dt = Math.max(1, p2.time - p1.time);
      const speed = dist / dt; // pixels per ms

      // Calligraphy dynamics: faster swipe = thinner bristle (4-8px), slow drag = thick wet saturated ink (14-22px)
      const strokeWidth = Math.max(5, Math.min(22, 22 - speed * 10));

      // Wet black ink with subtle cyan glow
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = strokeWidth;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Outer ink dispersion halo
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = strokeWidth + 6;
      ctx.stroke();

      // Occasional ink splatter drop along the brush
      if (i % 5 === 0 && Math.random() < 0.4) {
        ctx.fillStyle = '#09090b';
        ctx.beginPath();
        const splashX = p2.x + (Math.random() - 0.5) * (strokeWidth + 12);
        const splashY = p2.y + (Math.random() - 0.5) * (strokeWidth + 12);
        ctx.arc(splashX, splashY, Math.random() * 3 + 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
