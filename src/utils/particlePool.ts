// ============================================================
// 粒子对象池（Task 41）· 短命高频对象的分配/回收降本
// ------------------------------------------------------------
// 战斗粒子以每手势 20~30 颗、同屏至多 420 颗（行云 130）的速率
// 生灭。原先每次死亡 splice + 每次生成新分配，年轻代 GC 在低端
// 设备上形成周期性停顿。池化后死亡实例归还复用，峰值内存封顶
// 于池容量，GC 压力趋平。
// 设计取舍：
// - id 字段全程只写不读，池不管理（沿用各调用点的字面量）
// - 复用时仅重置可选字段 rotation/vRot——必填字段由 tsc 保证
//   每个调用点字面量全量覆盖，无需全字段清零
// - 池容量封顶 FREE_CAP，超出即弃（交还 GC），内存有界
// ============================================================
import type { Particle } from '../types/game';

/** 池内空闲实例上限（略高于战斗粒子帽 420，余量留给溢出归还） */
const FREE_CAP = 480;

export interface ParticlePoolStats {
  /** 累计取用（含复用与新分配） */
  acquired: number;
  /** 累计复用（取到死亡实例）次数 */
  reused: number;
  /** 累计归还次数 */
  released: number;
  /** 当前场上存活 */
  live: number;
  /** 场上存活峰值 */
  peakLive: number;
  /** 当前空闲可复用 */
  free: number;
  /** 复用率 = reused / acquired（0~1，战斗前期偏低属正常） */
  reuseRate: number;
}

export class ParticlePool {
  private freeList: Particle[] = [];
  private acquired = 0;
  private reused = 0;
  private released = 0;
  private peakLive = 0;

  /** 取一颗粒子：优先复用死亡实例，池空则新分配 */
  acquire(): Particle {
    this.acquired++;
    const p = this.freeList.pop();
    if (p) {
      this.reused++;
      // 可选字段重置：防上一世的旋转残留串扰（必填字段由调用点字面量全量覆盖）
      p.rotation = undefined;
      p.vRot = undefined;
      return p;
    }
    // 新分配：给出类型完备的空白底（所有必填字段随调用点字面量覆盖）
    return {
      id: '',
      x: 0,
      y: 0,
      altitudeZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      color: '#ffffff',
      size: 1,
      alpha: 1,
      life: 0,
      maxLife: 1,
      type: 'INK',
    };
  }

  /** 归还死亡实例；池满即弃（内存有界） */
  release(p: Particle): void {
    this.released++;
    const live = this.acquired - this.released;
    if (live > this.peakLive) this.peakLive = live;
    if (this.freeList.length < FREE_CAP) this.freeList.push(p);
  }

  /** 只读统计快照（无头验证缝用） */
  stats(): ParticlePoolStats {
    const live = Math.max(0, this.acquired - this.released);
    if (live > this.peakLive) this.peakLive = live;
    return {
      acquired: this.acquired,
      reused: this.reused,
      released: this.released,
      live,
      peakLive: this.peakLive,
      free: this.freeList.length,
      reuseRate: this.acquired > 0 ? this.reused / this.acquired : 0,
    };
  }
}
