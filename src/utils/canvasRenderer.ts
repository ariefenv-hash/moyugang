import {
  UnitInstance,
  HeroInstance,
  Projectile,
  Particle,
  DamageNumber,
  LevelConfig,
  InkLotusTrap,
  SealStamp,
  InkDragon,
  InkTreasure,
} from '../types/game';
import { UNIT_CONFIGS } from '../data/gameData';
import {
  StickPose,
  makeDefaultPose,
  lerpPose,
  clonePose,
  computeHeroPose,
  computeWalkStep,
  solveIK2,
  lerp,
  clamp01,
  expoBlend,
  easeOutCubic,
  easeOutQuad,
  easeInOutQuad,
} from './animationSystem';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  /** 设备像素比：高分屏逻辑坐标 → 物理像素映射，画面更清晰 */
  private dpr: number = 1;
  private bgImage: HTMLImageElement | null = null;

  /* ===== 程序化动作引擎内部状态（v3） ===== */
  private frameDt: number = 1 / 60;
  private lastGameTime: number = -1;
  private heroPose: StickPose = makeDefaultPose();
  private heroWalkPhase: number = 0;
  private lastHeroX: number = 0;
  private lastHeroAltZ: number = 0;
  private lastFallV: number = 0;
  private lastGhostX: number = 0;
  private heroVX: number = 0;
  private lastFacing: 1 | -1 = 1;
  private turnBlend: number = 0;
  private lastGrounded: boolean = true;
  private landSquash: number = 0;
  private prevTrailEmit: number = 0;
  private afterimageTimer: number = 0;
  private swordTrail: { x: number; y: number; tx: number; ty: number; life: number }[] = [];
  private afterimages: {
    x: number;
    gy: number;
    altZ: number;
    facing: 1 | -1;
    pose: StickPose;
    life: number;
  }[] = [];
  private fxRings: {
    x: number;
    y: number;
    r0: number;
    r1: number;
    life: number;
    maxLife: number;
    color: string;
    lw: number;
    flat: boolean;
  }[] = [];
  private capePts: { x: number; y: number; px: number; py: number }[] = [];
  private ribbonPts: { x: number; y: number; px: number; py: number }[] = [];
  private unitFx: WeakMap<UnitInstance, { walkPhase: number }> = new WeakMap();

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number, bgImageSrc?: string) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    if (bgImageSrc) {
      const img = new Image();
      img.src = bgImageSrc;
      img.onload = () => {
        this.bgImage = img;
      };
    }
  }

  public resize(width: number, height: number, dpr?: number) {
    this.width = width;
    this.height = height;
    if (dpr && dpr > 0) this.dpr = dpr;
  }

  // 2.5D Coordinate to Screen position with perspective
  private getDepthScale(laneY: number, laneMin: number, laneMax: number): number {
    const t = Math.max(0, Math.min(1, (laneY - laneMin) / (laneMax - laneMin)));
    return 0.86 + t * 0.22; // Depth scale 0.86 (back) to 1.08 (front)
  }

  // Clear and render entire 2.5D scene with screen shake
  public render(
    cameraX: number,
    level: LevelConfig,
    worldWidth: number,
    laneMinY: number,
    laneMaxY: number,
    playerBaseHp: number,
    playerBaseMaxHp: number,
    enemyBaseHp: number,
    enemyBaseMaxHp: number,
    hero: HeroInstance,
    units: UnitInstance[],
    lotusTraps: InkLotusTrap[],
    projectiles: Projectile[],
    particles: Particle[],
    damageNumbers: DamageNumber[],
    sealStamps: SealStamp[],
    wells: { x: number; y: number; inkRemaining: number }[],
    gameTime: number,
    shakeX: number = 0,
    shakeY: number = 0,
    inkDragons: InkDragon[] = [],
    treasures: InkTreasure[] = [],
    inkSlowProgress: number = 0
  ) {
    const ctx = this.ctx;

    // ===== 帧间隔（暂停/顿帧时 gameTime 不推进 → dt=0，全部动作特效自然凝滞） =====
    const dt =
      this.lastGameTime < 0
        ? 1 / 60
        : Math.max(0, Math.min(0.05, gameTime - this.lastGameTime));
    this.lastGameTime = gameTime;
    this.frameDt = dt;
    this.stepFX(dt);

    // 每帧重置基准变换到逻辑坐标系（物理分辨率由 dpr 缩放）
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Sky & Parallax Chinese Mountains
    this.drawSkyAndParallax(cameraX, level, laneMinY, gameTime);

    // 2. 2.5D Perspective Ground Plane (Courtyard / Riverbank flagstones)
    this.drawPerspectiveGround(cameraX, worldWidth, laneMinY, laneMaxY, level, gameTime);

    // 3. Ground Lotus Traps / Runes
    lotusTraps.forEach((trap) => {
      this.drawInkLotus(trap, cameraX, laneMinY, laneMaxY, gameTime);
    });

    // 3.5 文房四宝掉落物（地面发光物）
    treasures.forEach((t) => {
      this.drawInkTreasure(t, cameraX, gameTime);
    });

    // 4. Ink Wells
    wells.forEach((well) => {
      this.drawInkWell(well.x - cameraX, well.y, laneMinY, laneMaxY, well.inkRemaining, gameTime);
    });

    // 5. Bases / Citadels
    const baseMidY = (laneMinY + laneMaxY) * 0.5;
    this.drawPlayerCitadel(100 - cameraX, baseMidY, playerBaseHp, playerBaseMaxHp, gameTime);
    this.drawEnemyCitadel(
      worldWidth - 100 - cameraX,
      baseMidY,
      enemyBaseHp,
      enemyBaseMaxHp,
      gameTime,
      level.boss?.name
    );

    // 6. Draw Hero Inspiring Aura on Ground (Under feet)
    if (hero.state !== 'DEAD') {
      this.drawHeroAura25D(hero, cameraX, laneMinY, laneMaxY, gameTime);
    }

    // 7. 2.5D Y-Depth Sorting for Characters and Drops
    type RenderItem =
      | { type: 'HERO'; y: number; data: HeroInstance }
      | { type: 'UNIT'; y: number; data: UnitInstance };

    const renderList: RenderItem[] = [];
    if (hero.state !== 'DEAD') {
      renderList.push({ type: 'HERO', y: hero.y, data: hero });
    }
    units.forEach((u) => {
      renderList.push({ type: 'UNIT', y: u.y, data: u });
    });

    renderList.sort((a, b) => a.y - b.y);

    // Render sorted entities with skeletal animation
    renderList.forEach((item) => {
      if (item.type === 'HERO') {
        this.drawSkeletalHero(item.data, cameraX, laneMinY, laneMaxY, gameTime);
      } else {
        this.drawSkeletalUnit(item.data, cameraX, laneMinY, laneMaxY, gameTime);
      }
    });

    // 7.5 墨龙卷（高连击奖励，飞在最上层）
    inkDragons.forEach((dragon) => {
      this.drawInkDragon(dragon, cameraX, laneMinY, laneMaxY, gameTime);
    });

    // 8. Projectiles in 2.5D space
    projectiles.forEach((proj) => {
      this.drawProjectile(proj, cameraX, laneMinY, laneMaxY);
    });

    // 9. Particles
    particles.forEach((p) => {
      this.drawParticle(p, cameraX);
    });

    // 10. Seal Stamps (Red Calligraphy Stamps)
    sealStamps.forEach((stamp) => {
      this.drawSealStamp(stamp, cameraX);
    });

    // 11. Floating Damage Numbers
    damageNumbers.forEach((d) => {
      this.drawDamageNumber(d, cameraX);
    });

    ctx.restore();

    // 12. 墨滞时刻全屏滤镜（屏幕空间，不受镜头/震动影响）
    if (inkSlowProgress > 0) {
      this.drawInkSlowVignette(inkSlowProgress, gameTime);
    }
  }

  /** 墨龙卷：蛇形大笔触游走的墨龙 */
  private drawInkDragon(
    dragon: InkDragon,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = dragon.x - cameraX;
    if (screenX < -260 || screenX > this.width + 260) return;

    const ctx = this.ctx;
    const scale = this.getDepthScale(dragon.y, laneMinY, laneMaxY);
    const t = gameTime * 9;
    const dir = dragon.vx >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(screenX, dragon.y - 46 * scale);

    // 龙身：多段蛇形波浪笔触（越靠尾部越细）
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const tt = t - i * 0.55;
      const sx = -dir * i * 26 * scale;
      const sy = Math.sin(tt) * 14 * scale;
      const segSize = (20 - i * 1.7) * scale;
      if (segSize <= 1) continue;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = `rgba(9, 9, 11, ${0.92 - i * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, segSize * 1.5, segSize * 0.85, Math.sin(tt) * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // 金墨描边灵光
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.5 - i * 0.05})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    // 龙首：张口吐墨 + 龙角 + 龙须
    const headSway = Math.sin(t) * 6 * scale;
    ctx.save();
    ctx.translate(dir * 10 * scale, headSway);
    ctx.scale(dir, 1);

    // 头颅
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(6 * scale, 0, 15 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    // 吻部
    ctx.beginPath();
    ctx.moveTo(12 * scale, -4 * scale);
    ctx.lineTo(30 * scale, -2 * scale);
    ctx.lineTo(12 * scale, 6 * scale);
    ctx.closePath();
    ctx.fill();
    // 双角
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -8 * scale);
    ctx.quadraticCurveTo(-6 * scale, -20 * scale, 4 * scale, -24 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6 * scale, -7 * scale);
    ctx.quadraticCurveTo(-14 * scale, -17 * scale, -6 * scale, -21 * scale);
    ctx.stroke();
    // 龙目
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(10 * scale, -3 * scale, 2.6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 龙须
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-8 * scale, 2 * scale);
    ctx.quadraticCurveTo(-24 * scale, 8 * scale + Math.sin(t * 1.3) * 5, -36 * scale, 2 * scale);
    ctx.stroke();

    ctx.restore();
    ctx.restore();

    // 地面掠过阴影
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(screenX, dragon.y + 6, 60 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 文房四宝掉落物：毛笔 / 墨锭 / 纸卷 / 砚台，附光柱提示 */
  private drawInkTreasure(t: InkTreasure, cameraX: number, gameTime: number) {
    const screenX = t.x - cameraX;
    if (screenX < -60 || screenX > this.width + 60) return;

    const ctx = this.ctx;
    const bob = Math.sin(gameTime * 3.2 + t.x * 0.01) * 4;
    const y = t.y - t.altitudeZ - 14 + bob;

    // 光柱（即将消失时闪烁）
    const fading = t.life < 3 ? 0.4 + Math.sin(gameTime * 10) * 0.3 : 0.85;
    const pillarGrad = ctx.createLinearGradient(screenX, y, screenX, y - 90);
    pillarGrad.addColorStop(0, `rgba(250, 204, 21, ${0.35 * fading})`);
    pillarGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.save();
    ctx.fillStyle = pillarGrad;
    ctx.fillRect(screenX - 13, y - 90, 26, 90);

    // 底部光环
    ctx.strokeStyle = `rgba(250, 204, 21, ${0.55 * fading})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(screenX, t.y + 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.translate(screenX, y);
    ctx.rotate(Math.sin(gameTime * 2) * 0.12);

    if (t.kind === 'BRUSH') {
      // 毛笔：笔杆 + 笔锋
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, 9);
      ctx.lineTo(6, -8);
      ctx.stroke();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.moveTo(6, -8);
      ctx.quadraticCurveTo(13, -14, 11, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(-7, 9, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.kind === 'INK') {
      // 墨锭
      ctx.fillStyle = '#18181b';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-8, -6, 16, 12, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 9px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('墨', 0, 0.5);
    } else if (t.kind === 'PAPER') {
      // 纸卷
      ctx.save();
      ctx.rotate(-0.5);
      ctx.fillStyle = '#f5f0e6';
      ctx.strokeStyle = '#a8a29e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-10, -5, 20, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#78716c';
      ctx.beginPath();
      ctx.moveTo(-6, -1.5);
      ctx.lineTo(6, -1.5);
      ctx.moveTo(-6, 2);
      ctx.lineTo(2, 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // 砚台
      ctx.fillStyle = '#292524';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.ellipse(0, -1, 6.5, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 墨滞时刻：屏幕边缘墨紫晕影 + 飘落时之墨点 */
  private drawInkSlowVignette(progress: number, gameTime: number) {
    const ctx = this.ctx;
    const strength = Math.min(1, progress * 1.6);

    // 四周墨紫晕影
    const vg = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.32,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72
    );
    vg.addColorStop(0, 'rgba(76, 29, 149, 0)');
    vg.addColorStop(0.7, `rgba(76, 29, 149, ${0.22 * strength})`);
    vg.addColorStop(1, `rgba(9, 9, 11, ${0.55 * strength})`);
    ctx.save();
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.width, this.height);

    // 缓落时之墨点
    const dots = 14;
    for (let i = 0; i < dots; i++) {
      const seed = i * 97.13;
      const dx = (Math.sin(seed) * 0.5 + 0.5) * this.width;
      const dy = ((gameTime * 26 + seed * 13) % (this.height + 60)) - 30;
      ctx.globalAlpha = 0.3 * strength;
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw Sky & Parallax Layer
  private drawSkyAndParallax(cameraX: number, level: LevelConfig, laneMinY: number, gameTime: number) {
    const ctx = this.ctx;

    // Atmospheric Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, laneMinY);
    if (level.ambientType === 'SNOW') {
      skyGrad.addColorStop(0, '#1c1f24');
      skyGrad.addColorStop(0.6, '#282e38');
      skyGrad.addColorStop(1, '#dfe5ec');
    } else if (level.ambientType === 'BAMBOO') {
      skyGrad.addColorStop(0, '#0c1a16');
      skyGrad.addColorStop(0.5, '#173027');
      skyGrad.addColorStop(1, '#cce3d4');
    } else if (level.ambientType === 'MOON') {
      skyGrad.addColorStop(0, '#070a14');
      skyGrad.addColorStop(0.6, '#13192f');
      skyGrad.addColorStop(1, '#2c3755');
    } else if (level.ambientType === 'PETAL') {
      skyGrad.addColorStop(0, '#1c1218');
      skyGrad.addColorStop(0.6, '#38222b');
      skyGrad.addColorStop(1, '#f2d8dd');
    } else {
      skyGrad.addColorStop(0, '#120d1c');
      skyGrad.addColorStop(0.4, '#2e192f');
      skyGrad.addColorStop(0.8, '#6b3d43');
      skyGrad.addColorStop(1, '#ebd0ab');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, laneMinY + 40);

    // Background Image Art（等比 cover 绘制：窄屏/宽屏均不拉伸变形，底部对齐地平线，横向平铺视差）
    if (this.bgImage && this.bgImage.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      const img = this.bgImage;
      const skyH = laneMinY + 60;
      const imgAR = img.naturalWidth / img.naturalHeight;
      const targetAR = this.width / Math.max(1, skyH);
      // cover 逻辑：铺满目标区域所需的最小等比缩放
      let drawW: number, drawH: number;
      if (imgAR > targetAR) {
        drawH = skyH;
        drawW = skyH * imgAR;
      } else {
        drawW = this.width;
        drawH = this.width / imgAR;
      }
      // 底部对齐地平线（山景根部贴地），超高部分向天空裁切
      const drawY = skyH - drawH;
      // 横向平铺 + 视差滚动
      const tileW = drawW;
      const bgOffset = -((cameraX * 0.15) % tileW);
      for (let x = bgOffset; x < this.width; x += tileW) {
        ctx.drawImage(img, x, drawY, tileW, drawH);
      }
      ctx.restore();
    }

    // Celestial Body
    const celestialX = this.width * 0.75 - cameraX * 0.05;
    ctx.save();
    if (level.ambientType === 'MOON') {
      const moonGlow = ctx.createRadialGradient(celestialX, 85, 10, celestialX, 85, 75);
      moonGlow.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
      moonGlow.addColorStop(0.4, 'rgba(230, 240, 255, 0.4)');
      moonGlow.addColorStop(1, 'rgba(200, 220, 255, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(celestialX, 85, 75, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fffef0';
      ctx.beginPath();
      ctx.arc(celestialX, 85, 30, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'DAWN') {
      const sunGlow = ctx.createRadialGradient(celestialX, 100, 15, celestialX, 100, 130);
      sunGlow.addColorStop(0, 'rgba(255, 220, 140, 0.9)');
      sunGlow.addColorStop(0.3, 'rgba(240, 160, 90, 0.4)');
      sunGlow.addColorStop(1, 'rgba(230, 100, 70, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(celestialX, 100, 130, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Distant Ink Mountains
    this.drawDistantInkMountains(cameraX, laneMinY, 0.2, '#333b47', 0.35, 120);
    this.drawDistantInkMountains(cameraX, laneMinY, 0.45, '#1e242c', 0.6, 75);
  }

  private drawDistantInkMountains(
    cameraX: number,
    laneMinY: number,
    parallaxSpeed: number,
    color: string,
    alpha: number,
    heightVariance: number
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    const startOffset = -(cameraX * parallaxSpeed);
    ctx.beginPath();
    ctx.moveTo(0, laneMinY);

    const step = 85;
    const numPoints = Math.ceil(this.width / step) + 2;
    for (let i = 0; i <= numPoints; i++) {
      const x = i * step;
      const worldPos = x - startOffset;
      const y =
        laneMinY - 120 - Math.sin(worldPos * 0.003) * heightVariance - Math.cos(worldPos * 0.007) * 35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.width, laneMinY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw 2.5D Perspective Ground Plane
  private drawPerspectiveGround(
    cameraX: number,
    worldWidth: number,
    laneMinY: number,
    laneMaxY: number,
    level: LevelConfig,
    gameTime: number
  ) {
    const ctx = this.ctx;

    // Perspective depth gradient across the walkable lane
    const groundGrad = ctx.createLinearGradient(0, laneMinY, 0, this.height);
    if (level.ambientType === 'SNOW') {
      groundGrad.addColorStop(0, '#cbd5e1');
      groundGrad.addColorStop(0.3, '#94a3b8');
      groundGrad.addColorStop(1, '#334155');
    } else if (level.ambientType === 'BAMBOO') {
      groundGrad.addColorStop(0, '#334835');
      groundGrad.addColorStop(0.3, '#213023');
      groundGrad.addColorStop(1, '#111912');
    } else {
      groundGrad.addColorStop(0, '#26262b');
      groundGrad.addColorStop(0.3, '#1c1c20');
      groundGrad.addColorStop(1, '#0e0e11');
    }

    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, laneMinY, this.width, this.height - laneMinY);

    // Traditional Calligraphy Ink Horizon Line
    ctx.save();
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, laneMinY);
    ctx.lineTo(this.width, laneMinY);
    ctx.stroke();

    // 2.5D Flagstone grid lines (isometric depth perspective)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    // Horizontal depth division lines
    const depthSteps = 4;
    for (let i = 1; i <= depthSteps; i++) {
      const y = laneMinY + ((laneMaxY - laneMinY) / depthSteps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Vertical diagonal grid lines
    const tileSpacing = 160;
    const tileOffset = -(cameraX) % tileSpacing;
    for (let x = tileOffset; x < this.width + tileSpacing; x += tileSpacing) {
      ctx.beginPath();
      ctx.moveTo(x - 30, laneMinY);
      ctx.lineTo(x + 50, laneMaxY);
      ctx.stroke();
    }

    // Water puddle reflections along the riverbank
    const puddleOffset = -(cameraX * 0.9) % 320;
    for (let px = puddleOffset; px < this.width; px += 320) {
      const puddleY = laneMinY + 65;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
      ctx.beginPath();
      ctx.ellipse(px, puddleY, 35, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw 2.5D Drop Shadow under characters
  private drawDropShadow(screenX: number, groundY: number, radiusX: number, altitudeZ: number) {
    const ctx = this.ctx;
    ctx.save();

    // Shadow gets fainter and smaller when jumping high
    const shadowFactor = Math.max(0.2, 1 - altitudeZ / 180);
    const radX = radiusX * shadowFactor;
    const radY = radX * 0.35;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * shadowFactor})`;
    ctx.beginPath();
    ctx.ellipse(screenX, groundY, radX, radY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw Hero Inspiring Aura (风雅领域) in 2.5D
  private drawHeroAura25D(
    hero: HeroInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = hero.x - cameraX;
    const groundY = hero.y;
    const ctx = this.ctx;
    ctx.save();

    const scale = this.getDepthScale(hero.y, laneMinY, laneMaxY);
    const radiusX = 220 * scale;
    const radiusY = radiusX * 0.35;

    // Glowing ground ellipse
    ctx.beginPath();
    ctx.ellipse(screenX, groundY, radiusX, radiusY, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(screenX, groundY, radiusX * 0.15, screenX, groundY, radiusX);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
    grad.addColorStop(0.7, 'rgba(56, 189, 248, 0.05)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Calligraphy dash boundary
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([8, 12]);
    ctx.lineDashOffset = -gameTime * 25;
    ctx.beginPath();
    ctx.ellipse(screenX, groundY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // Draw Ink Lotus Trap
  private drawInkLotus(
    trap: InkLotusTrap,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = trap.x - cameraX;
    if (screenX < -100 || screenX > this.width + 100) return;

    const ctx = this.ctx;
    const scale = this.getDepthScale(trap.y, laneMinY, laneMaxY);
    const rx = trap.radius * scale;
    const ry = rx * 0.4;

    ctx.save();
    ctx.translate(screenX, trap.y);

    // Glowing lotus circle
    ctx.strokeStyle = trap.isBloomed ? 'rgba(52, 211, 153, 0.8)' : 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Blossoming Petals
    const numPetals = 8;
    const spin = gameTime * 1.5;
    for (let i = 0; i < numPetals; i++) {
      const angle = (i / numPetals) * Math.PI * 2 + spin;
      const px = Math.cos(angle) * (rx * 0.6);
      const py = Math.sin(angle) * (ry * 0.6);

      ctx.fillStyle = trap.isBloomed ? '#34d399' : '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(px, py, 6 * scale, 3 * scale, angle, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* ============================================================
     火柴人动作系统 v3 —— 程序化姿势引擎
     （三段式攻击 / 双骨 IK / verlet 物理披风 / 剑气轨迹 / 残影 / 冲击环）
     ============================================================ */

  /** 每帧特效状态推进（轨迹/残影/冲击环衰减，dt=0 时自然凝滞） */
  private stepFX(dt: number) {
    if (dt <= 0) return;
    for (let i = this.swordTrail.length - 1; i >= 0; i--) {
      this.swordTrail[i].life -= dt;
      if (this.swordTrail[i].life <= 0) this.swordTrail.splice(i, 1);
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }
    for (let i = this.fxRings.length - 1; i >= 0; i--) {
      this.fxRings[i].life -= dt;
      if (this.fxRings[i].life <= 0) this.fxRings.splice(i, 1);
    }
    if (this.swordTrail.length > 40) this.swordTrail.splice(0, this.swordTrail.length - 40);
    if (this.afterimages.length > 26) this.afterimages.splice(0, this.afterimages.length - 26);
    if (this.fxRings.length > 32) this.fxRings.splice(0, this.fxRings.length - 32);
  }

  /** 双骨肢体绘制（显式两段角度：根角 + 肘弯相对角），返回末端（手）坐标 */
  private drawTwoBoneAngles(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    angleA: number,
    angleB: number,
    len1: number,
    len2: number
  ): { x: number; y: number } {
    const midX = sx + Math.sin(angleA) * len1;
    const midY = sy + Math.cos(angleA) * len1;
    const endX = midX + Math.sin(angleA + angleB) * len2;
    const endY = midY + Math.cos(angleA + angleB) * len2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(midX, midY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    return { x: endX, y: endY };
  }

  /** 英雄 IK 双腿：脚掌目标点驱动，膝盖解剖学前弯，含脚掌 */
  private drawHeroLegsIK(ctx: CanvasRenderingContext2D, pose: StickPose, lw: number, color: string) {
    const legL1 = 15;
    const legL2 = 14.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    // 后腿（远端淡色）
    const ikB = solveIK2(pose.hipX - 1.5, pose.hipY, pose.backFootX, pose.backFootY, legL1, legL2, -1);
    ctx.save();
    ctx.globalAlpha *= 0.68;
    ctx.beginPath();
    ctx.moveTo(pose.hipX - 1.5, pose.hipY);
    ctx.lineTo(ikB.midX, ikB.midY);
    ctx.lineTo(ikB.endX, ikB.endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ikB.endX, ikB.endY);
    ctx.lineTo(ikB.endX + 4.2, ikB.endY + 0.6);
    ctx.stroke();
    ctx.restore();
    // 前腿
    const ikF = solveIK2(pose.hipX + 1.5, pose.hipY, pose.frontFootX, pose.frontFootY, legL1, legL2, -1);
    ctx.beginPath();
    ctx.moveTo(pose.hipX + 1.5, pose.hipY);
    ctx.lineTo(ikF.midX, ikF.midY);
    ctx.lineTo(ikF.endX, ikF.endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ikF.endX, ikF.endY);
    ctx.lineTo(ikF.endX + 4.6, ikF.endY + 0.7);
    ctx.stroke();
  }

  /** verlet 物理披风（跟随与重叠动作原则：惯性拖尾 + 风场 + 布料约束） */
  private updateAndDrawCape(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    dt: number,
    gameTime: number,
    anchorX: number,
    anchorY: number,
    heroVX: number,
    heroVY: number,
    lift: number
  ) {
    if (this.capePts.length === 0) {
      for (let i = 0; i < 5; i++) {
        this.capePts.push({ x: anchorX, y: anchorY + i * 8.5, px: anchorX, py: anchorY + i * 8.5 });
      }
    }
    if (dt > 0) {
      const anchor = this.capePts[0];
      anchor.x = anchorX;
      anchor.y = anchorY;
      anchor.px = anchorX;
      anchor.py = anchorY;
      const gravity = 560 * dt * dt;
      const wind = (Math.sin(gameTime * 2.1) * 22 + Math.sin(gameTime * 0.9 + 2) * 14) * dt * dt;
      for (let i = 1; i < this.capePts.length; i++) {
        const p = this.capePts[i];
        const vx = (p.x - p.px) * 0.965;
        const vy = (p.y - p.py) * 0.965;
        p.px = p.x;
        p.py = p.y;
        p.x += vx + wind - heroVX * dt * dt * 3.2;
        p.y += vy + gravity - heroVY * dt * dt * 2.0 - lift * dt * dt * 260;
      }
      const seg = 8.5;
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 1; i < this.capePts.length; i++) {
          const a = this.capePts[i - 1];
          const b = this.capePts[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (d - seg) / d;
          if (i === 1) {
            b.x -= dx * diff;
            b.y -= dy * diff;
          } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
          }
        }
      }
    }
    // 绘制：墨边 + 白披风双层描边，宽度渐变 + 布料飘动
    const pts = this.capePts;
    ctx.save();
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < pts.length; i++) {
        const wBase = Math.max(1.4, 7.5 - i * 1.15);
        ctx.strokeStyle = pass === 0 ? '#0f172a' : '#f8fafc';
        ctx.lineWidth = pass === 0 ? wBase + 2.4 : wBase;
        const flutter = Math.sin(gameTime * 8 + i * 1.7) * 1.6;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x - cameraX, pts[i - 1].y);
        ctx.lineTo(pts[i].x - cameraX + (i >= 2 ? flutter : 0), pts[i].y + (i >= 2 ? flutter * 0.4 : 0));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 发带 verlet（三节青色缎带，随移动与风力飘扬） */
  private updateAndDrawRibbon(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    dt: number,
    gameTime: number,
    ax: number,
    ay: number,
    heroVX: number,
    heroVY: number
  ) {
    if (this.ribbonPts.length === 0) {
      for (let i = 0; i < 3; i++) {
        this.ribbonPts.push({ x: ax - i * 5.5, y: ay + i * 2, px: ax - i * 5.5, py: ay + i * 2 });
      }
    }
    if (dt > 0) {
      const a0 = this.ribbonPts[0];
      a0.x = ax;
      a0.y = ay;
      a0.px = ax;
      a0.py = ay;
      const gravity = 300 * dt * dt;
      const wind = (Math.sin(gameTime * 3.1) * 34 + Math.sin(gameTime * 1.3) * 18) * dt * dt;
      for (let i = 1; i < this.ribbonPts.length; i++) {
        const p = this.ribbonPts[i];
        const vx = (p.x - p.px) * 0.94;
        const vy = (p.y - p.py) * 0.94;
        p.px = p.x;
        p.py = p.y;
        p.x += vx + wind - heroVX * dt * dt * 4.5;
        p.y += vy + gravity - heroVY * dt * dt * 2.5;
      }
      const seg = 5.5;
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 1; i < this.ribbonPts.length; i++) {
          const a = this.ribbonPts[i - 1];
          const b = this.ribbonPts[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (d - seg) / d;
          if (i === 1) {
            b.x -= dx * diff;
            b.y -= dy * diff;
          } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
          }
        }
      }
    }
    ctx.save();
    ctx.strokeStyle = '#06b6d4';
    ctx.globalAlpha = 0.92;
    ctx.lineCap = 'round';
    const widths = [2.4, 1.9, 1.3];
    for (let i = 1; i < this.ribbonPts.length; i++) {
      ctx.lineWidth = widths[i] || 1.2;
      ctx.beginPath();
      ctx.moveTo(this.ribbonPts[i - 1].x - cameraX, this.ribbonPts[i - 1].y);
      ctx.lineTo(this.ribbonPts[i].x - cameraX, this.ribbonPts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 剑气轨迹带（叠加发光：青色飘带 + 白热内芯，随出剑实时采样） */
  private drawSwordTrail(cameraX: number) {
    const n = this.swordTrail.length;
    if (n < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < n; i++) {
      const a = this.swordTrail[i - 1];
      const b = this.swordTrail[i];
      const alpha = ((a.life + b.life) / 2 / 0.2) * 0.5;
      if (alpha <= 0.02) continue;
      ctx.fillStyle = `rgba(125, 211, 252, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.x - cameraX, a.y);
      ctx.lineTo(a.tx - cameraX, a.ty);
      ctx.lineTo(b.tx - cameraX, b.ty);
      ctx.lineTo(b.x - cameraX, b.y);
      ctx.closePath();
      ctx.fill();
      // 白热内芯
      ctx.strokeStyle = `rgba(240, 250, 255, ${alpha * 0.55})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x * 0.25 + a.tx * 0.75 - cameraX, a.y * 0.25 + a.ty * 0.75);
      ctx.lineTo(b.x * 0.25 + b.tx * 0.75 - cameraX, b.y * 0.25 + b.ty * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 冲刺 / 重击残影（姿势快照幽灵剪影） */
  private drawAfterimages(cameraX: number, laneMinY: number, laneMaxY: number) {
    if (this.afterimages.length === 0) return;
    const ctx = this.ctx;
    for (const g of this.afterimages) {
      const alpha = (g.life / 0.26) * 0.32;
      if (alpha <= 0.015) continue;
      const s = this.getDepthScale(g.gy, laneMinY, laneMaxY);
      ctx.save();
      ctx.translate(g.x - cameraX, g.gy - g.altZ);
      ctx.scale(g.facing * s, s);
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      const p = g.pose;
      // 腿（简化折线）
      ctx.beginPath();
      ctx.moveTo(p.hipX, p.hipY);
      ctx.lineTo(p.hipX + (p.frontFootX - p.hipX) * 0.5, (p.hipY + p.frontFootY) * 0.5);
      ctx.lineTo(p.frontFootX, p.frontFootY);
      ctx.moveTo(p.hipX, p.hipY);
      ctx.lineTo(p.hipX + (p.backFootX - p.hipX) * 0.5, (p.hipY + p.backFootY) * 0.5);
      ctx.lineTo(p.backFootX, p.backFootY);
      // 躯干
      const shX = p.hipX + Math.sin(p.torsoLean) * 22;
      const shY = p.hipY - 22;
      ctx.moveTo(p.hipX, p.hipY);
      ctx.lineTo(shX, shY);
      // 前臂 + 剑
      const ex = shX + Math.sin(p.frontArmA) * 14;
      const ey = shY + Math.cos(p.frontArmA) * 14;
      const hx = ex + Math.sin(p.frontArmA + p.frontArmB) * 14;
      const hy = ey + Math.cos(p.frontArmA + p.frontArmB) * 14;
      ctx.moveTo(shX, shY);
      ctx.lineTo(ex, ey);
      ctx.lineTo(hx, hy);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(p.swordAngle) * 44, hy + Math.sin(p.swordAngle) * 44);
      ctx.stroke();
      // 头
      ctx.beginPath();
      ctx.arc(shX + 2, shY - 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 地效冲击环（落地尘环 / 重击冲击波，flat=椭圆贴地） */
  private drawFxRings(cameraX: number) {
    if (this.fxRings.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    for (const r of this.fxRings) {
      const t = 1 - r.life / r.maxLife;
      const rad = lerp(r.r0, r.r1, easeOutCubic(t));
      ctx.globalAlpha = Math.max(0, 1 - t) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.6, r.lw * (1 - t * 0.55));
      ctx.beginPath();
      if (r.flat) {
        ctx.ellipse(r.x - cameraX, r.y, rad, rad * 0.34, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(r.x - cameraX, r.y, rad, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ============================================================
  // 剑笔仙 · 程序化骨骼渲染 v3
  // ============================================================
  private drawSkeletalHero(
    hero: HeroInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = hero.x - cameraX;
    if (screenX < -160 || screenX > this.width + 160) {
      this.lastHeroX = hero.x;
      return;
    }

    const ctx = this.ctx;
    const groundY = hero.y;
    const altitudeZ = hero.altitudeZ || 0;
    const heroY = groundY - altitudeZ;
    const scale = this.getDepthScale(hero.y, laneMinY, laneMaxY);
    const facing = hero.facing;
    const dt = this.frameDt;
    const prevAltZ = this.lastHeroAltZ;

    // —— 速度估算 / 转身缓冲 / 步态相位 / 落地检测 ——
    if (dt > 0) {
      const rawVX = (hero.x - this.lastHeroX) / dt;
      this.heroVX += (rawVX - this.heroVX) * 0.4;
      if (facing !== this.lastFacing) {
        this.turnBlend = 1;
        this.lastFacing = facing;
      }
      this.turnBlend = Math.max(0, this.turnBlend - dt * 5.5);
      if (hero.state === 'WALK' && hero.isGrounded) {
        this.heroWalkPhase += dt * 11.5;
      }
      // 落地瞬间：挤压 + 尘环（Squash & Stretch 原则）
      if (hero.isGrounded && !this.lastGrounded) {
        const fallV = Math.abs(this.lastFallV);
        this.landSquash = Math.min(0.26, 0.1 + fallV * 0.00045);
        this.fxRings.push({
          x: hero.x,
          y: groundY,
          r0: 5,
          r1: 22 + fallV * 0.035,
          life: 0.34,
          maxLife: 0.34,
          color: 'rgba(203, 213, 225, 0.75)',
          lw: 2.6,
          flat: true,
        });
        if (fallV > 320) {
          for (let i = 0; i < 5; i++) {
            this.fxRings.push({
              x: hero.x + Math.sin(i * 2.4) * 14,
              y: groundY - 2,
              r0: 2,
              r1: 7 + (i % 3) * 4,
              life: 0.3,
              maxLife: 0.3,
              color: 'rgba(71, 85, 105, 0.55)',
              lw: 1.6,
              flat: true,
            });
          }
        }
      }
      this.lastGrounded = hero.isGrounded;
      this.landSquash = Math.max(0, this.landSquash - dt);
    }
    this.lastFallV = hero.vz || 0;
    this.lastHeroX = hero.x;
    this.lastHeroAltZ = altitudeZ;

    // —— 目标姿势 → 指数平滑混合（帧率无关，攻击出手段加速跟随） ——
    const targetPose = computeHeroPose(hero.state, hero.stateTime, gameTime, this.heroWalkPhase, hero.vz || 0);

    if (this.landSquash > 0) {
      const k = this.landSquash / 0.26;
      targetPose.squashY *= 1 - 0.15 * k;
      targetPose.squashX *= 1 + 0.13 * k;
    }
    if (!hero.isGrounded && (hero.vz || 0) > 140) {
      targetPose.squashY *= 1.045;
      targetPose.squashX *= 0.965;
    }
    if (this.turnBlend > 0) {
      targetPose.squashX *= 1 - 0.12 * Math.sin(this.turnBlend * Math.PI);
    }

    const striking = hero.state.startsWith('ATTACK_') && targetPose.trailEmit > 0.35;
    const blendRate = striking ? 30 : hero.state.startsWith('ATTACK_') || hero.state === 'SKILL_DASH' ? 24 : 17;
    this.heroPose = lerpPose(this.heroPose, targetPose, expoBlend(blendRate, Math.max(dt, 1 / 240)));
    const pose = this.heroPose;

    // —— 三式重斩命中瞬间：剑尖冲击波 ——
    if (dt > 0) {
      if (this.prevTrailEmit < 0.85 && pose.trailEmit >= 0.85 && hero.state === 'ATTACK_3') {
        this.fxRings.push({
          x: hero.x + facing * 40,
          y: groundY - 30,
          r0: 4,
          r1: 30,
          life: 0.28,
          maxLife: 0.28,
          color: 'rgba(186, 230, 253, 0.9)',
          lw: 3,
          flat: false,
        });
      }
      this.prevTrailEmit = pose.trailEmit;
    }

    // —— 剑刃世界坐标（轨迹 / 残影采样点） ——
    const shLX = pose.hipX + Math.sin(pose.torsoLean) * 22;
    const shLY = pose.hipY - 22;
    const elbX = shLX + Math.sin(pose.frontArmA) * 14;
    const elbY = shLY + Math.cos(pose.frontArmA) * 14;
    const handLX = elbX + Math.sin(pose.frontArmA + pose.frontArmB) * 14;
    const handLY = elbY + Math.cos(pose.frontArmA + pose.frontArmB) * 14;
    const tipLX = handLX + Math.cos(pose.swordAngle) * 46;
    const tipLY = handLY + Math.sin(pose.swordAngle) * 46;
    const handWX = hero.x + handLX * facing * scale;
    const handWY = heroY + handLY * scale;
    const tipWX = hero.x + tipLX * facing * scale;
    const tipWY = heroY + tipLY * scale;

    // —— 剑气轨迹采样 ——
    if (dt > 0 && pose.trailEmit > 0.08) {
      this.swordTrail.push({ x: handWX, y: handWY, tx: tipWX, ty: tipWY, life: 0.2 });
    }

    // —— 残影采样（重击挥砍 / 冲刺瞬移路径补插） ——
    if (dt > 0 && (pose.trailEmit > 0.55 || hero.state === 'SKILL_DASH')) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.048;
        const jumped = Math.abs(hero.x - this.lastGhostX);
        if (hero.state === 'SKILL_DASH' && jumped > 40) {
          const steps = Math.min(5, Math.max(2, Math.round(jumped / 55)));
          for (let i = 1; i <= steps; i++) {
            this.afterimages.push({
              x: lerp(this.lastGhostX, hero.x, i / (steps + 1)),
              gy: groundY,
              altZ: altitudeZ,
              facing,
              pose: clonePose(pose),
              life: 0.26,
            });
          }
        } else {
          this.afterimages.push({
            x: hero.x,
            gy: groundY,
            altZ: altitudeZ,
            facing,
            pose: clonePose(pose),
            life: 0.26,
          });
        }
      }
    }
    if (dt > 0) this.lastGhostX = hero.x;

    // 1. 地面投影
    this.drawDropShadow(screenX, groundY, 24 * scale, altitudeZ);

    // 2. 地效冲击环
    this.drawFxRings(cameraX);

    // 3. 残影（本体之下）
    this.drawAfterimages(cameraX, laneMinY, laneMaxY);

    // 4. 剑气轨迹带
    this.drawSwordTrail(cameraX);

    // 5. 披风 + 发带（世界空间物理模拟，画于身体之后）
    const anchorWX = hero.x + shLX * facing * scale;
    const anchorWY = heroY + shLY * scale;
    const heroVY = dt > 0 ? (prevAltZ - altitudeZ) / dt : 0;
    this.updateAndDrawCape(ctx, cameraX, dt, gameTime, anchorWX, anchorWY, this.heroVX, heroVY, pose.capeLift);
    const headLX = shLX + 2 + pose.headTilt * 0.5;
    const headLY = shLY - 14;
    const knotWX = hero.x + headLX * facing * scale;
    const knotWY = heroY + (headLY - 10) * scale;
    this.updateAndDrawRibbon(ctx, cameraX, dt, gameTime, knotWX, knotWY, this.heroVX, heroVY);

    // 6. 身体（局部空间：原点=脚底）
    ctx.save();
    ctx.translate(screenX, heroY);

    const flinchK = hero.flinchTimer > 0 ? Math.min(1, hero.flinchTimer / 0.35) : 0;
    ctx.rotate(-0.13 * flinchK + pose.bodyTilt);
    ctx.translate(-4 * flinchK, 0);
    ctx.scale(facing * scale * pose.squashX, scale * pose.squashY);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 后臂（远端淡色，先画）
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.6;
    this.drawTwoBoneAngles(ctx, shLX, shLY, pose.backArmA, pose.backArmB, 13, 13);

    // 双腿（IK 步态）
    this.drawHeroLegsIK(ctx, pose, 4.2, '#09090b');

    // 躯干
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(pose.hipX, pose.hipY);
    ctx.lineTo(shLX, shLY);
    ctx.stroke();

    // 玉色腰封
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(pose.hipX - 6, pose.hipY - 4.5, 12, 4.2);

    // 头 + 发髻
    const headX = shLX + 2 + pose.headTilt * 0.5;
    const headY = shLY - 14;
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(headX, headY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX, headY - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // 7. 前臂 + 墨锋
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 4.2;
    const hand = this.drawTwoBoneAngles(ctx, shLX, shLY, pose.frontArmA, pose.frontArmB, 14, 14);
    this.drawBrushSword(ctx, hand.x, hand.y, pose.swordAngle, pose.swordGlow);

    // 8. 攻击墨痕弧光（随挥砍相位淡出）
    if (hero.state.startsWith('ATTACK_') && pose.trailEmit > 0.12) {
      ctx.save();
      ctx.globalAlpha = pose.trailEmit * 0.85;
      if (hero.state === 'ATTACK_1') {
        this.drawInkSlashArc(ctx, shLX, shLY, 46, -1.15, 0.55, '125, 211, 252');
      } else if (hero.state === 'ATTACK_2') {
        this.drawInkSlashArc(ctx, shLX, shLY, 42, -1.35, 0.15, '125, 211, 252');
      } else if (hero.state === 'ATTACK_3') {
        this.drawInkSlashArc(ctx, shLX, shLY, 50, 0.1, 1.4, '125, 211, 252');
      }
      ctx.restore();
    }

    // 9. 冲刺速度线
    if (hero.state === 'SKILL_DASH') {
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
      ctx.lineWidth = 1.6;
      const seed = Math.floor(gameTime * 24);
      for (let i = 0; i < 5; i++) {
        const ly = -10 - ((seed * 13 + i * 29) % 46);
        const ln = 16 + ((seed + i * 7) % 22);
        ctx.beginPath();
        ctx.moveTo(-34 - ln - i * 6, ly);
        ctx.lineTo(-34 - i * 6, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 10. 护盾（旋转刻痕穹顶）
    if (hero.shieldHp > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -gameTime * 30;
      ctx.beginPath();
      ctx.arc(0, pose.hipY - 10, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // 头顶 HUD
    this.drawHeroOverheadHUD(screenX, heroY - 84 * scale, hero, scale);
  }

  /** Luminous Ink Slash Ribbon Arc（支持敌我配色） */
  private drawInkSlashArc(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    rgb: string = '56, 189, 248'
  ) {
    ctx.save();
    const arcGrad = ctx.createRadialGradient(originX, originY, radius * 0.55, originX, originY, radius);
    arcGrad.addColorStop(0, `rgba(${rgb}, 0)`);
    arcGrad.addColorStop(0.72, `rgba(${rgb}, 0.75)`);
    arcGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');

    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(originX, originY, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  }

  /** 墨锋剑（辉光强度 0-1 驱动剑锋光晕） */
  private drawBrushSword(
    ctx: CanvasRenderingContext2D,
    handX: number,
    handY: number,
    angle: number,
    glow: number
  ) {
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle);

    // 剑柄 & 玉格
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-5, -2, 8, 4);
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 光辉剑刃
    const bladeGrad = ctx.createLinearGradient(0, 0, 46, 0);
    bladeGrad.addColorStop(0, '#f8fafc');
    bladeGrad.addColorStop(0.7, '#38bdf8');
    bladeGrad.addColorStop(1, '#0284c7');

    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(36, -1.6);
    ctx.lineTo(46, 0);
    ctx.lineTo(36, 1.6);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();

    // 剑锋辉光
    if (glow > 0.18) {
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6 + glow * 16;
      ctx.fillStyle = `rgba(125, 211, 252, ${0.25 + glow * 0.5})`;
      ctx.beginPath();
      ctx.arc(46, 0, 2.5 + glow * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }


  // ============================================================
  // 骸影军团 · 程序化动作 v3（IK 行走 + 攻击三段式 + 兵种专属演出）
  // ============================================================

  /** 单位攻击阶段：命中后经过的秒数（由攻击冷却倒计时推算），未在攻击节奏返回 -1 */
  private unitStrikeSince(unit: UnitInstance): number {
    const cfg = UNIT_CONFIGS[unit.type];
    const cdMax = 1 / Math.max(0.1, cfg.attackSpeed);
    if (unit.attackCooldown <= 0) return -1;
    return cdMax - unit.attackCooldown;
  }

  /** 单位 IK 双腿（行走步迹 / 站姿，膝盖前弯） */
  private drawUnitLegsIK(
    ctx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    f: { x: number; y: number },
    b: { x: number; y: number },
    len: number,
    lw: number,
    color: string
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    const ikF = solveIK2(hipX + 1.2, hipY, f.x, f.y, len, len, -1);
    const ikB = solveIK2(hipX - 1.2, hipY, b.x, b.y, len, len, -1);
    // 后腿（远端淡色）
    ctx.save();
    ctx.globalAlpha *= 0.68;
    ctx.beginPath();
    ctx.moveTo(hipX - 1.2, hipY);
    ctx.lineTo(ikB.midX, ikB.midY);
    ctx.lineTo(ikB.endX, ikB.endY);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(hipX + 1.2, hipY);
    ctx.lineTo(ikF.midX, ikF.midY);
    ctx.lineTo(ikF.endX, ikF.endY);
    ctx.stroke();
  }

  /** 单位短刃（折柳剑客佩剑，敌我描边配色） */
  private drawShortBlade(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, accent: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(2, -1.2);
    ctx.lineTo(17, -1.2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw Skeletal Soldiers, Minions & Bosses in 2.5D（程序化动作 v3）
  private drawSkeletalUnit(
    unit: UnitInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = unit.x - cameraX;
    if (screenX < -140 || screenX > this.width + 140) return;

    const ctx = this.ctx;
    const groundY = unit.y;
    const altitudeZ = unit.altitudeZ || 0;
    const unitY = groundY - altitudeZ;
    const baseScale = this.getDepthScale(unit.y, laneMinY, laneMaxY);
    const scale = baseScale * (unit.isBoss ? 1.32 : 1);
    const facing = unit.facing;
    const isEnemy = unit.isEnemy;
    const dt = this.frameDt;
    const TAU = Math.PI * 2;

    // 1. Drop shadow on ground
    this.drawDropShadow(screenX, groundY, 18 * scale, altitudeZ);

    // 1.5 Boss 二阶段狂暴暗红气场
    if (unit.isBoss && unit.enraged) {
      const pulse = 0.55 + Math.sin(gameTime * 7) * 0.2;
      const auraGrad = ctx.createRadialGradient(
        screenX,
        unitY - 30 * scale,
        8,
        screenX,
        unitY - 30 * scale,
        62 * scale
      );
      auraGrad.addColorStop(0, `rgba(220, 38, 38, ${0.34 * pulse})`);
      auraGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(screenX, unitY - 30 * scale, 62 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // —— 步态相位累积（per-unit 池，避免起步脚底突变） ——
    let fx = this.unitFx.get(unit);
    if (!fx) {
      fx = { walkPhase: unit.limbPhase || Math.random() * Math.PI * 2 };
      this.unitFx.set(unit, fx);
    }
    const walking = unit.state === 'WALK' || unit.state === 'RETREAT';
    if (dt > 0 && walking) {
      const freq = Math.max(5, unit.speed * 0.075) * (unit.state === 'RETREAT' ? 1.25 : 1);
      fx.walkPhase += dt * freq;
    }
    const step = walking ? computeWalkStep(fx.walkPhase, 8, 6) : null;
    const footF = step ? { x: step.fx, y: step.fy } : { x: 4.5, y: 0 };
    const footB = step ? { x: step.bx, y: step.by } : { x: -5.5, y: 0 };
    const armSwing = step ? Math.sin(fx.walkPhase) * 0.4 : 0;
    const bob = step ? step.hipLift : Math.sin(gameTime * 2.4 + (unit.limbPhase || 0)) * 1.1;
    const since = unit.state === 'ATTACK' ? this.unitStrikeSince(unit) : -1;

    ctx.save();
    ctx.translate(screenX, unitY);
    ctx.scale(facing * scale, scale);

    // 受击踉跄（旋转 + 后移）
    const flinchK = unit.flinchTimer > 0 ? Math.min(1, unit.flinchTimer / 0.3) : 0;
    if (flinchK > 0) {
      ctx.rotate(-0.14 * flinchK);
      ctx.translate(-4 * flinchK, 0);
    }

    const mainColor = isEnemy ? '#18181b' : '#09090b';
    const accentColor = isEnemy ? '#ef4444' : '#06b6d4';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (unit.type) {
      /* ------------------------------------------------ 采墨侍：负罐佝偻 + 舀墨倾倒 ------------------------------------------------ */
      case 'SCRIBE': {
        const hipY = -18 + bob;
        this.drawUnitLegsIK(ctx, 0, hipY, footF, footB, 10, 3, mainColor);
        const lean = walking ? 0.12 : 0.05;
        const shX = Math.sin(lean) * 15;
        const shY = hipY - 15;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(shX, shY);
        ctx.stroke();
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(shX + 1, shY - 7, 5.8, 0, TAU);
        ctx.fill();
        // 后臂随步伐摆动
        ctx.lineWidth = 2.8;
        this.drawTwoBoneAngles(ctx, shX, shY, 0.35 + armSwing * 0.5, 0.4, 7, 7);
        // 墨罐（满罐发光）
        const full = (unit.carriedInk || 0) > 0;
        ctx.fillStyle = full ? accentColor : '#57534e';
        if (full) {
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 8;
        }
        const jarY = hipY - 10;
        ctx.fillRect(-12.2, jarY - 7, 6.5, 11);
        ctx.shadowBlur = 0;
        if (unit.state === 'MINE') {
          // 采墨：俯身向泉舀墨 + 墨滴下坠
          const dip = Math.sin(gameTime * 5) * 0.5 + 0.5;
          const pe = this.drawTwoBoneAngles(ctx, shX, shY, 1.15 + dip * 0.25, 0.35, 8, 8);
          for (let i = 0; i < 3; i++) {
            const dropT = (gameTime * 1.6 + i * 0.33) % 1;
            ctx.globalAlpha = 1 - dropT;
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.arc(pe.x + 1, pe.y + 4 + dropT * 14, 1.6, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else {
          // 前臂随步伐反向摆
          ctx.lineWidth = 2.8;
          this.drawTwoBoneAngles(ctx, shX, shY, 0.5 - armSwing * 0.5, 0.45, 8, 8);
        }
        break;
      }

      /* ------------------------------------------------ 折柳剑客：三段挥砍（蓄 → 斩 → 收） ------------------------------------------------ */
      case 'SWORD': {
        const hipY = -22 + bob;
        this.drawUnitLegsIK(ctx, 0, hipY, footF, footB, 12, 3.1, mainColor);
        let lean = walking ? 0.12 : 0.04;
        let hipOff = 0;
        let swordA = 0.55;
        let handA = 0.5;
        let handB = 0.45;
        if (since >= 0) {
          const WIND = 0.13;
          const HIT = 0.24;
          const REC = 0.45;
          if (since < WIND) {
            const t = easeOutQuad(since / WIND);
            lean = lerp(0.04, -0.2, t);
            hipOff = lerp(0, -2, t);
            handA = lerp(0.5, -1.3, t);
            handB = 0.7;
            swordA = lerp(0.55, -1.9, t);
          } else if (since < HIT) {
            const t = easeOutCubic((since - WIND) / (HIT - WIND));
            lean = lerp(-0.2, 0.34, t);
            hipOff = lerp(-2, 4, t);
            handA = lerp(-1.3, 1.15, t);
            handB = lerp(0.7, 0.1, t);
            swordA = lerp(-1.9, 0.9, t);
            ctx.save();
            ctx.globalAlpha = 0.8;
            this.drawInkSlashArc(ctx, 4, hipY - 16, 26, -1.2, 0.7, isEnemy ? '252, 165, 165' : '125, 211, 252');
            ctx.restore();
          } else if (since < REC) {
            const t = easeInOutQuad(clamp01((since - HIT) / (REC - HIT)));
            lean = lerp(0.34, 0.05, t);
            hipOff = lerp(4, 0, t);
            handA = lerp(1.15, 0.5, t);
            handB = lerp(0.1, 0.45, t);
            swordA = lerp(0.9, 0.55, t);
          }
        }
        const shX = Math.sin(lean) * 19 + hipOff;
        const shY = hipY - 19;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(hipOff, hipY);
        ctx.lineTo(shX, shY);
        ctx.stroke();
        // 头 + 斗笠
        const headX = shX + 1.5;
        const headY = shY - 7;
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(headX, headY, 6.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.moveTo(headX - 12, headY - 7);
        ctx.lineTo(headX, headY - 13.5);
        ctx.lineTo(headX + 12, headY - 7);
        ctx.closePath();
        ctx.fill();
        // 后臂摆
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.9;
        this.drawTwoBoneAngles(ctx, shX, shY, -0.2 - armSwing * 0.6, 0.35, 8.5, 8.5);
        // 持剑臂 + 短刃
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.1;
        const hand = this.drawTwoBoneAngles(ctx, shX, shY, handA, handB, 9, 9);
        this.drawShortBlade(ctx, hand.x, hand.y, swordA, accentColor);
        break;
      }

      /* ------------------------------------------------ 抚竹射手：搭箭 → 满弦 → 撒放震颤 ------------------------------------------------ */
      case 'ARCHER': {
        const hipY = -22 + bob;
        this.drawUnitLegsIK(ctx, 0, hipY, footF, footB, 12, 3.1, mainColor);
        const cdMax = 1 / Math.max(0.1, UNIT_CONFIGS.ARCHER.attackSpeed);
        let draw = 0;
        let snap = 0;
        let lean = walking ? 0.1 : 0.03;
        if (since >= 0) {
          if (since < 0.09) {
            snap = 1 - since / 0.09;
          } else {
            draw = easeInOutQuad(clamp01((since - 0.12) / (cdMax * 0.72)));
          }
        }
        lean += draw * 0.06 - snap * 0.12;
        const shX = Math.sin(lean) * 19;
        const shY = hipY - 19;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(shX, shY);
        ctx.stroke();
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(shX + 1.5, shY - 7, 6.2, 0, TAU);
        ctx.fill();
        // 弓（前臂伸直持弓）
        const bowX = shX + 13;
        const bowY = shY - 2;
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(bowX, bowY, 16, -Math.PI * 0.44, Math.PI * 0.44);
        ctx.stroke();
        // 弓弦（拉弓 V 形后引 / 撒放震颤）
        const tipY = 16 * Math.sin(Math.PI * 0.44);
        const restX = bowX + 16 * Math.cos(Math.PI * 0.44);
        const pullX = restX - draw * 13 - snap * Math.sin(gameTime * 60) * 2.5;
        ctx.strokeStyle = snap > 0 ? 'rgba(226, 232, 240, 0.95)' : '#d6d3d1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(restX, bowY - tipY);
        ctx.lineTo(pullX, bowY);
        ctx.lineTo(restX, bowY + tipY);
        ctx.stroke();
        // 箭（满弦搭箭）
        if (draw > 0.25) {
          ctx.strokeStyle = '#a8a29e';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(pullX, bowY);
          ctx.lineTo(restX + 14, bowY);
          ctx.stroke();
          ctx.fillStyle = '#e7e5e4';
          ctx.beginPath();
          ctx.moveTo(restX + 14, bowY - 2.4);
          ctx.lineTo(restX + 19, bowY);
          ctx.lineTo(restX + 14, bowY + 2.4);
          ctx.closePath();
          ctx.fill();
        }
        // 拉弦手
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(shX, shY);
        ctx.lineTo(pullX - 1, bowY);
        ctx.stroke();
        // 撒放弓光
        if (snap > 0) {
          ctx.save();
          ctx.globalAlpha = snap * 0.9;
          this.drawInkSlashArc(ctx, bowX, bowY, 22, -0.5, 0.5, isEnemy ? '252, 165, 165' : '134, 239, 172');
          ctx.restore();
        }
        break;
      }

      /* ------------------------------------------------ 墨岩卫：举盾蓄力 → 盾击前撞 → 长戈横扫 ------------------------------------------------ */
      case 'GUARDIAN': {
        const hipY = -24 + bob * 0.7;
        this.drawUnitLegsIK(ctx, 0, hipY, footF, footB, 13, 4.2, mainColor);
        let lean = walking ? 0.08 : 0.02;
        let hipOff = 0;
        let shieldLift = 0;
        let shieldX = 9;
        let halberdA = -1.35;
        if (since >= 0) {
          const BASH = 0.24;
          const SWEEP = 0.55;
          const REC = 0.85;
          if (since < 0.16) {
            const t = easeOutQuad(since / 0.16);
            lean = lerp(0.02, -0.14, t);
            hipOff = -2 * t;
            shieldLift = t;
          } else if (since < BASH) {
            const t = easeOutCubic((since - 0.16) / (BASH - 0.16));
            lean = lerp(-0.14, 0.3, t);
            hipOff = lerp(-2, 5, t);
            shieldLift = 1;
            shieldX = 9 + t * 9;
          } else if (since < SWEEP) {
            const t = easeOutCubic((since - BASH) / (SWEEP - BASH));
            halberdA = lerp(-1.5, 0.75, t);
            shieldX = 14 - t * 4;
            lean = lerp(0.3, 0.18, t);
            hipOff = lerp(5, 3, t);
            ctx.save();
            ctx.globalAlpha = t * 0.75;
            this.drawInkSlashArc(ctx, 6, hipY - 24, 30, -1.35, 0.65, isEnemy ? '252, 165, 165' : '125, 211, 252');
            ctx.restore();
          } else if (since < REC) {
            const t = easeInOutQuad(clamp01((since - SWEEP) / (REC - SWEEP)));
            halberdA = lerp(0.75, -1.35, t);
            shieldX = lerp(10, 9, t);
            lean = lerp(0.18, 0.02, t);
            hipOff = lerp(3, 0, t);
          }
        }
        const shX = Math.sin(lean) * 20 + hipOff;
        const shY = hipY - 20;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 4.4;
        ctx.beginPath();
        ctx.moveTo(hipOff, hipY);
        ctx.lineTo(shX, shY);
        ctx.stroke();
        // 头
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(shX + 1.5, shY - 8, 7.6, 0, TAU);
        ctx.fill();
        // Boss 冠饰（三尖刺冠）
        if (unit.isBoss) {
          ctx.fillStyle = accentColor;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(shX + 1.5 + i * 5 - 2, shY - 13);
            ctx.lineTo(shX + 1.5 + i * 5, shY - 21 - (i === 0 ? 4 : 0));
            ctx.lineTo(shX + 1.5 + i * 5 + 2, shY - 13);
            ctx.closePath();
            ctx.fill();
          }
        }
        // 持盾臂
        const shieldCY = shY + 14 - shieldLift * 16;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(shX, shY);
        ctx.lineTo(shX + shieldX - 1, shieldCY);
        ctx.stroke();
        // 巨盾
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(shX + shieldX - 1, shieldCY - 26, 15, 52, 3);
        ctx.fill();
        ctx.stroke();
        // 盾面纹
        ctx.strokeStyle = isEnemy ? 'rgba(239, 68, 68, 0.5)' : 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(shX + shieldX + 6.5, shieldCY - 17);
        ctx.lineTo(shX + shieldX + 6.5, shieldCY + 17);
        ctx.stroke();
        // 长戈（握点 + 戈杆 + 戈刃）
        const gripX = shX - 2;
        const gripY = shY + 6;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(shX, shY);
        ctx.lineTo(gripX, gripY);
        ctx.stroke();
        const dirX = Math.cos(halberdA);
        const dirY = Math.sin(halberdA);
        const poleEndX = gripX + dirX * 52;
        const poleEndY = gripY + dirY * 52;
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(gripX - dirX * 14, gripY - dirY * 14);
        ctx.lineTo(poleEndX, poleEndY);
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(poleEndX + dirX * 2, poleEndY + dirY * 2);
        ctx.lineTo(poleEndX + dirX * 10 - dirY * 3.5, poleEndY + dirY * 10 + dirX * 3.5);
        ctx.lineTo(poleEndX + dirX * 14, poleEndY + dirY * 14);
        ctx.lineTo(poleEndX + dirX * 10 + dirY * 3.5, poleEndY + dirY * 10 - dirX * 3.5);
        ctx.closePath();
        ctx.fill();
        break;
      }

      /* ------------------------------------------------ 鸣筝琴师：悬浮裙摆 + 琴弦振颤 + 拨弦音环 ------------------------------------------------ */
      case 'HARPIST': {
        const hover = Math.sin(gameTime * 2.6 + (unit.limbPhase || 0)) * 4;
        const sway = Math.sin(gameTime * 1.8 + (unit.limbPhase || 0)) * 0.06;
        const baseY = -34 + hover;
        // 裙摆（波浪下缘）
        ctx.fillStyle = mainColor;
        const hemWave = Math.sin(gameTime * 3.2) * 2.5;
        ctx.beginPath();
        ctx.moveTo(Math.sin(sway) * 10, baseY - 26);
        ctx.lineTo(-11 + hemWave, baseY + 8);
        ctx.quadraticCurveTo(0, baseY + 12, 11 + hemWave * 0.6, baseY + 8);
        ctx.closePath();
        ctx.fill();
        // 躯干
        const shX = Math.sin(sway) * 10 + 2;
        const shY = baseY - 26;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(shX, shY + 2);
        ctx.lineTo(shX + Math.sin(sway) * 4, shY - 10);
        ctx.stroke();
        // 头 + 发簪
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(shX + 1, shY - 16, 6.4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(shX + 1, shY - 22);
        ctx.lineTo(shX + 7 + Math.sin(gameTime * 2.2) * 1.5, shY - 26);
        ctx.stroke();
        // 古琴 + 四弦（拨弦后振颤衰减）
        const zX = shX + 12;
        const zY = shY - 2;
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.roundRect(zX - 2, zY - 4, 26, 9, 2);
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 0.8;
        const strumAmp = since >= 0 ? Math.max(0, 1 - since * 3) : 0;
        for (let i = 0; i < 4; i++) {
          const sy = zY - 2.6 + i * 1.8;
          ctx.beginPath();
          ctx.moveTo(zX, sy);
          ctx.lineTo(zX + 22, sy + Math.sin(gameTime * 40 + i * 2) * strumAmp * 1.8);
          ctx.stroke();
        }
        // 拨弦手扫过琴弦 + 音环
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.8;
        if (since >= 0 && since < 0.3) {
          const t = since / 0.3;
          const sweep = lerp(0.2, 1.1, easeOutCubic(t));
          this.drawTwoBoneAngles(ctx, shX, shY - 4, sweep, 0.5, 7.5, 7.5);
          ctx.save();
          ctx.globalAlpha = 1 - t;
          this.drawInkSlashArc(ctx, zX + 10, zY, 12 + t * 10, -0.6, 0.6, '252, 211, 77');
          ctx.restore();
        } else {
          this.drawTwoBoneAngles(ctx, shX, shY - 4, 0.55, 0.55, 7.5, 7.5);
        }
        break;
      }
    }

    ctx.restore();

    // Overhead HP Bar（Boss 抬高避让冠饰）
    this.drawUnitHpBar(screenX, unitY - (unit.isBoss ? 66 : 56) * scale, unit, scale);
  }


  // Draw Ancient Ink Well in 2.5D
  private drawInkWell(
    screenX: number,
    wellY: number,
    laneMinY: number,
    laneMaxY: number,
    inkRemaining: number,
    gameTime: number
  ) {
    if (screenX < -150 || screenX > this.width + 150) return;
    const ctx = this.ctx;
    const scale = this.getDepthScale(wellY, laneMinY, laneMaxY);

    ctx.save();
    ctx.translate(screenX, wellY);

    // Glowing pool
    const pulse = Math.sin(gameTime * 3) * 0.15 + 0.85;
    const glowGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 48 * scale);
    glowGrad.addColorStop(0, 'rgba(45, 212, 191, 0.45)');
    glowGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 48 * scale, 20 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stone Pedestal
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(0, 0, 32 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner Pool
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Floating Rune
    const runeY = -28 * scale + Math.sin(gameTime * 2.5) * 6;
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.moveTo(0, runeY - 14 * scale);
    ctx.lineTo(10 * scale, runeY);
    ctx.lineTo(0, runeY + 14 * scale);
    ctx.lineTo(-10 * scale, runeY);
    ctx.closePath();
    ctx.fill();

    // Title label
    ctx.fillStyle = '#f5f5f4';
    ctx.font = '600 11px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('灵墨泉', 0, runeY - 20 * scale);

    ctx.restore();
  }

  // Draw Player Citadel
  private drawPlayerCitadel(
    screenX: number,
    baseY: number,
    hp: number,
    maxHp: number,
    gameTime: number
  ) {
    if (screenX < -300 || screenX > this.width + 100) return;
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    ctx.fillRect(screenX - 90, baseY - 50, 120, 50);

    // Eaves 1
    ctx.beginPath();
    ctx.moveTo(screenX - 120, baseY - 50);
    ctx.quadraticCurveTo(screenX - 30, baseY - 65, screenX + 40, baseY - 50);
    ctx.lineTo(screenX + 25, baseY - 75);
    ctx.lineTo(screenX - 105, baseY - 75);
    ctx.closePath();
    ctx.fill();

    // Floor 2
    ctx.fillRect(screenX - 80, baseY - 115, 95, 40);

    // Eaves 2
    ctx.beginPath();
    ctx.moveTo(screenX - 105, baseY - 115);
    ctx.quadraticCurveTo(screenX - 35, baseY - 132, screenX + 30, baseY - 115);
    ctx.lineTo(screenX + 18, baseY - 138);
    ctx.lineTo(screenX - 90, baseY - 138);
    ctx.closePath();
    ctx.fill();

    // Spire
    ctx.beginPath();
    ctx.moveTo(screenX - 85, baseY - 170);
    ctx.lineTo(screenX - 32, baseY - 220);
    ctx.lineTo(screenX + 20, baseY - 170);
    ctx.closePath();
    ctx.fill();

    this.drawBuildingHpBar(screenX - 35, baseY - 235, hp, maxHp, '翰墨圣阁', '#38bdf8');
    ctx.restore();
  }

  // Draw Enemy Citadel
  private drawEnemyCitadel(
    screenX: number,
    baseY: number,
    hp: number,
    maxHp: number,
    gameTime: number,
    bossName?: string
  ) {
    if (screenX < -100 || screenX > this.width + 300) return;
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(screenX - 50, baseY);
    ctx.lineTo(screenX - 70, baseY - 90);
    ctx.lineTo(screenX - 35, baseY - 170);
    ctx.lineTo(screenX, baseY - 245);
    ctx.lineTo(screenX + 45, baseY - 160);
    ctx.lineTo(screenX + 70, baseY - 85);
    ctx.lineTo(screenX + 50, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crimson glowing runic cracks
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(screenX, baseY - 225);
    ctx.lineTo(screenX - 15, baseY - 160);
    ctx.lineTo(screenX + 10, baseY - 110);
    ctx.lineTo(screenX - 8, baseY - 50);
    ctx.stroke();

    this.drawBuildingHpBar(
      screenX,
      baseY - 260,
      hp,
      maxHp,
      bossName ? `幽影中枢 · ${bossName}` : '玄墨碑阙',
      '#ef4444'
    );
    ctx.restore();
  }

  private drawBuildingHpBar(
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    title: string,
    barColor: string
  ) {
    const ctx = this.ctx;
    const barW = 120;
    const barH = 7;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x, y - 6);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, y, barW, barH, 3);
    ctx.fill();

    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, y, barW * ratio, barH, 3);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Plus Jakarta Sans", monospace';
    ctx.fillText(`${Math.ceil(hp)} / ${maxHp}`, x, y + barH + 11);
  }

  private drawHeroOverheadHUD(x: number, y: number, hero: HeroInstance, scale: number) {
    const ctx = this.ctx;
    ctx.save();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('云砚 · 剑笔仙', x, y);

    const barW = 60 * scale;
    const barH = 5 * scale;
    const hpRatio = Math.max(0, Math.min(1, hero.hp / hero.maxHp));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, y + 4, barW, barH, 2);
    ctx.fill();

    ctx.fillStyle = hpRatio > 0.3 ? '#22c55e' : '#ef4444';
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, y + 4, barW * hpRatio, barH, 2);
    ctx.fill();

    if (hero.shieldHp > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x - barW / 2, y + 1, barW * Math.min(1, hero.shieldHp / 250), 2);
    }

    ctx.restore();
  }

  private drawUnitHpBar(x: number, y: number, unit: UnitInstance, scale: number) {
    const ctx = this.ctx;
    const barW = (unit.type === 'GUARDIAN' ? 44 : 32) * scale;
    const barH = 3.5 * scale;
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(x - barW / 2, y, barW, barH);

    ctx.fillStyle = unit.isEnemy ? '#ef4444' : '#22c55e';
    ctx.fillRect(x - barW / 2, y, barW * ratio, barH);
    ctx.restore();
  }

  // Draw Flying Projectiles
  private drawProjectile(
    proj: Projectile,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number
  ) {
    const screenX = proj.x - cameraX;
    if (screenX < -50 || screenX > this.width + 50) return;

    const ctx = this.ctx;
    const altitudeZ = proj.altitudeZ || 0;
    const screenY = proj.y - altitudeZ;
    const scale = this.getDepthScale(proj.y, laneMinY, laneMaxY);

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(scale, scale);

    const angle = Math.atan2(proj.vy, proj.vx);
    ctx.rotate(angle);

    if (proj.type === 'ARROW') {
      ctx.strokeStyle = proj.isEnemy ? '#ef4444' : '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(14, 0);
      ctx.lineTo(8, 3);
      ctx.closePath();
      ctx.fill();
    } else if (proj.type === 'QUILL') {
      const quillGrad = ctx.createLinearGradient(-24, 0, 12, 0);
      quillGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
      quillGrad.addColorStop(1, '#facc15');

      ctx.strokeStyle = quillGrad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(12, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.type === 'SOUNDWAVE') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw Particles
  private drawParticle(p: Particle, cameraX: number) {
    const screenX = p.x - cameraX;
    if (screenX < -50 || screenX > this.width + 50) return;

    const ctx = this.ctx;
    const screenY = p.y - (p.altitudeZ || 0);

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);

    if (p.type === 'PETAL') {
      ctx.translate(screenX, screenY);
      ctx.rotate(p.rotation || 0);
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.5, p.size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'SNOW') {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'BAMBOO') {
      ctx.translate(screenX, screenY);
      ctx.rotate(p.rotation || 0);
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 2, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'STAR') {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw Red Calligraphy Seal Stamps ("绝", "断", "阵", "妙", "斩")
  private drawSealStamp(stamp: SealStamp, cameraX: number) {
    const screenX = stamp.x - cameraX;
    if (screenX < -50 || screenX > this.width + 50) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, stamp.alpha);
    ctx.translate(screenX, stamp.y);
    ctx.scale(stamp.scale, stamp.scale);

    const size = 34;

    // Red Vermilion Stamp Border
    ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.beginPath();
    ctx.roundRect(-size / 2, -size / 2, size, size, 4);
    ctx.fill();

    ctx.strokeStyle = '#fef2f2';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-size / 2 + 2, -size / 2 + 2, size - 4, size - 4);

    // Calligraphy Character inside
    ctx.fillStyle = '#fef2f2';
    ctx.font = 'bold 16px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stamp.text, 0, 1);

    ctx.restore();
  }

  // Draw Floating Damage Numbers
  private drawDamageNumber(d: DamageNumber, cameraX: number) {
    const screenX = d.x - cameraX;
    if (screenX < -50 || screenX > this.width + 50) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.alpha);
    ctx.fillStyle = d.color;
    ctx.font = `bold ${Math.round(14 * d.scale)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(d.text, screenX, d.y);
    ctx.restore();
  }
}
