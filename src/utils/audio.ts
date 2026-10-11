// Web Audio API procedural sound engine for aesthetic Chinese ink & martial arts soundscape

class SoundEngine {
  private ctx: AudioContext | null = null;
  /** 主音量总线：所有音效统一路由，便于全局静音/音量控制 */
  private master: GainNode | null = null;
  private isMuted: boolean = typeof localStorage !== 'undefined' ? localStorage.getItem('ink_steel_muted') === '1' : false;
  private isBgmPlaying: boolean = false;
  private bgmIntervalId: any = null;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.setValueAtTime(this.isMuted ? 0 : 0.9, this.ctx.currentTime);
        this.master.connect(this.master);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('ink_steel_muted', this.isMuted ? '1' : '0');
    } catch {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.isMuted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
    if (this.isMuted) {
      this.stopBGM();
    } else {
      this.startBGM();
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Plucked Guqin / Guzheng string chord (Pentatonic tone)
  public playPluck(frequency: number = 440, duration: number = 1.2) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.98, now + duration);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + duration);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc.start(now);
      osc.stop(now + duration);
    } catch {}
  }

  // Crisp sword slash with ink swoosh
  public playSlash(isHeavy: boolean = false) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;

      // Noise generator for swoosh
      const bufferSize = Math.floor(this.ctx.sampleRate * (isHeavy ? 0.25 : 0.15));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isHeavy ? 1800 : 2600, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + (isHeavy ? 0.25 : 0.15));
      filter.Q.setValueAtTime(3, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isHeavy ? 0.32 : 0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.25 : 0.15));

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      whiteNoise.start(now);

      // Tonal ring for blade resonance
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isHeavy ? 880 : 1320, now);
      osc.frequency.exponentialRampToValueAtTime(isHeavy ? 350 : 580, now + 0.2);

      oscGain.gain.setValueAtTime(isHeavy ? 0.16 : 0.08, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(oscGain);
      oscGain.connect(this.master);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  // Enhanced Water-Ink Splatter & Flesh Hit Impact (水墨打击音效)
  public playInkHit(isHeavy: boolean = false, isCritical: boolean = false) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Wet ink squelch (Liquid droplet & ink slap)
      const bufferSize = Math.floor(this.ctx.sampleRate * (isHeavy ? 0.18 : 0.1));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(isHeavy ? 800 : 1400, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isHeavy ? 0.35 : 0.22, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);

      // 2. Heavy Sub-thud for punchy impact
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(isCritical ? 160 : isHeavy ? 130 : 210, now);
      subOsc.frequency.exponentialRampToValueAtTime(45, now + (isHeavy ? 0.18 : 0.1));

      subGain.gain.setValueAtTime(isCritical ? 0.4 : isHeavy ? 0.3 : 0.18, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.18 : 0.1));

      subOsc.connect(subGain);
      subGain.connect(this.master);
      subOsc.start(now);
      subOsc.stop(now + (isHeavy ? 0.18 : 0.1));

      // 3. Metallic ring on critical hit
      if (isCritical) {
        this.playStampSeal();
      }
    } catch {}
  }

  // Red Seal Stamp Hit (书法印章暴击顿挫)
  public playStampSeal() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.3);

      // Gong chime accent
      const bell = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bell.type = 'triangle';
      bell.frequency.setValueAtTime(1046.5, now); // C6 bell
      bellGain.gain.setValueAtTime(0.12, now);
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      bell.connect(bellGain);
      bellGain.connect(this.master);
      bell.start(now);
      bell.stop(now + 0.45);
    } catch {}
  }

  // Aerial Plunge Ground Shake Impact
  public playPlunge() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc.start(now);
      osc.stop(now + 0.38);
    } catch {}
  }

  // Lotus Bloom Chime
  public playLotusBloom() {
    if (this.isMuted) return;
    const notes = [587.33, 783.99, 880, 1174.66];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playPluck(freq, 0.9), idx * 70);
    });
  }

  // Combo Tier Escalation Fanfare
  public playComboEscalation(tierIdx: number) {
    if (this.isMuted) return;
    const chords = [440, 523.25, 659.25, 783.99, 880, 1046.5];
    const base = chords[Math.min(chords.length - 1, tierIdx)];
    this.playPluck(base, 1.0);
    setTimeout(() => this.playPluck(base * 1.5, 1.2), 90);
  }

  // Dash / Flash Step sound
  public playDash() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.master);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  // Shield / Ward chime
  public playShield() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        if (!this.ctx || !this.master) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.8);

        osc.connect(gain);
        gain.connect(this.master);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.8);
      });
    } catch {}
  }

  // Quill / Arrow shot
  public playArrow() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  // Ultimate Skill: River Immortal (Deep gong + ascending melody)
  public playUltimate() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;

      // Deep temple bronze bell resonance
      const bellOsc = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(110, now); // A2 deep bell
      bellGain.gain.setValueAtTime(0.45, now);
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

      bellOsc.connect(bellGain);
      bellGain.connect(this.master);
      bellOsc.start(now);
      bellOsc.stop(now + 3.2);

      // Pentatonic cascade
      const pentatonic = [220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33, 698.46, 784, 880];
      pentatonic.forEach((freq, idx) => {
        if (!this.ctx || !this.master) return;
        const timeOffset = now + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, timeOffset);

        gain.gain.setValueAtTime(0.001, timeOffset);
        gain.gain.linearRampToValueAtTime(0.12, timeOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, timeOffset + 1.2);

        osc.connect(gain);
        gain.connect(this.master);

        osc.start(timeOffset);
        osc.stop(timeOffset + 1.2);
      });
    } catch {}
  }

  // Mining harvest chime
  public playGather() {
    if (this.isMuted) return;
    this.playPluck(587.33, 0.4);
  }

  // 击杀反馈：墨爆闷响 + 液体飞溅（区别于普通命中，强化"斩落"实感）
  public playSlay() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;

      // 低频闷响（斩落的重量感）
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(95, now);
      sub.frequency.exponentialRampToValueAtTime(36, now + 0.26);
      subGain.gain.setValueAtTime(0.3, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      sub.connect(subGain);
      subGain.connect(this.master);
      sub.start(now);
      sub.stop(now + 0.28);

      // 湿墨飞溅噪声（低通扫频，像一大滴墨砸在纸上）
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.24);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.26));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.22);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.26, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);
    } catch {}
  }

  // 字诀成字：按评级升调的琴音（神品最清越）
  public playCharCast(grade: 'SHEN' | 'MIAO' | 'NENG') {
    if (this.isMuted) return;
    const base = grade === 'SHEN' ? 659.25 : grade === 'MIAO' ? 523.25 : 440;
    this.playPluck(base, 0.9);
    if (grade !== 'NENG') {
      setTimeout(() => this.playPluck(base * 1.25, 1.1), 80);
    }
    if (grade === 'SHEN') {
      setTimeout(() => this.playPluck(base * 1.5, 1.3), 170);
    }
  }

  // 字诀失败：墨渍糊纸的闷声
  public playCharFail() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.master) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(72, now + 0.16);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  // Victory fanfare
  public playVictory() {
    if (this.isMuted) return;
    const chords = [392, 440, 523.25, 587.33, 783.99];
    chords.forEach((note, i) => {
      setTimeout(() => this.playPluck(note, 1.8), i * 180);
    });
  }

  // Defeat chime
  public playDefeat() {
    if (this.isMuted) return;
    const chords = [220, 196, 164.81, 130.81];
    chords.forEach((note, i) => {
      setTimeout(() => this.playPluck(note, 1.5), i * 250);
    });
  }

  // Background meditative guzheng loop
  public startBGM() {
    if (this.isBgmPlaying || this.isMuted) return;
    this.isBgmPlaying = true;
    this.initContext();

    const scale = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25];
    let step = 0;

    this.bgmIntervalId = setInterval(() => {
      if (this.isMuted || !this.isBgmPlaying) return;
      const pattern = [0, 2, 4, 3, 5, 4, 2, 1, 3, 5, 7, 5, 4, 2];
      const noteIdx = pattern[step % pattern.length];
      const freq = scale[noteIdx] || 329.63;
      this.playPluck(freq, 2.2);
      step++;
    }, 1800);
  }

  public stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }
}

export const sound = new SoundEngine();
