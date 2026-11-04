export type GameMode = 'MENU' | 'LEVEL_SELECT' | 'BATTLE' | 'UPGRADES' | 'LORE' | 'ARCHIVE';

export type ArmyCommand = 'DEFEND' | 'HOLD' | 'ATTACK' | 'FOLLOW_HERO';

export type UnitType = 'SCRIBE' | 'SWORD' | 'ARCHER' | 'GUARDIAN' | 'HARPIST' | 'RUNECASTER' | 'PUPPET';

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
  state: 'WALK' | 'ATTACK' | 'MINE' | 'RETREAT' | 'HURT' | 'DEAD' | 'GUARD';
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
  /** 墨傀专属（Task 46）：锁纹墨甲当前甲值（>0 时凡兵承甲，字诀透甲） */
  runeArmorHp?: number;
  /** 墨傀专属：锁纹墨甲甲值上限（重凝满值） */
  runeArmorMax?: number;
  /** 墨傀专属：凝甲冷却（甲碎后计时，归零重凝满值） */
  runeArmorRegenCd?: number;
  /** Boss 专属：二阶段专属机制冷却（墨震八荒/弦召残响/影袭瞬步，狂暴期间循环释放） */
  bossSkillCd?: number;
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
  /** 每秒灼伤（字诀评级可放大） */
  dmgPerSec?: number;
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
  /** 连墨伤害倍率：连击越高，剑仙普攻与技能伤害越高（柔性连断后按保留段位回落） */
  dmgMult: number;
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
  /** 伤害来源（Task 46 锁纹墨甲结算：凡兵承甲，字诀透甲——QUILL/INK_BLADE 为 ability） */
  source?: 'melee' | 'projectile' | 'ability';
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
  ambientType:
    | 'SNOW'
    | 'BAMBOO'
    | 'MOON'
    | 'PETAL'
    | 'DAWN'
    | 'MIST'
    | 'AUTUMN'
    | 'STORM'
    | 'VOID'
    | 'LOTUS'
    | 'GOOSE'
    | 'CHRYS'
    | 'GLOOM'
    | 'STRING'
    | 'DESERT'
    | 'BEACON'
    | 'WITHER'
    | 'IRON'
    | 'SIEGE'
    | 'ORCHID'
    | 'CLOUDMARCH'
    | 'MORN'
    | 'HOLLOW'
    | 'STARQ'
    | 'RIVULET'
    | 'PEACHDAWN'
    | 'GAPLIGHT'
    | 'SMOKEFIELD'
    | 'EERYPEACH'
    | 'LANTERN'
    | 'QUJIANG'
    | 'PAGODA'
    | 'WINE'
    | 'CALYX'
    | 'CHIJI'
    | 'MOONRISE'
    | 'XIAO'
    | 'REEF'
    | 'BOATQ'
    | 'SCROLLIN'
    | 'SHADOW'
    | 'INKSTONE'
    | 'SNOWPLUM'
    | 'PUREQI'
    | 'DAO'
    | 'SAGE'
    | 'CANON'
    | 'MUSE'
    | 'ONENESS';
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
  /** Boss 出场使用的兵种造型（默认按旧规则：终折 GUARDIAN，其余 SWORD） */
  bossUnit?: UnitType;
  /** Boss 出场时间阈值秒数（或敌阵受创提前触发，默认：终折 25 / 其余 45） */
  bossTime?: number;
  /** 周期性基础波次的兵种编成（缺省时沿用旧行为：剑客打底，按折序加射手/重卫） */
  baselineWaves?: UnitType[];
  /** 开战卷首语：本折剧情引言（战斗开场展示数秒） */
  storyIntro?: string;
  rewardJade: number;
  unlockedUnit?: UnitType;
  /** 无尽试炼模式：波次无限，敌軍逐波变强，坚守越久奖励越丰 */
  endless?: boolean;
  /** 每日试炼：敌军攻击系数（默认 1） */
  enemyAtkMult?: number;
  /** 每日试炼：敌军气血系数（默认 1） */
  enemyHpMult?: number;
  /** 每日试炼：异象词缀摘要（展示用；卷面试炼通用字段，周试炼同构复用） */
  dailyModifiers?: { id: string; name: string; description: string }[];
  /** 每日试炼：开局墨灵祝福 id 列表（战斗开场自动赐福；卷面试炼通用字段，周试炼同构复用） */
  dailyBlessings?: string[];
}

/* ============================================================
   主线剧情架构：十章总纲 + 大章元数据
   新增一章 = 向 STORY_CHAPTERS 追加一个对象，UI/解锁/存档全自动适配
   ============================================================ */

