/**
 * 程序化动画引擎 —— 火柴人动作系统 v3
 *
 * 基于【动画十二原则】的程序化落地（源自网络检索的行业实践）：
 *  1. Anticipation 预备动作     → 攻击三段式（前摇蓄力 → 爆发 → 回收）
 *  2. Squash & Stretch 挤压拉伸 → 起跳拉长 / 落地压扁 / 重斩顿挫
 *  3. Follow Through 跟随重叠   → verlet 披风 / 发带 / 剑穗的惯性拖尾
 *  4. Ease In / Out 缓入缓出    → 全相位缓动曲线驱动
 *  5. Timing 节奏               → 快慢结合：前摇慢、出手极快、收势缓
 *  6. Pose to Pose 姿势到姿势   → 关键帧姿势库 + 指数平滑混合
 *
 * 生物力学合理性：
 *  - 双骨 IK 腿部求解（脚掌沿椭圆步迹线运行，膝盖按解剖方向自然弯曲）
 *  - 行走循环：双峰骨盆起伏、手臂反向摆动、躯干随速度前倾
 *  - 待机呼吸：双频正弦叠加 + 重心缓慢游移
 */

/* ============================== 缓动函数库 ============================== */

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 指数平滑（帧率无关）：用于姿势混合，snappy 但无突跳 */
export const expoBlend = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t: number) => t * t;
export const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -9 * t) * Math.sin((t * 9 - 0.75) * c4) + 1;
};

/* ============================== 双骨 IK 求解 ============================== */

export interface IKResult {
  midX: number;
  midY: number;
  endX: number;
  endY: number;
}

/**
 * 平面双骨逆向运动学（Law of Cosines）
 * @param bendDir 弯曲方向：+1 膝盖朝前（x+），-1 朝后
 */
export function solveIK2(
  rootX: number,
  rootY: number,
  targetX: number,
  targetY: number,
  len1: number,
  len2: number,
  bendDir: number
): IKResult {
  let dx = targetX - rootX;
  let dy = targetY - rootY;
  let dist = Math.sqrt(dx * dx + dy * dy);

  // 目标不可达时钳制到最大臂展（保持方向，腿绷直去够）
  const maxReach = len1 + len2 - 0.01;
  if (dist > maxReach) {
    dx = (dx / (dist || 1)) * maxReach;
    dy = (dy / (dist || 1)) * maxReach;
    dist = maxReach;
  }
  if (dist < Math.abs(len1 - len2) + 0.01) {
    dist = Math.abs(len1 - len2) + 0.01;
  }

  // 余弦定理求根部角
  const a1 = Math.acos(
    Math.max(-1, Math.min(1, (dist * dist + len1 * len1 - len2 * len2) / (2 * dist * len1)))
  );
  const baseAngle = Math.atan2(dy, dx);
  // bendDir 决定膝盖（肘）弯向
  const midAngle = baseAngle + a1 * bendDir;

  const midX = rootX + Math.cos(midAngle) * len1;
  const midY = rootY + Math.sin(midAngle) * len1;

  // 末端 = 目标点（已钳制）
  const endX = rootX + dx;
  const endY = rootY + dy;

  return { midX, midY, endX, endY };
}

/* ============================== 姿势系统 ============================== */

/**
 * 火柴人姿势（局部空间：原点=脚底地面接触点，y 向上为负，facing 已由外层 scale 处理）
 * 全部字段可插值
 */
export interface StickPose {
  hipX: number; // 骨盆前后偏移（突步/后撤）
  hipY: number; // 骨盆高度（负值向上，基准 -28）
  torsoLean: number; // 躯干前倾弧度（正=向前俯，负=后仰）
  headTilt: number; // 头部偏移量
  // 手臂（根角度：0=自然下垂向地，正=向前抬，负=向后摆；弯角：肘相对角）
  frontArmA: number;
  frontArmB: number;
  backArmA: number;
  backArmB: number;
  // 脚掌目标（相对骨盆水平原点，y=0 地面）
  frontFootX: number;
  frontFootY: number;
  backFootX: number;
  backFootY: number;
  // 挤压拉伸
  squashX: number;
  squashY: number;
  // 剑
  swordAngle: number; // 剑相对前手的朝向
  swordGlow: number; // 剑锋辉光 0-1
  trailEmit: number; // 剑气轨迹发射强度 0-1
  // 披风/发带风力
  capeLift: number;
  // 整体倾斜（受击踉跄等）
  bodyTilt: number;
}

