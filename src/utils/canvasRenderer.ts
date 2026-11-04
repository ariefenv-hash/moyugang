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
  InkSplat,
  InkCorruptZone,
} from '../types/game';
import { UNIT_CONFIGS } from '../data/gameData';
import { drawVectorWeapon, getWeaponReach, getActiveWeaponId } from './weaponSystem';
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

/** 剑气轨迹采样点（Task 43 次级池化对象） */
export interface SwordTrailSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
}

/** 特效冲击环（Task 43 次级池化对象） */
export interface FxRing {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  maxLife: number;
  color: string;
  lw: number;
  flat: boolean;
}

/**
 * 低端设备侦测（性能自动分档）：
 * deviceMemory ≤ 4GB（Chrome/Android 真实暴露，Safari/桌面 Firefox 返回 undefined 跳过）
 * 或 CPU 逻辑核 ≤ 4 → 建议默认启用行云模式（30fps + 氛围天气层/残影/轨迹减载）。
 * 仅在用户未显式选择画质档时作为初始值，不覆盖玩家偏好。
 */
export function detectLowEndDevice(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4) {
      return true;
    }
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) {
      return true;
    }
  } catch {}
  return false;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  /** 设备像素比：高分屏逻辑坐标 → 物理像素映射，画面更清晰 */
  private dpr: number = 1;
  private bgImage: HTMLImageElement | null = null;
  /** 行云性能模式：低载设备开启后跳过剑气轨迹/残影采样，渲染负载大减 */
  private qualityLow: boolean = false;

  /* ===== 程序化动作引擎内部状态（v3） ===== */
  private frameDt: number = 1 / 60;
  private lastGameTime: number = -1;
  /** 当前帧游戏时间（弹体/单位动画取相位用） */
  private frameGameTime: number = 0;
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
  private swordTrail: SwordTrailSample[] = [];
  private afterimages: {
    x: number;
    gy: number;
    altZ: number;
    facing: 1 | -1;
    pose: StickPose;
    life: number;
  }[] = [];
  private fxRings: FxRing[] = [];
  private capePts: { x: number; y: number; px: number; py: number }[] = [];
  private ribbonPts: { x: number; y: number; px: number; py: number }[] = [];
  private unitFx: WeakMap<UnitInstance, { walkPhase: number }> = new WeakMap();

  /* ===== 次级对象池（Task 43，模式同 Task 41 ParticlePool）===== */
  /** 空闲实例上限：两池活跃帽各 40，余量留给溢出归还，内存有界 */
  private static readonly FX_FREE_CAP = 64;
  private swordTrailFree: SwordTrailSample[] = [];
  private fxRingFree: FxRing[] = [];
  private fxPoolCounters = {
    trailAcq: 0,
    trailReuse: 0,
    trailRel: 0,
    ringAcq: 0,
    ringReuse: 0,
    ringRel: 0,
  };

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

  /** 行云模式开关（由 BattleView 顶栏切换并持久化） */
  public setQualityLow(v: boolean) {
    this.qualityLow = v;
  }

  /** 公共特效环：技能/Boss 出场可从外部注入冲击环（flat=地面椭圆波） */
  public addFxRing(
    x: number,
    y: number,
    color: string,
    r0: number,
    r1: number,
    life: number,
    lw = 3,
    flat = false
  ) {
    const r = this.acquireFxRing();
    r.x = x;
    r.y = y;
    r.r0 = r0;
    r.r1 = r1;
    r.life = life;
    r.maxLife = life;
    r.color = color;
    r.lw = lw;
    r.flat = flat;
    this.fxRings.push(r);
    if (this.fxRings.length > 40) {
      const cut = this.fxRings.splice(0, this.fxRings.length - 40);
      for (const o of cut) this.releaseFxRing(o);
    }
  }

  /** 池取：剑气轨迹样本（复用优先；必填字段由调用点字面量全量覆盖） */
  private acquireSwordTrail(): SwordTrailSample {
    this.fxPoolCounters.trailAcq++;
    const s = this.swordTrailFree.pop();
    if (s) {
      this.fxPoolCounters.trailReuse++;
      return s;
    }
    return { x: 0, y: 0, tx: 0, ty: 0, life: 0 };
  }

  /** 归还死亡轨迹样本；池满即弃（内存有界） */
  private releaseSwordTrail(s: SwordTrailSample) {
    this.fxPoolCounters.trailRel++;
    if (this.swordTrailFree.length < CanvasRenderer.FX_FREE_CAP) this.swordTrailFree.push(s);
  }

  /** 池取：特效冲击环（复用优先；必填字段由调用点字面量全量覆盖） */
  private acquireFxRing(): FxRing {
    this.fxPoolCounters.ringAcq++;
    const r = this.fxRingFree.pop();
    if (r) {
      this.fxPoolCounters.ringReuse++;
      return r;
    }
    return { x: 0, y: 0, r0: 0, r1: 0, life: 0, maxLife: 1, color: '#ffffff', lw: 3, flat: false };
  }

  /** 归还死亡冲击环；池满即弃（内存有界） */
  private releaseFxRing(r: FxRing) {
    this.fxPoolCounters.ringRel++;
    if (this.fxRingFree.length < CanvasRenderer.FX_FREE_CAP) this.fxRingFree.push(r);
  }

  /** 池统计快照（无头验证缝用，Task 43） */
  public fxPoolStats() {
    const c = this.fxPoolCounters;
    return {
      trailAcquired: c.trailAcq,
      trailReused: c.trailReuse,
      trailReleased: c.trailRel,
      trailReuseRate: c.trailAcq > 0 ? c.trailReuse / c.trailAcq : 0,
      ringAcquired: c.ringAcq,
      ringReused: c.ringReuse,
      ringReleased: c.ringRel,
      ringReuseRate: c.ringAcq > 0 ? c.ringReuse / c.ringAcq : 0,
      trailLive: this.swordTrail.length,
      ringLive: this.fxRings.length,
      trailFree: this.swordTrailFree.length,
      ringFree: this.fxRingFree.length,
    };
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
    inkSlowProgress: number = 0,
    inkSplats: InkSplat[] = [],
    corruptZones: InkCorruptZone[] = [],
    comboTier: string = 'NONE',
    comboCount: number = 0
  ) {
    const ctx = this.ctx;

    // ===== 帧间隔（暂停/顿帧时 gameTime 不推进 → dt=0，全部动作特效自然凝滞） =====
    const dt =
      this.lastGameTime < 0
        ? 1 / 60
        : Math.max(0, Math.min(0.05, gameTime - this.lastGameTime));
    this.lastGameTime = gameTime;
    this.frameDt = dt;
    this.frameGameTime = gameTime;
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

    // 2.5 地面墨渍贴花（击杀/重击飞溅的水墨痕迹，画在单位层之下）
    this.drawInkSplats(inkSplats, cameraX);

    // 2.6 蚀痕污染带（咒师落咒处：地面墨痕 + 升腾咒雾柱，污染上方书符区）
    this.drawCorruptZones(corruptZones, cameraX, gameTime);

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

    // 6. Draw Hero Inspiring Aura on Ground (Under feet)——连墨段位驱动光环升级
    if (hero.state !== 'DEAD') {
      this.drawHeroAura25D(hero, cameraX, laneMinY, laneMaxY, gameTime, comboTier, comboCount);
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

    // 11.5 大气天气层（章节氛围：雾带/霜叶/雷雨/墨尘，覆于单位层之上）
    this.drawAmbientWeather(level, gameTime, laneMinY);

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

  /* ============ canvas 分层·静态氛围离屏缓存（第壹阶段） ============
   * 天空/地面均为纯垂直线性渐变：色标只随氛围类型（五十境）变化，
   * 几何只随 laneMinY 与视口高变化——与相机、时间、画质档均无关。
   * 将其各采样为 1px 宽纵条（线性渐变沿 y 插值，纵向采样逐像素无损），
   * 逐帧只需两次 1px 纹理横向拉伸（GPU 代价可忽略），省去：
   * - 每帧 2 次 createLinearGradient 对象分配（GC 压力）
   * - 每帧 2 次全屏渐变 fillRect 的渐变重建
   * 缓存仅保留最近一份（战斗内氛围切换频率极低），key 变化即重建；
   * 离屏构建失败时静默回退主画布直绘路径。 */
  private staticGradCache: {
    key: string;
    sky: HTMLCanvasElement | null;
    ground: HTMLCanvasElement | null;
  } | null = null;

  /** 取静态渐变纵条缓存（sky/ground），key 不匹配则重建 */
  private ensureStaticGradCache(level: LevelConfig, laneMinY: number) {
    const key = `${level.ambientType}|${Math.round(laneMinY)}|${Math.round(this.height)}`;
    if (this.staticGradCache && this.staticGradCache.key === key) return this.staticGradCache;
    const entry: { key: string; sky: HTMLCanvasElement | null; ground: HTMLCanvasElement | null } = {
      key,
      sky: null,
      ground: null,
    };
    try {
      // 天空纵条：覆盖 [0, laneMinY+40]（含地平线下 40px 余量，与原 fillRect 完全一致）
      const skyH = Math.max(1, Math.ceil(laneMinY + 40));
      const sky = document.createElement('canvas');
      sky.width = 1;
      sky.height = skyH;
      const sctx = sky.getContext('2d');
      if (sctx) {
        const g = sctx.createLinearGradient(0, 0, 0, laneMinY);
        this.paintSkyStops(g, level);
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, 1, skyH);
        entry.sky = sky;
      }
      // 地面纵条：覆盖 [laneMinY, height]
      const groundH = Math.max(1, Math.ceil(this.height - laneMinY));
      const ground = document.createElement('canvas');
      ground.width = 1;
      ground.height = groundH;
      const gctx = ground.getContext('2d');
      if (gctx) {
        const g = gctx.createLinearGradient(0, laneMinY, 0, this.height);
        this.paintGroundStops(g, level);
        gctx.fillStyle = g;
        gctx.fillRect(0, 0, 1, groundH);
        entry.ground = ground;
      }
    } catch {
      // 极老内核/内存受限环境：放弃缓存，回退直绘
      entry.sky = null;
      entry.ground = null;
    }
    this.staticGradCache = entry;
    return entry;
  }

  /** 天空渐变色标链（五十境全量）：抽离为纯色标函数，供主绘与离屏纵条共用 */
  private paintSkyStops(skyGrad: CanvasGradient, level: LevelConfig) {
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
    } else if (level.ambientType === 'MIST') {
      // 烟雨断桥：灰青水汽，天地褪色
      skyGrad.addColorStop(0, '#252d33');
      skyGrad.addColorStop(0.55, '#5d6a6e');
      skyGrad.addColorStop(0.85, '#9aa5a3');
      skyGrad.addColorStop(1, '#c5ccc7');
    } else if (level.ambientType === 'AUTUMN') {
      // 枫林晚渡：霜枫似火，暮色燎原
      skyGrad.addColorStop(0, '#241009');
      skyGrad.addColorStop(0.5, '#6e2c12');
      skyGrad.addColorStop(0.8, '#b45824');
      skyGrad.addColorStop(1, '#e8a45c');
    } else if (level.ambientType === 'STORM') {
      // 雷峰夕照：雷雨压城，墨云翻滚
      skyGrad.addColorStop(0, '#080d14');
      skyGrad.addColorStop(0.5, '#17222f');
      skyGrad.addColorStop(0.8, '#2c3b4c');
      skyGrad.addColorStop(1, '#47586a');
    } else if (level.ambientType === 'VOID') {
      // 文枢归一：蚀月墨渊，天地尽头
      skyGrad.addColorStop(0, '#0a0512');
      skyGrad.addColorStop(0.5, '#1d0f31');
      skyGrad.addColorStop(0.82, '#33163f');
      skyGrad.addColorStop(1, '#4a1e3f');
    } else if (level.ambientType === 'LOTUS') {
      // 溪亭暮弦：暮色玫金，藕花水气
      skyGrad.addColorStop(0, '#1a1026');
      skyGrad.addColorStop(0.45, '#4a2440');
      skyGrad.addColorStop(0.75, '#8a4a52');
      skyGrad.addColorStop(1, '#e8a06a');
    } else if (level.ambientType === 'GOOSE') {
      // 雁字西楼：月满西楼，蓝紫雁夜
      skyGrad.addColorStop(0, '#070a16');
      skyGrad.addColorStop(0.55, '#141c33');
      skyGrad.addColorStop(0.85, '#33405e');
      skyGrad.addColorStop(1, '#6b5a70');
    } else if (level.ambientType === 'CHRYS') {
      // 黄花瘦影：东篱黄昏，琥珀菊香
      skyGrad.addColorStop(0, '#1d1208');
      skyGrad.addColorStop(0.5, '#4a2c10');
      skyGrad.addColorStop(0.8, '#8a5a20');
      skyGrad.addColorStop(1, '#d8a850');
    } else if (level.ambientType === 'GLOOM') {
      // 声声慢雨：凄冷暮雨，梧桐青灰
      skyGrad.addColorStop(0, '#0d1210');
      skyGrad.addColorStop(0.55, '#1e2a26');
      skyGrad.addColorStop(0.85, '#3a4a42');
      skyGrad.addColorStop(1, '#5c6e62');
    } else if (level.ambientType === 'STRING') {
      // 绝响广陵：琴台寒墨，万籁俱寂
      skyGrad.addColorStop(0, '#05070c');
      skyGrad.addColorStop(0.5, '#101822');
      skyGrad.addColorStop(0.8, '#1e2c38');
      skyGrad.addColorStop(1, '#384a52');
    } else if (level.ambientType === 'DESERT') {
      // 大漠孤烟：长河落日，黄沙映天
      skyGrad.addColorStop(0, '#20140c');
      skyGrad.addColorStop(0.45, '#4a2a12');
      skyGrad.addColorStop(0.75, '#9a5a22');
      skyGrad.addColorStop(1, '#e8b060');
    } else if (level.ambientType === 'BEACON') {
      // 烽火家书：烽燧映夜，火光烛天
      skyGrad.addColorStop(0, '#100604');
      skyGrad.addColorStop(0.5, '#2e110a');
      skyGrad.addColorStop(0.8, '#5c2010');
      skyGrad.addColorStop(1, '#a04e24');
    } else if (level.ambientType === 'WITHER') {
      // 羌笛怨柳：无春之关，灰败枯黄
      skyGrad.addColorStop(0, '#13130d');
      skyGrad.addColorStop(0.5, '#33331f');
      skyGrad.addColorStop(0.8, '#5c5a3a');
      skyGrad.addColorStop(1, '#8f8a60');
    } else if (level.ambientType === 'IRON') {
      // 铁衣寒光：关山月冷，钢蓝霜夜
      skyGrad.addColorStop(0, '#04070e');
      skyGrad.addColorStop(0.5, '#0e1626');
      skyGrad.addColorStop(0.8, '#1e2c44');
      skyGrad.addColorStop(1, '#3d4f68');
    } else if (level.ambientType === 'SIEGE') {
      // 黑云压城：墨云压顶，城下火光
      skyGrad.addColorStop(0, '#040407');
      skyGrad.addColorStop(0.5, '#10101a');
      skyGrad.addColorStop(0.82, '#241e28');
      skyGrad.addColorStop(1, '#4a2c22');
    } else if (level.ambientType === 'ORCHID') {
      // 沅芷澧兰：湘水烟波，紫青汀洲
      skyGrad.addColorStop(0, '#1c1838');
      skyGrad.addColorStop(0.5, '#343058');
      skyGrad.addColorStop(0.82, '#565f7e');
      skyGrad.addColorStop(1, '#8e98ae');
    } else if (level.ambientType === 'CLOUDMARCH') {
      // 云中霓旌：云海翻卷，玄白相间
      skyGrad.addColorStop(0, '#241f38');
      skyGrad.addColorStop(0.45, '#4a4268');
      skyGrad.addColorStop(0.8, '#7a7292');
      skyGrad.addColorStop(1, '#c0b8d0');
    } else if (level.ambientType === 'MORN') {
      // 扶桑浴日：金乌将升，赤金漫天
      skyGrad.addColorStop(0, '#2a1408');
      skyGrad.addColorStop(0.45, '#6e3410');
      skyGrad.addColorStop(0.75, '#c4702a');
      skyGrad.addColorStop(1, '#f8c878');
    } else if (level.ambientType === 'HOLLOW') {
      // 幽篁灵雨：山之阿兮，幽绿阴翳
      skyGrad.addColorStop(0, '#0d1a12');
      skyGrad.addColorStop(0.5, '#1c3022');
      skyGrad.addColorStop(0.82, '#2e4634');
      skyGrad.addColorStop(1, '#4a6350');
    } else if (level.ambientType === 'STARQ') {
      // 天问列星：遂古玄穹，星河垂野
      skyGrad.addColorStop(0, '#241a4e');
      skyGrad.addColorStop(0.45, '#2e2262');
      skyGrad.addColorStop(0.8, '#40306e');
      skyGrad.addColorStop(1, '#543c7a');
    } else if (level.ambientType === 'RIVULET') {
      // 缘溪行：青碧溪谷，晨雾未散
      skyGrad.addColorStop(0, '#12242a');
      skyGrad.addColorStop(0.5, '#1e3c3c');
      skyGrad.addColorStop(0.82, '#3a5c52');
      skyGrad.addColorStop(1, '#7a9a84');
    } else if (level.ambientType === 'PEACHDAWN') {
      // 夹岸桃霞：粉金满天，落英如雨
      skyGrad.addColorStop(0, '#2e1424');
      skyGrad.addColorStop(0.45, '#64283e');
      skyGrad.addColorStop(0.78, '#b4525c');
      skyGrad.addColorStop(1, '#f4b490');
    } else if (level.ambientType === 'GAPLIGHT') {
      // 豁然开朗：洞口天光，一线金柱
      skyGrad.addColorStop(0, '#201a12');
      skyGrad.addColorStop(0.42, '#463822');
      skyGrad.addColorStop(0.75, '#8a6c34');
      skyGrad.addColorStop(1, '#e8c878');
    } else if (level.ambientType === 'SMOKEFIELD') {
      // 阆陌炊烟：暖黄昏野，人家烟火
      skyGrad.addColorStop(0, '#2a1e10');
      skyGrad.addColorStop(0.45, '#5e4020');
      skyGrad.addColorStop(0.78, '#a07434');
      skyGrad.addColorStop(1, '#e0b070');
    } else if (level.ambientType === 'EERYPEACH') {
      // 千年迷津：桃霞与玄墨裂隙同框，诡美难辨
      skyGrad.addColorStop(0, '#1a0e22');
      skyGrad.addColorStop(0.45, '#3c1e3a');
      skyGrad.addColorStop(0.78, '#6e3854');
      skyGrad.addColorStop(1, '#b46870');
    } else if (level.ambientType === 'LANTERN') {
      // 春宵灯市：上元夜空，灯火暖底
      skyGrad.addColorStop(0, '#0a0c1e');
      skyGrad.addColorStop(0.45, '#1a1e3a');
      skyGrad.addColorStop(0.78, '#3a3050');
      skyGrad.addColorStop(1, '#8a5840');
    } else if (level.ambientType === 'QUJIANG') {
      // 曲江春宴：春水杏红，天光明媚
      skyGrad.addColorStop(0, '#1e2a30');
      skyGrad.addColorStop(0.45, '#3e5a58');
      skyGrad.addColorStop(0.78, '#7ea888');
      skyGrad.addColorStop(1, '#f0c8a8');
    } else if (level.ambientType === 'PAGODA') {
      // 雁塔题名：塔影墨青，金榜题字
      skyGrad.addColorStop(0, '#0c1210');
      skyGrad.addColorStop(0.45, '#1e2c28');
      skyGrad.addColorStop(0.78, '#3a4a3e');
      skyGrad.addColorStop(1, '#8a7a48');
    } else if (level.ambientType === 'WINE') {
      // 胡旋酒肆：琥珀酒光，暖夜微醉
      skyGrad.addColorStop(0, '#1e1008');
      skyGrad.addColorStop(0.45, '#4a2810');
      skyGrad.addColorStop(0.78, '#8a5220');
      skyGrad.addColorStop(1, '#d89850');
    } else if (level.ambientType === 'CALYX') {
      // 花萼辉楼：金紫盛世，楼阁交辉
      skyGrad.addColorStop(0, '#160a28');
      skyGrad.addColorStop(0.45, '#3c1a50');
      skyGrad.addColorStop(0.78, '#6e3060');
      skyGrad.addColorStop(1, '#d88858');
    } else if (level.ambientType === 'CHIJI') {
      // 壬戌秋江：秋水澄碧，白露横江
      skyGrad.addColorStop(0, '#1a2626');
      skyGrad.addColorStop(0.45, '#2e4442');
      skyGrad.addColorStop(0.78, '#54705e');
      skyGrad.addColorStop(1, '#a8b488');
    } else if (level.ambientType === 'MOONRISE') {
      // 月出东山：月悬东岭，清辉满江
      skyGrad.addColorStop(0, '#0a1424');
      skyGrad.addColorStop(0.45, '#16283e');
      skyGrad.addColorStop(0.78, '#2a4454');
      skyGrad.addColorStop(1, '#688a94');
    } else if (level.ambientType === 'XIAO') {
      // 洞箫泣月：箫声呜咽，江寒蛟潜
      skyGrad.addColorStop(0, '#0a1014');
      skyGrad.addColorStop(0.45, '#18242c');
      skyGrad.addColorStop(0.78, '#2c3c44');
      skyGrad.addColorStop(1, '#506068');
    } else if (level.ambientType === 'REEF') {
      // 渔樵江渚：芦花似雪，暮色苍苍
      skyGrad.addColorStop(0, '#241f18');
      skyGrad.addColorStop(0.45, '#464032');
      skyGrad.addColorStop(0.78, '#786e52');
      skyGrad.addColorStop(1, '#c4b890');
    } else if (level.ambientType === 'BOATQ') {
      // 扁舟问月：沧海月明，天地一粟
      skyGrad.addColorStop(0, '#060c1a');
      skyGrad.addColorStop(0.45, '#101e34');
      skyGrad.addColorStop(0.78, '#1e3450');
      skyGrad.addColorStop(1, '#4a6878');
    } else if (level.ambientType === 'SCROLLIN') {
      // 展卷入画：宣纸为天，淡墨为云
      skyGrad.addColorStop(0, '#8a8272');
      skyGrad.addColorStop(0.45, '#a89e88');
      skyGrad.addColorStop(0.78, '#c8bc9e');
      skyGrad.addColorStop(1, '#e8dcbe');
    } else if (level.ambientType === 'SHADOW') {
      // 疏影横斜：月黄昏水清浅
      skyGrad.addColorStop(0, '#1c2820');
      skyGrad.addColorStop(0.45, '#2e4234');
      skyGrad.addColorStop(0.78, '#4e664e');
      skyGrad.addColorStop(1, '#a0a878');
    } else if (level.ambientType === 'INKSTONE') {
      // 砚池凝墨：一池玄墨
      skyGrad.addColorStop(0, '#0a0710');
      skyGrad.addColorStop(0.45, '#161020');
      skyGrad.addColorStop(0.78, '#241a30');
      skyGrad.addColorStop(1, '#3c2c42');
    } else if (level.ambientType === 'SNOWPLUM') {
      // 雪夜梅影：雪压画境，玄青偏白
      skyGrad.addColorStop(0, '#3c444c');
      skyGrad.addColorStop(0.45, '#5c6872');
      skyGrad.addColorStop(0.78, '#8a97a0');
      skyGrad.addColorStop(1, '#d4dde0');
    } else if (level.ambientType === 'PUREQI') {
      // 清气乾坤：素白澄澈，淡金清气
      skyGrad.addColorStop(0, '#b8ac90');
      skyGrad.addColorStop(0.45, '#d0c4a4');
      skyGrad.addColorStop(0.78, '#e8dcbc');
      skyGrad.addColorStop(1, '#f8f0d8');
    } else if (level.ambientType === 'DAO') {
      // 原道：玄黄杂栏，天地初开
      skyGrad.addColorStop(0, '#2a2410');
      skyGrad.addColorStop(0.45, '#4a3e18');
      skyGrad.addColorStop(0.78, '#6e5c2c');
      skyGrad.addColorStop(1, '#a8924a');
    } else if (level.ambientType === 'SAGE') {
      // 征圣：圣殿金辉，炳耀重华
      skyGrad.addColorStop(0, '#584418');
      skyGrad.addColorStop(0.45, '#7c6028');
      skyGrad.addColorStop(0.78, '#a8843c');
      skyGrad.addColorStop(1, '#e0bc6c');
    } else if (level.ambientType === 'CANON') {
      // 宗经：万卷凌空，墨海书澜
      skyGrad.addColorStop(0, '#101c1e');
      skyGrad.addColorStop(0.45, '#1c3034');
      skyGrad.addColorStop(0.78, '#2c4450');
      skyGrad.addColorStop(1, '#54706c');
    } else if (level.ambientType === 'MUSE') {
      // 神思：思接千载，灵感如焰
      skyGrad.addColorStop(0, '#240e1c');
      skyGrad.addColorStop(0.45, '#3c1428');
      skyGrad.addColorStop(0.78, '#5c2036');
      skyGrad.addColorStop(1, '#944048');
    } else if (level.ambientType === 'ONENESS') {
      // 万象归宗：玄金相融，文心同辉
      skyGrad.addColorStop(0, '#2c1c3c');
      skyGrad.addColorStop(0.45, '#442a52');
      skyGrad.addColorStop(0.78, '#6e4058');
      skyGrad.addColorStop(1, '#c89a5c');
    } else {
      skyGrad.addColorStop(0, '#120d1c');
      skyGrad.addColorStop(0.4, '#2e192f');
      skyGrad.addColorStop(0.8, '#6b3d43');
      skyGrad.addColorStop(1, '#ebd0ab');
    }
  }

  /** 地面渐变色标链（五十境全量）：同上共用 */
  private paintGroundStops(groundGrad: CanvasGradient, level: LevelConfig) {
    if (level.ambientType === 'SNOW') {
      groundGrad.addColorStop(0, '#cbd5e1');
      groundGrad.addColorStop(0.3, '#94a3b8');
      groundGrad.addColorStop(1, '#334155');
    } else if (level.ambientType === 'BAMBOO') {
      groundGrad.addColorStop(0, '#334835');
      groundGrad.addColorStop(0.3, '#213023');
      groundGrad.addColorStop(1, '#111912');
    } else if (level.ambientType === 'MIST') {
      // 烟雨青灰石板
      groundGrad.addColorStop(0, '#6b7678');
      groundGrad.addColorStop(0.3, '#455154');
      groundGrad.addColorStop(1, '#1c2426');
    } else if (level.ambientType === 'AUTUMN') {
      // 霜枫赤褐渡口
      groundGrad.addColorStop(0, '#5e3220');
      groundGrad.addColorStop(0.3, '#3d2015');
      groundGrad.addColorStop(1, '#170c08');
    } else if (level.ambientType === 'STORM') {
      // 雷雨溃溡深蓝黑
      groundGrad.addColorStop(0, '#2b3540');
      groundGrad.addColorStop(0.3, '#1c242d');
      groundGrad.addColorStop(1, '#0b0f14');
    } else if (level.ambientType === 'VOID') {
      // 墨渊紫黑
      groundGrad.addColorStop(0, '#241331');
      groundGrad.addColorStop(0.3, '#160b22');
      groundGrad.addColorStop(1, '#0a0512');
    } else if (level.ambientType === 'LOTUS') {
      // 溪亭暮岸：玫褐暮色湿地
      groundGrad.addColorStop(0, '#4a3040');
      groundGrad.addColorStop(0.3, '#2c1e2c');
      groundGrad.addColorStop(1, '#140d16');
    } else if (level.ambientType === 'GOOSE') {
      // 西楼月渡：月照青蓝石阶
      groundGrad.addColorStop(0, '#333a52');
      groundGrad.addColorStop(0.3, '#20263a');
      groundGrad.addColorStop(1, '#0c0f1a');
    } else if (level.ambientType === 'CHRYS') {
      // 东篱菊圃：琥珀暗金
      groundGrad.addColorStop(0, '#4e381a');
      groundGrad.addColorStop(0.3, '#30220f');
      groundGrad.addColorStop(1, '#140d06');
    } else if (level.ambientType === 'GLOOM') {
      // 梧桐暮雨：湿冷青灰
      groundGrad.addColorStop(0, '#333f38');
      groundGrad.addColorStop(0.3, '#1f2823');
      groundGrad.addColorStop(1, '#0b100d');
    } else if (level.ambientType === 'STRING') {
      // 琴台绝响：寒墨玄青
      groundGrad.addColorStop(0, '#1c242e');
      groundGrad.addColorStop(0.3, '#10161d');
      groundGrad.addColorStop(1, '#06090d');
    } else if (level.ambientType === 'DESERT') {
      // 大漠沙丘：金黄渐暗
      groundGrad.addColorStop(0, '#a87838');
      groundGrad.addColorStop(0.3, '#6e4e22');
      groundGrad.addColorStop(1, '#241608');
    } else if (level.ambientType === 'BEACON') {
      // 烽燧焦土：赤褐灼痕
      groundGrad.addColorStop(0, '#5c3418');
      groundGrad.addColorStop(0.3, '#38200e');
      groundGrad.addColorStop(1, '#140a05');
    } else if (level.ambientType === 'WITHER') {
      // 无春枯柳：灰绿枯土
      groundGrad.addColorStop(0, '#565030');
      groundGrad.addColorStop(0.3, '#34301c');
      groundGrad.addColorStop(1, '#12100a');
    } else if (level.ambientType === 'IRON') {
      // 碑林冻土：铁灰霜夜
      groundGrad.addColorStop(0, '#33404e');
      groundGrad.addColorStop(0.3, '#202a36');
      groundGrad.addColorStop(1, '#0a0e14');
    } else if (level.ambientType === 'SIEGE') {
      // 攻城战场：焦黑染血
      groundGrad.addColorStop(0, '#2e2620');
      groundGrad.addColorStop(0.3, '#1c1610');
      groundGrad.addColorStop(1, '#0a0705');
    } else if (level.ambientType === 'ORCHID') {
      // 湘水汀洲：紫青湿沙
      groundGrad.addColorStop(0, '#4c4a66');
      groundGrad.addColorStop(0.3, '#302e46');
      groundGrad.addColorStop(1, '#12101c');
    } else if (level.ambientType === 'CLOUDMARCH') {
      // 云阶：玄白云台
      groundGrad.addColorStop(0, '#6a6480');
      groundGrad.addColorStop(0.3, '#46405e');
      groundGrad.addColorStop(1, '#181528');
    } else if (level.ambientType === 'MORN') {
      // 扶桑渡口：赤金沙滩
      groundGrad.addColorStop(0, '#9a6a32');
      groundGrad.addColorStop(0.3, '#66441e');
      groundGrad.addColorStop(1, '#221408');
    } else if (level.ambientType === 'HOLLOW') {
      // 幽篁苔径：墨绿湿苔
      groundGrad.addColorStop(0, '#2a3e2e');
      groundGrad.addColorStop(0.3, '#1a2a1e');
      groundGrad.addColorStop(1, '#080f0a');
    } else if (level.ambientType === 'STARQ') {
      // 天问星台：玄紫星阶
      groundGrad.addColorStop(0, '#322a4e');
      groundGrad.addColorStop(0.3, '#201a34');
      groundGrad.addColorStop(1, '#0a0714');
    } else if (level.ambientType === 'RIVULET') {
      // 溪畔青滩：湿石苔痕
      groundGrad.addColorStop(0, '#3e5648');
      groundGrad.addColorStop(0.3, '#263a30');
      groundGrad.addColorStop(1, '#0c1410');
    } else if (level.ambientType === 'PEACHDAWN') {
      // 桃林沃土：花壤绯褐
      groundGrad.addColorStop(0, '#6a4048');
      groundGrad.addColorStop(0.3, '#442634');
      groundGrad.addColorStop(1, '#160a10');
    } else if (level.ambientType === 'GAPLIGHT') {
      // 洞前石阶：金尘石阶
      groundGrad.addColorStop(0, '#6a5a3a');
      groundGrad.addColorStop(0.3, '#463a24');
      groundGrad.addColorStop(1, '#16100a');
    } else if (level.ambientType === 'SMOKEFIELD') {
      // 阆陌暖田：熟金麦壤
      groundGrad.addColorStop(0, '#8a6838');
      groundGrad.addColorStop(0.3, '#5c4424');
      groundGrad.addColorStop(1, '#1e1408');
    } else if (level.ambientType === 'EERYPEACH') {
      // 迷津花壤：桃墨相浸
      groundGrad.addColorStop(0, '#5a3a4c');
      groundGrad.addColorStop(0.3, '#38243a');
      groundGrad.addColorStop(1, '#100a16');
    } else if (level.ambientType === 'LANTERN') {
      // 灯市石板：暖光石街
      groundGrad.addColorStop(0, '#4a4054');
      groundGrad.addColorStop(0.3, '#322a3e');
      groundGrad.addColorStop(1, '#120e1a');
    } else if (level.ambientType === 'QUJIANG') {
      // 曲江春岸：青草杏岸
      groundGrad.addColorStop(0, '#5a7858');
      groundGrad.addColorStop(0.3, '#3a523c');
      groundGrad.addColorStop(1, '#121c14');
    } else if (level.ambientType === 'PAGODA') {
      // 塔下砖庭：墨青砖金
      groundGrad.addColorStop(0, '#44523e');
      groundGrad.addColorStop(0.3, '#2c362a');
      groundGrad.addColorStop(1, '#0e120c');
    } else if (level.ambientType === 'WINE') {
      // 酒肆暖砖：琥珀醉地
      groundGrad.addColorStop(0, '#7a4c28');
      groundGrad.addColorStop(0.3, '#502e18');
      groundGrad.addColorStop(1, '#180c06');
    } else if (level.ambientType === 'CALYX') {
      // 辉楼金阶：金紫琉璃
      groundGrad.addColorStop(0, '#6a4860');
      groundGrad.addColorStop(0.3, '#442c44');
      groundGrad.addColorStop(1, '#140c1c');
    } else if (level.ambientType === 'CHIJI') {
      // 秋江矶头：澄碧湿矶
      groundGrad.addColorStop(0, '#4e6454');
      groundGrad.addColorStop(0.3, '#324438');
      groundGrad.addColorStop(1, '#101812');
    } else if (level.ambientType === 'MOONRISE') {
      // 月下矶岸：银辉碎石
      groundGrad.addColorStop(0, '#42586a');
      groundGrad.addColorStop(0.3, '#2a3c4c');
      groundGrad.addColorStop(1, '#0c141d');
    } else if (level.ambientType === 'XIAO') {
      // 寒江暗礁：青灰沉江
      groundGrad.addColorStop(0, '#38484e');
      groundGrad.addColorStop(0.3, '#243038');
      groundGrad.addColorStop(1, '#0a0f13');
    } else if (level.ambientType === 'REEF') {
      // 芦荡沙洲：芦灰软沙
      groundGrad.addColorStop(0, '#78705a');
      groundGrad.addColorStop(0.3, '#4e4838');
      groundGrad.addColorStop(1, '#18150e');
    } else if (level.ambientType === 'BOATQ') {
      // 沧海月台：玄蓝观月台
      groundGrad.addColorStop(0, '#32465c');
      groundGrad.addColorStop(0.3, '#1e2e42');
      groundGrad.addColorStop(1, '#080e18');
    } else if (level.ambientType === 'SCROLLIN') {
      // 画中卷面：宣纸淡揭
      groundGrad.addColorStop(0, '#b0a284');
      groundGrad.addColorStop(0.3, '#8a7c62');
      groundGrad.addColorStop(1, '#4a4030');
    } else if (level.ambientType === 'SHADOW') {
      // 疏影清浅：苔石浅溪
      groundGrad.addColorStop(0, '#4a5e48');
      groundGrad.addColorStop(0.3, '#304030');
      groundGrad.addColorStop(1, '#101810');
    } else if (level.ambientType === 'INKSTONE') {
      // 砚池墨台：玄墨凝池
      groundGrad.addColorStop(0, '#2c2436');
      groundGrad.addColorStop(0.3, '#1c1626');
      groundGrad.addColorStop(1, '#08060e');
    } else if (level.ambientType === 'SNOWPLUM') {
      // 雪夜画境：雪覆梅石
      groundGrad.addColorStop(0, '#8a97a2');
      groundGrad.addColorStop(0.3, '#5c6874');
      groundGrad.addColorStop(1, '#20262e');
    } else if (level.ambientType === 'PUREQI') {
      // 清气画心：素白玉阶
      groundGrad.addColorStop(0, '#c8bc9c');
      groundGrad.addColorStop(0.3, '#a09478');
      groundGrad.addColorStop(1, '#584e3c');
    } else if (level.ambientType === 'DAO') {
      // 原道玄壤：玄黄相侵
      groundGrad.addColorStop(0, '#6e5c30');
      groundGrad.addColorStop(0.3, '#483c20');
      groundGrad.addColorStop(1, '#181408');
    } else if (level.ambientType === 'SAGE') {
      // 圣殿金阶：炳耀金砖
      groundGrad.addColorStop(0, '#8a6c34');
      groundGrad.addColorStop(0.3, '#5c4824');
      groundGrad.addColorStop(1, '#1e1608');
    } else if (level.ambientType === 'CANON') {
      // 经阁书澜：墨青书石
      groundGrad.addColorStop(0, '#3a4e50');
      groundGrad.addColorStop(0.3, '#263638');
      groundGrad.addColorStop(1, '#0c1214');
    } else if (level.ambientType === 'MUSE') {
      // 神思焰境：绯墨焦土
      groundGrad.addColorStop(0, '#5c3440');
      groundGrad.addColorStop(0.3, '#3c2028');
      groundGrad.addColorStop(1, '#120a0c');
    } else if (level.ambientType === 'ONENESS') {
      // 归宗圣坛：玄金文台
      groundGrad.addColorStop(0, '#5c4656');
      groundGrad.addColorStop(0.3, '#3c2c3e');
      groundGrad.addColorStop(1, '#120c14');
    } else {
      groundGrad.addColorStop(0, '#26262b');
      groundGrad.addColorStop(0.3, '#1c1c20');
      groundGrad.addColorStop(1, '#0e0e11');
    }

  }


  // Draw Sky & Parallax Layer
  private drawSkyAndParallax(cameraX: number, level: LevelConfig, laneMinY: number, gameTime: number) {
    const ctx = this.ctx;

    // Atmospheric Sky Gradient
    // —— canvas 分层·静态氛围离屏缓存（第壹阶段）：天空为纯垂直渐变，与相机/时间无关。
    //    采样为 1px 宽纵条缓存，逐帧 drawImage 横向拉伸铺绘：线性渐变沿 y 插值，
    //    纵向采样逐像素无损；省去每帧 createLinearGradient 分配与全屏渐变填充重建。
    //    氛围切换/视口缩放时 key 变化自动重建；离屏构建失败回退本直绘路径。
    const skyCache = this.ensureStaticGradCache(level, laneMinY);
    if (skyCache.sky) {
      ctx.drawImage(
        skyCache.sky,
        0,
        0,
        1,
        skyCache.sky.height,
        0,
        0,
        this.width,
        laneMinY + 40
      );
    } else {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, laneMinY);
      this.paintSkyStops(skyGrad, level);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, this.width, laneMinY + 40);
    }

    // Background Image Art（等比 cover 绘制：窄屏/宽屏均不拉伸变形，底部对齐地平线，横向平铺视差）
    // 裁掉原画右侧题字栏（防字样钤印随平铺重复），奇偶块水平镜像令接缝天衣无缝；
    // u0 取模周期为 2×tileW（镜像图案的真实周期），相机连续滚动时相位零跳变
    if (this.bgImage && this.bgImage.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      const img = this.bgImage;
      const srcW = Math.round(img.naturalWidth * 0.9);
      const skyH = laneMinY + 60;
      const imgAR = srcW / img.naturalHeight;
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
      const tileW = drawW;
      const pattern = tileW * 2;
      const u0 = (((cameraX * 0.15) % pattern) + pattern) % pattern;
      const jStart = Math.floor(u0 / tileW);
      const jEnd = Math.floor((u0 + this.width) / tileW);
      for (let j = jStart; j <= jEnd; j++) {
        const sx = j * tileW - u0;
        if (((j % 2) + 2) % 2 === 0) {
          ctx.drawImage(img, 0, 0, srcW, img.naturalHeight, sx, drawY, tileW, drawH);
        } else {
          ctx.save();
          ctx.translate(sx + tileW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, srcW, img.naturalHeight, 0, drawY, tileW, drawH);
          ctx.restore();
        }
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
    } else if (level.ambientType === 'VOID') {
      // 蚀月：玄色圆盘噬去月华，唯余紫白冕环（洗墨之乱的天地异象）
      const eclipseX = this.width * 0.75 - cameraX * 0.05;
      const corona = ctx.createRadialGradient(eclipseX, 90, 26, eclipseX, 90, 88);
      corona.addColorStop(0, 'rgba(216, 180, 254, 0.85)');
      corona.addColorStop(0.35, 'rgba(147, 112, 219, 0.35)');
      corona.addColorStop(1, 'rgba(88, 28, 135, 0)');
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(eclipseX, 90, 88, 0, Math.PI * 2);
      ctx.fill();

      // 玄盘本体
      ctx.fillStyle = '#0a0512';
      ctx.beginPath();
      ctx.arc(eclipseX, 90, 30, 0, Math.PI * 2);
      ctx.fill();
      // 新月细环（被蚀后残存的月缘）
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.9)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(eclipseX, 90, 31.5, Math.PI * 0.62, Math.PI * 1.58);
      ctx.stroke();
    } else if (level.ambientType === 'DAWN') {
      const sunGlow = ctx.createRadialGradient(celestialX, 100, 15, celestialX, 100, 130);
      sunGlow.addColorStop(0, 'rgba(255, 220, 140, 0.9)');
      sunGlow.addColorStop(0.3, 'rgba(240, 160, 90, 0.4)');
      sunGlow.addColorStop(1, 'rgba(230, 100, 70, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(celestialX, 100, 130, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'LOTUS') {
      // 溪亭日暮：半沉落日贴在地平线上，金红余晖漫染
      const sunY = laneMinY - 26;
      const sunGlow2 = ctx.createRadialGradient(celestialX, sunY, 12, celestialX, sunY, 120);
      sunGlow2.addColorStop(0, 'rgba(255, 214, 150, 0.95)');
      sunGlow2.addColorStop(0.3, 'rgba(250, 160, 100, 0.42)');
      sunGlow2.addColorStop(1, 'rgba(220, 110, 80, 0)');
      ctx.fillStyle = sunGlow2;
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 26, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'GOOSE') {
      // 雁字西楼：满月（与月夜共用月体，色调偏暖白）
      const moonGlow = ctx.createRadialGradient(celestialX, 88, 10, celestialX, 88, 80);
      moonGlow.addColorStop(0, 'rgba(255, 250, 235, 0.92)');
      moonGlow.addColorStop(0.4, 'rgba(240, 225, 210, 0.38)');
      moonGlow.addColorStop(1, 'rgba(220, 200, 190, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(celestialX, 88, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdf8ec';
      ctx.beginPath();
      ctx.arc(celestialX, 88, 29, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'STRING') {
      // 绝响广陵：惨白细月悬于琴台之上
      const moonGlow2 = ctx.createRadialGradient(celestialX, 78, 6, celestialX, 78, 60);
      moonGlow2.addColorStop(0, 'rgba(225, 235, 240, 0.85)');
      moonGlow2.addColorStop(0.4, 'rgba(180, 200, 215, 0.28)');
      moonGlow2.addColorStop(1, 'rgba(140, 170, 190, 0)');
      ctx.fillStyle = moonGlow2;
      ctx.beginPath();
      ctx.arc(celestialX, 78, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5edf2';
      ctx.beginPath();
      ctx.arc(celestialX, 78, 18, 0, Math.PI * 2);
      ctx.fill();
      // 玄色蚀缺（无声之曲啃月）
      ctx.fillStyle = '#0a0e14';
      ctx.beginPath();
      ctx.arc(celestialX + 9, 72, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'DESERT') {
      // 长河落日圆：巨大浑圆落日半悬地平线，晕染大漠
      const sunY = laneMinY - 34;
      const desertSun = ctx.createRadialGradient(celestialX, sunY, 16, celestialX, sunY, 150);
      desertSun.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
      desertSun.addColorStop(0.25, 'rgba(250, 180, 90, 0.45)');
      desertSun.addColorStop(1, 'rgba(200, 110, 50, 0)');
      ctx.fillStyle = desertSun;
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5c878';
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 34, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'WITHER') {
      // 无春之关：惨淡白日，有形无温
      const paleGlow = ctx.createRadialGradient(celestialX, 80, 8, celestialX, 80, 52);
      paleGlow.addColorStop(0, 'rgba(228, 228, 210, 0.75)');
      paleGlow.addColorStop(0.4, 'rgba(200, 200, 180, 0.22)');
      paleGlow.addColorStop(1, 'rgba(180, 180, 160, 0)');
      ctx.fillStyle = paleGlow;
      ctx.beginPath();
      ctx.arc(celestialX, 80, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcdcc8';
      ctx.beginPath();
      ctx.arc(celestialX, 80, 17, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'IRON') {
      // 关山月：明月出天山，苍茫云海间
      const ironMoon = ctx.createRadialGradient(celestialX, 82, 12, celestialX, 82, 86);
      ironMoon.addColorStop(0, 'rgba(235, 242, 252, 0.95)');
      ironMoon.addColorStop(0.4, 'rgba(190, 210, 235, 0.38)');
      ironMoon.addColorStop(1, 'rgba(140, 170, 205, 0)');
      ctx.fillStyle = ironMoon;
      ctx.beginPath();
      ctx.arc(celestialX, 82, 86, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eaf1fa';
      ctx.beginPath();
      ctx.arc(celestialX, 82, 30, 0, Math.PI * 2);
      ctx.fill();
      // 月轮蚀缺（玄墨啃月）
      ctx.fillStyle = '#0a0e16';
      ctx.beginPath();
      ctx.arc(celestialX - 10, 74, 13, 0, Math.PI * 2);
      ctx.fill();
      // 苍茫云海横带
      ctx.fillStyle = 'rgba(90, 110, 140, 0.2)';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.5, laneMinY * 0.55, this.width * 0.62, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(70, 90, 120, 0.16)';
      ctx.beginPath();
      ctx.ellipse(this.width * 0.42, laneMinY * 0.62, this.width * 0.5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'MORN') {
      // 扶桑浴日：巨大金乌贴地平线升起，扶桑枝剪影横陈其上
      const sunY = laneMinY - 40;
      const mornSun = ctx.createRadialGradient(celestialX, sunY, 18, celestialX, sunY, 160);
      mornSun.addColorStop(0, 'rgba(255, 240, 190, 0.96)');
      mornSun.addColorStop(0.25, 'rgba(255, 190, 90, 0.5)');
      mornSun.addColorStop(1, 'rgba(210, 110, 40, 0)');
      ctx.fillStyle = mornSun;
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 160, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe2a0';
      ctx.beginPath();
      ctx.arc(celestialX, sunY, 36, 0, Math.PI * 2);
      ctx.fill();
      // 三足金乌暗纹（日轮内的玄色鸟影，被蚀的痕迹）
      ctx.fillStyle = 'rgba(60, 30, 12, 0.32)';
      ctx.beginPath();
      ctx.ellipse(celestialX - 3, sunY + 2, 12, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(celestialX + 8, sunY - 6, 4.5, 3, 0.6, 0, Math.PI * 2);
      ctx.fill();
      // 扶桑枝剪影（九日栖木，枝桠自右上斜出）
      ctx.strokeStyle = 'rgba(24, 12, 6, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(celestialX + 150, sunY - 120);
      ctx.quadraticCurveTo(celestialX + 70, sunY - 96, celestialX + 18, sunY - 52);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      for (let b = 0; b < 4; b++) {
        const tB = 0.3 + b * 0.18;
        const bX = celestialX + 150 - 132 * tB;
        const bY = sunY - 120 + 68 * tB;
        ctx.beginPath();
        ctx.moveTo(bX, bY);
        ctx.quadraticCurveTo(bX - 14, bY - 16, bX - 30, bY - 12);
        ctx.stroke();
      }
    } else if (level.ambientType === 'STARQ') {
      // 天问列星：北斗列阵悬于玄穹，星芒明灭如问
      const stars: [number, number, number][] = [
        [0.18, 0.16, 2.4], [0.3, 0.2, 2.1], [0.42, 0.17, 2.6],
        [0.54, 0.22, 2.0], [0.66, 0.15, 2.5], [0.76, 0.24, 1.9], [0.87, 0.18, 2.3],
      ];
      for (let s = 0; s < stars.length; s++) {
        const [fx, fy, rr] = stars[s];
        const sX = this.width * fx - cameraX * 0.03;
        const sY = laneMinY * fy + 20;
        const tw = 0.55 + 0.45 * Math.sin(gameTime * 2.1 + s * 1.7);
        const glow = ctx.createRadialGradient(sX, sY, 0, sX, sY, rr * 5);
        glow.addColorStop(0, `rgba(235, 228, 255, ${0.8 * tw})`);
        glow.addColorStop(1, 'rgba(160, 140, 220, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sX, sY, rr * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(245, 240, 255, ${0.6 + 0.4 * tw})`;
        ctx.beginPath();
        ctx.arc(sX, sY, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      // 北斗连线（玄墨蚀不断的天问之问）
      ctx.strokeStyle = 'rgba(180, 168, 230, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0; s < stars.length; s++) {
        const [fx, fy] = stars[s];
        const sX = this.width * fx - cameraX * 0.03;
        const sY = laneMinY * fy + 20;
        if (s === 0) ctx.moveTo(sX, sY);
        else ctx.lineTo(sX, sY);
      }
      ctx.stroke();
    } else if (level.ambientType === 'EERYPEACH') {
      // 千年迷津：桃林尽头一道玄墨裂隙悬于天际，隙内透出桃花色的光
      const riftX = this.width * 0.7 - cameraX * 0.04;
      const riftY = laneMinY * 0.34;
      const riftGlow = ctx.createRadialGradient(riftX, riftY, 4, riftX, riftY, 90);
      riftGlow.addColorStop(0, 'rgba(255, 170, 190, 0.5)');
      riftGlow.addColorStop(0.5, 'rgba(180, 90, 140, 0.22)');
      riftGlow.addColorStop(1, 'rgba(90, 40, 90, 0)');
      ctx.fillStyle = riftGlow;
      ctx.beginPath();
      ctx.arc(riftX, riftY, 90, 0, Math.PI * 2);
      ctx.fill();
      // 裂隙缝体（两段曲线夹出一线细缝，随时间呼吸开合）
      const gapW = 5 + Math.sin(gameTime * 1.3) * 2.2;
      ctx.fillStyle = 'rgba(8, 4, 12, 0.9)';
      ctx.beginPath();
      ctx.moveTo(riftX - 46, riftY - 58);
      ctx.quadraticCurveTo(riftX - gapW, riftY - 18, riftX - gapW * 0.6, riftY + gapW);
      ctx.quadraticCurveTo(riftX - 40, riftY + 34, riftX - 58, riftY + 72);
      ctx.lineTo(riftX - 30, riftY + 66);
      ctx.quadraticCurveTo(riftX + gapW, riftY + 26, riftX + gapW, riftY - 10);
      ctx.quadraticCurveTo(riftX + 30, riftY - 44, riftX + 18, riftY - 74);
      ctx.closePath();
      ctx.fill();
      // 缝内桃色光芯
      ctx.strokeStyle = 'rgba(255, 190, 205, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(riftX - gapW * 0.4, riftY - 30);
      ctx.quadraticCurveTo(riftX + gapW, riftY, riftX - gapW * 0.2, riftY + 30);
      ctx.stroke();
      // 千年尘埃：缓浮的桃花瓣与玄色尘埃各半
      if (!this.qualityLow) {
        for (let i = 0; i < 10; i++) {
          const seed = i * 173.3;
          const px = ((seed * 53) % (this.width + 60)) - 30 + Math.sin(gameTime * 0.4 + seed) * 22;
          const py = ((seed * 97 + gameTime * 14) % (laneMinY * 0.8));
          ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 180, 200, 0.4)' : 'rgba(30, 16, 34, 0.5)';
          ctx.beginPath();
          ctx.ellipse(px, py, 2.4, 1.2, seed + gameTime * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (level.ambientType === 'MOONRISE') {
      // 月出东山：一轮满月悬于山脊，月径水路直铺江心
      const moonX = this.width * 0.5 - cameraX * 0.04;
      const moonY = laneMinY * 0.3;
      const riseGlow = ctx.createRadialGradient(moonX, moonY, 14, moonX, moonY, 130);
      riseGlow.addColorStop(0, 'rgba(240, 248, 255, 0.95)');
      riseGlow.addColorStop(0.35, 'rgba(200, 220, 240, 0.4)');
      riseGlow.addColorStop(1, 'rgba(150, 180, 210, 0)');
      ctx.fillStyle = riseGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f8fb';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
      ctx.fill();
      // 月面暗斑
      ctx.fillStyle = 'rgba(190, 205, 220, 0.5)';
      ctx.beginPath();
      ctx.arc(moonX - 12, moonY - 6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX + 10, moonY + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      // 月径水路（自月轮直铺江心的碎光带）
      if (!this.qualityLow) {
        for (let i = 0; i < 12; i++) {
          const seed = i * 149.3;
          const sy = laneMinY + 10 + (seed % 90);
          const spread = (sy - laneMinY) * 0.55 + 8;
          const sx = moonX + Math.sin(gameTime * 0.9 + seed) * spread * 0.4;
          ctx.globalAlpha = 0.24 - (sy - laneMinY) / 460;
          ctx.fillStyle = '#dce8f0';
          ctx.beginPath();
          ctx.ellipse(sx, sy, spread, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (level.ambientType === 'XIAO') {
      // 洞箫泣月：寒溪细月如钩，泪蚀月痕
      const sickleX = this.width * 0.78 - cameraX * 0.05;
      const sickleGlow = ctx.createRadialGradient(sickleX, 76, 4, sickleX, 76, 46);
      sickleGlow.addColorStop(0, 'rgba(210, 226, 234, 0.7)');
      sickleGlow.addColorStop(1, 'rgba(160, 190, 205, 0)');
      ctx.fillStyle = sickleGlow;
      ctx.beginPath();
      ctx.arc(sickleX, 76, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dce8ee';
      ctx.beginPath();
      ctx.arc(sickleX, 76, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a1014';
      ctx.beginPath();
      ctx.arc(sickleX + 8, 70, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (level.ambientType === 'BOATQ') {
      // 扁舟问月：沧海巨月半悬海面，倒影相接，天地皆一粟
      const bigMoonX = this.width * 0.5 - cameraX * 0.03;
      const bigMoonY = laneMinY - 30;
      const bigGlow = ctx.createRadialGradient(bigMoonX, bigMoonY, 20, bigMoonX, bigMoonY, 190);
      bigGlow.addColorStop(0, 'rgba(228, 240, 252, 0.9)');
      bigGlow.addColorStop(0.3, 'rgba(180, 205, 232, 0.42)');
      bigGlow.addColorStop(1, 'rgba(120, 160, 200, 0)');
      ctx.fillStyle = bigGlow;
      ctx.beginPath();
      ctx.arc(bigMoonX, bigMoonY, 190, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8f1fa';
      ctx.beginPath();
      ctx.arc(bigMoonX, bigMoonY, 56, 0, Math.PI * 2);
      ctx.fill();
      // 倒握之笔的剪影（无尽藏之笔悬于月心，笔尖朝下——倒握之相）
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 26, 40, 0.78)';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(bigMoonX, bigMoonY - 44);
      ctx.lineTo(bigMoonX, bigMoonY + 30);
      ctx.stroke();
      ctx.fillStyle = 'rgba(20, 26, 40, 0.78)';
      ctx.beginPath();
      ctx.moveTo(bigMoonX - 3.4, bigMoonY + 30);
      ctx.lineTo(bigMoonX + 3.4, bigMoonY + 30);
      ctx.lineTo(bigMoonX, bigMoonY + 42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (level.ambientType === 'SHADOW') {
      // 疏影横斜：黄昏残月淡挂，清浅水光一湾
      const paleMoonX = this.width * 0.72 - cameraX * 0.05;
      const paleGlow = ctx.createRadialGradient(paleMoonX, 70, 5, paleMoonX, 70, 50);
      paleGlow.addColorStop(0, 'rgba(244, 238, 214, 0.75)');
      paleGlow.addColorStop(1, 'rgba(220, 214, 180, 0)');
      ctx.fillStyle = paleGlow;
      ctx.beginPath();
      ctx.arc(paleMoonX, 70, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0ead0';
      ctx.beginPath();
      ctx.arc(paleMoonX, 70, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a3628';
      ctx.beginPath();
      ctx.arc(paleMoonX + 7, 65, 13.5, 0, Math.PI * 2);
      ctx.fill();
      // 水湾清光（月下一湾浅水微光）
      const bayY = laneMinY * 0.82;
      const bay = ctx.createLinearGradient(0, bayY - 14, 0, bayY + 12);
      bay.addColorStop(0, 'rgba(220, 228, 200, 0)');
      bay.addColorStop(0.5, 'rgba(220, 228, 200, 0.14)');
      bay.addColorStop(1, 'rgba(220, 228, 200, 0)');
      ctx.fillStyle = bay;
      ctx.fillRect(this.width * 0.2, bayY - 14, this.width * 0.55, 26);
    } else if (level.ambientType === 'ONENESS') {
      // 万象归宗：殿顶盘龙剪影（龙身盘旋，龙目点金，随时间缓缓游动）
      const dragonY = laneMinY * 0.3;
      const headX = this.width * 0.5 - cameraX * 0.03 + Math.sin(gameTime * 0.35) * 26;
      ctx.save();
      // 龙身（正弦盘旋的粗线）
      ctx.strokeStyle = 'rgba(14, 10, 22, 0.72)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let x = -180; x <= 180; x += 10) {
        const wx = headX - x;
        const wy = dragonY + Math.sin(x * 0.024 + gameTime * 0.7) * 22 + Math.cos(x * 0.011 - gameTime * 0.4) * 10;
        if (x === -180) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      // 龙首（三角吻部+龙角）
      const headY = dragonY + Math.sin(180 * 0.024 + gameTime * 0.7) * 22;
      ctx.fillStyle = 'rgba(14, 10, 22, 0.78)';
      ctx.beginPath();
      ctx.moveTo(headX + 18, headY - 8);
      ctx.lineTo(headX + 34, headY + 2);
      ctx.lineTo(headX + 16, headY + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(14, 10, 22, 0.78)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(headX + 16, headY - 8);
      ctx.lineTo(headX + 8, headY - 20);
      ctx.moveTo(headX + 20, headY - 8);
      ctx.lineTo(headX + 16, headY - 21);
      ctx.stroke();
      // 龙目点金（文心之证，呼吸明灭）
      const eyeA = 0.5 + 0.5 * Math.sin(gameTime * 2.2);
      ctx.fillStyle = `rgba(244, 204, 120, ${0.55 + eyeA * 0.45})`;
      ctx.beginPath();
      ctx.arc(headX + 21, headY, 2.8, 0, Math.PI * 2);
      ctx.fill();
      // 龙爪两点
      ctx.lineWidth = 3.4;
      for (let c = 0; c < 2; c++) {
        const cx = headX - 90 + c * 150;
        const cy = dragonY + Math.sin((180 - (180 - (c === 0 ? 90 : -90)) * 1) * 0.024 + gameTime * 0.7) * 22;
        ctx.beginPath();
        ctx.moveTo(cx, cy + 5);
        ctx.lineTo(cx + 6, cy + 16);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    // 雁塔题名：远处慈恩塔剪影 + 塔铃微光（视差随相机缓移）
    if (level.ambientType === 'PAGODA') {
      ctx.save();
      const px0 = ((560 - cameraX * 0.08) % (this.width + 500) + this.width + 500) % (this.width + 500) - 250;
      const baseY = laneMinY;
      const towerH = laneMinY * 0.62;
      // 塔身（七层渐收的梯形叠涩）
      ctx.fillStyle = 'rgba(10, 16, 14, 0.66)';
      for (let lv = 0; lv < 7; lv++) {
        const yBase = baseY - (towerH / 7) * lv;
        const yTop = baseY - (towerH / 7) * (lv + 1);
        const halfW = 34 - lv * 3.6;
        ctx.beginPath();
        ctx.moveTo(px0 - halfW, yBase);
        ctx.lineTo(px0 - halfW + 2.5, yTop);
        ctx.lineTo(px0 + halfW - 2.5, yTop);
        ctx.lineTo(px0 + halfW, yBase);
        ctx.closePath();
        ctx.fill();
        // 檐角出挑
        ctx.fillRect(px0 - halfW - 6, yTop - 2, halfW * 2 + 12, 2.4);
      }
      // 塔刹
      ctx.strokeStyle = 'rgba(10, 16, 14, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px0, baseY - towerH);
      ctx.lineTo(px0, baseY - towerH - 16);
      ctx.stroke();
      // 塔身题字金斑（题名壁的字光，明灭如金榜）
      if (!this.qualityLow) {
        for (let i = 0; i < 6; i++) {
          const seed = i * 149.9;
          const gx = px0 - 18 + (seed % 36);
          const gy = baseY - 12 - (seed % Math.max(20, towerH - 30));
          const gl = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(gameTime * 1.8 + seed));
          ctx.fillStyle = `rgba(232, 200, 110, ${gl})`;
          ctx.fillRect(gx, gy, 3, 4.4);
        }
      }
      ctx.restore();
    }

    // 展卷入画：卷轴天地——界格线、卷边暗影与朱印（画中乾坤的纸面感）
    if (level.ambientType === 'SCROLLIN') {
      ctx.save();
      // 卷轴界格（极淡的纵向界线，随相机缓移）
      ctx.strokeStyle = 'rgba(120, 108, 88, 0.16)';
      ctx.lineWidth = 1;
      const gridGap = 170;
      const gOff = -(cameraX * 0.35) % gridGap;
      for (let gx = gOff; gx < this.width + gridGap; gx += gridGap) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx + 8, laneMinY);
        ctx.stroke();
      }
      // 卷边暗影（上下两道轴影，宣纸铺展感）
      const topShade = ctx.createLinearGradient(0, 0, 0, 34);
      topShade.addColorStop(0, 'rgba(60, 50, 38, 0.32)');
      topShade.addColorStop(1, 'rgba(60, 50, 38, 0)');
      ctx.fillStyle = topShade;
      ctx.fillRect(0, 0, this.width, 34);
      // 朱印（右上角一方朱砂印，微微透光）
      const sealX = this.width * 0.86 - cameraX * 0.05;
      ctx.fillStyle = 'rgba(168, 48, 36, 0.4)';
      ctx.fillRect(sealX, 44, 26, 26);
      ctx.fillStyle = 'rgba(240, 232, 214, 0.5)';
      ctx.fillRect(sealX + 5, 50, 6, 6);
      ctx.fillRect(sealX + 15, 58, 6, 6);
      ctx.restore();
    }

    // 绝响广陵：天际断弦（振动的琴弦横陈天际，纯 gameTime 函数，暂停自然凝滞）
    if (level.ambientType === 'STRING') {
      ctx.save();
      for (let s = 0; s < 5; s++) {
        const sy = laneMinY * (0.18 + s * 0.09);
        const amp = 1.6 + (s % 3) * 1.1;
        const broken = s === 2 || s === 4; // 两根断弦：中段留缺口，弦尾下垂
        ctx.strokeStyle = `rgba(196, 212, 222, ${0.16 + s * 0.022})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const gapStart = broken ? this.width * 0.46 : -1;
        const gapEnd = broken ? this.width * 0.54 : -1;
        let drawing = true;
        for (let x = 0; x <= this.width; x += 14) {
          const inGap = x > gapStart && x < gapEnd;
          const vy = sy + Math.sin(gameTime * (3.1 + s * 0.7) + x * 0.02 + s) * amp * (inGap ? 0 : 1);
          if (inGap) {
            if (drawing) {
              ctx.stroke();
              drawing = false;
            }
            continue;
          }
          if (!drawing) {
            ctx.beginPath();
            drawing = true;
          }
          if (x === 0) ctx.moveTo(x, vy);
          else ctx.lineTo(x, vy);
        }
        if (drawing) ctx.stroke();
        if (broken) {
          // 断弦下垂的弦尾
          ctx.strokeStyle = 'rgba(196, 212, 222, 0.24)';
          ctx.beginPath();
          ctx.moveTo(gapStart, sy);
          ctx.quadraticCurveTo(gapStart - 10, sy + 26, gapStart - 4, sy + 52 + Math.sin(gameTime * 1.7) * 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(gapEnd, sy);
          ctx.quadraticCurveTo(gapEnd + 10, sy + 22, gapEnd + 5, sy + 44 + Math.cos(gameTime * 1.4) * 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 烽火家书：远处烽燧剪影 + 塔顶火光明灭（视差随相机缓移）
    if (level.ambientType === 'BEACON') {
      ctx.save();
      for (let b = 0; b < 3; b++) {
        const bx = ((b * 470 + 180 - cameraX * 0.1) % (this.width + 340) + this.width + 340) % (this.width + 340) - 170;
        const bh = 54 + (b % 2) * 16;
        const by = laneMinY - bh;
        // 烽燧梯台剪影
        ctx.fillStyle = 'rgba(14, 8, 6, 0.72)';
        ctx.beginPath();
        ctx.moveTo(bx - 15, laneMinY);
        ctx.lineTo(bx - 10, by);
        ctx.lineTo(bx + 10, by);
        ctx.lineTo(bx + 15, laneMinY);
        ctx.closePath();
        ctx.fill();
        // 垛口
        ctx.fillRect(bx - 12, by - 5, 4, 5);
        ctx.fillRect(bx - 2, by - 5, 4, 5);
        ctx.fillRect(bx + 8, by - 5, 4, 5);
        // 塔顶火光明灭
        const fa = 0.5 + Math.sin(gameTime * 3.2 + b * 2.1) * 0.28;
        const fire = ctx.createRadialGradient(bx, by - 10, 1, bx, by - 10, 30);
        fire.addColorStop(0, `rgba(255, 190, 90, ${fa})`);
        fire.addColorStop(0.4, `rgba(255, 120, 40, ${fa * 0.5})`);
        fire.addColorStop(1, 'rgba(255, 80, 30, 0)');
        ctx.fillStyle = fire;
        ctx.beginPath();
        ctx.arc(bx, by - 10, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 210, 120, ${fa})`;
        ctx.beginPath();
        ctx.arc(bx, by - 10, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 黑云压城：翻滚墨云横陈天际（雁门太守行·终章异象）
    if (level.ambientType === 'SIEGE') {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 5, 9, 0.82)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= this.width; x += 26) {
        const wx = x + Math.sin(gameTime * 0.22) * 8;
        const wy = laneMinY * 0.2
          + Math.sin(wx * 0.011 + gameTime * 0.16) * 16
          + Math.cos(wx * 0.023 - gameTime * 0.1) * 9;
        ctx.lineTo(x, Math.max(6, wy));
      }
      ctx.lineTo(this.width, 0);
      ctx.closePath();
      ctx.fill();
      // 云隙压下的暗红天光
      const siegeGlow = ctx.createLinearGradient(0, laneMinY * 0.2, 0, laneMinY);
      siegeGlow.addColorStop(0, 'rgba(120, 40, 26, 0)');
      siegeGlow.addColorStop(1, 'rgba(150, 52, 30, 0.14)');
      ctx.fillStyle = siegeGlow;
      ctx.fillRect(0, laneMinY * 0.2, this.width, laneMinY * 0.8);
      ctx.restore();
    }

    // 云中霓旌：云海横带翻卷 + 玄墨旌旗列阵（九歌·云中君异象）
    if (level.ambientType === 'CLOUDMARCH') {
      ctx.save();
      // 三层云海横带（缓速对流，视差分层）
      for (let cB = 0; cB < 3; cB++) {
        const bandY = laneMinY * (0.24 + cB * 0.14);
        const drift = ((gameTime * (12 + cB * 7) + cB * 320) % (this.width + 460)) - 230;
        for (let p = 0; p < 4; p++) {
          const pX = drift + p * 130;
          const pY = bandY + Math.sin(gameTime * 0.5 + p + cB * 2) * 7;
          const pR = 34 + ((p * 7 + cB * 11) % 22);
          ctx.fillStyle = `rgba(${cB === 0 ? '214, 210, 226' : cB === 1 ? '168, 162, 186' : '128, 122, 150'}, ${0.2 - cB * 0.045})`;
          ctx.beginPath();
          ctx.ellipse(pX, pY, pR, pR * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 玄墨旌旗列阵（旗杆直上，旗面翻卷，视差随相机）
      for (let b = 0; b < 4; b++) {
        const bx = ((b * 380 + 240 - cameraX * 0.12) % (this.width + 300) + this.width + 300) % (this.width + 300) - 150;
        const topY = laneMinY * 0.3 + (b % 2) * 18;
        const botY = laneMinY - 24;
        ctx.strokeStyle = 'rgba(10, 8, 16, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, botY);
        ctx.lineTo(bx, topY);
        ctx.stroke();
        // 旗面（sin 波动裁出旌形）
        ctx.fillStyle = 'rgba(16, 10, 24, 0.72)';
        ctx.beginPath();
        ctx.moveTo(bx, topY);
        for (let yy = 0; yy <= 34; yy += 6) {
          ctx.lineTo(bx + 44 - yy * 0.4 + Math.sin(gameTime * 3 + yy * 0.2 + b) * 4, topY + yy);
        }
        for (let yy = 34; yy >= 0; yy -= 6) {
          ctx.lineTo(bx + 30 - yy * 0.4 + Math.sin(gameTime * 3 + yy * 0.2 + b) * 4, topY + yy);
        }
        ctx.closePath();
        ctx.fill();
        // 旗顶玄珠
        ctx.fillStyle = 'rgba(200, 190, 220, 0.5)';
        ctx.beginPath();
        ctx.arc(bx, topY - 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

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

  /** 大气天气层：按章节氛围程序化绘制（纯 gameTime 函数，暂停自然凝滞；行云模式裁剪粒子） */
  private drawAmbientWeather(level: LevelConfig, gameTime: number, laneMinY: number) {
    const ctx = this.ctx;
    const t = gameTime;
    const W = this.width;
    const H = this.height;

    if (level.ambientType === 'MIST') {
      // 烟雨断桥：横移雾带 + 灰青细雨
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const seed = i * 173.3;
        const bandH = 34 + i * 14;
        const bandY = laneMinY - 96 + i * 42 + Math.sin(t * 0.35 + seed) * 8;
        const drift = ((t * (9 + i * 4) + seed * 7) % (W + 240)) - 120;
        const g = ctx.createLinearGradient(drift - 180, 0, drift + 180, 0);
        g.addColorStop(0, 'rgba(213, 220, 216, 0)');
        g.addColorStop(0.5, `rgba(213, 220, 216, ${0.16 - i * 0.03})`);
        g.addColorStop(1, 'rgba(213, 220, 216, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(drift - 180, bandY, 360, bandH);
      }
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(214, 224, 220, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 42; i++) {
          const seed = i * 97.31;
          const rx = ((seed * 73 + t * 240) % (W + 40)) - 20;
          const ry = ((seed * 57 + t * 430) % (H + 80)) - 40;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 2.4, ry + 11);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'AUTUMN') {
      // 枫林晚渡：飘旋霜叶
      if (this.qualityLow) return;
      ctx.save();
      const palette = ['#b45824', '#8a2f1d', '#d97b3f', '#a83a2a', '#c9552e'];
      for (let i = 0; i < 14; i++) {
        const seed = i * 131.7;
        const bx = ((seed * 53) % (W + 80)) - 40;
        const lx = bx + Math.sin(t * 0.8 + seed) * 46;
        const ly = ((seed * 97 + t * 88) % (H + 60)) - 30;
        const rot = t * 1.9 + seed;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = palette[i % palette.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 5.2, 2.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (level.ambientType === 'STORM') {
      // 雷峰夕照：斜骤雨 + 周期惊雷
      ctx.save();
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(178, 196, 214, 0.24)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let i = 0; i < 58; i++) {
          const seed = i * 89.77;
          const rx = ((seed * 67 + t * 520) % (W + 60)) - 30;
          const ry = ((seed * 43 + t * 760) % (H + 90)) - 45;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4.5, ry + 19);
        }
        ctx.stroke();
      }
      // 惊雷：7.5s 周期双脉冲白闪 + 折线闪电（seed 随周期轮换）
      const ph = t % 7.5;
      if (ph < 0.5) {
        const a =
          ph < 0.08 ? 0.5 : ph < 0.16 ? 0.08 : ph < 0.26 ? 0.34 : Math.max(0, 0.34 * (1 - (ph - 0.26) / 0.24));
        ctx.fillStyle = `rgba(226, 238, 255, ${a})`;
        ctx.fillRect(0, 0, W, H);
        if (ph < 0.2) {
          const cyc = Math.floor(t / 7.5);
          let bx = ((cyc * 197) % Math.floor(W * 0.7)) + W * 0.15;
          let by = 0;
          ctx.strokeStyle = 'rgba(230, 240, 255, 0.85)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          for (let s = 0; s < 6; s++) {
            const seg = ((cyc * 61 + s * 37) % 70) - 35;
            bx += seg;
            by += (laneMinY * 0.72) / 6;
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'VOID') {
      // 文枢归一：上浮的褪字墨尘（被洗去的文字化作微光升散）
      if (this.qualityLow) return;
      ctx.save();
      for (let i = 0; i < 20; i++) {
        const seed = i * 149.3;
        const mx = ((seed * 41) % (W + 60)) - 30 + Math.sin(t * 0.5 + seed) * 26;
        const my = H - ((seed * 83 + t * 42) % (H + 50));
        const r = 1.4 + (seed % 10) * 0.18;
        ctx.fillStyle = `rgba(216, 180, 254, ${0.1 + (seed % 7) * 0.028})`;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (level.ambientType === 'LOTUS') {
      // 溪亭暮弦：萤火明灭 + 藕花瓣飘落 + 鸥鹭掠影
      ctx.save();
      if (!this.qualityLow) {
        for (let i = 0; i < 9; i++) {
          const seed = i * 211.7;
          const fx = ((seed * 31) % (W + 40)) - 20 + Math.sin(t * 0.9 + seed) * 34;
          const fy = laneMinY - 40 - (seed % 90) - Math.sin(t * 0.55 + seed * 2) * 16;
          const pulse = 0.3 + 0.42 * (0.5 + 0.5 * Math.sin(t * 2.3 + seed * 5));
          ctx.fillStyle = `rgba(255, 236, 140, ${pulse})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.8 + (seed % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!this.qualityLow) {
        const petalColors = ['#f2c4cd', '#e8a7b7', '#f7dde2'];
        for (let i = 0; i < 10; i++) {
          const seed = i * 157.3;
          const px = ((seed * 47) % (W + 60)) - 30 + Math.sin(t * 0.7 + seed) * 30;
          const py = ((seed * 89 + t * 55) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 1.3 + seed) * 0.9 + seed);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = petalColors[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.5, 2.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(245, 240, 232, 0.42)';
        ctx.lineWidth = 1.6;
        for (let g = 0; g < 3; g++) {
          const seed = g * 331.1;
          const gx = ((t * (14 + g * 5) + seed * 97) % (W + 300)) - 150;
          const gy = laneMinY * (0.2 + g * 0.09) + Math.sin(t * 0.8 + seed) * 6;
          const flap = Math.sin(t * 6 + seed) * 3.2;
          ctx.beginPath();
          ctx.moveTo(gx - 8, gy - flap);
          ctx.quadraticCurveTo(gx, gy + 2.5, gx + 8, gy - flap);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'GOOSE') {
      // 雁字西楼：雁阵人字横空 + 红藕残瓣
      if (!this.qualityLow) {
        ctx.save();
        ctx.strokeStyle = 'rgba(26, 28, 38, 0.62)';
        ctx.lineWidth = 1.5;
        const flockX = ((t * 11) % (W + 420)) - 210;
        const flockY = laneMinY * 0.3;
        for (let g = 0; g < 7; g++) {
          const row = Math.ceil(g / 2);
          const side = g % 2 === 0 ? 1 : -1;
          const bx = flockX - row * 16;
          const by = flockY + row * 13 * side + Math.sin(t * 1.2 + g) * 2;
          const flap = Math.sin(t * 5 + g * 0.7) * 2.6;
          ctx.beginPath();
          ctx.moveTo(bx - 6, by - flap);
          ctx.quadraticCurveTo(bx, by + 2, bx + 6, by - flap);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (!this.qualityLow) {
        ctx.save();
        const cols = ['#a34a52', '#8a3a44', '#c4707a'];
        for (let i = 0; i < 12; i++) {
          const seed = i * 167.9;
          const px = ((seed * 53) % (W + 60)) - 30 + Math.sin(t * 0.6 + seed) * 26;
          const py = ((seed * 97 + t * 64) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(seed + Math.sin(t * 1.1 + seed) * 0.8);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = cols[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.6, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    } else if (level.ambientType === 'CHRYS') {
      // 黄花瘦影：西风疾线 + 菊瓣细长打旋
      if (this.qualityLow) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(240, 224, 180, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const seed = i * 251.3;
        const wy = laneMinY * 0.3 + (seed % 700) * 0.7;
        const wx = ((seed * 37 + t * 180) % (W + 200)) - 100;
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 46 + (seed % 30), wy + 2);
      }
      ctx.stroke();
      const cols = ['#e8b84a', '#d8a428', '#f0d070', '#c4922a'];
      for (let i = 0; i < 14; i++) {
        const seed = i * 143.7;
        const px = ((seed * 41) % (W + 60)) - 30 + Math.sin(t * 1.1 + seed) * 52;
        const py = ((seed * 89 + t * 95) % (H + 50)) - 25;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 2.1 + seed);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 6.2, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (level.ambientType === 'GLOOM') {
      // 声声慢雨：点点滴滴缓雨 + 梧桐落叶打旋
      ctx.save();
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(190, 205, 198, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 34; i++) {
          const seed = i * 113.7;
          const rx = ((seed * 71 + t * 130) % (W + 40)) - 20;
          const ry = ((seed * 59 + t * 300) % (H + 70)) - 35;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 1, ry + 9);
        }
        ctx.stroke();
      }
      if (!this.qualityLow) {
        const cols = ['#3d4a34', '#4a5540', '#2e3a28'];
        for (let i = 0; i < 9; i++) {
          const seed = i * 191.3;
          const lx = ((seed * 43) % (W + 60)) - 30 + Math.sin(t * 0.5 + seed) * 44;
          const ly = ((seed * 83 + t * 70) % (H + 50)) - 25;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(Math.sin(t * 0.9 + seed) * 1.4 + seed);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = cols[i % 3];
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.quadraticCurveTo(7, -2, 0, 7);
          ctx.quadraticCurveTo(-7, -2, 0, -7);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'STRING') {
      // 绝响广陵：墨色音符上浮 + 地面音纹涟漪
      if (this.qualityLow) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(170, 195, 210, 0.14)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const seed = i * 277.7;
        const ph = (t * 0.35 + i * 0.27) % 1;
        const cx = (seed * 67) % W;
        const cy = H - 30 - (seed % 60);
        const rr = 20 + ph * 130;
        ctx.globalAlpha = (1 - ph) * 0.16;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(16, 22, 28, 0.78)';
      ctx.strokeStyle = 'rgba(16, 22, 28, 0.78)';
      for (let i = 0; i < 11; i++) {
        const seed = i * 149.9;
        const nx = ((seed * 37) % (W + 40)) - 20 + Math.sin(t * 0.6 + seed) * 22;
        const ny = H - ((seed * 71 + t * 46) % (H * 0.8));
        const s = 0.8 + (seed % 5) * 0.14;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(Math.sin(t * 0.8 + seed) * 0.25);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.4, 2.4, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(3, -0.8);
        ctx.lineTo(3, -13);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(3, -13);
        ctx.quadraticCurveTo(8.5, -10.5, 6, -5.5);
        ctx.quadraticCurveTo(6.8, -9.5, 3, -10.5);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (level.ambientType === 'DESERT') {
      // 大漠孤烟：孤烟笔直 + 黄沙横扫 + 沙粒打旋
      ctx.save();
      // 孤烟（远处笔直上升的狼烟，随风缓摇）
      const smokeX = W * 0.72;
      ctx.strokeStyle = 'rgba(58, 46, 38, 0.32)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let y = laneMinY - 12; y > laneMinY * 0.12; y -= 8) {
        const rise = (laneMinY - y) / laneMinY;
        const sway = Math.sin(t * 0.6 + y * 0.05) * 6 * rise;
        if (y === laneMinY - 12) ctx.moveTo(smokeX + sway, y);
        else ctx.lineTo(smokeX + sway, y);
      }
      ctx.stroke();
      if (!this.qualityLow) {
        // 黄沙横扫线
        ctx.strokeStyle = 'rgba(216, 178, 118, 0.3)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
          const seed = i * 83.7;
          const sx = ((seed * 71 + t * 330) % (W + 80)) - 40;
          const sy = laneMinY * 0.35 + ((seed * 43) % (H * 0.55));
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 18 - (seed % 14), sy + 2.5);
        }
        ctx.stroke();
        // 沙粒打旋
        const sandCols = ['#d8b070', '#c49a52', '#e8cc90'];
        for (let i = 0; i < 12; i++) {
          const seed = i * 167.3;
          const px = ((seed * 47) % (W + 60)) - 30 + Math.sin(t * 1.3 + seed) * 30;
          const py = laneMinY * 0.5 + ((seed * 97 + t * 120) % (H * 0.4));
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * 2.4 + seed);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = sandCols[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.4, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'BEACON') {
      // 烽火家书：烽火光晕呼吸 + 灰烬火星上浮 + 家书纸页飘零
      ctx.save();
      // 地平线烽火光晕（呼吸）
      const pulse = 0.16 + Math.sin(t * 2.1) * 0.05;
      const glow = ctx.createLinearGradient(0, laneMinY - 70, 0, laneMinY + 20);
      glow.addColorStop(0, 'rgba(255, 120, 40, 0)');
      glow.addColorStop(0.7, `rgba(255, 120, 40, ${pulse})`);
      glow.addColorStop(1, `rgba(255, 160, 60, ${pulse * 1.6})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, laneMinY - 70, W, 90);
      if (!this.qualityLow) {
        // 上升灰烬 / 火星
        for (let i = 0; i < 22; i++) {
          const seed = i * 137.9;
          const ex = ((seed * 53) % (W + 40)) - 20 + Math.sin(t * 0.9 + seed) * 26;
          const ey = H - ((seed * 79 + t * (36 + (seed % 30))) % (H + 40));
          const isSpark = i % 4 === 0;
          ctx.globalAlpha = isSpark ? 0.75 : 0.4;
          ctx.fillStyle = isSpark ? '#ffb050' : '#8a7a6a';
          ctx.beginPath();
          ctx.arc(ex, ey, isSpark ? 1.8 : 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // 飘零家书纸页
        ctx.fillStyle = 'rgba(228, 216, 190, 0.5)';
        for (let i = 0; i < 5; i++) {
          const seed = i * 211.3;
          const px = ((seed * 61) % (W + 60)) - 30 + Math.sin(t * 0.7 + seed) * 40;
          const py = ((seed * 83 + t * 55) % (H + 50)) - 25;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 0.8 + seed) * 0.9 + seed);
          ctx.fillRect(-4.5, -6, 9, 12);
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'WITHER') {
      // 羌笛怨柳：枯枝剪影 + 灰柳絮打旋坠落
      ctx.save();
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(30, 30, 22, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const seed = i * 173.1;
          const bx = (seed * 53) % W;
          const by = laneMinY * (0.24 + (seed % 40) / 160);
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + 16, by - 9, bx + 34, by - 4);
          ctx.moveTo(bx + 17, by - 6.5);
          ctx.quadraticCurveTo(bx + 22, by - 15, bx + 30, by - 17);
        }
        ctx.stroke();
      }
      const fuzzCols = ['rgba(196, 198, 176, 0.55)', 'rgba(168, 172, 148, 0.5)', 'rgba(214, 214, 194, 0.45)'];
      for (let i = 0; i < 16; i++) {
        const seed = i * 127.7;
        const fx = ((seed * 67) % (W + 60)) - 30 + Math.sin(t * 1.1 + seed) * 44;
        const fy = ((seed * 89 + t * 72) % (H + 60)) - 30;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(t * 1.8 + seed);
        ctx.fillStyle = fuzzCols[i % 3];
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.6, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (level.ambientType === 'IRON') {
      // 铁衣寒光：寒光星芒明灭 + 长风掠沙
      ctx.save();
      if (!this.qualityLow) {
        for (let i = 0; i < 9; i++) {
          const seed = i * 197.3;
          const sx = ((seed * 71) % (W + 40)) - 20;
          const sy = laneMinY * (0.2 + (seed % 50) / 110);
          const tw = Math.max(0, Math.sin(t * 2.2 + seed));
          if (tw < 0.25) continue;
          ctx.strokeStyle = `rgba(220, 235, 250, ${tw * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - 4.5, sy);
          ctx.lineTo(sx + 4.5, sy);
          ctx.moveTo(sx, sy - 4.5);
          ctx.lineTo(sx, sy + 4.5);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(150, 170, 195, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const seed = i * 149.7;
          const wx = ((seed * 83 + t * 260) % (W + 100)) - 50;
          const wy = laneMinY * 0.3 + ((seed * 47) % (H * 0.5));
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 40 + (seed % 26), wy + 3);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'SIEGE') {
      // 黑云压城：战鼓暗红脉冲 + 火矢流光 + 灰烬弥漫
      ctx.save();
      const drumPh = t % 7;
      if (drumPh < 1.1) {
        const da = drumPh < 0.14 ? 0.16 : Math.max(0, 0.16 * (1 - (drumPh - 0.14) / 0.96));
        const dg = ctx.createRadialGradient(W * 0.5, laneMinY, 40, W * 0.5, laneMinY, H * 0.75);
        dg.addColorStop(0, `rgba(255, 70, 30, ${da})`);
        dg.addColorStop(1, 'rgba(255, 70, 30, 0)');
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, W, H);
      }
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(255, 120, 50, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const seed = i * 233.9;
          const cyc = (t * 0.9 + i * 0.37) % 1;
          const ax = ((seed * 71) % W) + cyc * 240;
          const ay = laneMinY * 0.1 + ((seed * 37) % (H * 0.5)) + cyc * 200;
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - 26, ay - 18);
        }
        ctx.stroke();
        for (let i = 0; i < 14; i++) {
          const seed = i * 151.3;
          const ex = ((seed * 59) % (W + 40)) - 20 + Math.sin(t * 0.6 + seed) * 20;
          const ey = H - ((seed * 73 + t * 40) % (H + 40));
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = '#6a5a50';
          ctx.beginPath();
          ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'ORCHID') {
      // 沅芷澧兰：兰瓣明灭飘坠 + 湘水波光横纹
      ctx.save();
      // 湘水波光（地平线上下的横向水纹，缓慢明灭）
      if (!this.qualityLow) {
        for (let i = 0; i < 7; i++) {
          const seed = i * 191.7;
          const wy = laneMinY + 12 + (seed % 90) - Math.sin(t * 0.7 + seed) * 5;
          const wx = ((seed * 53 + t * 26) % (W + 160)) - 80;
          ctx.strokeStyle = `rgba(190, 206, 214, ${0.1 + (seed % 5) * 0.022})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + 30, wy - 3.5, wx + 62, wy);
          ctx.stroke();
        }
      }
      // 兰瓣（紫青细长瓣，旋坠）
      if (!this.qualityLow) {
        const orchidCols = ['#a8b8d8', '#8a9ac8', '#c4cee4'];
        for (let i = 0; i < 12; i++) {
          const seed = i * 149.3;
          const px = ((seed * 47) % (W + 60)) - 30 + Math.sin(t * 0.75 + seed) * 34;
          const py = ((seed * 89 + t * 58) % (H + 50)) - 25;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 1.2 + seed) * 1.1 + seed);
          ctx.globalAlpha = 0.62;
          ctx.fillStyle = orchidCols[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.8, 1.9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'MORN') {
      // 扶桑浴日：金羽光屑自日轮向天飘散 + 晨雾横带
      ctx.save();
      // 晨雾横带（贴地缓移）
      for (let i = 0; i < 2; i++) {
        const bandY = laneMinY - 30 - i * 26;
        const drift = ((t * (16 + i * 8) + i * 300) % (W + 320)) - 160;
        const g = ctx.createLinearGradient(drift - 150, 0, drift + 150, 0);
        g.addColorStop(0, 'rgba(255, 226, 170, 0)');
        g.addColorStop(0.5, `rgba(255, 226, 170, ${0.12 - i * 0.04})`);
        g.addColorStop(1, 'rgba(255, 226, 170, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(drift - 150, bandY, 300, 22);
      }
      if (!this.qualityLow) {
        // 金羽光屑（自右下日轮方向升飘）
        for (let i = 0; i < 13; i++) {
          const seed = i * 167.9;
          const fx2 = W * 0.72 + Math.sin(t * 0.6 + seed) * 90 - ((seed * 13) % 120);
          const fy2 = laneMinY - ((seed * 53 + t * (26 + (seed % 20))) % (laneMinY * 0.85));
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.8 + seed);
          ctx.fillStyle = '#ffe2a0';
          ctx.save();
          ctx.translate(fx2, fy2);
          ctx.rotate(Math.sin(t * 1.1 + seed) * 0.8);
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.6, 1.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (level.ambientType === 'HOLLOW') {
      // 幽篁灵雨：灵雨冥冥 + 薜萝藤影垂摆 + 幽萤两点
      ctx.save();
      // 灵雨（密而缓的细雨）
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(168, 196, 178, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 44; i++) {
          const seed = i * 107.3;
          const rx = ((seed * 67 + t * 110) % (W + 40)) - 20;
          const ry = ((seed * 59 + t * 260) % (H + 70)) - 35;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 1.4, ry + 10);
        }
        ctx.stroke();
      }
      // 薜萝藤影（自天垂下的摆藤剪影）
      if (!this.qualityLow) {
        ctx.strokeStyle = 'rgba(14, 26, 18, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const seed = i * 149.7;
          const tx = (seed * 41) % W;
          const topY = -6;
          const len = 40 + (seed % 70);
          ctx.beginPath();
          ctx.moveTo(tx, topY);
          ctx.quadraticCurveTo(
            tx + Math.sin(t * 0.7 + seed) * 12, topY + len * 0.55,
            tx + Math.sin(t * 0.7 + seed) * 18, topY + len
          );
          ctx.stroke();
        }
      }
      // 幽萤两点（山鬼的引路灯）
      for (let i = 0; i < 3; i++) {
        const seed = i * 271.3;
        const gx = W * (0.2 + i * 0.28) + Math.sin(t * 0.5 + seed) * 44;
        const gy = laneMinY * (0.5 + (seed % 20) / 60) + Math.cos(t * 0.4 + seed) * 20;
        const glow = 0.3 + 0.36 * (0.5 + 0.5 * Math.sin(t * 1.7 + seed * 3));
        ctx.fillStyle = `rgba(190, 255, 190, ${glow})`;
        ctx.beginPath();
        ctx.arc(gx, gy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (level.ambientType === 'STARQ') {
      // 天问列星：星河横带 + 星屑缓坠 + 「问」字残光浮沉
      ctx.save();
      // 星河横带（银河斜挂）
      const milky = ctx.createLinearGradient(0, laneMinY * 0.1, W, laneMinY * 0.55);
      milky.addColorStop(0, 'rgba(140, 120, 200, 0)');
      milky.addColorStop(0.5, 'rgba(150, 132, 210, 0.1)');
      milky.addColorStop(1, 'rgba(140, 120, 200, 0)');
      ctx.fillStyle = milky;
      ctx.fillRect(0, laneMinY * 0.08, W, laneMinY * 0.5);
      if (!this.qualityLow) {
        // 星屑缓坠
        for (let i = 0; i < 18; i++) {
          const seed = i * 137.9;
          const sx = ((seed * 53) % (W + 40)) - 20 + Math.sin(t * 0.3 + seed) * 14;
          const sy = ((seed * 89 + t * 20) % (H + 40)) - 20;
          ctx.globalAlpha = 0.2 + (seed % 6) * 0.05;
          ctx.fillStyle = '#ded6f4';
          ctx.beginPath();
          ctx.arc(sx, sy, 1.1 + (seed % 3) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 「问」字残光（透明度呼吸的金色问字，自左向右缓浮）
        ctx.font = '42px "STKaiti", "KaiTi", "WenKai", serif';
        ctx.fillStyle = `rgba(226, 208, 140, ${0.1 + 0.06 * Math.sin(t * 0.9)})`;
        for (let i = 0; i < 3; i++) {
          const seed = i * 311.7;
          const qx = ((t * 9 + seed * 47) % (W + 200)) - 100;
          const qy = laneMinY * (0.34 + i * 0.14);
          ctx.fillText('问', qx, qy);
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'RIVULET') {
      // 缘溪行：溪光鳞纹 + 落英随水 + 晨雾带
      ctx.save();
      // 溪光鳞纹（地平线下的横向细纹，缓慢流动）
      if (!this.qualityLow) {
        for (let i = 0; i < 8; i++) {
          const seed = i * 211.7;
          const wy = laneMinY + 14 + (seed % 80);
          const wx = ((seed * 47 + t * 34) % (W + 140)) - 70;
          ctx.strokeStyle = `rgba(190, 226, 214, ${0.12 + (seed % 4) * 0.03})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + 26, wy - 3, wx + 54, wy);
          ctx.stroke();
        }
      }
      // 落英随水（粉瓣顺流斜落）
      if (!this.qualityLow) {
        const cols = ['#f4b4c8', '#e894ac', '#f8d0da'];
        for (let i = 0; i < 11; i++) {
          const seed = i * 157.3;
          const px = ((seed * 53) % (W + 60)) - 30 + Math.sin(t * 0.65 + seed) * 26;
          const py = ((seed * 89 + t * 62) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 1.2 + seed) * 0.8 + seed);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = cols[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.8, 2.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      // 晨雾带
      for (let i = 0; i < 2; i++) {
        const bandY = laneMinY - 60 - i * 30;
        const drift = ((t * (10 + i * 6) + i * 280) % (W + 360)) - 180;
        const g = ctx.createLinearGradient(drift - 170, 0, drift + 170, 0);
        g.addColorStop(0, 'rgba(214, 234, 226, 0)');
        g.addColorStop(0.5, `rgba(214, 234, 226, ${0.13 - i * 0.04})`);
        g.addColorStop(1, 'rgba(214, 234, 226, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(drift - 170, bandY, 340, 26);
      }
      ctx.restore();
    } else if (level.ambientType === 'PEACHDAWN') {
      // 夹岸桃霞：桃瓣密雨 + 花枝剪影横斜
      ctx.save();
      if (!this.qualityLow) {
        // 花枝剪影（自两侧斜出）
        ctx.strokeStyle = 'rgba(40, 16, 28, 0.42)';
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 4; i++) {
          const seed = i * 233.7;
          const side = i % 2 === 0 ? 1 : -1;
          const bx = side > 0 ? -10 : W + 10;
          const by = laneMinY * (0.3 + (seed % 20) / 90);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(
            bx + side * (70 + (seed % 50)), by - 26,
            bx + side * (150 + (seed % 60)), by - 12
          );
          ctx.stroke();
        }
        // 桃瓣密雨
        const cols = ['#f4a8bc', '#e88aa4', '#f8ccd6', '#d8708e'];
        for (let i = 0; i < 18; i++) {
          const seed = i * 137.9;
          const px = ((seed * 47) % (W + 60)) - 30 + Math.sin(t * 0.9 + seed) * 40;
          const py = ((seed * 83 + t * 92) % (H + 50)) - 25;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * 1.7 + seed);
          ctx.globalAlpha = 0.66;
          ctx.fillStyle = cols[i % 4];
          ctx.beginPath();
          ctx.ellipse(0, 0, 5.4, 2.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'GAPLIGHT') {
      // 豁然开朗：洞口光柱自上而下 + 光尘浮游 + 蝶影
      ctx.save();
      // 光柱（顶部斜下的锥形光带，透明度呼吸）
      const beamA = 0.16 + Math.sin(t * 0.7) * 0.05;
      const beam = ctx.createLinearGradient(W * 0.36, 0, W * 0.6, laneMinY);
      beam.addColorStop(0, `rgba(255, 236, 180, ${beamA})`);
      beam.addColorStop(1, 'rgba(255, 236, 180, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(W * 0.42, 0);
      ctx.lineTo(W * 0.56, 0);
      ctx.lineTo(W * 0.72, laneMinY);
      ctx.lineTo(W * 0.4, laneMinY);
      ctx.closePath();
      ctx.fill();
      if (!this.qualityLow) {
        // 光尘浮游（光柱内慢速上升的金屑）
        for (let i = 0; i < 14; i++) {
          const seed = i * 191.3;
          const dx = W * 0.42 + ((seed * 71) % (W * 0.22)) + Math.sin(t * 0.5 + seed) * 14;
          const dy = laneMinY - ((seed * 83 + t * 22) % (laneMinY * 0.95));
          ctx.globalAlpha = 0.34 + (seed % 5) * 0.06;
          ctx.fillStyle = '#ffedbc';
          ctx.beginPath();
          ctx.arc(dx, dy, 1.2 + (seed % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 蝶影两点（先睹为快的探路蝶）
        ctx.strokeStyle = 'rgba(60, 44, 24, 0.5)';
        ctx.lineWidth = 1.3;
        for (let i = 0; i < 2; i++) {
          const seed = i * 331.9;
          const bx = W * (0.5 + i * 0.14) + Math.sin(t * 0.8 + seed) * 46;
          const by = laneMinY * (0.5 + i * 0.16) + Math.cos(t * 0.6 + seed) * 24;
          const flap = Math.sin(t * 7 + seed) * 3;
          ctx.beginPath();
          ctx.moveTo(bx - 4, by - flap);
          ctx.quadraticCurveTo(bx, by + 2, bx + 4, by - flap);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'SMOKEFIELD') {
      // 阆陌炊烟：炊烟柱袅袅 + 麦穗金粒 + 归鸟一串
      ctx.save();
      // 炊烟柱（远处三户人家，烟柱摇曳上升）
      ctx.strokeStyle = 'rgba(232, 218, 196, 0.26)';
      ctx.lineWidth = 5;
      for (let s = 0; s < 3; s++) {
        const smokeX = W * (0.24 + s * 0.24);
        ctx.beginPath();
        for (let y = laneMinY - 16; y > laneMinY * 0.16; y -= 7) {
          const rise = (laneMinY - y) / laneMinY;
          const sway = Math.sin(t * 0.55 + y * 0.045 + s * 2) * 9 * rise;
          if (y === laneMinY - 16) ctx.moveTo(smokeX + sway, y);
          else ctx.lineTo(smokeX + sway, y);
        }
        ctx.stroke();
      }
      if (!this.qualityLow) {
        // 麦穗金粒（地面上方翻滚的暖色颗粒）
        for (let i = 0; i < 14; i++) {
          const seed = i * 149.7;
          const gx = ((seed * 61) % (W + 40)) - 20 + Math.sin(t * 1.1 + seed) * 30;
          const gy = laneMinY * 0.72 + ((seed * 89 + t * 46) % (H * 0.24));
          ctx.fillStyle = 'rgba(228, 190, 110, 0.5)';
          ctx.beginPath();
          ctx.ellipse(gx, gy, 2.2, 1, t * 1.4 + seed, 0, Math.PI * 2);
          ctx.fill();
        }
        // 归鸟一串（五只人字小队掠过暮色）
        ctx.strokeStyle = 'rgba(52, 36, 22, 0.5)';
        ctx.lineWidth = 1.4;
        const flockX = ((t * 13) % (W + 320)) - 160;
        for (let g = 0; g < 5; g++) {
          const row = Math.ceil(g / 2);
          const side = g % 2 === 0 ? 1 : -1;
          const bx = flockX - row * 15;
          const by = laneMinY * 0.26 + row * 12 * side + Math.sin(t * 1.1 + g) * 2;
          const flap = Math.sin(t * 5.4 + g) * 2.8;
          ctx.beginPath();
          ctx.moveTo(bx - 5.5, by - flap);
          ctx.quadraticCurveTo(bx, by + 2, bx + 5.5, by - flap);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'EERYPEACH') {
      // 千年迷津：桃花与玄墨齐飞 + 裂隙光晕呼吸 + 半瓣半墨
      ctx.save();
      // 裂隙光晕（随时间呼吸的桃色地光）
      const riftA = 0.1 + 0.05 * Math.sin(t * 1.3);
      const rg = ctx.createLinearGradient(0, laneMinY - 60, 0, laneMinY + 20);
      rg.addColorStop(0, 'rgba(255, 160, 190, 0)');
      rg.addColorStop(0.65, `rgba(255, 160, 190, ${riftA})`);
      rg.addColorStop(1, `rgba(120, 50, 110, ${riftA * 1.3})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, laneMinY - 60, W, 80);
      if (!this.qualityLow) {
        // 半桃瓣半墨尘（一半花一半墨，千年谜题的具象）
        for (let i = 0; i < 16; i++) {
          const seed = i * 167.3;
          const px = ((seed * 53) % (W + 60)) - 30 + Math.sin(t * 0.8 + seed) * 38;
          const py = ((seed * 97 + t * 54) % (H + 50)) - 25;
          const ink = i % 2 === 1;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * (ink ? 1.9 : 1.2) + seed);
          ctx.globalAlpha = ink ? 0.6 : 0.62;
          ctx.fillStyle = ink ? '#140a1a' : '#f4b4c8';
          ctx.beginPath();
          ctx.ellipse(0, 0, ink ? 3.2 : 5.2, ink ? 1.6 : 2.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'LANTERN') {
      // 春宵灯市：灯河光点 + 孔明灯升 + 灯影人潮尾迹
      ctx.save();
      // 灯河（地平线上两串灯火明灭）
      for (let i = 0; i < 12; i++) {
        const seed = i * 173.9;
        const lx = ((seed * 67) % W);
        const ly = laneMinY - 8 - (seed % 46);
        const la = 0.4 + 0.32 * (0.5 + 0.5 * Math.sin(t * 2.4 + seed));
        const warm = ctx.createRadialGradient(lx, ly, 0, lx, ly, 9);
        warm.addColorStop(0, `rgba(255, 190, 100, ${la})`);
        warm.addColorStop(1, 'rgba(255, 140, 60, 0)');
        ctx.fillStyle = warm;
        ctx.beginPath();
        ctx.arc(lx, ly, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!this.qualityLow) {
        // 孔明灯（三两盏缓缓升起）
        for (let i = 0; i < 4; i++) {
          const seed = i * 251.7;
          const kx = ((seed * 53) % W) + Math.sin(t * 0.4 + seed) * 18;
          const ky = H - ((seed * 83 + t * 17) % (H + 60));
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = 'rgba(255, 170, 90, 0.75)';
          ctx.beginPath();
          ctx.moveTo(kx, ky + 5);
          ctx.quadraticCurveTo(kx - 5.5, ky + 1, kx - 3.5, ky - 5);
          ctx.lineTo(kx + 3.5, ky - 5);
          ctx.quadraticCurveTo(kx + 5.5, ky + 1, kx, ky + 5);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // 幻影人潮尾迹（横向流动的墨色拖尾）
        ctx.strokeStyle = 'rgba(12, 10, 24, 0.34)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const seed = i * 197.3;
          const sx = ((seed * 47 + t * 40) % (W + 120)) - 60;
          const sy = laneMinY * (0.66 + (seed % 24) / 100);
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 22, sy + 1);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'QUJIANG') {
      // 曲江春宴：杏瓣飘岸 + 柳丝拂水 + 春水光斑
      ctx.save();
      if (!this.qualityLow) {
        // 柳丝（顶部垂下的春柳）
        ctx.strokeStyle = 'rgba(88, 132, 96, 0.4)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 7; i++) {
          const seed = i * 149.7;
          const wx = (seed * 43) % W;
          const len = 34 + (seed % 50);
          ctx.beginPath();
          ctx.moveTo(wx, -4);
          ctx.quadraticCurveTo(
            wx + Math.sin(t * 0.8 + seed) * 10, len * 0.5,
            wx + Math.sin(t * 0.8 + seed) * 15, len
          );
          ctx.stroke();
        }
        // 春水光斑（地平线下闪烁的椭圆光点）
        for (let i = 0; i < 9; i++) {
          const seed = i * 181.3;
          const gx = ((seed * 61) % W);
          const gy = laneMinY + 14 + (seed % 78);
          const ga = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.1 + seed));
          ctx.fillStyle = `rgba(255, 240, 210, ${ga})`;
          ctx.beginPath();
          ctx.ellipse(gx, gy, 14, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 杏瓣飘岸（粉白花瓣密而柔）
      if (!this.qualityLow) {
        const cols = ['#f8d4d0', '#f0b0b4', '#fce8e0'];
        for (let i = 0; i < 13; i++) {
          const seed = i * 157.9;
          const px = ((seed * 53) % (W + 60)) - 30 + Math.sin(t * 0.7 + seed) * 32;
          const py = ((seed * 89 + t * 48) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 1.1 + seed) * 0.9 + seed);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = cols[i % 3];
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.6, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'PAGODA') {
      // 雁塔题名：金榜题字光斑升浮 + 墨羽掠塔 + 檐铃微光
      ctx.save();
      if (!this.qualityLow) {
        // 题字金斑（自塔身方向升起的小方块字光）
        for (let i = 0; i < 12; i++) {
          const seed = i * 191.7;
          const cx = W * 0.32 + ((seed * 53) % (W * 0.4));
          const cy = laneMinY - ((seed * 79 + t * 26) % (laneMinY * 0.85));
          ctx.globalAlpha = 0.3 + (seed % 5) * 0.07;
          ctx.fillStyle = '#e8c86e';
          ctx.fillRect(cx, cy, 2.6, 3.8);
        }
        ctx.globalAlpha = 1;
        // 墨羽（鸦羽掠影横飞）
        ctx.strokeStyle = 'rgba(14, 18, 16, 0.5)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const seed = i * 233.9;
          const bx = ((t * (20 + (seed % 12)) + seed * 71) % (W + 140)) - 70;
          const by = laneMinY * (0.2 + (seed % 30) / 130);
          ctx.beginPath();
          ctx.moveTo(bx - 7, by);
          ctx.quadraticCurveTo(bx, by - 4, bx + 7, by);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'WINE') {
      // 胡旋酒肆：琥珀酒光涟漪 + 旋舞绸带 + 葡萄紫碎光
      ctx.save();
      // 酒光涟漪（地平线下扩散的琥珀环）
      if (!this.qualityLow) {
        for (let i = 0; i < 4; i++) {
          const seed = i * 277.7;
          const ph = (t * 0.3 + i * 0.25) % 1;
          const cx = (seed * 67) % W;
          const cy = laneMinY + 20 + (seed % 60);
          const rr = 16 + ph * 110;
          ctx.strokeStyle = `rgba(244, 190, 110, ${(1 - ph) * 0.16})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr, rr * 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // 旋舞绸带（两道旋转的飘带曲线）
        ctx.strokeStyle = 'rgba(214, 120, 90, 0.34)';
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 2; i++) {
          const seed = i * 149.3;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 16) {
            const wy = laneMinY * (0.4 + i * 0.2) + Math.sin(x * 0.02 + t * (2.2 + i * 0.5) + seed) * 16;
            if (x === 0) ctx.moveTo(x, wy);
            else ctx.lineTo(x, wy);
          }
          ctx.stroke();
        }
        // 葡萄紫碎光
        for (let i = 0; i < 10; i++) {
          const seed = i * 131.9;
          const px = ((seed * 71) % (W + 40)) - 20 + Math.sin(t * 1.2 + seed) * 28;
          const py = ((seed * 89 + t * 58) % (H + 40)) - 20;
          ctx.fillStyle = 'rgba(168, 108, 190, 0.4)';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'CALYX') {
      // 花萼辉楼：金紫光带交汇 + 楼灯次第亮 + 羽衣花瓣
      ctx.save();
      // 金紫光带（两道交汇的楼光）
      const beamL = ctx.createLinearGradient(0, laneMinY * 0.2, W * 0.5, laneMinY);
      beamL.addColorStop(0, 'rgba(244, 200, 120, 0)');
      beamL.addColorStop(1, 'rgba(244, 200, 120, 0.1)');
      ctx.fillStyle = beamL;
      ctx.beginPath();
      ctx.moveTo(0, laneMinY * 0.16);
      ctx.lineTo(W * 0.52, laneMinY * 0.5);
      ctx.lineTo(W * 0.52, laneMinY);
      ctx.lineTo(0, laneMinY);
      ctx.closePath();
      ctx.fill();
      const beamR = ctx.createLinearGradient(W, laneMinY * 0.2, W * 0.5, laneMinY);
      beamR.addColorStop(0, 'rgba(180, 120, 220, 0)');
      beamR.addColorStop(1, 'rgba(180, 120, 220, 0.1)');
      ctx.fillStyle = beamR;
      ctx.beginPath();
      ctx.moveTo(W, laneMinY * 0.16);
      ctx.lineTo(W * 0.52, laneMinY * 0.5);
      ctx.lineTo(W * 0.52, laneMinY);
      ctx.lineTo(W, laneMinY);
      ctx.closePath();
      ctx.fill();
      if (!this.qualityLow) {
        // 楼灯次第亮（横向一串金紫灯点呼吸）
        for (let i = 0; i < 10; i++) {
          const seed = i * 163.7;
          const lx = (seed * 53) % W;
          const ly = laneMinY - 6 - (seed % 40);
          const la = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + seed));
          ctx.fillStyle = i % 2 === 0 ? `rgba(255, 210, 120, ${la})` : `rgba(210, 150, 240, ${la})`;
          ctx.beginPath();
          ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // 羽衣花瓣（金紫花瓣飘落）
        for (let i = 0; i < 12; i++) {
          const seed = i * 149.9;
          const px = ((seed * 61) % (W + 60)) - 30 + Math.sin(t * 0.85 + seed) * 36;
          const py = ((seed * 97 + t * 50) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * 1.4 + seed);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = i % 2 === 0 ? '#f0d090' : '#c8a0e0';
          ctx.beginPath();
          ctx.ellipse(0, 0, 5, 2.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'CHIJI') {
      // 壬戌秋江：白露横江雾带 + 清风水纹 + 一叶扁舟剪影
      ctx.save();
      // 白露横江（三道横江雾带，缓移）
      for (let i = 0; i < 3; i++) {
        const bandY = laneMinY - 44 - i * 30;
        const drift = ((t * (8 + i * 5) + i * 260) % (W + 400)) - 200;
        const g = ctx.createLinearGradient(drift - 200, 0, drift + 200, 0);
        g.addColorStop(0, 'rgba(222, 232, 224, 0)');
        g.addColorStop(0.5, `rgba(222, 232, 224, ${0.15 - i * 0.035})`);
        g.addColorStop(1, 'rgba(222, 232, 224, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(drift - 200, bandY, 400, 24);
      }
      if (!this.qualityLow) {
        // 清风水纹（细密水纹横掠）
        ctx.strokeStyle = 'rgba(196, 216, 200, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const seed = i * 131.7;
          const wx = ((seed * 61 + t * 30) % (W + 120)) - 60;
          const wy = laneMinY + 12 + (seed % 84);
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + 22, wy - 2.6, wx + 46, wy);
        }
        ctx.stroke();
        // 一叶扁舟剪影（远处缓行）
        const boatX = ((t * 7 + 200) % (W + 300)) - 150;
        const boatY = laneMinY - 4;
        ctx.fillStyle = 'rgba(18, 24, 22, 0.6)';
        ctx.beginPath();
        ctx.moveTo(boatX - 18, boatY);
        ctx.quadraticCurveTo(boatX, boatY + 7, boatX + 18, boatY);
        ctx.quadraticCurveTo(boatX, boatY + 3, boatX - 18, boatY);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18, 24, 22, 0.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(boatX + 4, boatY + 1);
        ctx.lineTo(boatX + 10, boatY - 14);
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'MOONRISE') {
      // 月出东山：月光碎银 + 山脊薄雾 + 夜枭掠影
      ctx.save();
      if (!this.qualityLow) {
        // 月光碎银（天顶缓落的银点）
        for (let i = 0; i < 14; i++) {
          const seed = i * 167.9;
          const sx = ((seed * 53) % (W + 40)) - 20;
          const sy = ((seed * 89 + t * 14) % (H + 40)) - 20;
          ctx.globalAlpha = 0.18 + (seed % 5) * 0.05;
          ctx.fillStyle = '#e8f0f8';
          ctx.beginPath();
          ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 山脊薄雾（中部横带）
        const mistY = laneMinY * 0.62;
        const drift = ((t * 10 + 120) % (W + 380)) - 190;
        const g = ctx.createLinearGradient(drift - 190, 0, drift + 190, 0);
        g.addColorStop(0, 'rgba(214, 228, 238, 0)');
        g.addColorStop(0.5, 'rgba(214, 228, 238, 0.13)');
        g.addColorStop(1, 'rgba(214, 228, 238, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(drift - 190, mistY, 380, 20);
      }
      ctx.restore();
    } else if (level.ambientType === 'XIAO') {
      // 洞箫泣月：箫音波纹环 + 潜蛟水涌 + 寒露点滴
      ctx.save();
      // 箫音波纹（自远处扩散的同心弧）
      if (!this.qualityLow) {
        for (let i = 0; i < 4; i++) {
          const ph = (t * 0.28 + i * 0.25) % 1;
          const cx = W * 0.78;
          const cy = laneMinY * 0.42;
          const rr = 24 + ph * 170;
          ctx.strokeStyle = `rgba(168, 196, 208, ${(1 - ph) * 0.14})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, Math.PI * 0.9, Math.PI * 2.1);
          ctx.stroke();
        }
        // 潜蛟水涌（地平线处的隆起水包，周期起伏）
        ctx.strokeStyle = 'rgba(140, 176, 190, 0.22)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const seed = i * 211.3;
          const wx = ((seed * 71) % W);
          const swell = Math.sin(t * 1.1 + seed) * 7 + Math.sin(t * 2.3 + seed * 2) * 3;
          ctx.beginPath();
          ctx.moveTo(wx - 34, laneMinY);
          ctx.quadraticCurveTo(wx, laneMinY - 14 - Math.max(0, swell), wx + 34, laneMinY);
          ctx.stroke();
        }
        // 寒露点滴
        ctx.strokeStyle = 'rgba(190, 210, 218, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
          const seed = i * 107.9;
          const rx = ((seed * 67 + t * 90) % (W + 40)) - 20;
          const ry = ((seed * 59 + t * 210) % (H + 60)) - 30;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 1, ry + 8);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'REEF') {
      // 渔樵江渚：芦絮如雪 + 白鹭两点 + 渔火明灭
      ctx.save();
      if (!this.qualityLow) {
        // 芦絮（白絮缓飞）
        for (let i = 0; i < 15; i++) {
          const seed = i * 151.7;
          const fx = ((seed * 59) % (W + 60)) - 30 + Math.sin(t * 0.9 + seed) * 42;
          const fy = ((seed * 97 + t * 40) % (H + 40)) - 20;
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#e2dcc8';
          ctx.beginPath();
          ctx.ellipse(fx, fy, 2.6, 1.1, Math.sin(t + seed), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 白鹭两点（掠过江渚）
        ctx.strokeStyle = 'rgba(236, 238, 232, 0.7)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) {
          const seed = i * 347.9;
          const ex = ((t * (16 + i * 5) + seed * 89) % (W + 200)) - 100;
          const ey = laneMinY * (0.3 + i * 0.12) + Math.sin(t * 1.2 + seed) * 8;
          ctx.beginPath();
          ctx.moveTo(ex - 8, ey);
          ctx.quadraticCurveTo(ex, ey - 3.5, ex + 8, ey);
          ctx.stroke();
        }
        // 渔火（两点暖光明灭）
        for (let i = 0; i < 2; i++) {
          const seed = i * 271.3;
          const fx = W * (0.3 + i * 0.4);
          const fy = laneMinY - 6 - (seed % 12);
          const fa = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2 + seed));
          ctx.fillStyle = `rgba(255, 178, 90, ${fa})`;
          ctx.beginPath();
          ctx.arc(fx, fy, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'BOATQ') {
      // 扁舟问月：江风拂线 + 星子倒江 + 月华尘埃
      ctx.save();
      if (!this.qualityLow) {
        // 江风拂线（极淡的横向流线）
        ctx.strokeStyle = 'rgba(196, 216, 232, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const seed = i * 149.7;
          const wx = ((seed * 71 + t * 60) % (W + 140)) - 70;
          const wy = laneMinY * (0.3 + (seed % 50) / 110);
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 44 + (seed % 24), wy + 1.6);
        }
        ctx.stroke();
        // 星子倒江（地平线下的微光点）
        for (let i = 0; i < 16; i++) {
          const seed = i * 173.9;
          const sx = ((seed * 61) % W);
          const sy = laneMinY + 10 + (seed % 80);
          ctx.globalAlpha = 0.2 + (seed % 5) * 0.05;
          ctx.fillStyle = '#dce8f4';
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (level.ambientType === 'SCROLLIN') {
      // 展卷入画：淡墨晕染流云 + 梅瓣零星 + 题字微光
      ctx.save();
      if (!this.qualityLow) {
        // 淡墨晕染（大团极淡的墨云缓移）
        for (let i = 0; i < 4; i++) {
          const seed = i * 211.3;
          const mx = ((t * (6 + i * 3) + seed * 47) % (W + 400)) - 200;
          const my = laneMinY * (0.2 + (seed % 40) / 130);
          const mg = ctx.createRadialGradient(mx, my, 6, mx, my, 90);
          mg.addColorStop(0, 'rgba(88, 80, 68, 0.1)');
          mg.addColorStop(1, 'rgba(88, 80, 68, 0)');
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.arc(mx, my, 90, 0, Math.PI * 2);
          ctx.fill();
        }
        // 题字微光（自右向左缓浮的淡金小字块）
        for (let i = 0; i < 6; i++) {
          const seed = i * 137.7;
          const tx = ((seed * 61) % W);
          const ty = laneMinY * (0.16 + (seed % 30) / 110);
          const ta = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.2 + seed));
          ctx.fillStyle = `rgba(140, 96, 60, ${ta})`;
          ctx.fillRect(tx, ty, 3.4, 5);
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'SHADOW') {
      // 疏影横斜：梅枝剪影横斜 + 暗香流雾 + 落梅两点
      ctx.save();
      // 梅枝剪影（两道横斜的枝，缀梅点）
      ctx.strokeStyle = 'rgba(22, 26, 20, 0.55)';
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 2; i++) {
        const seed = i * 269.3;
        const side = i === 0 ? 1 : -1;
        const bx = side > 0 ? -20 : W + 20;
        const by = laneMinY * (0.3 + i * 0.14);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + side * 150, by - 40, bx + side * 290, by - 16);
        ctx.stroke();
        // 枝上梅点
        ctx.fillStyle = 'rgba(214, 196, 206, 0.6)';
        for (let p = 0; p < 5; p++) {
          const px = bx + side * (60 + p * 52);
          const py = by - 34 + Math.sin(seed + p) * 12;
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (!this.qualityLow) {
        // 暗香流雾（贴地流动的香雾）
        const fogY = laneMinY - 20;
        const drift = ((t * 14 + 60) % (W + 360)) - 180;
        const fg = ctx.createLinearGradient(drift - 180, 0, drift + 180, 0);
        fg.addColorStop(0, 'rgba(214, 222, 200, 0)');
        fg.addColorStop(0.5, 'rgba(214, 222, 200, 0.12)');
        fg.addColorStop(1, 'rgba(214, 222, 200, 0)');
        ctx.fillStyle = fg;
        ctx.fillRect(drift - 180, fogY, 360, 18);
        // 落梅两点
        ctx.fillStyle = 'rgba(220, 204, 214, 0.55)';
        for (let i = 0; i < 2; i++) {
          const seed = i * 331.7;
          const px = W * (0.4 + i * 0.3) + Math.sin(t * 0.7 + seed) * 60;
          const py = laneMinY * 0.6 + ((seed * 13 + t * 30) % (laneMinY * 0.3));
          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'INKSTONE') {
      // 砚池凝墨：墨滴落池涟漪 + 砚台磨纹 + 墨烟上升
      ctx.save();
      if (!this.qualityLow) {
        // 墨滴落池（同心墨环自天而降般扩散）
        for (let i = 0; i < 5; i++) {
          const seed = i * 191.3;
          const ph = (t * 0.4 + i * 0.2) % 1;
          const cx = (seed * 71) % W;
          const cy = laneMinY * (0.34 + (seed % 40) / 120);
          const rr = 8 + ph * 90;
          ctx.strokeStyle = `rgba(20, 14, 28, ${(1 - ph) * 0.3})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr, rr * 0.34, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // 墨烟上升（玄色烟絮）
        for (let i = 0; i < 9; i++) {
          const seed = i * 149.9;
          const sx = ((seed * 53) % (W + 40)) - 20 + Math.sin(t * 0.6 + seed) * 24;
          const sy = H - ((seed * 89 + t * 32) % (H + 40));
          ctx.fillStyle = 'rgba(24, 16, 34, 0.34)';
          ctx.beginPath();
          ctx.arc(sx, sy, 4 + (seed % 4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'SNOWPLUM') {
      // 雪夜梅影：雪片纷落 + 墨渍雪点 + 梅枝红萼两点
      ctx.save();
      if (!this.qualityLow) {
        // 雪片（缓落，比 SNOW 更密的画中雪）
        ctx.fillStyle = 'rgba(238, 244, 246, 0.8)';
        for (let i = 0; i < 26; i++) {
          const seed = i * 97.3;
          const sx = ((seed * 67) % (W + 40)) - 20 + Math.sin(t * 0.8 + seed) * 18;
          const sy = ((seed * 53 + t * 54) % (H + 50)) - 25;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.3 + (seed % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // 墨渍雪点（部分雪落即化墨——玄墨混雪的异象）
        for (let i = 0; i < 6; i++) {
          const seed = i * 233.9;
          const mx = ((seed * 71) % (W + 40)) - 20 + Math.sin(t * 0.7 + seed) * 20;
          const my = ((seed * 47 + t * 60) % (H + 50)) - 25;
          ctx.fillStyle = 'rgba(14, 10, 18, 0.55)';
          ctx.beginPath();
          ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // 红萼两点（雪中一抹梅红）
        for (let i = 0; i < 2; i++) {
          const seed = i * 347.3;
          const px = W * (0.34 + i * 0.36) + Math.sin(t * 0.5 + seed) * 26;
          const py = laneMinY * (0.44 + i * 0.1);
          ctx.fillStyle = 'rgba(188, 62, 58, 0.6)';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'PUREQI') {
      // 清气乾坤：清气流光升腾 + 素金花瓣 + 澄澈微尘
      ctx.save();
      if (!this.qualityLow) {
        // 清气流光（自地而升的素白流线）
        ctx.strokeStyle = 'rgba(240, 236, 220, 0.2)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 8; i++) {
          const seed = i * 167.9;
          const qx = (seed * 53) % W;
          ctx.beginPath();
          for (let yy = laneMinY; yy > laneMinY * 0.2; yy -= 14) {
            const sway = Math.sin(t * 1.2 + yy * 0.03 + seed) * 8;
            if (yy === laneMinY) ctx.moveTo(qx + sway, yy);
            else ctx.lineTo(qx + sway, yy);
          }
          ctx.stroke();
        }
        // 素金花瓣（极淡的梅瓣，清气所化）
        for (let i = 0; i < 10; i++) {
          const seed = i * 149.7;
          const px = ((seed * 61) % (W + 60)) - 30 + Math.sin(t * 0.6 + seed) * 30;
          const py = ((seed * 83 + t * 34) % (H + 40)) - 20;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 0.9 + seed) * 0.8 + seed);
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = '#f4ecd4';
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.4, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'DAO') {
      // 原道：玄黄二气双流对旋 + 天地初开光隙
      ctx.save();
      if (!this.qualityLow) {
        // 玄黄二气（两道交错的流动气带）
        for (let i = 0; i < 2; i++) {
          const isXuan = i === 0;
          ctx.strokeStyle = isXuan ? 'rgba(24, 20, 34, 0.3)' : 'rgba(196, 164, 88, 0.26)';
          ctx.lineWidth = 3;
          for (let b = 0; b < 3; b++) {
            const seed = b * 173.7 + i * 71;
            ctx.beginPath();
            for (let x = 0; x <= W; x += 18) {
              const wy = laneMinY * (0.24 + b * 0.16) + Math.sin(x * 0.012 + t * (0.9 + i * 0.5) + seed) * 18;
              if (x === 0) ctx.moveTo(x, wy);
              else ctx.lineTo(x, wy);
            }
            ctx.stroke();
          }
        }
        // 天地初开光隙（中线一道竖直的光缝）
        const gapX = W * 0.5;
        const gapA = 0.1 + 0.06 * Math.sin(t * 0.9);
        const gg = ctx.createLinearGradient(gapX - 40, 0, gapX + 40, 0);
        gg.addColorStop(0, 'rgba(232, 208, 140, 0)');
        gg.addColorStop(0.5, `rgba(232, 208, 140, ${gapA})`);
        gg.addColorStop(1, 'rgba(232, 208, 140, 0)');
        ctx.fillStyle = gg;
        ctx.fillRect(gapX - 40, 0, 80, laneMinY);
      }
      ctx.restore();
    } else if (level.ambientType === 'SAGE') {
      // 征圣：圣殿金辉光柱 + 金袍墨偶剪影列阵 + 经文金字落
      ctx.save();
      // 金辉光柱（数道自天而下的圣光）
      for (let i = 0; i < 3; i++) {
        const seed = i * 211.3;
        const bx = W * (0.26 + i * 0.24) + Math.sin(t * 0.5 + seed) * 12;
        const bg2 = ctx.createLinearGradient(bx - 16, 0, bx + 16, laneMinY);
        bg2.addColorStop(0, 'rgba(236, 200, 120, 0)');
        bg2.addColorStop(0.4, `rgba(236, 200, 120, ${0.12 + 0.04 * Math.sin(t * 1.1 + seed)})`);
        bg2.addColorStop(1, 'rgba(236, 200, 120, 0.02)');
        ctx.fillStyle = bg2;
        ctx.beginPath();
        ctx.moveTo(bx - 14, 0);
        ctx.lineTo(bx + 14, 0);
        ctx.lineTo(bx + 30, laneMinY);
        ctx.lineTo(bx - 30, laneMinY);
        ctx.closePath();
        ctx.fill();
      }
      if (!this.qualityLow) {
        // 经文金字（缓缓飘落的金色字块）
        for (let i = 0; i < 12; i++) {
          const seed = i * 149.9;
          const kx = ((seed * 61) % (W + 40)) - 20;
          const ky = ((seed * 83 + t * 40) % (H + 50)) - 25;
          ctx.globalAlpha = 0.3 + (seed % 4) * 0.08;
          ctx.fillStyle = '#e8c470';
          ctx.fillRect(kx, ky, 2.8, 4.2);
        }
        ctx.globalAlpha = 1;
        // 墨偶剪影（远景列阵的方块人偶，缓行）
        ctx.fillStyle = 'rgba(16, 12, 20, 0.4)';
        for (let i = 0; i < 6; i++) {
          const seed = i * 191.7;
          const mx = ((seed * 47 + t * 12) % (W + 80)) - 40;
          const my = laneMinY - 14 - (seed % 10);
          ctx.fillRect(mx, my, 8, 8);
          ctx.fillRect(mx + 1, my - 7, 6, 6);
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'CANON') {
      // 宗经：万卷翻飞 + 墨字横流 + 书澜起伏
      ctx.save();
      if (!this.qualityLow) {
        // 万卷翻飞（矩形书页翻卷飘落，双向旋转）
        for (let i = 0; i < 14; i++) {
          const seed = i * 131.9;
          const px = ((seed * 53) % (W + 60)) - 30 + Math.sin(t * 0.8 + seed) * 40;
          const py = ((seed * 89 + t * 66) % (H + 60)) - 30;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * (i % 2 === 0 ? 1.6 : -1.4) + seed);
          ctx.fillStyle = i % 3 === 0 ? 'rgba(210, 200, 178, 0.5)' : 'rgba(178, 168, 148, 0.45)';
          ctx.fillRect(-5, -6.5, 10, 13);
          ctx.strokeStyle = 'rgba(90, 82, 70, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(5, 0);
          ctx.stroke();
          ctx.restore();
        }
        // 墨字横流（贴地的墨色字迹流线）
        ctx.strokeStyle = 'rgba(16, 22, 26, 0.4)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const seed = i * 167.3;
          const wx = ((seed * 71 + t * 90) % (W + 120)) - 60;
          const wy = laneMinY * (0.7 + (seed % 20) / 90);
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 30, wy - 2);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (level.ambientType === 'MUSE') {
      // 神思：墨焰升腾 + 思维流光 + 火星飘散
      ctx.save();
      if (!this.qualityLow) {
        // 墨焰（地平线处的火焰轮廓，摇曳）
        for (let i = 0; i < 9; i++) {
          const seed = i * 149.7;
          const fx = (seed * 53) % W;
          const fh = 14 + (seed % 22) + Math.sin(t * 2.4 + seed) * 6;
          ctx.strokeStyle = `rgba(120, 40, 60, ${0.22 + (seed % 5) * 0.05})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(fx, laneMinY);
          ctx.quadraticCurveTo(fx + 6, laneMinY - fh * 0.6, fx + Math.sin(t * 3 + seed) * 5, laneMinY - fh);
          ctx.stroke();
        }
        // 思维流光（横贯天际的灵感弧光）
        for (let i = 0; i < 3; i++) {
          const seed = i * 271.3;
          const ph = (t * 0.5 + i * 0.33) % 1;
          ctx.globalAlpha = Math.max(0, 0.24 * (1 - Math.abs(ph - 0.5) * 2));
          ctx.strokeStyle = '#c47888';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const ay = laneMinY * (0.3 + i * 0.14);
          ctx.moveTo(W * 0.1, ay + Math.sin(ph * Math.PI) * -20);
          ctx.quadraticCurveTo(W * 0.5, ay - 26, W * 0.9, ay + Math.sin(ph * Math.PI) * -8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 火星
        for (let i = 0; i < 12; i++) {
          const seed = i * 173.9;
          const px = ((seed * 59) % (W + 40)) - 20 + Math.sin(t * 1.1 + seed) * 24;
          const py = H - ((seed * 71 + t * 52) % (H + 40));
          ctx.fillStyle = `rgba(224, 120, 100, ${0.3 + (seed % 4) * 0.1})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (level.ambientType === 'ONENESS') {
      // 万象归宗：文字归流（字块自四周向殿心汇聚）+ 文心光晕 + 金玄双色尘埃
      ctx.save();
      if (!this.qualityLow) {
        // 文字归流（小字块沿曲线向中心汇聚，循环往复）
        for (let i = 0; i < 16; i++) {
          const seed = i * 149.3;
          const ph = (t * 0.14 + (seed % 100) / 100) % 1;
          const ang = seed % 628 / 100;
          const r0 = Math.max(W, H) * 0.55 * (1 - ph);
          const cx = W * 0.5 + Math.cos(ang) * r0;
          const cy = laneMinY * 0.5 + Math.sin(ang) * r0 * 0.6;
          ctx.globalAlpha = 0.14 + ph * 0.3;
          ctx.fillStyle = i % 2 === 0 ? '#e8d0a0' : '#181226';
          ctx.fillRect(cx, cy, 3, 4.4);
        }
        ctx.globalAlpha = 1;
        // 文心光晕（殿心呼吸的金环）
        const haloPh = (t * 0.3) % 1;
        ctx.strokeStyle = `rgba(232, 200, 130, ${(1 - haloPh) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(W * 0.5, laneMinY * 0.55, 30 + haloPh * 150, (30 + haloPh * 150) * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 金玄双色尘埃
        for (let i = 0; i < 12; i++) {
          const seed = i * 191.9;
          const px = ((seed * 61) % (W + 40)) - 20 + Math.sin(t * 0.7 + seed) * 26;
          const py = ((seed * 89 + t * 30) % (H + 40)) - 20;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(216, 190, 130, 0.4)' : 'rgba(30, 22, 44, 0.42)';
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
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

    // —— canvas 分层·静态氛围离屏缓存（第壹阶段）：地面为纯垂直渐变（与相机/时间无关），
    //    优先取 1px 纵条横向拉伸铺绘；缓存未命中（首帧/氛围切换/视口缩放）时直绘。
    const groundCache = this.ensureStaticGradCache(level, laneMinY);
    if (groundCache.ground) {
      ctx.drawImage(
        groundCache.ground,
        0,
        0,
        1,
        groundCache.ground.height,
        0,
        laneMinY,
        this.width,
        this.height - laneMinY
      );
    } else {
      const groundGrad = ctx.createLinearGradient(0, laneMinY, 0, this.height);
      this.paintGroundStops(groundGrad, level);
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, laneMinY, this.width, this.height - laneMinY);
    }

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

  // Draw Hero Inspiring Aura (风雅领域) in 2.5D——随连墨段位升级色彩/半径/转速
  private drawHeroAura25D(
    hero: HeroInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number,
    comboTier: string = 'NONE',
    comboCount: number = 0
  ) {
    const screenX = hero.x - cameraX;
    const groundY = hero.y;
    const ctx = this.ctx;
    ctx.save();

    // 段位 → 光环色谱与强度（ NONE 青蓝 → 行云流水准金 → 笔走龙蛇橙 → 出神入化绯 → 翰墨通神鎏金）
    const tierStyle: Record<string, { core: string; mid: string; ring: string; glow: number }> = {
      NONE: { core: 'rgba(56, 189, 248, 0.14)', mid: 'rgba(56, 189, 248, 0.05)', ring: 'rgba(250, 204, 21, 0.35)', glow: 1 },
      ENTRY: { core: 'rgba(56, 189, 248, 0.15)', mid: 'rgba(56, 189, 248, 0.05)', ring: 'rgba(250, 204, 21, 0.4)', glow: 1 },
      PROGRESS: { core: 'rgba(94, 234, 212, 0.16)', mid: 'rgba(94, 234, 212, 0.06)', ring: 'rgba(250, 204, 21, 0.48)', glow: 1 },
      FLOW: { core: 'rgba(250, 204, 21, 0.16)', mid: 'rgba(250, 204, 21, 0.06)', ring: 'rgba(251, 191, 36, 0.55)', glow: 1.1 },
      DRAGON: { core: 'rgba(249, 115, 22, 0.17)', mid: 'rgba(249, 115, 22, 0.07)', ring: 'rgba(251, 146, 60, 0.62)', glow: 1.2 },
      DIVINE: { core: 'rgba(220, 38, 38, 0.18)', mid: 'rgba(220, 38, 38, 0.08)', ring: 'rgba(248, 113, 113, 0.68)', glow: 1.3 },
      TRANSCEND: { core: 'rgba(250, 204, 21, 0.22)', mid: 'rgba(253, 224, 71, 0.1)', ring: 'rgba(253, 224, 71, 0.78)', glow: 1.45 },
    };
    const style = tierStyle[comboTier] ?? tierStyle.NONE;

    const scale = this.getDepthScale(hero.y, laneMinY, laneMaxY);
    // 连击数微涨光环半径（最多 +18%），高段位呼吸感更强
    const growFactor = 1 + Math.min(0.18, Math.max(0, comboCount) * 0.004);
    const pulse = 1 + Math.sin(gameTime * (4 + style.glow * 2.4)) * 0.03 * style.glow;
    const radiusX = 220 * scale * growFactor * pulse;
    const radiusY = radiusX * 0.35;

    // Glowing ground ellipse
    ctx.beginPath();
    ctx.ellipse(screenX, groundY, radiusX, radiusY, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(screenX, groundY, radiusX * 0.15, screenX, groundY, radiusX);
    grad.addColorStop(0, style.core);
    grad.addColorStop(0.7, style.mid);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Calligraphy dash boundary（转速随段位加快）
    ctx.strokeStyle = style.ring;
    ctx.lineWidth = 1.8 + style.glow * 0.5;
    ctx.setLineDash([8, 12]);
    ctx.lineDashOffset = -gameTime * (25 + style.glow * 14);
    ctx.beginPath();
    ctx.ellipse(screenX, groundY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 翰墨通神：外环再起一圈反向旋镒的鎏金细环 + 身后「连」字水印（行云模式略过省帧）
    if (comboTier === 'TRANSCEND' && !this.qualityLow) {
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 14]);
      ctx.lineDashOffset = gameTime * 40;
      ctx.beginPath();
      ctx.ellipse(screenX, groundY, radiusX * 1.14, radiusY * 1.14, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `bold ${Math.round(64 * scale)}px "KaiTi", "STKaiti", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(253, 224, 71, ${0.1 + Math.sin(gameTime * 5) * 0.04})`;
      ctx.fillText('连', screenX, groundY - 90 * scale);
    }

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
      if (this.swordTrail[i].life <= 0) this.releaseSwordTrail(this.swordTrail.splice(i, 1)[0]);
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }
    for (let i = this.fxRings.length - 1; i >= 0; i--) {
      this.fxRings[i].life -= dt;
      if (this.fxRings[i].life <= 0) this.releaseFxRing(this.fxRings.splice(i, 1)[0]);
    }
    if (this.swordTrail.length > 40) {
      const cut = this.swordTrail.splice(0, this.swordTrail.length - 40);
      for (const o of cut) this.releaseSwordTrail(o);
    }
    if (this.afterimages.length > 26) this.afterimages.splice(0, this.afterimages.length - 26);
    if (this.fxRings.length > 32) {
      const cut = this.fxRings.splice(0, this.fxRings.length - 32);
      for (const o of cut) this.releaseFxRing(o);
    }
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

  /** 蚀痕污染带：地面紫黑墨痕 + 蚀纹折线 + 升腾咒雾柱（书符区污染的可视化根） */
  private drawCorruptZones(zones: InkCorruptZone[], cameraX: number, gameTime: number) {
    const ctx = this.ctx;
    for (const z of zones) {
      const sx = z.x - cameraX;
      if (sx < -180 || sx > this.width + 180) continue;
      const born = Math.min(1, (z.maxLife - z.life) / 0.4);
      const fade = Math.min(1, Math.max(0, z.life) / 0.8);
      const k = born * fade;
      if (k <= 0) continue;
      const pulse = 0.82 + Math.sin(gameTime * 3.4 + z.seed) * 0.18;
      ctx.save();
      // —— 地面蚀痕主体（透视压扁椭圆，紫黑墨渍） ——
      ctx.globalAlpha = k * 0.55 * pulse;
      ctx.fillStyle = '#2e103c';
      ctx.beginPath();
      ctx.ellipse(sx, z.y, z.r * pulse, z.r * 0.42 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      // —— 蚀纹折线（seed 三笔，缓慢蠕动） ——
      ctx.globalAlpha = k * 0.5 * pulse;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.6;
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        const ang = z.seed + s * 2.09;
        for (let i = 0; i <= 3; i++) {
          const rr = (z.r * 0.85 * (i + 1)) / 4;
          const a2 = ang + Math.sin(gameTime * 1.7 + s * 3 + i) * 0.35;
          const px = sx + Math.cos(a2) * rr;
          const py = z.y + Math.sin(a2) * rr * 0.42;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // —— 升腾咒雾柱（污染上方书符区的可视根，缓呼吸） ——
      const colH = Math.min(300, Math.max(180, z.y * 0.42));
      const g = ctx.createLinearGradient(0, z.y, 0, z.y - colH);
      g.addColorStop(0, `rgba(88, 28, 135, ${0.17 * k})`);
      g.addColorStop(1, 'rgba(88, 28, 135, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(sx - z.r * pulse, z.y - colH, z.r * 2 * pulse, colH);
      // —— 柱中浮字「蚀」 ——
      ctx.globalAlpha = k * 0.55 * pulse;
      ctx.fillStyle = '#c4b5fd';
      ctx.font = '600 13px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('蚀', sx, z.y - colH * 0.55 + Math.sin(gameTime * 2 + z.seed) * 6);
      ctx.restore();
    }
  }

  /** 地面墨渍贴花（seed 决定瓣形，life 驱动淡出；透视压扁贴地） */
  private drawInkSplats(splats: InkSplat[], cameraX: number) {
    if (splats.length === 0) return;
    const ctx = this.ctx;
    for (const s of splats) {
      const screenX = s.x - cameraX;
      if (screenX < -90 || screenX > this.width + 90) continue;
      const ageK = Math.max(0, s.life / s.maxLife);
      const alpha = 0.4 * Math.min(1, ageK * 1.7); // 前段饱和、尾段淡去
      ctx.save();
      ctx.translate(screenX, s.y);
      ctx.scale(1, 0.36);
      ctx.fillStyle = `rgba(9, 9, 11, ${alpha})`;
      // 主墨团（多瓣不规则形，seed 确定性抖动）
      ctx.beginPath();
      const lobes = 7;
      for (let i = 0; i <= lobes; i++) {
        const li = i % lobes;
        const ang = s.seed + li * ((Math.PI * 2) / lobes);
        const rr = s.r * (0.6 + 0.4 * Math.abs(Math.sin(s.seed * 3.7 + li * 2.3)));
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr * 0.85;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // 卫星飞溅墨点
      for (let i = 0; i < 4; i++) {
        const ang = s.seed * 1.7 + i * 1.9;
        const dist = s.r * (1.18 + 0.55 * Math.abs(Math.sin(s.seed + i * 4.1)));
        ctx.beginPath();
        ctx.arc(
          Math.cos(ang) * dist,
          Math.sin(ang) * dist * 0.72,
          s.r * 0.09 + 0.8,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
    }
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
      const ghostReach = getWeaponReach(getActiveWeaponId());
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
      ctx.lineTo(hx + Math.cos(p.swordAngle) * ghostReach, hy + Math.sin(p.swordAngle) * ghostReach);
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
        const dust = this.acquireFxRing();
        dust.x = hero.x;
        dust.y = groundY;
        dust.r0 = 5;
        dust.r1 = 22 + fallV * 0.035;
        dust.life = 0.34;
        dust.maxLife = 0.34;
        dust.color = 'rgba(203, 213, 225, 0.75)';
        dust.lw = 2.6;
        dust.flat = true;
        this.fxRings.push(dust);
        if (fallV > 320) {
          for (let i = 0; i < 5; i++) {
            const puff = this.acquireFxRing();
            puff.x = hero.x + Math.sin(i * 2.4) * 14;
            puff.y = groundY - 2;
            puff.r0 = 2;
            puff.r1 = 7 + (i % 3) * 4;
            puff.life = 0.3;
            puff.maxLife = 0.3;
            puff.color = 'rgba(71, 85, 105, 0.55)';
            puff.lw = 1.6;
            puff.flat = true;
            this.fxRings.push(puff);
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
        const shock = this.acquireFxRing();
        shock.x = hero.x + facing * 40;
        shock.y = groundY - 30;
        shock.r0 = 4;
        shock.r1 = 30;
        shock.life = 0.28;
        shock.maxLife = 0.28;
        shock.color = 'rgba(186, 230, 253, 0.9)';
        shock.lw = 3;
        shock.flat = false;
        this.fxRings.push(shock);
      }
      this.prevTrailEmit = pose.trailEmit;
    }

    // —— 剑刃世界坐标（轨迹 / 残影采样点；长度与矢量武器系统对齐） ——
    const swordReach = getWeaponReach(getActiveWeaponId());
    const shLX = pose.hipX + Math.sin(pose.torsoLean) * 22;
    const shLY = pose.hipY - 22;
    const elbX = shLX + Math.sin(pose.frontArmA) * 14;
    const elbY = shLY + Math.cos(pose.frontArmA) * 14;
    const handLX = elbX + Math.sin(pose.frontArmA + pose.frontArmB) * 14;
    const handLY = elbY + Math.cos(pose.frontArmA + pose.frontArmB) * 14;
    const tipLX = handLX + Math.cos(pose.swordAngle) * swordReach;
    const tipLY = handLY + Math.sin(pose.swordAngle) * swordReach;
    const handWX = hero.x + handLX * facing * scale;
    const handWY = heroY + handLY * scale;
    const tipWX = hero.x + tipLX * facing * scale;
    const tipWY = heroY + tipLY * scale;

    // —— 剑气轨迹采样（行云模式跳过） ——
    if (dt > 0 && !this.qualityLow && pose.trailEmit > 0.08) {
      const s = this.acquireSwordTrail();
      s.x = handWX;
      s.y = handWY;
      s.tx = tipWX;
      s.ty = tipWY;
      s.life = 0.2;
      this.swordTrail.push(s);
    }

    // —— 残影采样（重击挥砍 / 冲刺瞬移路径补插；行云模式跳过） ——
    if (dt > 0 && !this.qualityLow && (pose.trailEmit > 0.55 || hero.state === 'SKILL_DASH')) {
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

  /** 墨锋剑：矢量武器系统渲染（SVG Path2D 剑形，辉光 0-1 驱动剑锋光晕） */
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
    drawVectorWeapon(ctx, getActiveWeaponId(), glow);
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

      /* ------------------------------------------------ 蚀文咒师：悬笔咒袍 · 洗墨遗孽（敌军专属） ------------------------------------------------ */
      case 'RUNECASTER': {
        const hover = Math.sin(gameTime * 2.2 + (unit.limbPhase || 0)) * 3.5;
        const sway = Math.sin(gameTime * 1.5 + (unit.limbPhase || 0)) * 0.05;
        const robeY = -26 + hover;
        // 咒袍（下摆蚀纹波动）
        ctx.fillStyle = mainColor;
        const hemW = Math.sin(gameTime * 2.6 + (unit.limbPhase || 0)) * 2.2;
        ctx.beginPath();
        ctx.moveTo(Math.sin(sway) * 8, robeY - 22);
        ctx.lineTo(-10 + hemW, robeY + 10);
        ctx.quadraticCurveTo(0, robeY + 14, 10 + hemW * 0.7, robeY + 10);
        ctx.closePath();
        ctx.fill();
        // 蚀纹衣缘（幽紫）
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-9 + hemW * 0.8, robeY + 8);
        ctx.quadraticCurveTo(0, robeY + 12, 9 + hemW * 0.6, robeY + 8);
        ctx.stroke();
        // 躯干
        const shX = Math.sin(sway) * 8 + 1.5;
        const shY = robeY - 22;
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 3.1;
        ctx.beginPath();
        ctx.moveTo(shX, shY + 2);
        ctx.lineTo(shX + 2, shY - 11);
        ctx.stroke();
        // 兜帽头（低垂）+ 帽尖
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(shX + 2, shY - 17, 6.2, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(shX + 2, shY - 26);
        ctx.quadraticCurveTo(shX + 8, shY - 21, shX + 6, shY - 14);
        ctx.quadraticCurveTo(shX + 2, shY - 18, shX + 2, shY - 26);
        ctx.fill();
        // 瞳光（幽紫，咒师在场标识）
        ctx.fillStyle = '#c4b5fd';
        ctx.beginPath();
        ctx.arc(shX + 5, shY - 17.5, 1.3, 0, TAU);
        ctx.fill();
        // 洗墨之笔（倒握长笔，笔锋向下滴墨）
        const brA =
          since >= 0
            ? lerp(0.5, -1.35, easeOutCubic(Math.min(1, since / 0.3)))
            : 0.5 + Math.sin(gameTime * 1.8 + (unit.limbPhase || 0)) * 0.04;
        const bx = shX + 3;
        const by = shY - 12;
        const tipX = bx + Math.sin(brA) * 26;
        const tipY = by + Math.cos(brA) * 26;
        ctx.strokeStyle = '#57534e';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        // 笔锋（幽紫滴墨）
        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        ctx.arc(tipX, tipY + 2, 2.4, 0, TAU);
        ctx.fill();
        // 吟唱：笔尖蚀文咒环（施法后 0.55s 内扩散消散）
        if (since >= 0 && since < 0.55) {
          const t = since / 0.55;
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#a78bfa';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 4 + t * 13, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'PUPPET': {
        // 锁纹墨傀（Task 46）：青铜方重心机关体——甲存续时旋转六段锁纹墨金环+甲值余量弧，破甲后胸核幽光裸露急闪
        const bob = Math.sin(gameTime * 1.6 + (unit.limbPhase || 0)) * 2.2;
        const armorMax = unit.runeArmorMax || 1;
        const armorPct = Math.max(0, (unit.runeArmorHp ?? 0) / armorMax);
        // 躯干（青铜梯形）
        ctx.fillStyle = '#5c5340';
        ctx.beginPath();
        ctx.moveTo(-12, -36 + bob);
        ctx.lineTo(12, -36 + bob);
        ctx.lineTo(9, 8 + bob);
        ctx.lineTo(-9, 8 + bob);
        ctx.closePath();
        ctx.fill();
        // 锈斑三块
        ctx.fillStyle = 'rgba(38, 32, 20, 0.5)';
        [[-5, -26, 3.2], [4, -14, 2.6], [-2, 0, 3.6]].forEach((sp) => {
          ctx.beginPath();
          ctx.ellipse(sp[0], sp[1] + bob, sp[2], sp[2] * 0.7, 0.4, 0, TAU);
          ctx.fill();
        });
        // 方首 + 单目幽紫瞳光
        ctx.fillStyle = '#4a4234';
        ctx.fillRect(-8, -52 + bob, 16, 14);
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath();
        ctx.arc(unit.facing * 3, -45 + bob, 2.2, 0, TAU);
        ctx.fill();
        // 肩铆
        ctx.fillStyle = '#8a7a55';
        ctx.beginPath();
        ctx.arc(-11, -34 + bob, 2.6, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(11, -34 + bob, 2.6, 0, TAU);
        ctx.fill();
        // 墨足（双短柱）
        ctx.fillStyle = '#3f3829';
        ctx.fillRect(-8, 8 + bob, 5, 9);
        ctx.fillRect(3, 8 + bob, 5, 9);
        if (armorPct > 0) {
          // 存续甲：旋转六段锁纹环（墨金）
          ctx.save();
          ctx.translate(0, -22 + bob);
          ctx.rotate(gameTime * 0.85);
          ctx.strokeStyle = 'rgba(201, 168, 106, 0.9)';
          ctx.lineWidth = 2.2;
          for (let s = 0; s < 6; s++) {
            const a0 = (s * Math.PI) / 3 + 0.14;
            ctx.beginPath();
            ctx.arc(0, 0, 24, a0, a0 + Math.PI / 3 - 0.28);
            ctx.stroke();
          }
          ctx.restore();
          // 甲值余量弧（幽紫，自顶顺时针按剩余比例）
          ctx.strokeStyle = 'rgba(167, 139, 250, 0.95)';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(0, -22 + bob, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * armorPct);
          ctx.stroke();
        } else {
          // 破甲态：胸核幽光裸露急闪
          const flicker = 0.45 + Math.sin(gameTime * 9.5) * 0.35;
          ctx.fillStyle = `rgba(167, 139, 250, ${flicker.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(0, -30 + bob);
          ctx.lineTo(6, -22 + bob);
          ctx.lineTo(0, -14 + bob);
          ctx.lineTo(-6, -22 + bob);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }

    // 受击白闪（命中前几帧加性提亮，强化打击反馈）
    const flashK = unit.flinchTimer > 0.1 ? Math.min(1, (unit.flinchTimer - 0.1) / 0.2) : 0;
    if (flashK > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flashK * 0.38;
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.ellipse(0, -20, 13, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
    } else if (proj.type === 'INK_BLADE') {
      // 墨浪（川字诀「三江引」）：弧形墨潮 + 浪尖飞沫，友军青碧 / 敌军暗红
      const waveGrad = ctx.createLinearGradient(-30, 0, 18, 0);
      if (proj.isEnemy) {
        waveGrad.addColorStop(0, 'rgba(127, 29, 29, 0)');
        waveGrad.addColorStop(1, '#b91c1c');
      } else {
        waveGrad.addColorStop(0, 'rgba(13, 148, 136, 0)');
        waveGrad.addColorStop(0.65, '#0d9488');
        waveGrad.addColorStop(1, '#99f6e4');
      }
      ctx.strokeStyle = waveGrad;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-6, 0, 22, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      // 浪尖飞沫
      ctx.fillStyle = proj.isEnemy ? '#ef4444' : '#ccfbf1';
      ctx.beginPath();
      ctx.arc(16, -9, 2.6, 0, Math.PI * 2);
      ctx.arc(20, 5, 2, 0, Math.PI * 2);
      ctx.fill();
      // 浪脚拖尾
      ctx.strokeStyle = proj.isEnemy ? 'rgba(127, 29, 29, 0.4)' : 'rgba(45, 212, 191, 0.4)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-34, 6);
      ctx.lineTo(-14, 8);
      ctx.stroke();
    } else if (proj.type === 'DARK_ORB') {
      // 蚀文咒弹（咒师遥书）：幽紫墨球 + 内环蚀文 + 墨色拖尾
      const orbPulse = 0.85 + Math.sin(this.frameGameTime * 9 + proj.x * 0.05) * 0.15;
      const orbGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 11 * orbPulse);
      orbGrad.addColorStop(0, '#c4b5fd');
      orbGrad.addColorStop(0.45, '#7c3aed');
      orbGrad.addColorStop(1, 'rgba(46, 16, 60, 0)');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 11 * orbPulse, 0, Math.PI * 2);
      ctx.fill();
      // 内环蚀纹（随飞行自转，咒意流转）
      ctx.save();
      ctx.rotate(this.frameGameTime * 5);
      ctx.strokeStyle = 'rgba(196, 181, 253, 0.75)';
      ctx.lineWidth = 1.1;
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        const a0 = (s / 3) * (Math.PI * 2);
        ctx.arc(0, 0, 5.5, a0, a0 + 1.4);
        ctx.stroke();
      }
      ctx.restore();
      // 墨色拖尾
      const tailGrad = ctx.createLinearGradient(-26, 0, -4, 0);
      tailGrad.addColorStop(0, 'rgba(46, 16, 60, 0)');
      tailGrad.addColorStop(1, 'rgba(124, 58, 237, 0.55)');
      ctx.strokeStyle = tailGrad;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-4, 0);
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
      ctx.fillStyle = p.color || '#f472b6';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.5, p.size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'SNOW') {
      ctx.fillStyle = p.color || '#f8fafc';
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'BAMBOO') {
      ctx.translate(screenX, screenY);
      ctx.rotate(p.rotation || 0);
      ctx.fillStyle = p.color || '#4ade80';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 2, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'STAR') {
      ctx.fillStyle = p.color || '#facc15';
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'SLASH') {
      // 剑气残痕：旋转的墨色长划
      ctx.translate(screenX, screenY);
      ctx.rotate(p.rotation || 0);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size * 0.9);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-p.size * 2.6, 0);
      ctx.lineTo(p.size * 2.6, 0);
      ctx.stroke();
    } else if (p.type === 'WATER_RIPPLE') {
      // 水波涟纹：空心扩散环
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size * 1.7, 0, Math.PI * 2);
      ctx.stroke();
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

  // Draw Floating Damage Numbers（出生弹跳：前 0.1s 由 1.55x 回落，pop-in overshoot）
  private drawDamageNumber(d: DamageNumber, cameraX: number) {
    const screenX = d.x - cameraX;
    if (screenX < -50 || screenX > this.width + 50) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.alpha);
    const age = 0.75 - d.life;
    const pop = age < 0.1 ? 1 + 0.55 * (1 - age / 0.1) : 1;
    ctx.fillStyle = d.color;
    ctx.font = `bold ${Math.round(14 * d.scale * pop)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(d.text, screenX, d.y);
    ctx.restore();
  }
}