/** 大章状态：已启（可玩）/ 未启（预告） */
export type ChapterStatus = 'RELEASED' | 'UPCOMING';

/** 十大章总纲条目（未启章仅展示预告，后续逐章实装） */
export interface StoryOutlineEntry {
  id: number;
  anthology: string;
  name: string;
  teaser: string;
  status: ChapterStatus;
}

/** 大章元数据：卷首诗 + 章前引子 + 通关尾声 + 折页关卡组 */
export interface StoryChapterMeta {
  id: number;
  key: string;
  /** 集名（如「风雅集」） */
  anthology: string;
  /** 章名（如「翰墨千秋」） */
  name: string;
  /** 卷首诗 */
  verse: string;
  verseAuthor: string;
  /** 章前引子（剧情卷宗，进章首读） */
  intro: string;
  /** 通关尾声（终折大捷后展示） */
  epilogue: string;
  status: ChapterStatus;
  /** 未启之卷的一句话预告 */
  teaser?: string;
  /** 本大章折页关卡（RELEASED 章必填） */
  levels?: LevelConfig[];
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
  /** 已读过章前引子的大章 id 列表（每章仅自动弹一次） */
  storySeen: number[];
  jadeSparks: number; // Currency for upgrades
  heroUpgrades: {
    attackLevel: number;
    hpLevel: number;
    cooldownLevel: number;
    resonanceLevel: number;
    /** 字诀精研等级：九字诀招式威力每级 +10%（乘算，Task 44 墨阁升级树扩展） */
    runeLevel: number;
    /** 祝福气运等级：稀世（RARE/EPIC）祝福抽取权重每级 +18%（Task 44 墨阁升级树扩展） */
    blessingLuckLevel: number;
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
  /** 每日试炼：最后完成首胜的墨历日（YYYY-MM-DD） */
  dailyDone?: string;
  /** 每日试炼：问战连捷天数（昨日完成则延续，否则重置） */
  dailyStreak?: number;
  /** 周试炼：最后完成首胜的周键（本周一日期 YYYY-MM-DD，周一零点换卷） */
  weeklyDone?: string;
}

/** 成就定义 */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: 'TROPHY' | 'STAR' | 'FLAME' | 'SWORD' | 'SHIELD' | 'INFINITE' | 'CROWN' | 'FEATHER';
}

/* ============================================================
   趣味机制扩展：墨灵祝福 / 文房四宝 / 墨龙卷 / 墨滞时刻
   ============================================================ */

/** 墨灵祝福定义（Roguelike 三选一） */
export interface BlessingDef {
  id: string;
  name: string;
  verse: string;
  description: string;
  icon: 'SWORD' | 'SHIELD' | 'WIND' | 'FLAME' | 'COINS' | 'HEART' | 'ZAP' | 'STAR';
  rarity: 'COMMON' | 'RARE' | 'EPIC';
}

/** 战斗内祝福加成乘数集合（可叠加） */
export interface BlessingMults {
  attack: number;
  speed: number;
  hp: number;
  inkGain: number;
  energyGain: number;
  comboTimer: number;
  cooldown: number;
}

/** 文房四宝掉落物 */
export interface InkTreasure {
  id: string;
  kind: 'BRUSH' | 'INK' | 'PAPER' | 'STONE';
  x: number;
  y: number;
  altitudeZ: number;
  vz: number;
  life: number;
  maxLife: number;
}

/** 墨龙卷（高连击奖励：横扫战场的墨龙；字诀「龙」三龙阵复用同结构） */
export interface InkDragon {
  id: string;
  x: number;
  y: number;
  vx: number;
  life: number;
  maxLife: number;
  /** 已命中单位 id，防重复伤害 */
  hitIds: Set<string>;
  /** 伤害倍率（默认 2.2 = 连击墨龙卷；龙诀三龙阵 2.6×字诀威力） */
  dmgMult?: number;
  /** 击退距离（默认 45px） */
  knockback?: number;
}

/** 地面墨渍贴花（击杀/重击飞溅留下的水墨痕迹，随时间淡去） */
export interface InkSplat {
  id: string;
  x: number;
  y: number;
  r: number;
  /** 形状随机种子（旋转 + 瓣形抖动，保证每帧渲染一致） */
  seed: number;
  life: number;
  maxLife: number;
}

/** 蚀痕污染带（蚀文咒师咒弹落点：升腾咒雾污染书符笔迹，正字临痕可驱散） */
export interface InkCorruptZone {
  id: string;
  x: number;
  y: number;
  r: number;
  /** 形状/相位随机种子（蚀纹折线与咒雾呼吸每帧渲染一致） */
  seed: number;
  life: number;
  maxLife: number;
}