export function makeDefaultPose(): StickPose {
  return {
    hipX: 0,
    hipY: -28,
    torsoLean: 0.04,
    headTilt: 0,
    frontArmA: 0.5,
    frontArmB: 0.55,
    backArmA: -0.15,
    backArmB: 0.35,
    frontFootX: 5,
    frontFootY: 0,
    backFootX: -6,
    backFootY: 0,
    squashX: 1,
    squashY: 1,
    swordAngle: 0.68,
    swordGlow: 0.12,
    trailEmit: 0,
    capeLift: 0,
    bodyTilt: 0,
  };
}

const POSE_KEYS: (keyof StickPose)[] = Object.keys(makeDefaultPose()) as (keyof StickPose)[];

/** 姿势逐字段插值 */
export function lerpPose(a: StickPose, b: StickPose, t: number): StickPose {
  const out = {} as StickPose;
  for (const k of POSE_KEYS) {
    out[k] = lerp(a[k], b[k], t);
  }
  return out;
}

/** 姿势克隆 */
export function clonePose(p: StickPose): StickPose {
  return { ...p };
}

/* ============================== 行走循环工具 ============================== */

export interface WalkStep {
  /** 前脚 x/y 目标（y 负=抬起） */
  fx: number;
  fy: number;
  /** 后脚 x/y 目标 */
  bx: number;
  by: number;
  /** 骨盆抬升量（叠加到 hipY 上，负值=升高） */
  hipLift: number;
  /** 步态相位 0-1 */
  p: number;
}

/**
 * 标准程序化行走循环（生物力学步迹）：
 * - 脚掌沿椭圆轨迹：支撑相（贴地后擦）→ 摆动相（抬起前迈）
 * - 骨盆双峰起伏：触地最低、蹬伸最高（每周期两次）
 * @param phase 累计步态相位（弧度制 2π 为一周期）
 * @param stride 步幅（半距）
 * @param lift 抬脚高度
 */
export function computeWalkStep(phase: number, stride: number, lift: number): WalkStep {
  const TAU = Math.PI * 2;
  const p = ((phase / TAU) % 1 + 1) % 1;

  // 前脚：cos 决定前后（+stride 前掌 → -stride 后跟），sin 正半周为摆动抬起
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  const fx = c * stride;
  const fy = -Math.max(0, s) * lift;
  // 后脚反相
  const bx = -c * stride;
  const by = -Math.max(0, -s) * lift;
  // 骨盆：两次触地下沉（cos 4πp）
  const hipLift = (0.5 - 0.5 * Math.cos(phase * 2)) * -2.6;

  return { fx, fy, bx, by, hipLift, p };
}

/* ============================== 英雄姿势库 ============================== */

/**
 * 英雄全状态姿势计算（关键帧 + 相位缓动）
 * @param stateTime 状态持续时间（秒）
 * @param gameTime 全局时间（待机呼吸用）
 * @param walkPhase 行走步态相位（弧度，由渲染器累积）
 * @param vz 垂直速度（跳跃上升/下落区分）
 */
