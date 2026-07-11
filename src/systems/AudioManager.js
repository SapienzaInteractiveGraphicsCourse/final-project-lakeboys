// DEFUSE-DECK 3D — systems/AudioManager
//
// Effetti sonori: alcuni sono campioni mp3 (Balatro), gli altri restano
// sintetizzati al volo via Web Audio API (oscillatori + rumore + inviluppi).
// I campioni condividono lo stesso contesto/master gain dei suoni procedurali,
// così mute e volume restano un'unica manopola per tutto l'audio del gioco.
//
// Il browser blocca l'audio prima del primo gesto dell'utente: il contesto
// viene creato pigramente al primo pointerdown/keydown (vedi _bindUnlock).

const MASTER_VOLUME = 0.35;
const MUSIC_VOLUME  = 0.16;   // sotto gli SFX: la musica fa da tappeto, non da protagonista

// ── Campioni mp3 (public/sound/) ─────────────────────────────────────────────
const SOUND_BASE = 'public/sound/';
const SAMPLES = Object.freeze({
  menuTheme:       SOUND_BASE + '04. Celestial Theme.mp3',
  mainTheme:       SOUND_BASE + '01. Main Theme.mp3',
  explosionBoom:   SOUND_BASE + '28-explosion1.mp3',
  gameOverStinger: SOUND_BASE + 'balatro-game-over-sound.mp3',
  cardDraw:        SOUND_BASE + '7-card1.mp3',
  multHit:         SOUND_BASE + 'balatro-multhit.mp3',
});

export class AudioManager {
  constructor() {
    this.ctx        = null;
    this.master     = null;
    this.musicGain  = null;
    this.muted      = false;
    this._noiseBuffer  = null;
    this._buffers      = new Map();   // path → Promise<AudioBuffer> (cache dei campioni decodificati)
    this._musicSource  = null;
    this._musicPath    = null;        // traccia in riproduzione (per non riavviarla se richiamata due volte)
    this._bindUnlock();

    // Precarica i campioni in background: pronti prima che servano in partita
    Object.values(SAMPLES).forEach(path => this._loadBuffer(path));
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  _bindUnlock() {
    const unlock = () => {
      this._ensureContext();
      this.playMenuMusic();   // primo gesto utile: parte subito il tema del menu/tutorial
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

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.muted ? 0 : MUSIC_VOLUME;
      this.musicGain.connect(this.ctx.destination);
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
    if (this.musicGain) this.musicGain.gain.value = muted ? 0 : MUSIC_VOLUME;
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

  // ── Campioni mp3 ────────────────────────────────────────────────────────────
  // Decodifica una volta, cache condivisa: chiamate ripetute (es. scoreTick,
  // richiamato ~10 volte in rapida sequenza) riusano lo stesso AudioBuffer e
  // creano solo un nuovo BufferSourceNode per istanza — così i colpi si
  // sovrappongono naturalmente invece di troncarsi a vicenda.
  async _loadBuffer(path) {
    if (this._buffers.has(path)) return this._buffers.get(path);
    const promise = (async () => {
      if (!this._ensureContext()) return null;
      try {
        const res = await fetch(encodeURI(path));
        const arr = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(arr);
      } catch (err) {
        console.error(`AudioManager: impossibile caricare ${path}:`, err);
        return null;
      }
    })();
    this._buffers.set(path, promise);
    return promise;
  }

  async _playBuffer(path, { gain = 1, delayMs = 0 } = {}) {
    const buffer = await this._loadBuffer(path);
    if (!buffer) return;
    const fire = () => {
      if (!this._ensureContext()) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.master);
      src.start(this.ctx.currentTime);
    };
    if (delayMs > 0) setTimeout(fire, delayMs);
    else fire();
  }

  // Musica di sottofondo: loop continuo instradato su musicGain (manopola
  // separata dal master SFX, vedi setMuted). Idempotente sulla stessa traccia;
  // se ne è già in corso un'altra, la ferma e parte con la nuova (menu → partita).
  async _startMusic(path) {
    if (this._musicPath === path && this._musicSource) return;
    const buffer = await this._loadBuffer(path);
    if (!buffer || !this._ensureContext()) return;
    this._musicSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start(this.ctx.currentTime);
    this._musicSource = src;
    this._musicPath   = path;
  }

  // Tema del menu/tutorial (schermata iniziale con le istruzioni)
  playMenuMusic() { return this._startMusic(SAMPLES.menuTheme); }

  // Tema della partita, dal click su INIZIA in poi
  playMusic() { return this._startMusic(SAMPLES.mainTheme); }

  // ── SFX di gioco ────────────────────────────────────────────────────────────

  cardSelect()   { this._tone({ freq: [520, 740], dur: 0.07, type: 'triangle', gain: 0.35 }); }
  cardDeselect() { this._tone({ freq: [620, 420], dur: 0.06, type: 'triangle', gain: 0.25 }); }
  cardDraw()     { this._playBuffer(SAMPLES.cardDraw, { gain: 0.55 }); }

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

  // Tick del count-up punteggio (chips/mult che salgono): un "mult hit" per
  // ogni tick, richiamato ~10 volte in rapida sequenza da HUD.revealScore.
  scoreTick(step = 0) {
    this._playBuffer(SAMPLES.multHit, { gain: 0.45 });
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

  // Joker scelto: piccola triade luminosa
  jokerPick() {
    [523, 659, 784].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.22, delay: i * 0.07 }));
  }

  victory() {
    // Arpeggio maggiore ascendente + accordo finale
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.28, delay: i * 0.14 }));
    notes.forEach(f => this._tone({ freq: f, dur: 0.9, type: 'sine', gain: 0.14, delay: 0.62 }));
  }

  // Boom della detonazione, poi lo stinger di chiusura ~300ms dopo
  explosion() {
    this._playBuffer(SAMPLES.explosionBoom,   { gain: 0.9 });
    this._playBuffer(SAMPLES.gameOverStinger, { gain: 0.75, delayMs: 300 });
  }
}
