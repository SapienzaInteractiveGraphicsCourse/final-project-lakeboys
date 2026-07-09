// DEFUSE-DECK 3D — systems/AudioManager
//
// Effetti sonori PROCEDURALI via Web Audio API: nessun file audio esterno,
// tutto sintetizzato al volo (oscillatori + rumore + inviluppi di guadagno).
//
// Il browser blocca l'audio prima del primo gesto dell'utente: il contesto
// viene creato pigramente al primo pointerdown/keydown (vedi _bindUnlock).

const MASTER_VOLUME = 0.35;

export class AudioManager {
  constructor() {
    this.ctx    = null;
    this.master = null;
    this.muted  = false;
    this._noiseBuffer = null;
    this._bindUnlock();
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  _bindUnlock() {
    const unlock = () => {
      this._ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      console.error('AudioManager: contesto non disponibile:', err);
      this.ctx = null;
      return false;
    }
    return true;
  }

  // Buffer di rumore bianco riusato per whoosh/esplosioni
  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ── Primitive di sintesi ────────────────────────────────────────────────────

  // Beep con inviluppo: freq può essere un numero o [start, end] (glide)
  _tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.5, delay = 0 } = {}) {
    if (!this._ensureContext()) return;
    const t0  = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Soffio di rumore filtrato (whoosh, impatti, esplosione)
  _whoosh({ dur = 0.3, from = 400, to = 2000, gain = 0.4, delay = 0, q = 1.2 } = {}) {
    if (!this._ensureContext()) return;
    const t0  = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ── SFX di gioco ────────────────────────────────────────────────────────────

  cardSelect()   { this._tone({ freq: [520, 740], dur: 0.07, type: 'triangle', gain: 0.35 }); }
  cardDeselect() { this._tone({ freq: [620, 420], dur: 0.06, type: 'triangle', gain: 0.25 }); }
  cardDraw()     { this._whoosh({ dur: 0.14, from: 900, to: 2600, gain: 0.16, q: 2 }); }

  discard() {
    this._whoosh({ dur: 0.22, from: 1400, to: 500, gain: 0.28 });
    this._tone({ freq: [300, 180], dur: 0.14, type: 'square', gain: 0.12, delay: 0.04 });
  }

  // Rimescolata del mazzo: raffica di tick tipo riffle
  shuffle() {
    for (let i = 0; i < 7; i++) {
      this._whoosh({
        dur: 0.05, from: 1600 + i * 120, to: 800, gain: 0.10,
        delay: i * 0.045, q: 3,
      });
    }
    this._tone({ freq: [240, 160], dur: 0.16, type: 'triangle', gain: 0.18, delay: 0.35 });
  }

  // Mano giocata: whoosh + accordo crescente proporzionato al mult
  playHand(mult = 1) {
    this._whoosh({ dur: 0.35, from: 500, to: 2800, gain: 0.35 });
    const base = 320 + Math.min(mult, 8) * 40;
    [0, 4, 7].forEach((semi, i) => {
      this._tone({
        freq: base * Math.pow(2, semi / 12),
        dur: 0.22, type: 'sawtooth', gain: 0.10, delay: 0.10 + i * 0.05,
      });
    });
  }

  // Tick del count-up punteggio (chips/mult che salgono)
  scoreTick(step = 0) {
    this._tone({ freq: 900 + step * 26, dur: 0.03, type: 'square', gain: 0.06 });
  }

  scoreSlam() {
    this._tone({ freq: [180, 60], dur: 0.28, type: 'square', gain: 0.3 });
    this._whoosh({ dur: 0.2, from: 3000, to: 700, gain: 0.22 });
  }

  enemyPlay() {
    this._tone({ freq: [140, 90], dur: 0.35, type: 'sawtooth', gain: 0.22 });
    this._tone({ freq: [420, 260], dur: 0.3, type: 'square', gain: 0.10, delay: 0.05 });
  }

  enemyImpact() {
    this._whoosh({ dur: 0.4, from: 900, to: 120, gain: 0.5, q: 0.8 });
    this._tone({ freq: [90, 40], dur: 0.4, type: 'sine', gain: 0.5 });
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      this._tone({ freq: [880, 660], dur: 0.22, type: 'square', gain: 0.14, delay: i * 0.3 });
    }
  }

  // Modulo della bomba disinnescato: doppio blip positivo
  stageDefused() {
    this._tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.3 });
    this._tone({ freq: 990, dur: 0.2, type: 'triangle', gain: 0.3, delay: 0.11 });
  }

  victory() {
    // Arpeggio maggiore ascendente + accordo finale
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.28, delay: i * 0.14 }));
    notes.forEach(f => this._tone({ freq: f, dur: 0.9, type: 'sine', gain: 0.14, delay: 0.62 }));
  }

  explosion() {
    this._whoosh({ dur: 1.4, from: 2500, to: 40, gain: 0.9, q: 0.5 });
    this._tone({ freq: [70, 26], dur: 1.2, type: 'sine', gain: 0.7 });
    this._tone({ freq: [220, 30], dur: 0.8, type: 'sawtooth', gain: 0.25, delay: 0.05 });
  }
}