export function computeHeroPose(
  state: string,
  stateTime: number,
  gameTime: number,
  walkPhase: number,
  vz: number
): StickPose {
  const pose = makeDefaultPose();

  /* ---------- 待机：双频呼吸 + 重心游移 + 剑锋微鸣 ---------- */
  if (state === 'IDLE') {
    const breathe = Math.sin(gameTime * 2.3) * 0.8 + Math.sin(gameTime * 3.7 + 1.2) * 0.35;
    const sway = Math.sin(gameTime * 0.8);
    pose.hipY = -28 - breathe * 0.9;
    pose.hipX = sway * 1.1;
    pose.torsoLean = 0.045 + breathe * 0.012;
    pose.headTilt = Math.sin(gameTime * 1.7) * 0.6;
    pose.frontFootX = 5 + sway * 0.6;
    pose.backFootX = -7;
    pose.frontArmA = 0.5 + breathe * 0.03;
    pose.frontArmB = 0.6;
    pose.backArmA = -0.14 + sway * 0.03;
    pose.swordAngle = 0.68 + breathe * 0.035;
    pose.swordGlow = 0.12 + Math.max(0, Math.sin(gameTime * 1.4)) * 0.1;
    pose.capeLift = 0.15 + Math.sin(gameTime * 1.1) * 0.1;
    return pose;
  }

  /* ---------- 行走：程序化步态（IK 腿 + 反向摆臂 + 速度前倾） ---------- */
  if (state === 'WALK') {
    const step = computeWalkStep(walkPhase, 9.5, 7.5);
    pose.hipY = -28 + step.hipLift;
    pose.hipX = 1.5;
    pose.torsoLean = 0.15;
    pose.headTilt = -Math.sin(gameTime * 4) * 0.4; // 头部稳定（抵消骨盆起伏）
    pose.frontFootX = step.fx;
    pose.frontFootY = step.fy;
    pose.backFootX = step.bx;
    pose.backFootY = step.by;
    // 后手随步伐反向摆动；前手持剑随节奏微沉
    const armSwing = Math.sin(walkPhase) * 0.42;
    pose.backArmA = -0.1 + armSwing;
    pose.backArmB = 0.4 + Math.max(0, armSwing) * 0.3;
    pose.frontArmA = 0.48 + Math.sin(walkPhase * 2) * 0.06;
    pose.swordAngle = 0.72 + Math.sin(walkPhase * 2) * 0.05;
    pose.swordGlow = 0.1;
    pose.capeLift = 0.55;
    return pose;
  }

  /* ---------- 跳跃：上升拉长 → 下落展开（Squash & Stretch） ---------- */
  if (state === 'JUMP') {
    const rising = vz > 40;
    const falling = vz < -40;
    if (rising) {
      pose.hipY = -30;
      pose.squashY = 1.12;
      pose.squashX = 0.92;
      pose.torsoLean = 0.1;
      pose.frontFootX = 2;
      pose.frontFootY = -9; // 收腿
      pose.backFootX = -5;
      pose.backFootY = -7;
      pose.frontArmA = -0.9; // 手臂上扬带势
      pose.frontArmB = 0.5;
      pose.backArmA = -0.7;
      pose.swordAngle = -0.4;
      pose.capeLift = 1.1;
    } else if (falling) {
      pose.hipY = -27;
      pose.squashY = 1.04;
      pose.torsoLean = 0.06;
      pose.frontFootX = 6;
      pose.frontFootY = -3;
      pose.backFootX = -6;
      pose.backFootY = -5;
      pose.frontArmA = -0.35;
      pose.backArmA = 0.55;
      pose.swordAngle = 0.3;
      pose.capeLift = 0.8;
    } else {
      // 滞空顶点：舒展悬停
      pose.hipY = -29;
      pose.frontFootX = 3;
      pose.frontFootY = -7;
      pose.backFootX = -5;
      pose.backFootY = -6;
      pose.frontArmA = -0.5;
      pose.capeLift = 1.0;
    }
    return pose;
  }

  /* ---------- 普攻一式「横扫千墨」：预备后拧 → 极速横斩 → 收势 ---------- */
  if (state === 'ATTACK_1') {
    const ANT = 0.09, HIT = 0.16, END = 0.35;
    if (stateTime < ANT) {
      const t = easeOutQuad(stateTime / ANT);
      pose.torsoLean = lerp(0.04, -0.22, t); // 后仰蓄力
      pose.hipX = lerp(0, -2.5, t);
      pose.frontArmA = lerp(0.5, -1.05, t); // 拉剑回后
      pose.frontArmB = lerp(0.6, 0.9, t);
      pose.swordAngle = lerp(0.68, -1.35, t);
      pose.backArmA = lerp(-0.14, 0.55, t);
      pose.frontFootX = lerp(5, 2, t);
      pose.swordGlow = lerp(0.12, 0.55, t);
      pose.capeLift = 0.3;
    } else if (stateTime < HIT) {
      const t = easeOutCubic((stateTime - ANT) / (HIT - ANT)); // 出手极快
      pose.torsoLean = lerp(-0.22, 0.34, t); // 拧腰发力
      pose.hipX = lerp(-2.5, 4, t);
      pose.frontArmA = lerp(-1.05, 1.28, t); // 大幅横扫
      pose.frontArmB = lerp(0.9, 0.15, t); // 肘展开
      pose.swordAngle = lerp(-1.35, 0.12, t);
      pose.backArmA = lerp(0.55, -0.5, t);
      pose.backArmB = 0.5;
      pose.frontFootX = lerp(2, 8, t); // 前脚踏步
      pose.backFootX = lerp(-6, -10, t);
      pose.swordGlow = 1;
      pose.trailEmit = 1;
      pose.capeLift = 1.3;
      pose.squashX = 1.03;
    } else {
      const t = easeInOutQuad(clamp01((stateTime - HIT) / (END - HIT)));
      pose.torsoLean = lerp(0.34, 0.06, t);
      pose.hipX = lerp(4, 0, t);
      pose.frontArmA = lerp(1.28, 0.52, t);
      pose.frontArmB = lerp(0.15, 0.58, t);
      pose.swordAngle = lerp(0.12, 0.68, t);
      pose.backArmA = lerp(-0.5, -0.14, t);
      pose.frontFootX = lerp(8, 5, t);
      pose.backFootX = lerp(-10, -6, t);
      pose.swordGlow = lerp(1, 0.15, t);
      pose.trailEmit = 1 - t;
      pose.capeLift = lerp(1.3, 0.2, t);
      pose.squashX = lerp(1.03, 1, t);
    }
    return pose;
  }

  /* ---------- 普攻二式「挑墨问天」：下沉蓄力 → 上撩挑斩 ---------- */
  if (state === 'ATTACK_2') {
    const ANT = 0.08, HIT = 0.17, END = 0.35;
    if (stateTime < ANT) {
      const t = easeOutQuad(stateTime / ANT);
      pose.hipY = lerp(-28, -24.5, t); // 沉身
      pose.squashY = lerp(1, 0.93, t);
      pose.squashX = lerp(1, 1.06, t);
      pose.torsoLean = lerp(0.04, 0.26, t); // 前倾聚势
      pose.frontArmA = lerp(0.5, 1.05, t); // 剑压向地
      pose.frontArmB = 0.7;
      pose.swordAngle = lerp(0.68, 1.15, t);
      pose.swordGlow = lerp(0.12, 0.6, t);
      pose.frontFootX = 4;
      pose.backFootX = -8;
    } else if (stateTime < HIT) {
      const t = easeOutCubic((stateTime - ANT) / (HIT - ANT));
      pose.hipY = lerp(-24.5, -31.5, t); // 拔地而起
      pose.squashY = lerp(0.93, 1.09, t);
      pose.squashX = lerp(1.06, 0.95, t);
      pose.torsoLean = lerp(0.26, -0.12, t);
      pose.frontArmA = lerp(1.05, -1.5, t); // 大幅上撩
      pose.frontArmB = lerp(0.7, 0.3, t);
      pose.swordAngle = lerp(1.15, -1.45, t);
      pose.backArmA = lerp(-0.14, -0.65, t);
      pose.swordGlow = 1;
      pose.trailEmit = 1;
      pose.capeLift = 1.5;
    } else {
      const t = easeInOutQuad(clamp01((stateTime - HIT) / (END - HIT)));
      pose.hipY = lerp(-31.5, -28, t);
      pose.squashY = lerp(1.09, 1, t);
      pose.squashX = lerp(0.95, 1, t);
      pose.torsoLean = lerp(-0.12, 0.06, t);
      pose.frontArmA = lerp(-1.5, 0.5, t);
      pose.frontArmB = lerp(0.3, 0.6, t);
      pose.swordAngle = lerp(-1.45, 0.68, t);
      pose.backArmA = lerp(-0.65, -0.14, t);
      pose.swordGlow = lerp(1, 0.15, t);
      pose.trailEmit = 1 - t;
      pose.capeLift = lerp(1.5, 0.2, t);
    }
    return pose;
  }

  /* ---------- 普攻三式「力透纸背」：高举过顶 → 劈落重斩 → 顿挫定格 ---------- */
  if (state === 'ATTACK_3') {
    const ANT = 0.11, HIT = 0.2, SETTLE = 0.27, END = 0.35;
    if (stateTime < ANT) {
      const t = easeOutQuad(stateTime / ANT);
      pose.hipY = lerp(-28, -31, t); // 提身举剑
      pose.torsoLean = lerp(0.04, -0.3, t); // 后弓蓄力
      pose.frontArmA = lerp(0.5, -1.85, t); // 高举过顶
      pose.frontArmB = lerp(0.6, 0.25, t);
      pose.swordAngle = lerp(0.68, -1.7, t);
      pose.backArmA = lerp(-0.14, -1.0, t); // 双手举势
      pose.swordGlow = lerp(0.12, 0.85, t);
      pose.frontFootX = 3;
      pose.capeLift = 0.4;
    } else if (stateTime < HIT) {
      const t = easeInCubic((stateTime - ANT) / (HIT - ANT)); // 加速下劈
      pose.hipY = lerp(-31, -25.5, t); // 全身压下
      pose.squashY = lerp(1, 0.88, t); // 重挤压
      pose.squashX = lerp(1, 1.1, t);
      pose.torsoLean = lerp(-0.3, 0.5, t);
      pose.hipX = lerp(0, 5, t);
      pose.frontArmA = lerp(-1.85, 1.15, t);
      pose.frontArmB = lerp(0.25, 0.35, t);
      pose.swordAngle = lerp(-1.7, 1.35, t);
      pose.backArmA = lerp(-1.0, 0.9, t);
      pose.swordGlow = 1;
      pose.trailEmit = 1;
      pose.frontFootX = lerp(3, 9, t);
      pose.backFootX = lerp(-6, -12, t);
      pose.capeLift = 1.6;
    } else if (stateTime < SETTLE) {
      // 顿挫定格（重击余韵）
      pose.hipY = -25.5;
      pose.squashY = 0.88;
      pose.squashX = 1.1;
      pose.torsoLean = 0.5;
      pose.hipX = 5;
      pose.frontArmA = 1.15;
      pose.swordAngle = 1.35;
      pose.backArmA = 0.9;
      pose.swordGlow = 0.9;
      pose.trailEmit = 0.35;
      pose.frontFootX = 9;
      pose.backFootX = -12;
      pose.capeLift = 1.2;
    } else {
      const t = easeInOutQuad(clamp01((stateTime - SETTLE) / (END - SETTLE)));
      pose.hipY = lerp(-25.5, -28, t);
      pose.squashY = lerp(0.88, 1, t);
      pose.squashX = lerp(1.1, 1, t);
      pose.torsoLean = lerp(0.5, 0.06, t);
      pose.hipX = lerp(5, 0, t);
      pose.frontArmA = lerp(1.15, 0.52, t);
      pose.swordAngle = lerp(1.35, 0.68, t);
      pose.backArmA = lerp(0.9, -0.14, t);
      pose.swordGlow = lerp(0.9, 0.15, t);
      pose.trailEmit = 0.35 * (1 - t);
      pose.frontFootX = lerp(9, 5, t);
      pose.backFootX = lerp(-12, -6, t);
      pose.capeLift = lerp(1.2, 0.2, t);
    }
    return pose;
  }

  /* ---------- 空中坠击「墨燕投林」：蜷身倒栽 ---------- */
  if (state === 'ATTACK_AERIAL') {
    pose.hipY = -27;
    pose.squashY = 1.08;
    pose.squashX = 0.94;
    pose.torsoLean = 0.42; // 前倾倒栽
    pose.bodyTilt = 0.18;
    pose.frontArmA = 1.35; // 剑直指下方
    pose.frontArmB = 0.1;
    pose.swordAngle = 1.5;
    pose.swordGlow = 1;
    pose.trailEmit = 1;
    pose.backArmA = -0.9; // 后臂上摆平衡
    pose.frontFootX = 4;
    pose.frontFootY = -10; // 腿蜷起
    pose.backFootX = -7;
    pose.backFootY = -13;
    pose.capeLift = 1.8;
    return pose;
  }

  /* ---------- 技能·断水斩「踏墨穿云」：极限突进 ---------- */
  if (state === 'SKILL_DASH') {
    const t = easeOutCubic(clamp01(stateTime / 0.3));
    pose.hipY = -24; // 压低重心
    pose.squashY = 0.94;
    pose.squashX = 1.06;
    pose.hipX = lerp(3, 7, t);
    pose.torsoLean = 0.62; // 极限前倾
    pose.frontArmA = 1.5; // 剑水平直指前方
    pose.frontArmB = 0.05;
    pose.swordAngle = 0.02;
    pose.swordGlow = 1;
    pose.trailEmit = 1;
    pose.backArmA = -0.85; // 后摆如翼
    pose.backArmB = 0.2;
    pose.frontFootX = 12; // 弓步
    pose.frontFootY = -1;
    pose.backFootX = -14;
    pose.backFootY = -2;
    pose.capeLift = 2.2; // 披风激扬
    return pose;
  }

  /* ---------- 技能·竹影护体：双臂结印 ---------- */
  if (state === 'SKILL_SHIELD') {
    const t = easeOutBack(clamp01(stateTime / 0.3));
    pose.hipY = -26;
    pose.torsoLean = lerp(0.04, -0.08, t);
    pose.frontArmA = lerp(0.5, -1.35, t); // 双臂上举结印
    pose.frontArmB = lerp(0.6, 0.9, t);
    pose.backArmA = lerp(-0.14, -1.5, t);
    pose.backArmB = 0.7;
    pose.swordAngle = lerp(0.68, -0.9, t);
    pose.swordGlow = 0.8;
    pose.capeLift = 1.0;
    return pose;
  }

  /* ---------- 技能·星辉弹幕：引星上天 ---------- */
  if (state === 'SKILL_BARRAGE') {
    const t = easeOutCubic(clamp01(stateTime / 0.4));
    pose.hipY = lerp(-28, -30.5, t);
    pose.torsoLean = lerp(0.04, -0.16, t);
    pose.frontArmA = lerp(0.5, -1.75, t); // 指天引星
    pose.frontArmB = lerp(0.6, 0.2, t);
    pose.backArmA = lerp(-0.14, -1.45, t);
    pose.swordAngle = lerp(0.68, -1.55, t);
    pose.swordGlow = 1;
    pose.capeLift = 1.4;
    return pose;
  }

  /* ---------- 技能·墨莲阵：单指点地 ---------- */
  if (state === 'SKILL_LOTUS') {
    const t = easeOutCubic(clamp01(stateTime / 0.35));
    pose.hipY = lerp(-28, -23, t); // 低身
    pose.squashY = lerp(1, 0.92, t);
    pose.torsoLean = lerp(0.04, 0.32, t);
    pose.frontArmA = lerp(0.5, 1.5, t); // 指地种莲
    pose.frontArmB = 0.15;
    pose.swordAngle = 1.6;
    pose.swordGlow = 0.9;
    pose.backArmA = lerp(-0.14, -1.1, t); // 后臂扬起平衡
    pose.backArmB = 0.4;
    pose.frontFootX = 3;
    pose.backFootX = -10;
    pose.capeLift = 0.9;
    return pose;
  }

  /* ---------- 绝技·万墨归宗：大开大合 ---------- */
  if (state === 'SKILL_ULTIMATE') {
    const t = easeOutBack(clamp01(stateTime / 0.45));
    pose.hipY = lerp(-28, -32, t);
    pose.squashY = lerp(1, 1.06, t);
    pose.torsoLean = lerp(0.04, -0.2, t); // 仰天张臂
    pose.frontArmA = lerp(0.5, -2.2, t); // 剑指苍穹
    pose.frontArmB = lerp(0.6, 0.1, t);
    pose.swordAngle = lerp(0.68, -1.85, t);
    pose.swordGlow = 1;
    pose.backArmA = lerp(-0.14, -1.9, t);
    pose.backArmB = 0.15;
    pose.frontFootX = 8;
    pose.backFootX = -10;
    pose.capeLift = 2.6; // 披风狂舞
    return pose;
  }

  /* ---------- 受击：踉跄后仰 ---------- */
  if (state === 'HURT') {
    const t = easeOutQuad(clamp01(stateTime / 0.3));
    pose.torsoLean = -0.34 * (1 - t * 0.6);
    pose.bodyTilt = -0.14 * (1 - t);
    pose.hipX = -4 * (1 - t * 0.5);
    pose.headTilt = -1.2 * (1 - t * 0.6);
    pose.frontArmA = 0.9 * (1 - t * 0.5); // 手臂前甩失衡
    pose.frontArmB = 0.3;
    pose.backArmA = -0.75 * (1 - t * 0.5);
    pose.frontFootX = 8;
    pose.backFootX = -4;
    pose.swordAngle = 0.9;
    pose.capeLift = 0.7;
    return pose;
  }

  return pose;
}
