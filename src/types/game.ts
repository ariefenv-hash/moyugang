export type GameMode = 'MENU' | 'LEVEL_SELECT' | 'BATTLE' | 'UPGRADES' | 'LORE';

export type ArmyCommand = 'DEFEND' | 'HOLD' | 'ATTACK' | 'FOLLOW_HERO';

export type UnitType = 'SCRIBE' | 'SWORD' | 'ARCHER' | 'GUARDIAN' | 'HARPIST';

export interface UnitConfig {
  type: UnitType;
  name: string;
  title: string;
  cost: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackSpeed: number; // attacks per second
  speed: number;
  description: string;
  icon: string;
}

export interface HeroSkill {
  id: string;
  name: string;
  shortcut: string;
  description: string;
  cooldown: number; // in seconds
  currentCooldown: number;
  costEnergy?: number;
  icon: string;
  resonanceText: string;
}

export interface UnitInstance {
  id: string;
  type: UnitType;
  isEnemy: boolean;
  x: number;
  y: number; // 2.5D depth lane position
  altitudeZ: number; // Jump height above ground
  vz: number;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackCooldown: number;
  speed: number;
  facing: 1 | -1; // 1 = right (player), -1 = left (enemy)
  state: 'WALK' | 'ATTACK' | 'MINE' | 'RETREAT' | 'HURT' | 'DEAD';
  stateTime: number;
  miningTimer?: number;
  carriedInk?: number;
  targetId?: string;
  shieldHp?: number;
  // Multi-joint bone physics tracking
  limbPhase: number;
  capeWave: number[];
  flinchTimer: number;
  /** Boss 专属：是否已进入二阶段狂暴 */
  enraged?: boolean;
  /** Boss 专属：无休狂战姿态（渲染暗红氛围） */
  isBoss?: boolean;
}

export interface HeroInstance {
  x: number;
  y: number; // 2.5D depth lane position
  altitudeZ: number; // Jump elevation
  vz: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  speed: number;
  facing: 1 | -1;
  state:
    | 'IDLE'
    | 'WALK'
    | 'JUMP'
    | 'ATTACK_1'
    | 'ATTACK_2'
    | 'ATTACK_3'
    | 'ATTACK_AERIAL'
    | 'SKILL_DASH'
    | 'SKILL_SHIELD'
    | 'SKILL_BARRAGE'
    | 'SKILL_LOTUS'
    | 'SKILL_ULTIMATE'
    | 'HURT'
    | 'DEAD';
  stateTime: number;
  isInvulnerable: boolean;
  shieldHp: number;
  shieldTimer: number;
  reviveTimer: number;
  comboIndex: number;
  comboResetTimer: number;
  isGrounded: boolean;
  // Skeletal animation states
  capeSegments: { x: number; y: number }[];
  flinchTimer: number;
}

export interface InkLotusTrap {
  id: string;
  x: number;
  y: number;
  radius: number;
  isEnemy: boolean;
  duration: number;
  maxDuration: number;
  isBloomed: boolean;
}

export type ComboTier =
  | 'NONE'
  | 'ENTRY' // 3+ 初窥门径
  | 'PROGRESS' // 7+ 渐入佳境
  | 'FLOW' // 12+ 行云流水
  | 'DRAGON' // 20+ 笔走龙蛇
  | 'DIVINE' // 30+ 出神入化
  | 'TRANSCEND'; // 45+ 翰墨通神

export interface CalligraphyCombo {
  count: number;
  tier: ComboTier;
  timer: number;
  maxTimer: number;
  ratingText: string;
  inkBonusMultiplier: number;
}

export interface WeatherEvent {
  type: 'INK_RAIN' | 'POETIC_BREEZE' | 'LUNAR_GLOW' | 'CRIMSON_ECLIPSE';
  name: string;
  description: string;
  duration: number;
  timeRemaining: number;
}

export interface SealStamp {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  scale: number;
  life: number;
  maxLife: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  altitudeZ: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  isEnemy: boolean;
  type: 'ARROW' | 'QUILL' | 'SOUNDWAVE' | 'DARK_ORB' | 'INK_BLADE';
  pierce?: boolean;
  duration: number;
  maxDuration: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  altitudeZ: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'INK' | 'PETAL' | 'SNOW' | 'BAMBOO' | 'STAR' | 'SLASH' | 'WATER_RIPPLE' | 'SMOKE';
  rotation?: number;
  vRot?: number;
}

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  scale: number;
  life: number;
  isSeal?: boolean;
}

export interface LevelConfig {
  id: number;
  chapter: string;
  title: string;
  subtitle: string;
  poeticVerse: string;
  poeticAuthor: string;
  description: string;
  enemyBaseHp: number;
  playerBaseHp: number;
  ambientType: 'SNOW' | 'BAMBOO' | 'MOON' | 'PETAL' | 'DAWN';
  initialInk: number;
  enemySpawns: {
    time: number;
    unitType: UnitType;
    count: number;
  }[];
  enemyWaveInterval: number;
  boss?: {
    name: string;
    title: string;
    hp: number;
    attack: number;
    speed: number;
  };
  rewardJade: number;
  unlockedUnit?: UnitType;
  /** 无尽试炼模式：波次无限，敌軍逐波变强，坚守越久奖励越丰 */
  endless?: boolean;
}

/** 结算战斗统计：胜负、星级、击杀、最高连击、用时、基地留存、无尽波次 */
export interface BattleResultStats {
  stars: number;
  jadeEarned: number;
  kills: number;
  maxCombo: number;
  durationSec: number;
  baseHpPct: number;
  endlessWave?: number;
}

export interface PlayerProgress {
  unlockedLevel: number;
  completedLevels: number[];
  jadeSparks: number; // Currency for upgrades
  heroUpgrades: {
    attackLevel: number;
    hpLevel: number;
    cooldownLevel: number;
    resonanceLevel: number;
  };
  unitUpgrades: {
    [key in UnitType]?: number;
  };
  citadelUpgrades: {
    baseHpLevel: number;
    gatherSpeedLevel: number;
  };
  /** 各关卡最高星级（1-3），key 为关卡 id */
  levelStars: Record<number, number>;
  /** 无尽试炼最高坚守波次 */
  endlessBest: number;
  /** 已解锁成就 id 列表 */
  achievements: string[];
  /** 是否已看过首战教学 */
  tutorialDone: boolean;
  /** 累计击杀数（成就统计用） */
  totalKills: number;
}

/** 成就定义 */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: 'TROPHY' | 'STAR' | 'FLAME' | 'SWORD' | 'SHIELD' | 'INFINITE' | 'CROWN' | 'FEATHER';
}
