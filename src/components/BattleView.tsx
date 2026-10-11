import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  LevelConfig,
  UnitInstance,
  HeroInstance,
  Projectile,
  Particle,
  DamageNumber,
  ArmyCommand,
  UnitType,
  PlayerProgress,
  InkLotusTrap,
  SealStamp,
  CalligraphyCombo,
  WeatherEvent,
  BattleResultStats,
  BlessingDef,
  BlessingMults,
  InkDragon,
  InkTreasure,
} from '../types/game';
import {
  UNIT_CONFIGS,
  HERO_INITIAL_STATS,
  WEATHER_EFFECTS,
  BLESSINGS,
} from '../data/gameData';
import { CanvasRenderer } from '../utils/canvasRenderer';
import { sound } from '../utils/audio';
import { GestureRecognizer, GestureResult } from '../utils/gestureRecognizer';
import { Joystick } from './Joystick';
import { FloatingJoystick } from './FloatingJoystick';
import { PauseOverlay } from './PauseOverlay';
import { BlessingModal } from './BlessingModal';
import bgInkMountains from '../assets/images/bg_ink_mountains_1791652099827.jpg';
import {
  Shield,
  Zap,
  Sparkles,
  Scroll,
  Sword,
  Crosshair,
  Music,
  Feather,
  Volume2,
  VolumeX,
  Flag,
  ChevronLeft,
  ArrowUp,
  Flame,
  CloudRain,
  Wind,
  Moon,
  PenTool,
  Gamepad2,
  HelpCircle,
  Pause,
  Infinity as InfinityIcon,
  X,
  Hand,
  Gem,
} from 'lucide-react';

interface BattleViewProps {
  level: LevelConfig;
  progress: PlayerProgress;
  onVictory: (stats: BattleResultStats) => void;
  onDefeat: (stats: BattleResultStats) => void;
  onExit: () => void;
  onRestart: () => void;
  onTutorialDone: () => void;
}

