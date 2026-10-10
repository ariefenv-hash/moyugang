import {
  UnitInstance,
  HeroInstance,
  Projectile,
  Particle,
  DamageNumber,
  LevelConfig,
  InkLotusTrap,
  SealStamp,
} from '../types/game';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  /** 设备像素比：高分屏逻辑坐标 → 物理像素映射，画面更清晰 */
  private dpr: number = 1;
  private bgImage: HTMLImageElement | null = null;

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
    shakeY: number = 0
  ) {
    const ctx = this.ctx;
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

    // Background Image Art
    if (this.bgImage) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      const bgOffset = -(cameraX * 0.15) % this.width;
      ctx.drawImage(this.bgImage, bgOffset, 0, this.width, laneMinY + 60);
      ctx.drawImage(this.bgImage, bgOffset + this.width, 0, this.width, laneMinY + 60);
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

  // Enhanced Multi-Joint Skeletal Hero Animation
  private drawSkeletalHero(
    hero: HeroInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = hero.x - cameraX;
    if (screenX < -120 || screenX > this.width + 120) return;

    const ctx = this.ctx;
    const groundY = hero.y;
    const altitudeZ = hero.altitudeZ || 0;
    const heroY = groundY - altitudeZ;
    const scale = this.getDepthScale(hero.y, laneMinY, laneMaxY);
    const facing = hero.facing;

    // 1. Draw 2.5D Drop Shadow on ground
    this.drawDropShadow(screenX, groundY, 24 * scale, altitudeZ);

    ctx.save();
    ctx.translate(screenX, heroY);
    ctx.scale(facing * scale, scale);

    // Flinch Recoil if taking damage
    if (hero.flinchTimer > 0) {
      ctx.rotate(-0.15);
      ctx.translate(-5, 0);
    }

    // Skeletal Gait Calculation
    const isMoving = hero.state === 'WALK';
    const walkFreq = 12;
    const gaitPhase = isMoving ? gameTime * walkFreq : 0;

    // Pelvis & Body Bobbing
    const hipBob = isMoving ? Math.abs(Math.sin(gaitPhase)) * 4 : Math.sin(gameTime * 2) * 1.5;
    const hipY = -28 + hipBob;

    // 2. Billowing Multi-Segment Silk Cape (Fluid physics)
    this.drawMultiSegmentCape(ctx, hipY - 20, isMoving, facing, hero.state, gameTime);

    // 3. Multi-Joint Legs (Thigh -> Knee -> Shin -> Foot)
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const leg1Swing = isMoving ? Math.sin(gaitPhase) * 0.7 : 0.05;
    const leg2Swing = isMoving ? -Math.sin(gaitPhase) * 0.7 : -0.05;

    // Left Leg (Back)
    this.drawLimbBone(ctx, -2, hipY, leg1Swing, 14, 14);

    // Right Leg (Front)
    this.drawLimbBone(ctx, 2, hipY, leg2Swing, 14, 14);

    // 4. Torso & Robes (Spine bone)
    const spineLean = isMoving ? 0.12 : 0;
    const shoulderX = Math.sin(spineLean) * 22;
    const shoulderY = hipY - 22;

    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(shoulderX, shoulderY);
    ctx.stroke();

    // Robe Sash / Belt in jade turquoise
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(-6, hipY - 4, 12, 4);

    // 5. Head, Neck & Topknot
    const headX = shoulderX + 2;
    const headY = shoulderY - 14;

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(headX, headY, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Topknot & Flowing Ribbon
    ctx.beginPath();
    ctx.arc(headX, headY - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.2;
    const ribbonWave = Math.sin(gameTime * 6) * 6;
    ctx.beginPath();
    ctx.moveTo(headX, headY - 10);
    ctx.quadraticCurveTo(headX - 12 + ribbonWave * 0.5, headY - 12, headX - 22 + ribbonWave, headY - 6);
    ctx.stroke();

    // 6. Multi-Joint Arms & Luminous Brush-Sword
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 4;

    // Handle Attack animations
    if (hero.state === 'ATTACK_1') {
      // Horizontal sweeping slash
      this.drawLimbBone(ctx, shoulderX, shoulderY, -0.4, 16, 16);
      this.drawBrushSword(ctx, shoulderX + 28, shoulderY - 8, 0.2, true);
      this.drawInkSlashArc(ctx, 40, shoulderY - 8, 65, -0.6, 0.6);
    } else if (hero.state === 'ATTACK_2') {
      // Upward calligraphy stroke
      this.drawLimbBone(ctx, shoulderX, shoulderY, -1.2, 16, 16);
      this.drawBrushSword(ctx, shoulderX + 22, shoulderY - 26, -1.1, true);
      this.drawInkSlashArc(ctx, 35, shoulderY - 26, 70, -1.3, 0.1);
    } else if (hero.state === 'ATTACK_3') {
      // Plunging heavy stroke
      this.drawLimbBone(ctx, shoulderX, shoulderY, 0.6, 16, 16);
      this.drawBrushSword(ctx, shoulderX + 32, shoulderY + 8, 0.9, true);
      this.drawInkSlashArc(ctx, 40, shoulderY + 8, 80, 0.2, 1.4);
    } else if (hero.state === 'ATTACK_AERIAL') {
      // Airborne diving plunge
      this.drawLimbBone(ctx, shoulderX, shoulderY, 1.4, 16, 16);
      this.drawBrushSword(ctx, shoulderX + 20, shoulderY + 22, 1.57, true);
    } else if (hero.state === 'SKILL_DASH') {
      // Forward thrust
      this.drawLimbBone(ctx, shoulderX, shoulderY, -0.1, 16, 16);
      this.drawBrushSword(ctx, shoulderX + 36, shoulderY - 4, 0, true);
    } else {
      // Idle / Walking holding sword gracefully
      const armSway = isMoving ? Math.sin(gaitPhase) * 0.3 : 0;
      this.drawLimbBone(ctx, shoulderX, shoulderY, 0.5 + armSway, 14, 14);
      this.drawBrushSword(ctx, shoulderX + 16, shoulderY + 12, 0.7, false);
    }

    // Shield Dome if active
    if (hero.shieldHp > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, hipY - 10, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Overhead HUD
    this.drawHeroOverheadHUD(screenX, heroY - 82 * scale, hero, scale);
  }

  // Draw 2-joint limb bone (thigh/shin or arm/forearm)
  private drawLimbBone(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    rootAngle: number,
    len1: number,
    len2: number
  ) {
    const kneeX = startX + Math.sin(rootAngle) * len1;
    const kneeY = startY + Math.cos(rootAngle) * len1;

    // Joint 2 angle bends naturally forward/backward
    const bendAngle = rootAngle + 0.35;
    const footX = kneeX + Math.sin(bendAngle) * len2;
    const footY = kneeY + Math.cos(bendAngle) * len2;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
  }

  // Billowing Multi-Segment Silk Cape
  private drawMultiSegmentCape(
    ctx: CanvasRenderingContext2D,
    attachY: number,
    isMoving: boolean,
    facing: number,
    heroState: string,
    gameTime: number
  ) {
    ctx.save();
    const windSpeed = isMoving ? 8 : 4;
    const wave = Math.sin(gameTime * windSpeed) * 10;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;

    ctx.beginPath();
    ctx.moveTo(-4, attachY);
    ctx.quadraticCurveTo(-18, attachY + 14, -28 + wave * 0.6, attachY + 28);
    ctx.quadraticCurveTo(-38 + wave, attachY + 40, -42 + wave * 1.2, attachY + 46);
    ctx.quadraticCurveTo(-26, attachY + 36, -6, attachY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Luminous Ink Slash Ribbon Arc
  private drawInkSlashArc(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ) {
    ctx.save();
    const arcGrad = ctx.createRadialGradient(originX, originY, radius * 0.6, originX, originY, radius);
    arcGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    arcGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.7)');
    arcGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');

    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(originX, originY, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  }

  // Draw Brush-Sword
  private drawBrushSword(
    ctx: CanvasRenderingContext2D,
    handX: number,
    handY: number,
    angle: number,
    isSlashing: boolean
  ) {
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle);

    // Hilt & Jade guard
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -2, 8, 4);
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Luminous Blade
    const bladeGrad = ctx.createLinearGradient(0, 0, 42, 0);
    bladeGrad.addColorStop(0, '#f8fafc');
    bladeGrad.addColorStop(0.7, '#38bdf8');
    bladeGrad.addColorStop(1, '#0284c7');

    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(34, -1.5);
    ctx.lineTo(44, 0);
    ctx.lineTo(34, 1.5);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();

    if (isSlashing) {
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(44, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw Skeletal Soldiers, Minions & Bosses in 2.5D
  private drawSkeletalUnit(
    unit: UnitInstance,
    cameraX: number,
    laneMinY: number,
    laneMaxY: number,
    gameTime: number
  ) {
    const screenX = unit.x - cameraX;
    if (screenX < -100 || screenX > this.width + 100) return;

    const ctx = this.ctx;
    const groundY = unit.y;
    const altitudeZ = unit.altitudeZ || 0;
    const unitY = groundY - altitudeZ;
    const scale = this.getDepthScale(unit.y, laneMinY, laneMaxY);
    const facing = unit.facing;
    const isEnemy = unit.isEnemy;

    // 1. Drop shadow on ground
    this.drawDropShadow(screenX, groundY, 18 * scale, altitudeZ);

    // 1.5 Boss 二阶段狂暴暗红气场
    if (unit.isBoss && unit.enraged) {
      const pulse = 0.55 + Math.sin(gameTime * 7) * 0.2;
      const auraGrad = ctx.createRadialGradient(screenX, unitY - 30 * scale, 8, screenX, unitY - 30 * scale, 62 * scale);
      auraGrad.addColorStop(0, `rgba(220, 38, 38, ${0.34 * pulse})`);
      auraGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(screenX, unitY - 30 * scale, 62 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(screenX, unitY);
    ctx.scale(facing * scale, scale);

    // Flinch recoil
    if (unit.flinchTimer > 0) {
      ctx.rotate(-0.12);
      ctx.translate(-4, 0);
    }

    const mainColor = isEnemy ? '#18181b' : '#09090b';
    const accentColor = isEnemy ? '#ef4444' : '#06b6d4';

    const isMoving = unit.state === 'WALK' || unit.state === 'RETREAT';
    const gaitPhase = isMoving ? gameTime * (unit.speed * 0.08) : 0;
    const leg1Swing = isMoving ? Math.sin(gaitPhase) * 0.6 : 0;
    const leg2Swing = isMoving ? -Math.sin(gaitPhase) * 0.6 : 0;

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (unit.type) {
      case 'SCRIBE':
        // Legs
        this.drawLimbBone(ctx, -2, -18, leg1Swing, 10, 10);
        this.drawLimbBone(ctx, 2, -18, leg2Swing, 10, 10);
        // Torso
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, -34);
        ctx.stroke();
        // Head
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, -42, 6, 0, Math.PI * 2);
        ctx.fill();
        // Ink jar
        ctx.fillStyle = (unit.carriedInk || 0) > 0 ? accentColor : '#57534e';
        ctx.fillRect(-10, -32, 7, 13);
        break;

      case 'SWORD':
        // Legs
        this.drawLimbBone(ctx, -2, -22, leg1Swing, 12, 12);
        this.drawLimbBone(ctx, 2, -22, leg2Swing, 12, 12);
        // Torso
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(0, -42);
        ctx.stroke();
        // Conical straw hat
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, -49, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.moveTo(-13, -51);
        ctx.lineTo(0, -58);
        ctx.lineTo(13, -51);
        ctx.closePath();
        ctx.fill();
        // Sword slash or idle
        if (unit.state === 'ATTACK') {
          ctx.strokeStyle = accentColor;
          ctx.beginPath();
          ctx.moveTo(0, -36);
          ctx.lineTo(24, -36);
          ctx.lineTo(46, -36);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.moveTo(0, -36);
          ctx.lineTo(12, -26);
          ctx.lineTo(22, -14);
          ctx.stroke();
        }
        break;

      case 'ARCHER':
        this.drawLimbBone(ctx, -2, -22, leg1Swing, 12, 12);
        this.drawLimbBone(ctx, 2, -22, leg2Swing, 12, 12);
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(0, -42);
        ctx.stroke();
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, -49, 6.5, 0, Math.PI * 2);
        ctx.fill();
        // Longbow
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(16, -36, 18, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.stroke();
        break;

      case 'GUARDIAN':
        ctx.lineWidth = 4.2;
        this.drawLimbBone(ctx, -4, -24, leg1Swing, 13, 13);
        this.drawLimbBone(ctx, 4, -24, leg2Swing, 13, 13);
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(0, -46);
        ctx.stroke();
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, -54, 8, 0, Math.PI * 2);
        ctx.fill();
        // Tower Shield
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.5;
        ctx.fillRect(10, -56, 16, 52);
        ctx.strokeRect(10, -56, 16, 52);
        // Halberd
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-4, -12);
        ctx.lineTo(unit.state === 'ATTACK' ? 38 : 14, unit.state === 'ATTACK' ? -38 : -72);
        ctx.stroke();
        break;

      case 'HARPIST':
        // Hovering Zither Maiden
        const hover = Math.sin(gameTime * 3) * 4;
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.moveTo(0, -32 + hover);
        ctx.lineTo(-9, 0 + hover);
        ctx.lineTo(9, 0 + hover);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -44 + hover, 6.5, 0, Math.PI * 2);
        ctx.fill();
        // Zither
        ctx.fillStyle = '#78350f';
        ctx.fillRect(12, -36 + hover, 26, 8);
        break;
    }

    ctx.restore();

    // Overhead HP Bar
    this.drawUnitHpBar(screenX, unitY - 50 * scale, unit, scale);
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