export const BattleView: React.FC<BattleViewProps> = ({
  level,
  progress,
  onVictory,
  onDefeat,
  onExit,
  onRestart,
  onTutorialDone,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  // Sound Mute State
  const [isMuted, setIsMuted] = useState(sound.getMuted());

  // Input Control Mode: 'GESTURE' 挥毫手势 | 'DUAL' 双区操控（浮动摇杆+手势） | 'CLASSIC' 经典摇杆按键
  // 首次进入：触屏设备默认双区，桌面默认挥毫；选择持久化
  const [controlMode, setControlModeState] = useState<'GESTURE' | 'DUAL' | 'CLASSIC'>(() => {
    try {
      const saved = localStorage.getItem('ink_steel_control_mode');
      if (saved === 'GESTURE' || saved === 'DUAL' || saved === 'CLASSIC') return saved;
    } catch {}
    const isTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
    return isTouch ? 'DUAL' : 'GESTURE';
  });
  const controlModeRef = useRef(controlMode);
  const setControlMode = useCallback((m: 'GESTURE' | 'DUAL' | 'CLASSIC') => {
    controlModeRef.current = m;
    setControlModeState(m);
    try {
      localStorage.setItem('ink_steel_control_mode', m);
    } catch {}
  }, []);
  const [showGestureGuide, setShowGestureGuide] = useState(false);

  // ===== 浮动摇杆状态（DUAL 模式：左半屏触点生成，多点触控安全） =====
  const FLOAT_JOY_RADIUS = 60; // 底盘半径 px
  const [floatJoy, setFloatJoy] = useState<{
    active: boolean;
    pointerId: number;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
  }>({ active: false, pointerId: -1, baseX: 0, baseY: 0, knobX: 0, knobY: 0 });
  const floatJoyRef = useRef(floatJoy);

  // ===== 高频游戏状态：真相源在 ref，节流同步到 state（避免每帧 setState 性能灾难） =====
  const [ink, setInk] = useState(level.initialInk);
  const inkRef = useRef(level.initialInk);
  const [armyCommand, setArmyCommandState] = useState<ArmyCommand>('ATTACK');
  const armyCommandRef = useRef<ArmyCommand>('ATTACK');
  const playerBaseHpRef = useRef(level.playerBaseHp + (progress.citadelUpgrades.baseHpLevel * 300));
  const [playerBaseHp, setPlayerBaseHp] = useState(playerBaseHpRef.current);
  const playerBaseMaxHpRef = useRef(level.playerBaseHp + (progress.citadelUpgrades.baseHpLevel * 300));
  const enemyBaseHpRef = useRef(level.enemyBaseHp);
  const [enemyBaseHp, setEnemyBaseHp] = useState(level.enemyBaseHp);
  const enemyBaseMaxHpRef = useRef(level.enemyBaseHp);
  const armyCountRef = useRef(0);
  const [armyCount, setArmyCount] = useState(0);
  const [maxArmy] = useState(25);

  // ===== 暂停系统 =====
  const isPausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  // ===== 战斗统计（击杀 / 最高连击） =====
  const statsRef = useRef({ kills: 0, maxCombo: 0 });

  // ===== 无尽试炼波次 =====
  const endlessWaveRef = useRef(1);
  const [endlessWave, setEndlessWave] = useState(1);

  // ===== 首战教学 =====
  const [showTutorial, setShowTutorial] = useState(
    !progress.tutorialDone && !level.endless && level.id === 1
  );

  // Hero Cooldowns（真相源 skillCdsRef）
  const skillCdsRef = useRef<{ [key: string]: number }>({
    dash_slash: 0,
    bamboo_shield: 0,
    starlight_barrage: 0,
    lotus_trap: 0,
    ultimate_landscape: 0,
  });
  const [skillCds, setSkillCds] = useState<{ [key: string]: number }>(skillCdsRef.current);
  const heroEnergyRef = useRef(60);
  const [heroEnergy, setHeroEnergy] = useState(60);
  const [heroHp, setHeroHp] = useState(HERO_INITIAL_STATS.maxHp);
  const [heroMaxHp] = useState(
    HERO_INITIAL_STATS.maxHp + (progress.heroUpgrades.hpLevel * 60)
  );
  const [heroReviving, setHeroReviving] = useState(false);
  const [heroReviveTimer, setHeroReviveTimer] = useState(0);

  // Calligraphy Combo state（真相源 comboRef，命中时即时同步，衰减走节流）
  const comboRef = useRef<CalligraphyCombo>({
    count: 0,
    tier: 'NONE',
    timer: 0,
    maxTimer: 2.8,
    ratingText: '',
    inkBonusMultiplier: 1.0,
  });
  const [combo, setCombo] = useState<CalligraphyCombo>(comboRef.current);

  // Dynamic Weather Event（真相源 weatherRef）
  const weatherRef = useRef<WeatherEvent | null>(null);
  const [activeWeather, setActiveWeather] = useState<WeatherEvent | null>(null);

  // ===== 墨灵祝福（Roguelike 三选一，可叠加） =====
  const activeBlessingsRef = useRef<Record<string, number>>({});
  const [ownedBlessings, setOwnedBlessings] = useState<Record<string, number>>({});
  const blessingMultsRef = useRef<BlessingMults>({
    attack: 1,
    speed: 1,
    hp: 1,
    inkGain: 1,
    energyGain: 1,
    comboTimer: 1,
    cooldown: 1,
  });
  const [blessingOffer, setBlessingOffer] = useState<BlessingDef[] | null>(null);
  const blessingOfferRef = useRef<BlessingDef[] | null>(null);
  const nextBlessingTimeRef = useRef(45);
  const citadelRegenRef = useRef(0);

  // ===== 文房四宝收集 =====
  const TREASURE_KINDS: InkTreasure['kind'][] = ['BRUSH', 'INK', 'PAPER', 'STONE'];
  const TREASURE_CHAR: Record<InkTreasure['kind'], string> = {
    BRUSH: '笔',
    INK: '墨',
    PAPER: '纸',
    STONE: '砚',
  };
  const treasuresRef = useRef<InkTreasure[]>([]);
  const collectedTreasuresRef = useRef<Record<InkTreasure['kind'], boolean>>({
    BRUSH: false,
    INK: false,
    PAPER: false,
    STONE: false,
  });
  const [treasureCollected, setTreasureCollected] = useState<Record<InkTreasure['kind'], boolean>>({
    BRUSH: false,
    INK: false,
    PAPER: false,
    STONE: false,
  });

  // ===== 墨龙卷（高连击奖励） =====
  const inkDragonsRef = useRef<InkDragon[]>([]);
  const dragonComboMarkRef = useRef(0);
  const dragonCdRef = useRef(0);

  // ===== 墨滞时刻（残血子弹时间，每场一次） =====
  const INK_SLOW_DURATION = 3.0;
  const inkSlowUsedRef = useRef(false);
  const inkSlowTimerRef = useRef(0);
  const [inkSlowLeft, setInkSlowLeft] = useState(0);

  // Stage announcement / verse banner
  const [stageBanner, setStageBanner] = useState<string | null>(level.poeticVerse);
  const [bossAnnounced, setBossAnnounced] = useState(false);

  // Recent Recognized Calligraphy Gesture Badge (e.g. 「横 · 断水东流」)
  const [gestureBadge, setGestureBadge] = useState<{ text: string; sub: string } | null>(null);

  // 2.5D Arena Geometry
  const WORLD_WIDTH = 2600;
  const LANE_MIN_Y = useRef(390);
  const LANE_MAX_Y = useRef(520);
  const viewWRef = useRef(1280);
  const viewHRef = useRef(720);
  const cameraX = useRef(0);

  // level 快照：game loop 依赖数组清空后，内部改读 levelRef
  const levelRef = useRef(level);
  levelRef.current = level;

  // ===== 可靠清理的 setTimeout 登记（卸载后不再执行，防泄漏） =====
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
    return id;
  }, []);

  // ===== 升级效果实装：冷却缩短（每级 -8%，上限5级）与风雅领域共鸣增幅 =====
  const cdMult = Math.max(0.6, 1 - progress.heroUpgrades.cooldownLevel * 0.08);
  const resonanceMult = 1 + progress.heroUpgrades.resonanceLevel * 0.12;

  // 技能冷却设置（统一应用冷却缩短加成：研习等级 + 祝福笔势如虹）
  const applySkillCd = useCallback(
    (key: string, baseCd: number) => {
      skillCdsRef.current[key] =
        baseCd * cdMult * blessingMultsRef.current.cooldown;
    },
    [cdMult]
  );

  // 屏幕震动 / Hit Stop 触发器（供非 React 闭包调用）
  const triggerShakeRef = useRef<(i: number, d?: number) => void>(() => {});
  const triggerHitStopRef = useRef<(d?: number) => void>(() => {});

  // Screen Shake & Hitstop Refs
  const screenShakeRef = useRef({ x: 0, y: 0, intensity: 0, duration: 0 });
  const hitStopTimerRef = useRef(0);

  // Joystick Input Vector (for Classic mode)
  const joystickVector = useRef({ x: 0, y: 0 });

  // Unified Gesture Recognizer Ref
  const gestureRecognizer = useRef(new GestureRecognizer());

  // Keyboard keys pressed tracking (Preserved for PC experience)
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  // Target navigation destination for Tap-to-move
  const heroTargetMove = useRef<{ x: number; y: number } | null>(null);

  // Core Simulation Entities Refs
  const heroRef = useRef<HeroInstance>({
    x: 240,
    y: 450,
    altitudeZ: 0,
    vz: 0,
    hp: HERO_INITIAL_STATS.maxHp + (progress.heroUpgrades.hpLevel * 60),
    maxHp: HERO_INITIAL_STATS.maxHp + (progress.heroUpgrades.hpLevel * 60),
    energy: 60,
    maxEnergy: 100,
    attack: HERO_INITIAL_STATS.attack + (progress.heroUpgrades.attackLevel * 10),
    speed: HERO_INITIAL_STATS.speed,
    facing: 1,
    state: 'IDLE',
    stateTime: 0,
    isInvulnerable: false,
    shieldHp: 0,
    shieldTimer: 0,
    reviveTimer: 0,
    comboIndex: 0,
    comboResetTimer: 0,
    isGrounded: true,
    capeSegments: [],
    flinchTimer: 0,
  });

  const unitsRef = useRef<UnitInstance[]>([]);
  const lotusTrapsRef = useRef<InkLotusTrap[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const sealStampsRef = useRef<SealStamp[]>([]);
  const wellsRef = useRef([
    { x: 550, y: 440, inkRemaining: 9999 },
    { x: 1100, y: 460, inkRemaining: 9999 },
    { x: 1750, y: 430, inkRemaining: 9999 },
  ]);

  const gameTimeRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const spawnedWavesRef = useRef<Set<number>>(new Set());
  const nextEnemyWaveTimeRef = useRef(level.enemyWaveInterval);
  const nextWeatherEventTimeRef = useRef(25);
  const isGameOverRef = useRef(false);
  const bossSpawnedRef = useRef(false);

  // Trigger Screen Shake
  const triggerShake = (intensity: number, duration: number = 0.2) => {
    screenShakeRef.current = {
      x: (Math.random() - 0.5) * intensity,
      y: (Math.random() - 0.5) * intensity,
      intensity,
      duration,
    };
  };
  triggerShakeRef.current = triggerShake;

  // Trigger Hit Stop
  const triggerHitStop = (duration: number = 0.04) => {
    hitStopTimerRef.current = duration;
  };
  triggerHitStopRef.current = triggerHitStop;

  // ===== 暂停切换（祝福三选一凝滞期间不可打断） =====
  const togglePause = useCallback(() => {
    if (isGameOverRef.current || blessingOfferRef.current) return;
    isPausedRef.current = !isPausedRef.current;
    setPaused(isPausedRef.current);
  }, []);

  const setArmyCommand = useCallback((cmd: ArmyCommand) => {
    armyCommandRef.current = cmd;
    setArmyCommandState(cmd);
  }, []);

  // Add Calligraphy Stamp on Critical Hits
  const triggerSealStamp = (x: number, y: number, text: string = '绝') => {
    sound.playStampSeal();
    sealStampsRef.current.push({
      id: `seal_${Math.random()}`,
      x,
      y,
      text,
      color: '#ef4444',
      alpha: 1,
      scale: 1.25,
      life: 0.8,
      maxLife: 0.8,
    });
  };

  // Dismiss stage banner
  useEffect(() => {
    const timer = safeTimeout(() => {
      setStageBanner(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [safeTimeout]);

  // Keyboard Event Listeners (PC experience fully preserved)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.key.toLowerCase();
      keysPressed.current[code] = true;

      // ESC / P 暂停切换
      if (code === 'escape' || code === 'p') {
        e.preventDefault();
        togglePause();
        return;
      }

      // 暂停时忽略操作键
      if (isPausedRef.current) return;

      // Reset auto-pathing if keyboard input is received
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(code)) {
        heroTargetMove.current = null;
      }

      if (code === 'j') {
        triggerHeroAttack();
      } else if (code === ' ' || e.code === 'Space') {
        e.preventDefault();
        triggerHeroJump();
      } else if (code === 'q' || code === 'k') {
        triggerSkillDashSlash();
      } else if (code === 'l') {
        triggerSkillBambooShield();
      } else if (code === 'e' || code === 'u') {
        triggerSkillStarlightBarrage();
      } else if (code === 't' || code === 'o') {
        triggerSkillInkLotus();
      } else if (code === 'r' || code === 'i') {
        triggerSkillUltimate();
      } else if (code === '1') {
        setArmyCommand('DEFEND');
      } else if (code === '2') {
        setArmyCommand('HOLD');
      } else if (code === '3') {
        setArmyCommand('FOLLOW_HERO');
      } else if (code === '4') {
        setArmyCommand('ATTACK');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Setup Canvas and Renderer（含 devicePixelRatio 高分屏适配）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const logicalW = parent.clientWidth;
      const logicalH = parent.clientHeight;
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);
      viewWRef.current = logicalW;
      viewHRef.current = logicalH;
      LANE_MIN_Y.current = logicalH - 180;
      LANE_MAX_Y.current = logicalH - 60;
      heroRef.current.y = (LANE_MIN_Y.current + LANE_MAX_Y.current) * 0.5;

      if (rendererRef.current) {
        rendererRef.current.resize(logicalW, logicalH, dpr);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    rendererRef.current = new CanvasRenderer(
      ctx,
      viewWRef.current,
      viewHRef.current,
      bgInkMountains
    );

    // Initial units
    spawnUnit('SCRIBE', false, 140, LANE_MIN_Y.current + 30);
    spawnUnit('SWORD', false, 180, LANE_MIN_Y.current + 60);

    // 卸载清理：超时登记 + BGM 停止
    return () => {
      window.removeEventListener('resize', handleResize);
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current.clear();
      sound.stopBGM();
    };
  }, []);

  // Helper to spawn unit with 2.5D lane depth
  const spawnUnit = useCallback(
    (
      type: UnitType,
      isEnemy: boolean,
      spawnX: number,
      customY?: number,
      isBoss: boolean = false,
      statScale: number = 1
    ) => {
      const config = UNIT_CONFIGS[type];
      const upgradeBonus = !isEnemy && progress.unitUpgrades[type] ? progress.unitUpgrades[type]! * 0.15 : 0;
      const laneY =
        customY ||
        LANE_MIN_Y.current + Math.random() * (LANE_MAX_Y.current - LANE_MIN_Y.current);

      const bossBase = isBoss && levelRef.current.boss ? levelRef.current.boss : null;
      // 祝福加成：仅友军享受剑气纵横（攻击）/墨甲如山（生命）乘数
      const blMult = blessingMultsRef.current;
      const newUnit: UnitInstance = {
        id: `unit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type,
        isEnemy,
        x: spawnX,
        y: laneY,
        altitudeZ: 0,
        vz: 0,
        hp: bossBase
          ? Math.round(bossBase.hp * statScale)
          : Math.round(config.maxHp * (1 + upgradeBonus) * statScale * (!isEnemy ? blMult.hp : 1)),
        maxHp: bossBase
          ? Math.round(bossBase.hp * statScale)
          : Math.round(config.maxHp * (1 + upgradeBonus) * statScale * (!isEnemy ? blMult.hp : 1)),
        attack: bossBase
          ? Math.round(bossBase.attack * statScale)
          : Math.round(config.attack * (1 + upgradeBonus) * statScale * (!isEnemy ? blMult.attack : 1)),
        attackRange: config.attackRange,
        attackCooldown: 0,
        speed: bossBase ? bossBase.speed : config.speed,
        facing: isEnemy ? -1 : 1,
        state: 'WALK',
        stateTime: 0,
        carriedInk: 0,
        limbPhase: Math.random() * Math.PI,
        capeWave: [0, 0, 0],
        flinchTimer: 0,
        isBoss,
        enraged: false,
      };

      unitsRef.current.push(newUnit);
      if (!isEnemy) {
        sound.playPluck(523.25, 0.4);
      }
    },
    [progress]
  );

  // Trigger Recruit Unit
  const recruitUnit = (type: UnitType) => {
    const config = UNIT_CONFIGS[type];
    if (inkRef.current < config.cost) return;
    const currentAllies = unitsRef.current.filter((u) => !u.isEnemy).length;
    if (currentAllies >= maxArmy) return;

    inkRef.current -= config.cost;
    setInk(inkRef.current);
    spawnUnit(type, false, 130 + Math.random() * 40);
  };

  // 触觉反馈（移动端震动，桌面端无害跳过）
  const triggerHaptic = (pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {}
  };

  // 墨龙卷：连墨达「翰墨通神」（45）时自动召唤，横扫战场（内置冷却防频繁）
  const spawnInkDragon = () => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD') return;
    const dir = hero.facing;
    inkDragonsRef.current.push({
      id: `dragon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: hero.x + dir * 60,
      y: hero.y,
      vx: dir * 520,
      life: 2.4,
      maxLife: 2.4,
      hitIds: new Set(),
    });
    sound.playUltimate();
    triggerShake(10, 0.4);
    triggerSealStamp(hero.x + dir * 130, hero.y - 60, '龍');
    setStageBanner('墨龙卷 · 笔走龙蛇，横扫千军！');
    safeTimeout(() => setStageBanner(null), 2600);
    triggerHaptic(40);
  };

  // Add Hit to Calligraphy Combo Counter
  const registerHit = (isCritical = false) => {
    const prev = comboRef.current;
    const nextCount = prev.count + 1;
    let nextTier = prev.tier;
    let ratingText = prev.ratingText;
    let mult = 1.0;

    if (nextCount >= 45) {
      nextTier = 'TRANSCEND';
      ratingText = '翰墨通神';
      mult = 2.0;
    } else if (nextCount >= 30) {
      nextTier = 'DIVINE';
      ratingText = '出神入化';
      mult = 1.6;
    } else if (nextCount >= 20) {
      nextTier = 'DRAGON';
      ratingText = '笔走龙蛇';
      mult = 1.4;
    } else if (nextCount >= 12) {
      nextTier = 'FLOW';
      ratingText = '行云流水';
      mult = 1.25;
    } else if (nextCount >= 7) {
      nextTier = 'PROGRESS';
      ratingText = '渐入佳境';
      mult = 1.15;
    } else if (nextCount >= 3) {
      nextTier = 'ENTRY';
      ratingText = '初窥门径';
      mult = 1.05;
    }

    // 祝福「连墨永驻」：判定窗口延长
    const comboMaxTimer = 2.8 * blessingMultsRef.current.comboTimer;

    const next: CalligraphyCombo = {
      count: nextCount,
      tier: nextTier,
      timer: comboMaxTimer,
      maxTimer: comboMaxTimer,
      ratingText,
      inkBonusMultiplier: mult,
    };
    comboRef.current = next;

    // 统计最高连击
    if (nextCount > statsRef.current.maxCombo) {
      statsRef.current.maxCombo = nextCount;
    }

    // 命中即时反馈（低频事件，直接同步 UI）
    setCombo(next);

    // 墨龙卷：每次达到 45 连且间隔足够即触发
    if (
      nextCount >= 45 &&
      nextCount - dragonComboMarkRef.current >= 40 &&
      dragonCdRef.current <= 0
    ) {
      dragonComboMarkRef.current = nextCount;
      dragonCdRef.current = 8;
      spawnInkDragon();
    }

    if (nextTier !== prev.tier) {
      sound.playComboEscalation(
        ['ENTRY', 'PROGRESS', 'FLOW', 'DRAGON', 'DIVINE', 'TRANSCEND'].indexOf(nextTier)
      );
    }
  };

  // Combat Damage Calculation with Hitstop, Screen Shake & Ink Splatters
  const applyDamage = (
    target: UnitInstance | 'HERO' | 'PLAYER_BASE' | 'ENEMY_BASE',
    dmg: number,
    isCritical = false,
    sourceX?: number,
    sourceY?: number
  ) => {
    sound.playInkHit(isCritical || dmg > 80, isCritical);

    if (isCritical || dmg > 80) {
      triggerShake(6, 0.22);
      triggerHitStop(0.05);
    } else {
      triggerShake(2.5, 0.12);
    }

    if (target === 'HERO') {
      const hero = heroRef.current;
      if (hero.isInvulnerable || hero.state === 'DEAD') return;

      let finalDmg = dmg;
      if (hero.shieldHp > 0) {
        if (hero.shieldHp >= finalDmg) {
          hero.shieldHp -= finalDmg;
          finalDmg = 0;
        } else {
          finalDmg -= hero.shieldHp;
          hero.shieldHp = 0;
        }
      }

      hero.hp = Math.max(0, hero.hp - finalDmg);
      hero.flinchTimer = 0.2;

      // 墨滞时刻：首次跌破三成气血，天地凝墨缓技喘息（每场一次）
      if (
        !inkSlowUsedRef.current &&
        hero.hp > 0 &&
        hero.hp <= hero.maxHp * 0.3
      ) {
        inkSlowUsedRef.current = true;
        inkSlowTimerRef.current = INK_SLOW_DURATION;
        setStageBanner('墨滞时刻 · 天地凝墨，剑仙独醒！');
        safeTimeout(() => setStageBanner(null), 2600);
        sound.playComboEscalation(4);
        triggerHaptic([60, 40, 60]);
      }

      damageNumbersRef.current.push({
        id: `dmg_${Math.random()}`,
        x: hero.x,
        y: hero.y - hero.altitudeZ - 75,
        text: `-${Math.round(dmg)}`,
        color: '#f87171',
        alpha: 1,
        scale: isCritical ? 1.4 : 1,
        life: 0.8,
      });

      if (hero.hp <= 0) {
        hero.state = 'DEAD';
        hero.reviveTimer = HERO_INITIAL_STATS.reviveDuration;
        setHeroReviving(true);
        setHeroReviveTimer(HERO_INITIAL_STATS.reviveDuration);
        sound.playDefeat();
      }
      return;
    }

    if (target === 'PLAYER_BASE') {
      if (isGameOverRef.current) return;
      playerBaseHpRef.current = Math.max(0, playerBaseHpRef.current - dmg);
      setPlayerBaseHp(playerBaseHpRef.current);
      damageNumbersRef.current.push({
        id: `dmg_${Math.random()}`,
        x: 100,
        y: LANE_MIN_Y.current - 120,
        text: `-${Math.round(dmg)}`,
        color: '#ef4444',
        alpha: 1,
        scale: 1.2,
        life: 0.9,
      });
      if (playerBaseHpRef.current <= 0) {
        isGameOverRef.current = true;
        sound.playDefeat();
        // 无尽模式：坚守失败结算；普通模式：败北
        onDefeat({
          stars: 0,
          jadeEarned: 0,
          kills: statsRef.current.kills,
          maxCombo: statsRef.current.maxCombo,
          durationSec: Math.round(gameTimeRef.current),
          baseHpPct: 0,
          endlessWave: levelRef.current.endless ? endlessWaveRef.current - 1 : undefined,
        });
      }
      return;
    }

    if (target === 'ENEMY_BASE') {
      // 无尽试炼：敌阵不可摧毁，坚守到底
      if (levelRef.current.endless || isGameOverRef.current) return;
      enemyBaseHpRef.current = Math.max(0, enemyBaseHpRef.current - dmg);
      setEnemyBaseHp(enemyBaseHpRef.current);
      damageNumbersRef.current.push({
        id: `dmg_${Math.random()}`,
        x: WORLD_WIDTH - 100,
        y: LANE_MIN_Y.current - 130,
        text: `-${Math.round(dmg)}`,
        color: '#38bdf8',
        alpha: 1,
        scale: 1.2,
        life: 0.9,
      });
      if (enemyBaseHpRef.current <= 0) {
        isGameOverRef.current = true;
        sound.playVictory();
        // 真实星级评价：守护墨阁越完好，星级越高
        const baseHpPct =
          playerBaseHpRef.current / Math.max(1, playerBaseMaxHpRef.current);
        const stars = baseHpPct >= 0.7 ? 3 : baseHpPct >= 0.35 ? 2 : 1;
        onVictory({
          stars,
          jadeEarned: Math.round(levelRef.current.rewardJade * (0.6 + 0.2 * stars)),
          kills: statsRef.current.kills,
          maxCombo: statsRef.current.maxCombo,
          durationSec: Math.round(gameTimeRef.current),
          baseHpPct,
        });
      }
      return;
    }

    const unit = target;
    unit.hp -= dmg;
    unit.flinchTimer = 0.2;
    registerHit(isCritical);

    if (isCritical) {
      triggerSealStamp(unit.x, unit.y - 45, '斩');
    }

    damageNumbersRef.current.push({
      id: `dmg_${Math.random()}`,
      x: unit.x,
      y: unit.y - unit.altitudeZ - 55,
      text: isCritical ? `暴击 -${Math.round(dmg)}` : `-${Math.round(dmg)}`,
      color: unit.isEnemy ? (isCritical ? '#facc15' : '#ffffff') : '#ef4444',
      alpha: 1,
      scale: isCritical ? 1.4 : 1.0,
      life: 0.75,
    });

    for (let i = 0; i < (isCritical ? 8 : 4); i++) {
      particlesRef.current.push({
        id: `p_${Math.random()}`,
        x: unit.x,
        y: unit.y,
        altitudeZ: unit.altitudeZ + 25,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 60,
        vz: Math.random() * 90 + 40,
        color: unit.isEnemy ? '#09090b' : '#38bdf8',
        size: Math.random() * 3.5 + 2,
        alpha: 1,
        life: 0.6,
        maxLife: 0.6,
        type: 'INK',
      });
    }

    if (unit.hp <= 0 && unit.isEnemy) {
      statsRef.current.kills += 1;
      heroEnergyRef.current = Math.min(100, heroEnergyRef.current + 10);
      inkRef.current += Math.round(14 * comboRef.current.inkBonusMultiplier);

      // 文房四宝掉落：8% 概率，优先掉未收集的种类
      if (Math.random() < 0.08) {
        const missing = TREASURE_KINDS.filter((k) => !collectedTreasuresRef.current[k]);
        const pickKind =
          missing.length > 0
            ? missing[Math.floor(Math.random() * missing.length)]
            : TREASURE_KINDS[Math.floor(Math.random() * TREASURE_KINDS.length)];
        treasuresRef.current.push({
          id: `tre_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          kind: pickKind,
          x: unit.x,
          y: unit.y,
          altitudeZ: 30,
          vz: 170,
          life: 12,
          maxLife: 12,
        });
      }
    }
  };

  // ===== 墨灵祝福：三选一 / 应用效果 =====
  const offerBlessings = () => {
    const pool = [...BLESSINGS];
    const picks: BlessingDef[] = [];
    while (picks.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    if (picks.length === 0) return;
    isPausedRef.current = true; // 战场凝滞，静心抉择
    blessingOfferRef.current = picks;
    setBlessingOffer(picks);
    sound.playPluck(880, 0.9);
    triggerHaptic(25);
  };

  const handlePickBlessing = (b: BlessingDef) => {
    applyBlessing(b);
    blessingOfferRef.current = null;
    setBlessingOffer(null);
    isPausedRef.current = false;
    sound.playPluck(659.25, 0.5);
  };

  const applyBlessing = (b: BlessingDef) => {
    activeBlessingsRef.current[b.id] = (activeBlessingsRef.current[b.id] || 0) + 1;
    const M = blessingMultsRef.current;
    const hero = heroRef.current;

    switch (b.id) {
      case 'sword_aura': {
        // 全军攻击 +15%（含新招募单位，通过 spawnUnit 乘数生效）
        M.attack *= 1.15;
        unitsRef.current.forEach((u) => {
          if (!u.isEnemy) u.attack = Math.round(u.attack * 1.15);
        });
        hero.attack = Math.round(hero.attack * 1.15);
        break;
      }
      case 'wind_steps':
        M.speed *= 1.18;
        break;
      case 'ink_armor': {
        M.hp *= 1.2;
        unitsRef.current.forEach((u) => {
          if (!u.isEnemy) {
            u.maxHp = Math.round(u.maxHp * 1.2);
            u.hp = Math.min(u.maxHp, Math.round(u.hp + u.maxHp * 0.3));
          }
        });
        break;
      }
      case 'gold_ink':
        M.inkGain *= 1.35;
        break;
      case 'combo_steady':
        M.comboTimer *= 1.45;
        break;
      case 'citadel_bless': {
        playerBaseHpRef.current = Math.min(
          playerBaseMaxHpRef.current,
          Math.round(playerBaseHpRef.current + playerBaseMaxHpRef.current * 0.25)
        );
        setPlayerBaseHp(playerBaseHpRef.current);
        citadelRegenRef.current += playerBaseMaxHpRef.current * 0.008; // 每秒缓慢自愈
        break;
      }
      case 'swift_skill':
        M.cooldown = Math.max(0.4, M.cooldown * 0.78);
        break;
      case 'star_siphon':
        M.energyGain *= 1.55;
        break;
    }

    setOwnedBlessings({ ...activeBlessingsRef.current });
    triggerSealStamp(hero.x, hero.y - 66, '祝');
    sound.playVictory();
    triggerShake(6, 0.3);
    setStageBanner(`墨灵祝福 · ${b.name}（${b.description}）`);
    safeTimeout(() => setStageBanner(null), 3000);
  };

  // Hero Attack Action (3-hit Combo or Aerial Plunge)
  const triggerHeroAttack = (targetWorldX?: number, targetWorldY?: number) => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD') return;
    if (hero.state.startsWith('SKILL_') && hero.stateTime < 0.25) return;

    if (targetWorldX !== undefined) {
      hero.facing = targetWorldX >= hero.x ? 1 : -1;
    }

    if (!hero.isGrounded) {
      hero.state = 'ATTACK_AERIAL';
      hero.vz = -480;
      sound.playSlash(true);
      return;
    }

    sound.playSlash(hero.comboIndex === 2);

    hero.comboIndex = (hero.comboIndex + 1) % 3;
    hero.state = (`ATTACK_${hero.comboIndex + 1}` as any);
    hero.stateTime = 0;
    hero.comboResetTimer = 1.0;

    const reachX = 90;
    const reachDepth = 48;
    const isHeavy = hero.comboIndex === 2;
    // 暴击系统：残月生辉大幅提升暴击率（1.6倍伤害 + 朱印刻章）
    const critChance = weatherRef.current?.type === 'LUNAR_GLOW' ? 0.35 : 0.18;
    const isCrit = Math.random() < critChance;
    const attackDmg = hero.attack * (isHeavy ? 1.85 : 1.0) * (isCrit ? 1.6 : 1);

    unitsRef.current.forEach((u) => {
      if (u.isEnemy && u.hp > 0) {
        const dx = (u.x - hero.x) * hero.facing;
        const dy = Math.abs(u.y - hero.y);
        if (dx >= -10 && dx <= reachX && dy <= reachDepth) {
          applyDamage(u, attackDmg, isCrit || isHeavy, hero.x, hero.y);
          if (isHeavy) {
            u.x += hero.facing * 40;
          }
        }
      }
    });

    const baseDist = (WORLD_WIDTH - 100 - hero.x) * hero.facing;
    if (baseDist >= 0 && baseDist <= reachX && Math.abs(hero.y - (LANE_MIN_Y.current + LANE_MAX_Y.current) * 0.5) <= 60) {
      applyDamage('ENEMY_BASE', attackDmg);
    }
  };

  // Hero Jump (Space or Up swipe)
  const triggerHeroJump = () => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD' || !hero.isGrounded) return;

    hero.isGrounded = false;
    hero.vz = 340;
    hero.state = 'JUMP';
    hero.stateTime = 0;
    sound.playPluck(659.25, 0.4);
  };

  // Skill 1: Dash Slash (Q or Horizontal Swipe 「横」)
  const triggerSkillDashSlash = (forceDirection?: 'LEFT' | 'RIGHT') => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD' || skillCdsRef.current.dash_slash > 0 || isPausedRef.current) return;

    if (forceDirection) {
      hero.facing = forceDirection === 'RIGHT' ? 1 : -1;
    }

    sound.playDash();
    sound.playSlash(true);
    triggerSealStamp(hero.x + 80 * hero.facing, hero.y - 30, '断');

    hero.state = 'SKILL_DASH';
    hero.stateTime = 0;
    hero.isInvulnerable = true;

    const dashDist = 220 * hero.facing;
    const startX = hero.x;
    const endX = Math.max(100, Math.min(WORLD_WIDTH - 120, hero.x + dashDist));
    hero.x = endX;

    applySkillCd('dash_slash', 4.0);

    const minX = Math.min(startX, endX) - 25;
    const maxX = Math.max(startX, endX) + 25;

    unitsRef.current.forEach((u) => {
      if (u.isEnemy && u.hp > 0 && u.x >= minX && u.x <= maxX && Math.abs(u.y - hero.y) <= 50) {
        applyDamage(u, hero.attack * 2.8, true, hero.x, hero.y);
      }
    });

    // 剑势呼应：前方友军移速提升（以短暂加速体现）
    unitsRef.current.forEach((u) => {
      if (!u.isEnemy && (hero.facing === 1 ? u.x > hero.x : u.x < hero.x) && Math.abs(u.y - hero.y) <= 60) {
        u.x += hero.facing * 24;
      }
    });

    safeTimeout(() => {
      hero.isInvulnerable = false;
    }, 350);
  };

  // Skill 2: Bamboo Shield (W / L or Circle Gesture 「圆」)
  const triggerSkillBambooShield = () => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD' || skillCdsRef.current.bamboo_shield > 0 || isPausedRef.current) return;

    sound.playShield();
    triggerSealStamp(hero.x, hero.y - 40, '阵');
    hero.state = 'SKILL_SHIELD';
    hero.stateTime = 0;
    // 风雅领域共鸣增幅：护盾厚度随共鸣等级提升
    hero.shieldHp = Math.round(280 * resonanceMult);
    hero.shieldTimer = 7.0;

    applySkillCd('bamboo_shield', 8.0);

    unitsRef.current.forEach((u) => {
      if (!u.isEnemy && Math.hypot(u.x - hero.x, u.y - hero.y) <= 240) {
        u.shieldHp = Math.round(200 * resonanceMult);
        damageNumbersRef.current.push({
          id: `shield_${Math.random()}`,
          x: u.x,
          y: u.y - 65,
          text: '竹影护体',
          color: '#38bdf8',
          alpha: 1,
          scale: 1.1,
          life: 0.9,
        });
      }
    });
  };

  // Skill 3: Starlight Barrage (E / U or Zigzag Gesture 「折」)
  const triggerSkillStarlightBarrage = () => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD' || skillCdsRef.current.starlight_barrage > 0 || isPausedRef.current) return;

    sound.playArrow();
    hero.state = 'SKILL_BARRAGE';
    hero.stateTime = 0;

    applySkillCd('starlight_barrage', 7.0);

    for (let i = 0; i < 8; i++) {
      safeTimeout(() => {
        if (!heroRef.current) return;
        const spreadAngle = (i - 3.5) * 0.08;
        const speed = 480;
        projectilesRef.current.push({
          id: `quill_${Date.now()}_${i}`,
          x: heroRef.current.x + 20 * heroRef.current.facing,
          y: heroRef.current.y,
          altitudeZ: heroRef.current.altitudeZ + 25 + (i - 3.5) * 4,
          targetX: heroRef.current.x + 600 * heroRef.current.facing,
          targetY: heroRef.current.y,
          vx: Math.cos(spreadAngle) * speed * heroRef.current.facing,
          vy: Math.sin(spreadAngle) * (speed * 0.2),
          vz: 0,
          damage: hero.attack * 0.95,
          isEnemy: false,
          type: 'QUILL',
          pierce: true,
          duration: 0,
          maxDuration: 1.6,
        });
      }, i * 35);
    }
  };

  // Skill 4: Ink Lotus Trap (T)
  const triggerSkillInkLotus = (customX?: number, customY?: number) => {
    const hero = heroRef.current;
    if (hero.state === 'DEAD' || skillCdsRef.current.lotus_trap > 0 || isPausedRef.current) return;

    sound.playLotusBloom();
    const spawnX = customX !== undefined ? customX : hero.x;
    const spawnY = customY !== undefined ? customY : hero.y;

    triggerSealStamp(spawnX, spawnY - 20, '妙');
    applySkillCd('lotus_trap', 10.0);

    lotusTrapsRef.current.push({
      id: `lotus_${Date.now()}`,
      x: spawnX,
      y: spawnY,
      radius: 80,
      isEnemy: false,
      duration: 12.0,
      maxDuration: 12.0,
      isBloomed: false,
    });
  };

  // Ultimate Skill: River Immortal (R / Space)
  const triggerSkillUltimate = () => {
    const hero = heroRef.current;
    if (
      hero.state === 'DEAD' ||
      heroEnergyRef.current < 100 ||
      skillCdsRef.current.ultimate_landscape > 0 ||
      isPausedRef.current
    )
      return;

    sound.playUltimate();
    triggerShake(14, 0.6);
    triggerSealStamp(hero.x, hero.y - 50, '绝');

    hero.state = 'SKILL_ULTIMATE';
    hero.stateTime = 0;
    heroEnergyRef.current = 0;
    setHeroEnergy(0);
    applySkillCd('ultimate_landscape', 28.0);

    setStageBanner('临江仙 · 水墨山河天地开');
    safeTimeout(() => setStageBanner(null), 3000);

    unitsRef.current.forEach((u) => {
      if (u.isEnemy && u.hp > 0) {
        applyDamage(u, hero.attack * 4.8, true, hero.x, hero.y);
        u.x += 50;
      }
    });

    applyDamage('ENEMY_BASE', hero.attack * 3.5);

    unitsRef.current.forEach((u) => {
      if (!u.isEnemy) {
        u.hp = Math.min(u.maxHp, u.hp + Math.round(140 * resonanceMult));
        damageNumbersRef.current.push({
          id: `buff_${Math.random()}`,
          x: u.x,
          y: u.y - 70,
          text: '诗韵凌霄！',
          color: '#facc15',
          alpha: 1,
          scale: 1.25,
          life: 1.2,
        });
      }
    });

    for (let i = 0; i < 45; i++) {
      particlesRef.current.push({
        id: `p_ult_${i}`,
        x: hero.x + (Math.random() - 0.5) * 500,
        y: hero.y + (Math.random() - 0.5) * 80,
        altitudeZ: Math.random() * 150,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.5) * 80,
        vz: Math.random() * 180,
        color: i % 2 === 0 ? '#38bdf8' : '#facc15',
        size: Math.random() * 5 + 3,
        alpha: 1,
        life: 1.6,
        maxLife: 1.6,
        type: 'STAR',
      });
    }
  };

  // --- UNIFIED CALLIGRAPHY GESTURE & TOUCH HANDLERS (Screen-as-Canvas) ---
  // 指针路由策略：
  //  · DUAL 模式 + 触屏 + 左 45% 区域 → 浮动摇杆（可移动，多点触控安全）
  //  · 其余指针 → 挥毫手势（点按/横竖提/画圆/折线/拖动）
  //  · 右半屏 + 技能按钮（DOM 层，不穿透到画布）
  const handlePointerDown = (e: React.PointerEvent) => {
    // Canvas client bounds
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // DUAL 双区模式：左半屏触点生成浮动摇杆（一次只允许一个摇杆实例）
    if (
      controlModeRef.current === 'DUAL' &&
      e.pointerType === 'touch' &&
      clientX < rect.width * 0.45 &&
      !floatJoyRef.current.active
    ) {
      const next = {
        active: true,
        pointerId: e.pointerId,
        baseX: clientX,
        baseY: clientY,
        knobX: 0,
        knobY: 0,
      };
      floatJoyRef.current = next;
      setFloatJoy(next);
      heroTargetMove.current = null; // 切入手动操控，停止自动寻路
      return;
    }

    gestureRecognizer.current.startStroke(clientX, clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // 浮动摇杆跟踪：以按下点为圆心，摇杆帽钳制在底盘半径内
    const joy = floatJoyRef.current;
    if (joy.active && e.pointerId === joy.pointerId) {
      let dx = clientX - joy.baseX;
      let dy = clientY - joy.baseY;
      const dist = Math.hypot(dx, dy);
      if (dist > FLOAT_JOY_RADIUS) {
        dx = (dx / dist) * FLOAT_JOY_RADIUS;
        dy = (dy / dist) * FLOAT_JOY_RADIUS;
      }
      const next = { ...joy, knobX: dx, knobY: dy };
      floatJoyRef.current = next;
      setFloatJoy(next);
      joystickVector.current = {
        x: dx / FLOAT_JOY_RADIUS,
        y: dy / FLOAT_JOY_RADIUS,
      };
      return;
    }

    if (!gestureRecognizer.current.getIsTracing()) return;

    gestureRecognizer.current.addPoint(clientX, clientY);

    // If dragging slowly in gesture mode, continuously lead the hero!
    const pts = gestureRecognizer.current.getPoints();
    if (pts.length > 5) {
      const worldX = clientX + cameraX.current;
      const clampedY = Math.max(LANE_MIN_Y.current, Math.min(LANE_MAX_Y.current, clientY));
      heroTargetMove.current = { x: worldX, y: clampedY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // 浮动摇杆释放：归零输入并隐藏
    const joy = floatJoyRef.current;
    if (joy.active && e.pointerId === joy.pointerId) {
      const cleared = {
        active: false,
        pointerId: -1,
        baseX: 0,
        baseY: 0,
        knobX: 0,
        knobY: 0,
      };
      floatJoyRef.current = cleared;
      setFloatJoy(cleared);
      joystickVector.current = { x: 0, y: 0 };
      return;
    }

    const gesture = gestureRecognizer.current.endStroke();
    if (!gesture) return;
    // 识别成功触觉反馈（轻震）
    if (gesture.type !== 'DRAG') triggerHaptic(12);

    const worldStartX = gesture.startX + cameraX.current;
    const worldEndX = gesture.endX + cameraX.current;
    const worldY = Math.max(LANE_MIN_Y.current, Math.min(LANE_MAX_Y.current, gesture.endY));

    // Execute actions based on recognized gesture
    switch (gesture.type) {
      case 'TAP': {
        // Check if tap hit near enemy -> Attack!
        let hitEnemy = false;
        unitsRef.current.forEach((u) => {
          if (u.isEnemy && Math.hypot(u.x - worldEndX, u.y - worldY) <= 75) {
            hitEnemy = true;
          }
        });

        if (hitEnemy) {
          triggerHeroAttack(worldEndX, worldY);
          setGestureBadge({ text: '「点」', sub: '落墨点煞' });
        } else {
          // Tap ground -> Glide move to position
          heroTargetMove.current = { x: worldEndX, y: worldY };
          setGestureBadge({ text: '「行」', sub: '步移景从' });
          sound.playPluck(523.25, 0.3);
        }
        break;
      }

      case 'SWIPE_HORIZONTAL': {
        // 「横」- 断水斩 (Dash Slash)
        triggerSkillDashSlash(gesture.direction as any);
        setGestureBadge({ text: '「横」', sub: gesture.poeticCalligraphy });
        break;
      }

      case 'SWIPE_DOWN': {
        // 「竖」- 笔落惊风 (Aerial Plunge / Slam)
        if (heroRef.current.isGrounded) {
          heroRef.current.altitudeZ = 20;
          heroRef.current.vz = 260;
          heroRef.current.isGrounded = false;
          safeTimeout(() => {
            triggerHeroAttack();
          }, 120);
        } else {
          triggerHeroAttack();
        }
        setGestureBadge({ text: '「竖」', sub: '笔落惊风' });
        break;
      }

      case 'SWIPE_UP': {
        // 「提」- 轻功揽月 (Jump Leap)
        triggerHeroJump();
        setGestureBadge({ text: '「提」', sub: '轻功揽月' });
        break;
      }

      case 'CIRCLE': {
        // 「圆」- 竹影墨盾 or 墨荷灵阵
        if (skillCds.bamboo_shield <= 0) {
          triggerSkillBambooShield();
          setGestureBadge({ text: '「圆」', sub: '竹影护体' });
        } else {
          triggerSkillInkLotus(worldStartX, worldY);
          setGestureBadge({ text: '「周」', sub: '墨荷灵阵' });
        }
        break;
      }

      case 'ZIGZAG': {
        // 「折 / 撇捺」- 星河引毫 (Starlight Quill Barrage)
        triggerSkillStarlightBarrage();
        setGestureBadge({ text: '「折」', sub: '星河引毫' });
        break;
      }

      case 'DRAG': {
        heroTargetMove.current = { x: worldEndX, y: worldY };
        break;
      }
    }

    // Clear gesture badge after 1.8s
    safeTimeout(() => {
      setGestureBadge((prev) => (prev?.text === gesture.name ? null : prev));
    }, 1800);
  };

  // Main 60FPS Game Loop（依赖清空：内部全部读 ref，不再因状态变化销毁重建）
  // updateSimulation 通过 ref 晚绑定（定义于本 effect 之后）
  const updateSimulationRef = useRef<(dt: number) => void>(() => {});
  useEffect(() => {
    let animId: number;

    const gameLoop = (timestamp: number) => {
      const dt = Math.min(0.1, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      if (hitStopTimerRef.current > 0) {
        hitStopTimerRef.current -= dt;
      } else if (!isPausedRef.current) {
        // 墨滞时刻：世界减速至 0.45x（剑仙在 updateSimulation 内速度补偿），计时走真实秒
        if (inkSlowTimerRef.current > 0) {
          inkSlowTimerRef.current -= dt;
          gameTimeRef.current += dt * 0.45;
          updateSimulationRef.current(dt * 0.45);
        } else {
          gameTimeRef.current += dt;
          if (!isGameOverRef.current) {
            updateSimulationRef.current(dt);
          }
        }
      }

      if (screenShakeRef.current.duration > 0) {
        screenShakeRef.current.duration -= dt;
        screenShakeRef.current.x = (Math.random() - 0.5) * screenShakeRef.current.intensity;
        screenShakeRef.current.y = (Math.random() - 0.5) * screenShakeRef.current.intensity;
        screenShakeRef.current.intensity *= 0.88;
      } else {
        screenShakeRef.current = { x: 0, y: 0, intensity: 0, duration: 0 };
      }

      // Render 2.5D Scene（暂停时仍渲染，但画面静止）
      if (rendererRef.current && canvasRef.current) {
        rendererRef.current.render(
          cameraX.current,
          levelRef.current,
          WORLD_WIDTH,
          LANE_MIN_Y.current,
          LANE_MAX_Y.current,
          playerBaseHpRef.current,
          playerBaseMaxHpRef.current,
          levelRef.current.endless ? enemyBaseMaxHpRef.current : enemyBaseHpRef.current,
          enemyBaseMaxHpRef.current,
          heroRef.current,
          unitsRef.current,
          lotusTrapsRef.current,
          projectilesRef.current,
          particlesRef.current,
          damageNumbersRef.current,
          sealStampsRef.current,
          wellsRef.current,
          gameTimeRef.current,
          screenShakeRef.current.x,
          screenShakeRef.current.y,
          inkDragonsRef.current,
          treasuresRef.current,
          inkSlowTimerRef.current > 0 ? inkSlowTimerRef.current / INK_SLOW_DURATION : 0
        );

        // Render Real-time Calligraphy Brush Trail on screen
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          gestureRecognizer.current.drawBrushTrail(ctx);
        }
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Update Simulation Physics in 2.5D（纯 ref 运算，不直接触发 setState）
  const updateSimulation = (dt: number) => {
    const hero = heroRef.current;
    const units = unitsRef.current;
    const now = gameTimeRef.current;
    const lv = levelRef.current;

    const weatherMult = weatherRef.current?.type === 'INK_RAIN' ? 3.0 : 1.0;
    inkRef.current +=
      (2.5 + progress.citadelUpgrades.gatherSpeedLevel * 0.6) *
      comboRef.current.inkBonusMultiplier *
      weatherMult *
      blessingMultsRef.current.inkGain *
      dt;
    heroEnergyRef.current = Math.min(
      100,
      heroEnergyRef.current + 2.8 * blessingMultsRef.current.energyGain * dt
    );

    // 墨龙卷冷却
    if (dragonCdRef.current > 0) dragonCdRef.current -= dt;

    // 文光护阁：墨阁持续缓慢自愈
    if (citadelRegenRef.current > 0 && playerBaseHpRef.current > 0) {
      playerBaseHpRef.current = Math.min(
        playerBaseMaxHpRef.current,
        playerBaseHpRef.current + citadelRegenRef.current * dt
      );
    }

    // 墨灵祝福：普通关卡按节奏提供三选一（无尽在波次逻辑中触发）
    if (
      !lv.endless &&
      !blessingOfferRef.current &&
      !isGameOverRef.current &&
      now >= nextBlessingTimeRef.current
    ) {
      nextBlessingTimeRef.current = now + 55;
      offerBlessings();
    }

    // Skill Cooldowns（ref 直减，HUD 节流同步）
    const cds = skillCdsRef.current;
    for (const k in cds) {
      if (cds[k] > 0) {
        cds[k] = Math.max(0, cds[k] - dt);
      }
    }

    // Combo Decay（ref 衰减，命中时即时同步）
    const cb = comboRef.current;
    if (cb.timer > 0) {
      cb.timer -= dt;
      if (cb.timer <= 0) {
        cb.count = 0;
        cb.tier = 'NONE';
        cb.timer = 0;
        cb.ratingText = '';
        cb.inkBonusMultiplier = 1.0;
      }
    }

    // Weather Events
    if (now >= nextWeatherEventTimeRef.current) {
      nextWeatherEventTimeRef.current = now + 40;
      const weatherTypes: WeatherEvent['type'][] = lv.endless
        ? ['INK_RAIN', 'POETIC_BREEZE', 'LUNAR_GLOW', 'CRIMSON_ECLIPSE']
        : ['INK_RAIN', 'POETIC_BREEZE', 'LUNAR_GLOW'];
      const pick = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];

      weatherRef.current = {
        type: pick,
        name: WEATHER_EFFECTS[pick].name,
        description: WEATHER_EFFECTS[pick].desc,
        duration: 15,
        timeRemaining: 15,
      };
      setActiveWeather(weatherRef.current);
      sound.playPluck(880, 1.2);
    }

    if (weatherRef.current) {
      if (weatherRef.current.timeRemaining > dt) {
        weatherRef.current.timeRemaining -= dt;
      } else {
        weatherRef.current = null;
        setActiveWeather(null);
      }
    }

    // Hero 2.5D Movement & Auto-Pathing
    if (hero.state === 'DEAD') {
      hero.reviveTimer -= dt;
      setHeroReviveTimer(Math.ceil(hero.reviveTimer));
      if (hero.reviveTimer <= 0) {
        hero.state = 'IDLE';
        hero.hp = hero.maxHp;
        hero.x = 220;
        hero.y = (LANE_MIN_Y.current + LANE_MAX_Y.current) * 0.5;
        setHeroReviving(false);
      }
    } else {
      if (hero.flinchTimer > 0) hero.flinchTimer -= dt;
      if (hero.shieldTimer > 0) {
        hero.shieldTimer -= dt;
        if (hero.shieldTimer <= 0) hero.shieldHp = 0;
      }
      if (hero.comboResetTimer > 0) {
        hero.comboResetTimer -= dt;
        if (hero.comboResetTimer <= 0) hero.comboIndex = 0;
      }

      // Jump Physics
      if (!hero.isGrounded) {
        hero.vz -= 850 * dt;
        hero.altitudeZ += hero.vz * dt;

        if (hero.altitudeZ <= 0) {
          hero.altitudeZ = 0;
          hero.vz = 0;
          hero.isGrounded = true;

          if (hero.state === 'ATTACK_AERIAL') {
            sound.playPlunge();
            triggerShake(8, 0.25);
            triggerSealStamp(hero.x, hero.y - 10, '灭');

            unitsRef.current.forEach((u) => {
              if (u.isEnemy && Math.hypot(u.x - hero.x, u.y - hero.y) <= 120) {
                applyDamage(u, hero.attack * 2.2, true, hero.x, hero.y);
                u.altitudeZ = 35;
                u.vz = 220;
              }
            });
            hero.state = 'IDLE';
          } else if (hero.state === 'JUMP') {
            hero.state = 'IDLE';
          }
        }
      }

      // Check input sources (Keyboard + Joystick + Tap-to-move pathing)
      let inputX = 0;
      let inputY = 0;

      if (keysPressed.current['a'] || keysPressed.current['arrowleft']) inputX -= 1;
      if (keysPressed.current['d'] || keysPressed.current['arrowright']) inputX += 1;
      if (keysPressed.current['w'] || keysPressed.current['arrowup']) inputY -= 1;
      if (keysPressed.current['s'] || keysPressed.current['arrowdown']) inputY += 1;

      if (Math.hypot(joystickVector.current.x, joystickVector.current.y) > 0.1) {
        inputX += joystickVector.current.x;
        inputY += joystickVector.current.y;
      }

      // Handle Tap/Drag Gesture Target Move
      if (heroTargetMove.current && inputX === 0 && inputY === 0) {
        const dx = heroTargetMove.current.x - hero.x;
        const dy = heroTargetMove.current.y - hero.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 15) {
          inputX = dx / dist;
          inputY = dy / dist;
        } else {
          heroTargetMove.current = null;
        }
      }

      const inputMag = Math.hypot(inputX, inputY);
      if (inputMag > 1) {
        inputX /= inputMag;
        inputY /= inputMag;
      }

      const speedBonus = weatherRef.current?.type === 'POETIC_BREEZE' ? 1.35 : 1.0;
      // 墨滞时刻：世界减速，剑仙几乎全速行动（主角时间）
      const inkSlowBoost = inkSlowTimerRef.current > 0 ? 2.1 : 1.0;
      const effectiveHeroSpeed = hero.speed * speedBonus * inkSlowBoost * blessingMultsRef.current.speed;

      if (!hero.state.startsWith('ATTACK_') && hero.state !== 'SKILL_DASH') {
        if (inputMag > 0.15) {
          hero.x = Math.max(120, Math.min(WORLD_WIDTH - 120, hero.x + inputX * effectiveHeroSpeed * dt));
          hero.y = Math.max(
            LANE_MIN_Y.current,
            Math.min(LANE_MAX_Y.current, hero.y + inputY * (effectiveHeroSpeed * 0.7) * dt)
          );

          if (inputX !== 0) {
            hero.facing = inputX > 0 ? 1 : -1;
          }

          if (hero.isGrounded) {
            hero.state = 'WALK';
          }
          hero.stateTime += dt;
        } else {
          if (hero.isGrounded && hero.state === 'WALK') {
            hero.state = 'IDLE';
          }
          hero.stateTime += dt;
        }
      } else {
        hero.stateTime += dt;
        if (hero.stateTime > 0.35 && !hero.state.startsWith('SKILL_') && hero.isGrounded) {
          hero.state = 'IDLE';
        }
      }
    }

    // Camera follow hero（逻辑视宽，兼容高分屏）
    const viewW = viewWRef.current;
    const targetCamX = hero.x - viewW * 0.4;
    const clampedCamX = Math.max(0, Math.min(WORLD_WIDTH - viewW, targetCamX));
    cameraX.current += (clampedCamX - cameraX.current) * 0.12;

    // Wave Progression（剧本波次：普通关卡）
    if (!lv.endless) {
      lv.enemySpawns.forEach((spawn, idx) => {
        if (now >= spawn.time && !spawnedWavesRef.current.has(idx)) {
          spawnedWavesRef.current.add(idx);
          for (let i = 0; i < spawn.count; i++) {
            safeTimeout(() => {
              spawnUnit(spawn.unitType, true, WORLD_WIDTH - 140 - Math.random() * 60);
            }, i * 380);
          }
        }
      });

      if (now >= nextEnemyWaveTimeRef.current) {
        nextEnemyWaveTimeRef.current = now + lv.enemyWaveInterval;
        spawnUnit('SWORD', true, WORLD_WIDTH - 140);
        if (lv.id >= 2) spawnUnit('ARCHER', true, WORLD_WIDTH - 160);
        if (lv.id >= 3) spawnUnit('GUARDIAN', true, WORLD_WIDTH - 150);
      }

      if (lv.boss && !bossSpawnedRef.current) {
        const baseDamaged = enemyBaseHpRef.current < enemyBaseMaxHpRef.current * 0.85;
        const timeThreshold = now >= (lv.id === 5 ? 25 : 45);

        if (baseDamaged || timeThreshold) {
          bossSpawnedRef.current = true;
          setBossAnnounced(true);
          safeTimeout(() => setBossAnnounced(false), 4500);

          sound.playUltimate();
          triggerSealStamp(WORLD_WIDTH - 200, (LANE_MIN_Y.current + LANE_MAX_Y.current) * 0.5, '尊');
          spawnUnit(lv.id === 5 ? 'GUARDIAN' : 'SWORD', true, WORLD_WIDTH - 200, undefined, true);
        }
      }
    } else {
      // ===== 无尽试炼：波次无限递进，难度逐波攀升 =====
      if (now >= nextEnemyWaveTimeRef.current) {
        const waveNo = endlessWaveRef.current;
        nextEnemyWaveTimeRef.current = now + Math.max(5.5, lv.enemyWaveInterval - waveNo * 0.15);
        const diff = 1 + waveNo * 0.07;
        const count = Math.min(7, 2 + Math.floor(waveNo / 3));

        // 每 2 波墨灵赐福（波次越高，战斗越艰，祝福是活下去的关键）
        if (waveNo >= 2 && waveNo % 2 === 0 && !blessingOfferRef.current && !isGameOverRef.current) {
          offerBlessings();
        }

        // 兵种池随波次扩展
        const pool: UnitType[] = ['SWORD'];
        if (waveNo >= 3) pool.push('ARCHER');
        if (waveNo >= 5) pool.push('GUARDIAN');
        if (waveNo >= 7) pool.push('HARPIST');

        for (let i = 0; i < count; i++) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          safeTimeout(
            () => spawnUnit(pick, true, WORLD_WIDTH - 140 - Math.random() * 60, undefined, false, diff),
            i * 380
          );
        }

        // 每 5 波玄墨霸主压阵
        if (waveNo % 5 === 0 && lv.boss) {
          safeTimeout(() => {
            spawnUnit('GUARDIAN', true, WORLD_WIDTH - 200, undefined, true, diff);
            setBossAnnounced(true);
            safeTimeout(() => setBossAnnounced(false), 4500);
            sound.playUltimate();
          }, count * 380);
        }

        endlessWaveRef.current += 1;
      }
    }

    // Update Lotus Traps（减速改为状态计算，不再永久污染单位速度）
    for (let i = lotusTrapsRef.current.length - 1; i >= 0; i--) {
      const trap = lotusTrapsRef.current[i];
      trap.duration -= dt;

      units.forEach((u) => {
        const d = Math.hypot(u.x - trap.x, u.y - trap.y);
        if (d <= trap.radius) {
          if (u.isEnemy) {
            u.hp -= 15 * dt;
          } else {
            if (!trap.isBloomed) {
              trap.isBloomed = true;
              u.hp = Math.min(u.maxHp, u.hp + 90);
              sound.playLotusBloom();
            }
          }
        }
      });

      if (trap.duration <= 0) {
        lotusTrapsRef.current.splice(i, 1);
      }
    }

    // ===== 文房四宝：下落弹跳 / 超时消散 / 剑仙拾取 / 集齐触发「文光焕彩」 =====
    for (let i = treasuresRef.current.length - 1; i >= 0; i--) {
      const tr = treasuresRef.current[i];
      tr.life -= dt;

      // 落地弹跳
      if (tr.altitudeZ > 0 || tr.vz !== 0) {
        tr.vz -= 700 * dt;
        tr.altitudeZ += tr.vz * dt;
        if (tr.altitudeZ <= 0) {
          tr.altitudeZ = 0;
          tr.vz = 0;
        }
      }

      // 拾取判定
      if (hero.state !== 'DEAD' && Math.hypot(hero.x - tr.x, hero.y - tr.y) < 60) {
        collectedTreasuresRef.current[tr.kind] = true;
        treasuresRef.current.splice(i, 1);
        sound.playGather();
        triggerSealStamp(hero.x, hero.y - 58, TREASURE_CHAR[tr.kind]);
        triggerHaptic(18);
        setTreasureCollected({ ...collectedTreasuresRef.current });

        // 集齐四宝 → 文光焕彩：绝意充满 + 全军治愈 + 墨韵大增
        if (TREASURE_KINDS.every((k) => collectedTreasuresRef.current[k])) {
          TREASURE_KINDS.forEach((k) => {
            collectedTreasuresRef.current[k] = false;
          });
          setTreasureCollected({ BRUSH: false, INK: false, PAPER: false, STONE: false });

          heroEnergyRef.current = 100;
          setHeroEnergy(100);
          inkRef.current += 120;
          setInk(inkRef.current);

          unitsRef.current.forEach((u) => {
            if (!u.isEnemy) {
              u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.35));
              damageNumbersRef.current.push({
                id: `wenguang_${Math.random()}`,
                x: u.x,
                y: u.y - 70,
                text: '文光焕彩！',
                color: '#facc15',
                alpha: 1,
                scale: 1.15,
                life: 1.1,
              });
            }
          });

          setStageBanner('文光焕彩 · 四宝归一，绝意盈胸！');
          safeTimeout(() => setStageBanner(null), 2800);
          sound.playUltimate();
          triggerShake(8, 0.35);
          triggerHaptic([30, 30, 30]);

          for (let pi = 0; pi < 32; pi++) {
            particlesRef.current.push({
              id: `wg_${pi}_${Math.random()}`,
              x: hero.x + (Math.random() - 0.5) * 260,
              y: hero.y + (Math.random() - 0.5) * 60,
              altitudeZ: Math.random() * 130,
              vx: (Math.random() - 0.5) * 150,
              vy: (Math.random() - 0.5) * 60,
              vz: Math.random() * 150,
              color: pi % 3 === 0 ? '#facc15' : pi % 3 === 1 ? '#38bdf8' : '#fef08a',
              size: Math.random() * 4 + 2,
              alpha: 1,
              life: 1.2,
              maxLife: 1.2,
              type: 'STAR',
            });
          }
        }
        continue;
      }

      if (tr.life <= 0) {
        treasuresRef.current.splice(i, 1);
      }
    }

    // ===== 墨龙卷：推进 + 尾迹 + 沿途横扫 =====
    for (let i = inkDragonsRef.current.length - 1; i >= 0; i--) {
      const dragon = inkDragonsRef.current[i];
      dragon.x += dragon.vx * dt;
      dragon.life -= dt;

      // 墨色尾迹
      if (Math.random() < 0.6) {
        particlesRef.current.push({
          id: `dk_${Math.random()}`,
          x: dragon.x - Math.sign(dragon.vx) * 20,
          y: dragon.y,
          altitudeZ: 30 + Math.random() * 45,
          vx: -dragon.vx * 0.08,
          vy: (Math.random() - 0.5) * 30,
          vz: 40 + Math.random() * 40,
          color: '#09090b',
          size: Math.random() * 4 + 2,
          alpha: 1,
          life: 0.5,
          maxLife: 0.5,
          type: 'INK',
        });
      }

      // 命中判定：每只敌军仅吃一次伤害 + 击退
      units.forEach((u) => {
        if (
          u.isEnemy &&
          u.hp > 0 &&
          !dragon.hitIds.has(u.id) &&
          Math.abs(u.x - dragon.x) < 72 &&
          Math.abs(u.y - dragon.y) < 55
        ) {
          dragon.hitIds.add(u.id);
          applyDamage(u, hero.attack * 2.2, true, dragon.x, dragon.y);
          u.x += Math.sign(dragon.vx) * 45;
        }
      });

      if (dragon.life <= 0) {
        inkDragonsRef.current.splice(i, 1);
      }
    }

    // Update Units
    for (let i = units.length - 1; i >= 0; i--) {
      const unit = units[i];

      if (unit.hp <= 0) {
        units.splice(i, 1);
        continue;
      }

      if (unit.flinchTimer > 0) unit.flinchTimer -= dt;
      unit.stateTime += dt;
      if (unit.attackCooldown > 0) unit.attackCooldown -= dt;

      if (unit.altitudeZ > 0 || unit.vz !== 0) {
        unit.vz -= 800 * dt;
        unit.altitudeZ += unit.vz * dt;
        if (unit.altitudeZ <= 0) {
          unit.altitudeZ = 0;
          unit.vz = 0;
        }
      }

      const distToHero = Math.hypot(unit.x - hero.x, unit.y - hero.y);
      const isBuffedByHero = !unit.isEnemy && hero.state !== 'DEAD' && distToHero <= 230;
      const inSlowZone =
        unit.isEnemy &&
        lotusTrapsRef.current.some(
          (t) => Math.hypot(unit.x - t.x, unit.y - t.y) <= t.radius
        );
      const speedMult =
        (isBuffedByHero ? 1.25 : 1.0) *
        (weatherRef.current?.type === 'POETIC_BREEZE' && !unit.isEnemy ? 1.35 : 1.0) *
        (weatherRef.current?.type === 'CRIMSON_ECLIPSE' && unit.isEnemy ? 1.15 : 1.0) *
        (inSlowZone ? 0.55 : 1.0);
      const effectiveSpeed = unit.speed * speedMult;

      // Boss 二阶段狂暴：血量跌破五成触发「暗墨狂姿」
      if (unit.isBoss && !unit.enraged && unit.hp < unit.maxHp * 0.5) {
        unit.enraged = true;
        unit.attack = Math.round(unit.attack * 1.25);
        unit.speed = unit.speed * 1.35;
        sound.playUltimate();
        triggerShake(12, 0.5);
        triggerSealStamp(unit.x, unit.y - 60, '狂');
        setStageBanner(`${unit.type === 'GUARDIAN' ? '玄墨狂姿 · 破阵' : '残红狂姿 · 破阵'}：敌首陷入暗墨狂暴！`);
        safeTimeout(() => setStageBanner(null), 3000);
      }

      if (unit.type === 'SCRIBE' && !unit.isEnemy) {
        if ((unit.carriedInk || 0) >= 15) {
          unit.facing = -1;
          unit.x -= effectiveSpeed * dt;
          unit.state = 'RETREAT';
          if (unit.x <= 130) {
            inkRef.current += (unit.carriedInk || 15) * comboRef.current.inkBonusMultiplier;
            unit.carriedInk = 0;
            sound.playGather();
          }
        } else {
          const targetWell = wellsRef.current[0];
          if (Math.abs(unit.x - targetWell.x) > 20) {
            unit.facing = 1;
            unit.x += effectiveSpeed * dt;
            unit.y += (targetWell.y - unit.y) * 0.05;
            unit.state = 'WALK';
          } else {
            unit.state = 'MINE';
            unit.miningTimer = (unit.miningTimer || 0) + dt;
            if (unit.miningTimer >= 2.0) {
              unit.carriedInk = 15;
              unit.miningTimer = 0;
            }
          }
        }
        continue;
      }

      if (!unit.isEnemy) {
        if (armyCommandRef.current === 'DEFEND') {
          if (unit.x > 180) {
            unit.facing = -1;
            unit.x -= effectiveSpeed * dt;
            unit.state = 'RETREAT';
          }
        } else if (armyCommandRef.current === 'FOLLOW_HERO') {
          const targetX = hero.x + (Math.sin(unit.limbPhase) * 60);
          const targetY = hero.y + (Math.cos(unit.limbPhase) * 35);
          if (Math.hypot(unit.x - targetX, unit.y - targetY) > 35) {
            unit.facing = unit.x < targetX ? 1 : -1;
            unit.x += (targetX - unit.x) * 0.08;
            unit.y += (targetY - unit.y) * 0.08;
            unit.state = 'WALK';
          }
        }
      }

      let nearestTarget: UnitInstance | 'BASE' | 'HERO' | null = null;
      let minDistance = 9999;

      if (!unit.isEnemy) {
        units.forEach((other) => {
          if (other.isEnemy && other.hp > 0) {
            const d = Math.hypot(other.x - unit.x, (other.y - unit.y) * 1.5);
            if (other.x > unit.x && d < minDistance) {
              minDistance = d;
              nearestTarget = other;
            }
          }
        });

        const distToBase = WORLD_WIDTH - 100 - unit.x;
        if (distToBase > 0 && distToBase < minDistance) {
          minDistance = distToBase;
          nearestTarget = 'BASE';
        }
      } else {
        if (hero.state !== 'DEAD') {
          const dHero = Math.hypot(unit.x - hero.x, (unit.y - hero.y) * 1.5);
          if (unit.x > hero.x && dHero < minDistance) {
            minDistance = dHero;
            nearestTarget = 'HERO';
          }
        }

        units.forEach((other) => {
          if (!other.isEnemy && other.hp > 0) {
            const d = Math.hypot(unit.x - other.x, (unit.y - other.y) * 1.5);
            if (unit.x > other.x && d < minDistance) {
              minDistance = d;
              nearestTarget = other;
            }
          }
        });

        const distToBase = unit.x - 100;
        if (distToBase > 0 && distToBase < minDistance) {
          minDistance = distToBase;
          nearestTarget = 'BASE';
        }
      }

      if (nearestTarget && minDistance <= unit.attackRange) {
        unit.state = 'ATTACK';
        if (unit.attackCooldown <= 0) {
          unit.attackCooldown = 1 / UNIT_CONFIGS[unit.type].attackSpeed;

          if (unit.type === 'ARCHER') {
            sound.playArrow();
            projectilesRef.current.push({
              id: `arrow_${Date.now()}_${Math.random()}`,
              x: unit.x,
              y: unit.y,
              altitudeZ: 28,
              targetX: unit.x + unit.facing * 350,
              targetY: unit.y,
              vx: unit.facing * 440,
              vy: 0,
              vz: 0,
              damage: unit.attack,
              isEnemy: unit.isEnemy,
              type: 'ARROW',
              duration: 0,
              maxDuration: 1.2,
            });
          } else if (unit.type === 'HARPIST') {
            sound.playPluck(392, 0.6);
            projectilesRef.current.push({
              id: `wave_${Date.now()}_${Math.random()}`,
              x: unit.x,
              y: unit.y,
              altitudeZ: 22,
              targetX: unit.x + unit.facing * 280,
              targetY: unit.y,
              vx: unit.facing * 260,
              vy: 0,
              vz: 0,
              damage: unit.attack,
              isEnemy: unit.isEnemy,
              type: 'SOUNDWAVE',
              duration: 0,
              maxDuration: 1.1,
            });

            units.forEach((ally) => {
              if (ally.isEnemy === unit.isEnemy && Math.hypot(ally.x - unit.x, ally.y - unit.y) <= 220) {
                ally.hp = Math.min(ally.maxHp, ally.hp + 20);
              }
            });
          } else {
            sound.playSlash(false);
            if (nearestTarget === 'BASE') {
              applyDamage(unit.isEnemy ? 'PLAYER_BASE' : 'ENEMY_BASE', unit.attack);
            } else if (nearestTarget === 'HERO') {
              applyDamage('HERO', unit.attack, false, unit.x, unit.y);
            } else {
              applyDamage(nearestTarget, unit.attack, false, unit.x, unit.y);
            }
          }
        }
      } else {
        if (armyCommandRef.current !== 'DEFEND' || unit.isEnemy) {
          unit.state = 'WALK';
          unit.facing = unit.isEnemy ? -1 : 1;
          unit.x += unit.facing * effectiveSpeed * dt;
        }
      }
    }

    // Update Projectiles
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const proj = projectilesRef.current[i];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.duration += dt;

      if (proj.duration >= proj.maxDuration) {
        projectilesRef.current.splice(i, 1);
        continue;
      }

      let hit = false;
      units.forEach((u) => {
        if (u.isEnemy !== proj.isEnemy && u.hp > 0) {
          if (Math.abs(u.x - proj.x) < 26 && Math.abs(u.y - proj.y) < 32) {
            applyDamage(u, proj.damage, false, proj.x, proj.y);
            hit = true;
          }
        }
      });

      if (proj.isEnemy && hero.state !== 'DEAD') {
        if (Math.abs(hero.x - proj.x) < 26 && Math.abs(hero.y - proj.y) < 35) {
          applyDamage('HERO', proj.damage, false, proj.x, proj.y);
          hit = true;
        }
      }

      if (hit && !proj.pierce) {
        projectilesRef.current.splice(i, 1);
      }
    }

    // Update Seals
    for (let i = sealStampsRef.current.length - 1; i >= 0; i--) {
      const stamp = sealStampsRef.current[i];
      stamp.life -= dt;
      stamp.alpha = stamp.life / stamp.maxLife;
      if (stamp.life <= 0) {
        sealStampsRef.current.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.altitudeZ !== undefined) {
        p.altitudeZ += (p.vz || 0) * dt;
      }
      p.life -= dt;
      p.alpha = p.life / p.maxLife;
      if (p.vRot) p.rotation = (p.rotation || 0) + p.vRot * dt;

      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
      }
    }

    // Update Damage Numbers
    for (let i = damageNumbersRef.current.length - 1; i >= 0; i--) {
      const d = damageNumbersRef.current[i];
      d.y -= 26 * dt;
      d.life -= dt;
      d.alpha = Math.max(0, d.life / 0.75);
      if (d.life <= 0) {
        damageNumbersRef.current.splice(i, 1);
      }
    }

    armyCountRef.current = units.filter((u) => !u.isEnemy).length;
  };

  // 将 updateSimulation 晚绑定到游戏循环（避免循环 effect 依赖函数引用）
  updateSimulationRef.current = updateSimulation;

  // ===== HUD 节流同步：每 130ms 批量把 ref 真相同步到 React state（替代每帧 setState） =====
  useEffect(() => {
    const hudTimer = setInterval(() => {
      setInk(inkRef.current);
      setHeroHp(heroRef.current.hp);
      setHeroEnergy(heroEnergyRef.current);
      setSkillCds({ ...skillCdsRef.current });
      setCombo({ ...comboRef.current });
      setArmyCount(armyCountRef.current);
      setPlayerBaseHp(playerBaseHpRef.current);
      setEnemyBaseHp(enemyBaseHpRef.current);
      setEndlessWave(endlessWaveRef.current);
      setInkSlowLeft(inkSlowTimerRef.current > 0 ? inkSlowTimerRef.current : 0);
    }, 130);
    return () => clearInterval(hudTimer);
  }, []);

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="relative w-full h-screen bg-stone-950 select-none overflow-hidden font-sans">
      {/* Top Bar Header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 bg-stone-950/85 backdrop-blur-md border-b border-stone-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-300 hover:text-white bg-stone-900 border border-stone-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>
          <span className="text-sm md:text-base font-bold tracking-wide text-stone-100 font-serif whitespace-nowrap shrink-0">
            {level.endless && (
              <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 align-middle rounded-md bg-purple-950/80 border border-purple-700/60 text-[10px] font-bold text-purple-200">
                <InfinityIcon className="w-3 h-3" />
                第 {endlessWave} 波
              </span>
            )}
            {level.chapter} · {level.title}
          </span>
        </div>

        {/* Army Commands Toolbar */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-900/90 border border-stone-800 rounded-lg overflow-x-auto max-w-sm md:max-w-none">
          <button
            onClick={() => setArmyCommand('DEFEND')}
            className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              armyCommand === 'DEFEND'
                ? 'bg-amber-700 text-amber-50 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">坚守</span>墨阁
          </button>
          <button
            onClick={() => setArmyCommand('HOLD')}
            className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              armyCommand === 'HOLD'
                ? 'bg-stone-700 text-stone-50 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">就地</span>御敌
          </button>
          <button
            onClick={() => setArmyCommand('FOLLOW_HERO')}
            className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              armyCommand === 'FOLLOW_HERO'
                ? 'bg-cyan-700 text-cyan-50 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            随君冲锋
          </button>
          <button
            onClick={() => setArmyCommand('ATTACK')}
            className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
              armyCommand === 'ATTACK'
                ? 'bg-rose-800 text-rose-50 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sword className="w-3.5 h-3.5" />
            全军破阵
          </button>
        </div>

        {/* Resources, Input Mode Switcher & Sound Action */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* 暂停按钮 */}
          <button
            onClick={togglePause}
            className="p-2 text-stone-300 hover:text-white bg-stone-900 border border-stone-800 rounded-lg transition-colors cursor-pointer"
            title="暂停 (ESC / P)"
          >
            <Pause className="w-4 h-4" />
          </button>

          {/* Mode Switcher: 挥毫手势 / 双区操控 / 经典按键 */}
          <div className="flex items-center bg-stone-900 border border-stone-800 rounded-lg p-0.5">
            <button
              onClick={() => setControlMode('GESTURE')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                controlMode === 'GESTURE'
                  ? 'bg-cyan-900/80 text-cyan-200 font-bold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="全屏挥毫手势：以笔驭剑（桌面鼠标友好）"
            >
              <PenTool className="w-3 h-3 text-cyan-400" />
              <span>挥毫</span>
            </button>
            <button
              onClick={() => setControlMode('DUAL')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                controlMode === 'DUAL'
                  ? 'bg-emerald-900/80 text-emerald-200 font-bold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="双区操控：左手浮动摇杆移动 + 右手手势/技能（触屏推荐）"
            >
              <Hand className="w-3 h-3 text-emerald-400" />
              <span>双区</span>
            </button>
            <button
              onClick={() => setControlMode('CLASSIC')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                controlMode === 'CLASSIC'
                  ? 'bg-stone-800 text-stone-100 font-bold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="传统虚拟摇杆+按键模式"
            >
              <Gamepad2 className="w-3 h-3 text-amber-400" />
              <span>经典</span>
            </button>
          </div>

          <button
            onClick={() => setShowGestureGuide((prev) => !prev)}
            className="p-1.5 text-stone-400 hover:text-stone-100 bg-stone-900 border border-stone-800 rounded-lg transition-colors cursor-pointer"
            title="手势指南"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-300" />
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-lg">
            <span className="text-[11px] text-stone-400">墨韵</span>
            <span className="text-xs md:text-sm font-bold text-cyan-400 font-mono tabular-nums">
              {Math.floor(ink)}
            </span>
          </div>

          <button
            onClick={toggleSound}
            className="p-1.5 text-stone-400 hover:text-stone-100 bg-stone-900 border border-stone-800 rounded-lg transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Full-Screen Unified Calligraphy Gesture Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full block touch-none cursor-crosshair"
      />

      {/* 浮动摇杆（双区模式：触点处浮现，松手即隐） */}
      {controlMode === 'DUAL' && floatJoy.active && (
        <FloatingJoystick
          baseX={floatJoy.baseX}
          baseY={floatJoy.baseY}
          knobX={floatJoy.knobX}
          knobY={floatJoy.knobY}
          size={FLOAT_JOY_RADIUS * 2}
        />
      )}

      {/* 文房四宝收集进度 + 已获墨灵祝福 */}
      <div className="absolute left-4 md:left-6 top-28 z-30 pointer-events-none flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-950/80 border border-amber-800/50 rounded-xl backdrop-blur-sm shadow-xl">
          <Gem className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          {TREASURE_KINDS.map((k) => (
            <span
              key={k}
              className={`w-6 h-6 flex items-center justify-center rounded-md text-xs font-serif font-bold border transition-all ${
                treasureCollected[k]
                  ? 'bg-amber-400/90 border-amber-300 text-stone-950 shadow-[0_0_8px_rgba(250,204,21,0.7)] scale-110'
                  : 'bg-stone-900 border-stone-700 text-stone-600'
              }`}
            >
              {TREASURE_CHAR[k]}
            </span>
          ))}
        </div>
        {Object.keys(ownedBlessings).length > 0 && (
          <div className="flex flex-wrap items-center gap-1 max-w-[230px]">
            {BLESSINGS.filter((b) => ownedBlessings[b.id]).map((b) => (
              <span
                key={b.id}
                className="px-1.5 py-0.5 text-[10px] font-serif rounded-md bg-emerald-950/80 border border-emerald-700/50 text-emerald-200 backdrop-blur-sm"
              >
                {b.name} ×{ownedBlessings[b.id]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 墨滞时刻倒计时指示 */}
      {inkSlowLeft > 0 && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-fade-in">
          <div className="px-4 py-1.5 bg-purple-950/85 border border-purple-500/60 rounded-xl backdrop-blur-md shadow-2xl text-center">
            <p className="text-xs font-serif font-bold text-purple-200 tracking-widest">
              墨滞时刻 · 天地凝墨
            </p>
            <div className="mt-1 w-32 h-1 bg-stone-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-400 transition-all duration-100"
                style={{ width: `${Math.max(0, (inkSlowLeft / INK_SLOW_DURATION) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating Gesture Recognition Badge */}
      {gestureBadge && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
          <div className="px-5 py-2 bg-stone-950/90 border border-cyan-500/70 rounded-2xl backdrop-blur-md shadow-2xl flex items-center gap-2">
            <span className="text-lg font-bold font-serif text-cyan-300">{gestureBadge.text}</span>
            <span className="text-xs font-serif text-stone-200">{gestureBadge.sub}</span>
          </div>
        </div>
      )}

      {/* Gesture Quick Guide Overlay Modal */}
      {showGestureGuide && (
        <div className="absolute top-16 right-4 md:right-6 z-40 max-w-xs p-4 bg-stone-900/95 border border-stone-700 rounded-2xl shadow-2xl backdrop-blur-md text-xs text-stone-300 space-y-2 animate-fade-in font-sans max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between font-serif font-bold text-amber-200 border-b border-stone-800 pb-1.5">
            <span>操控心诀 · 三式任选</span>
            <button
              onClick={() => setShowGestureGuide(false)}
              className="text-stone-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] font-bold text-emerald-300">
            【双区操控 · 触屏推荐】左半屏任意处按住浮现摇杆移动；右半屏点按/手势施法；右下技能按钮随时可点，双手齐用！
          </p>
          <p><strong className="text-cyan-300">轻点地面：</strong>剑仙踏墨巡行至该位置</p>
          <p><strong className="text-cyan-300">轻点敌军：</strong>施展落墨三式剑招</p>
          <p><strong className="text-cyan-300">「横」划：</strong>化身墨影疾驰【断水斩】</p>
          <p><strong className="text-cyan-300">「竖」划：</strong>凌空暴扣【笔落惊风俯冲斩】</p>
          <p><strong className="text-cyan-300">「提」划（向上）：</strong>轻功腾跃跳起</p>
          <p><strong className="text-cyan-300">「画圆」⭕：</strong>释放【竹影墨盾 / 墨荷灵阵】</p>
          <p><strong className="text-cyan-300">「折」划（Z型）：</strong>万毫齐发【星河笔阵】</p>
          <div className="pt-1 border-t border-stone-800 text-[10px] text-stone-400 space-y-1">
            <p>* 电脑端键盘（WASD/J/Q/W/E/R/Space）全程原生支持！</p>
            <p className="text-amber-300/80">
              ★ 连墨 45 触发「墨龙卷」· 集齐文房四宝触发「文光焕彩」· 残血自动入「墨滞时刻」
            </p>
          </div>
        </div>
      )}

      {/* Active Calligraphy Combo Rating HUD */}
      {combo.count >= 3 && (
        <div className="absolute top-14 right-6 z-30 pointer-events-none flex flex-col items-end animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-1 bg-stone-950/80 border border-amber-600/60 rounded-xl backdrop-blur-sm shadow-xl">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-sm font-bold font-mono text-amber-300">
              {combo.count} 连墨
            </span>
            <span className="text-xs font-serif font-bold text-amber-100">
              【{combo.ratingText}】
            </span>
          </div>
          <div className="w-24 h-1 bg-stone-800 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-75"
              style={{ width: `${(combo.timer / combo.maxTimer) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Dynamic Weather Event Indicator */}
      {activeWeather && (
        <div className="absolute top-14 left-6 z-30 pointer-events-none flex items-center gap-2 px-3 py-1.5 bg-stone-950/80 border border-cyan-800/60 rounded-xl backdrop-blur-sm shadow-xl">
          {activeWeather.type === 'INK_RAIN' && <CloudRain className="w-4 h-4 text-cyan-400" />}
          {activeWeather.type === 'POETIC_BREEZE' && <Wind className="w-4 h-4 text-emerald-400" />}
          {activeWeather.type === 'LUNAR_GLOW' && <Moon className="w-4 h-4 text-amber-300" />}
          <div>
            <p className="text-xs font-serif font-bold text-stone-100">
              异象 · {activeWeather.name}
            </p>
            <p className="text-[10px] text-stone-400 font-serif">
              {activeWeather.description} ({Math.ceil(activeWeather.timeRemaining)}s)
            </p>
          </div>
        </div>
      )}

      {/* Poetic Verse Announcement Banner */}
      {stageBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center animate-fade-in max-w-sm md:max-w-md w-full px-4">
          <div className="px-6 py-3.5 bg-stone-950/90 border border-stone-800 rounded-2xl backdrop-blur-md shadow-2xl">
            <p className="text-base md:text-lg font-serif font-semibold tracking-widest text-amber-100">
              {stageBanner}
            </p>
            <p className="mt-1 text-[11px] text-stone-400 font-serif tracking-wider">
              {level.poeticAuthor}
            </p>
          </div>
        </div>
      )}

      {/* Boss Announcement Banner */}
      {bossAnnounced && level.boss && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
          <div className="px-6 py-2.5 bg-rose-950/90 border border-rose-800 rounded-xl backdrop-blur-md shadow-2xl">
            <p className="text-xs text-rose-300 font-mono tracking-widest">警告 · 敌阵宿敌降临</p>
            <p className="text-base md:text-lg font-serif font-bold text-rose-100 tracking-wider">
              {level.boss.name} · {level.boss.title}
            </p>
          </div>
        </div>
      )}

      {/* Hero Reviving Overlay */}
      {heroReviving && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-5 py-2 bg-stone-900/90 border border-rose-900/50 rounded-xl backdrop-blur-sm text-center">
            <p className="text-xs text-rose-400 font-medium">剑仙重伤调息中</p>
            <p className="text-sm font-bold text-stone-100 font-mono tabular-nums">
              {heroReviveTimer} 秒后墨阁重塑真身
            </p>
          </div>
        </div>
      )}

      {/* Compact Troop Recruitment Dock (Always Accessible on Top or Bottom) */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 bg-stone-950/80 backdrop-blur-md border border-stone-800 rounded-xl shadow-2xl">
        <button
          onClick={() => recruitUnit('SCRIBE')}
          disabled={ink < UNIT_CONFIGS.SCRIBE.cost || armyCount >= maxArmy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
            ink >= UNIT_CONFIGS.SCRIBE.cost && armyCount < maxArmy
              ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer active:scale-95'
              : 'bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed'
          }`}
          title="采墨侍 (50 墨)"
        >
          <Feather className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-serif">采墨</span>
          <span className="text-[10px] text-cyan-300 font-mono">50</span>
        </button>

        <button
          onClick={() => recruitUnit('SWORD')}
          disabled={ink < UNIT_CONFIGS.SWORD.cost || armyCount >= maxArmy}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
            ink >= UNIT_CONFIGS.SWORD.cost && armyCount < maxArmy
              ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer active:scale-95'
              : 'bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed'
          }`}
          title="折柳剑客 (100 墨)"
        >
          <Sword className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-serif">折柳</span>
          <span className="text-[10px] text-cyan-300 font-mono">100</span>
        </button>

        {level.id >= 2 && (
          <button
            onClick={() => recruitUnit('ARCHER')}
            disabled={ink < UNIT_CONFIGS.ARCHER.cost || armyCount >= maxArmy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
              ink >= UNIT_CONFIGS.ARCHER.cost && armyCount < maxArmy
                ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer active:scale-95'
                : 'bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed'
            }`}
            title="抚竹射手 (180 墨)"
          >
            <Crosshair className="w-3.5 h-3.5 text-lime-400" />
            <span className="text-[11px] font-serif">抚竹</span>
            <span className="text-[10px] text-cyan-300 font-mono">180</span>
          </button>
        )}

        {level.id >= 3 && (
          <button
            onClick={() => recruitUnit('GUARDIAN')}
            disabled={ink < UNIT_CONFIGS.GUARDIAN.cost || armyCount >= maxArmy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
              ink >= UNIT_CONFIGS.GUARDIAN.cost && armyCount < maxArmy
                ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer active:scale-95'
                : 'bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed'
            }`}
            title="墨岩卫 (280 墨)"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-serif">墨岩</span>
            <span className="text-[10px] text-cyan-300 font-mono">280</span>
          </button>
        )}

        {level.id >= 4 && (
          <button
            onClick={() => recruitUnit('HARPIST')}
            disabled={ink < UNIT_CONFIGS.HARPIST.cost || armyCount >= maxArmy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all ${
              ink >= UNIT_CONFIGS.HARPIST.cost && armyCount < maxArmy
                ? 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200 cursor-pointer active:scale-95'
                : 'bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed'
            }`}
            title="鸣筝琴师 (380 墨)"
          >
            <Music className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-serif">鸣筝</span>
            <span className="text-[10px] text-cyan-300 font-mono">380</span>
          </button>
        )}
      </div>

      {/* Floating Bottom HUD: Hero Health & Luminous Ultimate Seal */}
      <div className="absolute bottom-4 left-6 right-6 z-20 flex items-end justify-between pointer-events-none pb-[env(safe-area-inset-bottom)]">
        {/* Left: Hero Stats & Gesture Mode prompt */}
        <div className="flex flex-col items-start gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-3 px-3.5 py-2 bg-stone-950/85 backdrop-blur-md border border-stone-800 rounded-xl shadow-xl">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-serif text-stone-300">云砚气血</span>
              <div className="w-24 md:w-32 h-2.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (heroHp / heroMaxHp) * 100))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                {Math.ceil(heroHp)}/{heroMaxHp}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-serif text-amber-200">绝意</span>
              <div className="w-18 md:w-26 h-2.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, (heroEnergy / 100) * 100))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-amber-300 tabular-nums">
                {Math.floor(heroEnergy)}/100
              </span>
            </div>
          </div>

          {controlMode === 'GESTURE' ? (
            <div className="text-[11px] font-serif text-stone-400 bg-stone-950/70 border border-stone-800 px-3 py-1 rounded-lg">
              ✨ 挥毫手势模式：点击点地漫步 · 横划破水 · 竖划震天 · 画圆起盾
            </div>
          ) : controlMode === 'DUAL' ? (
            <div className="text-[11px] font-serif text-emerald-300/90 bg-stone-950/70 border border-emerald-800/50 px-3 py-1 rounded-lg">
              🖐 双区操控：左半屏按住浮现摇杆移动 · 右半屏点按/手势施法 · 技能常驻右下
            </div>
          ) : (
            /* Classic Joystick on Bottom Left when in Classic Mode */
            <div className="mt-2">
              <Joystick
                size={110}
                onMove={(dx, dy) => {
                  joystickVector.current = { x: dx, y: dy };
                }}
                onEnd={() => {
                  joystickVector.current = { x: 0, y: 0 };
                }}
              />
            </div>
          )}
        </div>

        {/* Right: Ultimate Seal & Action Cluster (双区/经典模式都显示实体技能键，挥毫模式仅保留绝技印) */}
        <div className="pointer-events-auto flex items-center gap-2">
          {controlMode !== 'GESTURE' && (
            <div className="flex items-center gap-1.5 p-2 bg-stone-950/90 backdrop-blur-md border border-stone-800 rounded-2xl shadow-2xl">
              <button
                onClick={triggerHeroJump}
                className="w-11 h-12 flex flex-col items-center justify-center bg-stone-900 border border-stone-700 rounded-xl text-stone-200 active:scale-95"
              >
                <ArrowUp className="w-4 h-4 text-cyan-300 mb-0.5" />
                <span className="text-[9px] font-serif">腾跃</span>
              </button>
              <button
                onClick={() => triggerSkillDashSlash()}
                className="w-11 h-12 flex flex-col items-center justify-center bg-stone-900 border border-stone-700 rounded-xl text-cyan-200 active:scale-95"
              >
                <Zap className="w-4 h-4 text-cyan-400 mb-0.5" />
                <span className="text-[9px] font-serif">断水</span>
              </button>
              <button
                onClick={triggerSkillBambooShield}
                className="w-11 h-12 flex flex-col items-center justify-center bg-stone-900 border border-stone-700 rounded-xl text-emerald-200 active:scale-95"
              >
                <Shield className="w-4 h-4 text-emerald-400 mb-0.5" />
                <span className="text-[9px] font-serif">竹影</span>
              </button>
              <button
                onClick={triggerSkillStarlightBarrage}
                className="w-11 h-12 flex flex-col items-center justify-center bg-stone-900 border border-stone-700 rounded-xl text-amber-200 active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-400 mb-0.5" />
                <span className="text-[9px] font-serif">笔阵</span>
              </button>
              <button
                onClick={() => triggerHeroAttack()}
                className="w-13 h-13 flex flex-col items-center justify-center bg-stone-800 border-2 border-stone-600 rounded-2xl text-white active:scale-95 cursor-pointer"
              >
                <Sword className="w-5 h-5 text-stone-100 mb-0.5" />
                <span className="text-[10px] font-serif font-bold">落墨</span>
              </button>
            </div>
          )}

          {/* Luminous Ultimate Seal Button: River Immortal (临江仙) */}
          <button
            onClick={triggerSkillUltimate}
            disabled={heroEnergy < 100 || skillCds.ultimate_landscape > 0}
            className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-2xl border-2 shadow-2xl transition-all cursor-pointer ${
              heroEnergy >= 100 && skillCds.ultimate_landscape === 0
                ? 'bg-gradient-to-br from-amber-600 via-rose-700 to-amber-700 border-amber-300 text-white animate-pulse active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.6)]'
                : 'bg-stone-900/80 border-stone-800 text-stone-600 cursor-not-allowed'
            }`}
            title="【绝技】临江仙·水墨山河 (R): 全屏墨爆+全军狂暴！"
          >
            <Scroll className="w-6 h-6 text-amber-200 mb-0.5" />
            <span className="text-[10px] font-serif font-black tracking-wider">临江仙</span>
            {skillCds.ultimate_landscape > 0 && (
              <div className="absolute inset-0 bg-stone-950/80 rounded-2xl flex items-center justify-center text-xs font-mono font-bold text-amber-400">
                {skillCds.ultimate_landscape.toFixed(0)}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ===== 首战教学引导（仅第一折且未完成时展示） ===== */}
      {showTutorial && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[calc(100%-2rem)] animate-fade-in">
          <div className="relative p-4 scroll-mount-thin text-ink">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-serif font-bold text-ink-strong flex items-center gap-1.5">
                <PenTool className="w-4 h-4 text-cinnabar" />
                初入战场 · 三步上手法
              </span>
              <button
                onClick={() => {
                  setShowTutorial(false);
                  onTutorialDone();
                }}
                className="p-1 text-ink-light hover:text-ink-strong cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-ink-mid font-serif space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                <strong className="text-daiqing">招募采墨侍</strong>
                （顶栏「采墨 50」）→ 他们会自动汲取墨韵运回墨阁
              </li>
              <li>
                <strong className="text-shilv">触屏推荐双区模式</strong>
                ：左半屏按住浮现摇杆移动，右手点敌攻击或划手势施法；电脑端 WASD + J 攻击
              </li>
              <li>
                <strong className="text-cinnabar">横划屏幕</strong>
                施放断水斩，
                <strong className="text-cinnabar">画圆</strong>
                起竹影盾，攒满绝意释放「临江仙」大招！
              </li>
            </ol>
            <p className="mt-2 pt-2 border-t rule-ink text-[10px] text-ink-light">
              提示：ESC / P 可随时暂停 · 连墨45召墨龙 · 集齐文房四宝获「文光焕彩」· 残血自动触发墨滞时刻
            </p>
          </div>
        </div>
      )}

      {/* ===== 墨灵祝福三选一（战场凝滞中抉择） ===== */}
      {blessingOffer && (
        <BlessingModal
          offerings={blessingOffer}
          ownedCounts={ownedBlessings}
          onPick={handlePickBlessing}
        />
      )}

      {/* ===== 暂停遮罩 ===== */}
      {paused && (
        <PauseOverlay
          isMuted={isMuted}
          onToggleMute={toggleSound}
          onResume={togglePause}
          onRestart={onRestart}
          onExit={onExit}
        />
      )}
    </div>
  );
};
