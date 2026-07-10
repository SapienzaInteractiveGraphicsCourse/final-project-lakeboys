// DEFUSE-DECK 3D — core/GameState
//
// Stato PURO del duello: nessun accesso al DOM né a Three.js.
// Chi orchestra (GameManager) chiama i metodi di transizione; chi presenta
// (HUD) si iscrive agli eventi. Questo separa logica, resa 3D e interfaccia.
//
// Eventi emessi (via on/off):
//   'defuse'      { value, delta, progress }
//   'overcharge'  { value, delta, progress, play }
//   'turn'        { turn, phase }
//   'phase'       { phase }
//   'discard'     { discardsLeft }
//   'suggestion'  { suggestionsLeft }
//   'danger'      { level, entered }   — entered=true al primo superamento della soglia
//   'end'         { won, stats }

export const GamePhase = Object.freeze({
  CHOOSING: 'choosing',   // scelta del joker a inizio partita
  PLAYER:   'player',
  ENEMY:    'enemy',
  OVER:     'over',
});

export const RULES = Object.freeze({
  DEFUSE_TARGET:       1400,   // soglia di vittoria (disinnesco)
  OVERCHARGE_TARGET:   1600,   // soglia di sconfitta (detonazione)
  DISCARDS_PER_TURN:   3,
  SUGGESTIONS_PER_GAME: 5,     // aiuti "miglior mano" per partita
  DANGER_THRESHOLD:    0.7,    // frazione di sovraccarico che attiva l'allarme
  MAX_SELECTED:        5,
});

export class GameState {
  constructor(rules = RULES, startPhase = GamePhase.PLAYER) {
    this.rules = rules;

    this.defuse     = 0;
    this.overcharge = 0;
    this.turn       = 1;
    this.phase      = startPhase;

    this.discardsLeft    = rules.DISCARDS_PER_TURN;
    this.suggestionsLeft = rules.SUGGESTIONS_PER_GAME;

    this.isOver   = false;
    this.won      = false;
    this._inDanger = false;

    // Statistiche mostrate a fine partita
    this.stats = {
      handsPlayed:   0,
      discardsUsed:  0,
      bestHandName:  null,
      bestHandTotal: 0,
      maxEnemyHit:   0,
      turns:         1,
    };

    this._listeners = new Map();
  }

  // ── Pub/sub minimale ────────────────────────────────────────────────────────
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  _emit(event, payload) {
    this._listeners.get(event)?.forEach(fn => {
      try { fn(payload); }
      catch (err) { console.error(`GameState listener '${event}' failed:`, err); }
    });
  }

  // ── Letture derivate ────────────────────────────────────────────────────────
  get defuseProgress()     { return Math.min(this.defuse / this.rules.DEFUSE_TARGET, 1); }
  get overchargeProgress() { return Math.min(this.overcharge / this.rules.OVERCHARGE_TARGET, 1); }
  get dangerLevel()        { return this.overchargeProgress; }
  get inDanger()           { return this._inDanger; }

  canPlay(selectedCount)    { return this.phase === GamePhase.PLAYER && !this.isOver && selectedCount > 0; }
  canDiscard(selectedCount) { return this.canPlay(selectedCount) && this.discardsLeft > 0; }
  canSuggest()              { return this.phase === GamePhase.PLAYER && !this.isOver && this.suggestionsLeft > 0; }

  // ── Transizioni ─────────────────────────────────────────────────────────────

  // Sovrascrive i parametri di difficoltà (solo prima dell'inizio del duello)
  applyDifficulty(diff) {
    if (this.turn > 1 || this.defuse > 0 || this.overcharge > 0) return;
    this.rules = Object.freeze({
      ...this.rules,
      OVERCHARGE_TARGET: diff.overchargeTarget,
    });
  }

  // Fine della scelta del joker → inizia il duello vero e proprio
  beginDuel() {
    if (this.phase !== GamePhase.CHOOSING) return;
    this.phase = GamePhase.PLAYER;
    this._emit('phase', { phase: this.phase });
  }

  // Il giocatore ha calato una mano già valutata (score da combos.scoreHand).
  // Ritorna true se la partita è stata vinta con questa giocata.
  applyPlayerScore(score) {
    if (this.isOver || this.phase !== GamePhase.PLAYER) return false;

    const before = this.defuse;
    this.defuse  = Math.min(this.defuse + score.total, this.rules.DEFUSE_TARGET);

    this.stats.handsPlayed += 1;
    if (score.total > this.stats.bestHandTotal) {
      this.stats.bestHandTotal = score.total;
      this.stats.bestHandName  = score.combo?.name ?? null;
    }

    this._emit('defuse', {
      value: this.defuse,
      delta: this.defuse - before,
      progress: this.defuseProgress,
    });

    if (this.defuse >= this.rules.DEFUSE_TARGET) {
      this._end(true);
      return true;
    }
    return false;
  }

  beginEnemyPhase() {
    if (this.isOver) return;
    this.phase = GamePhase.ENEMY;
    this._emit('phase', { phase: this.phase });
  }

  // Il Warden ha giocato (play da EnemyAI.playTurn).
  // Ritorna true se la partita è stata persa con questa giocata.
  applyEnemyPlay(play) {
    if (this.isOver) return false;

    const before    = this.overcharge;
    this.overcharge = Math.min(this.overcharge + play.damage, this.rules.OVERCHARGE_TARGET);
    this.stats.maxEnemyHit = Math.max(this.stats.maxEnemyHit, play.damage);

    this._emit('overcharge', {
      value: this.overcharge,
      delta: this.overcharge - before,
      progress: this.overchargeProgress,
      play,
    });

    const entered = !this._inDanger && this.dangerLevel >= this.rules.DANGER_THRESHOLD;
    if (entered) this._inDanger = true;
    if (this._inDanger) this._emit('danger', { level: this.dangerLevel, entered });

    if (this.overcharge >= this.rules.OVERCHARGE_TARGET) {
      this._end(false);
      return true;
    }
    return false;
  }

  beginPlayerTurn() {
    if (this.isOver) return;
    this.turn += 1;
    this.stats.turns = this.turn;
    this.discardsLeft = this.rules.DISCARDS_PER_TURN;
    this.phase = GamePhase.PLAYER;
    this._emit('turn', { turn: this.turn, phase: this.phase });
  }

  spendDiscard() {
    if (this.discardsLeft <= 0) return false;
    this.discardsLeft -= 1;
    this.stats.discardsUsed += 1;
    this._emit('discard', { discardsLeft: this.discardsLeft });
    return true;
  }

  spendSuggestion() {
    if (!this.canSuggest()) return false;
    this.suggestionsLeft -= 1;
    this._emit('suggestion', { suggestionsLeft: this.suggestionsLeft });
    return true;
  }

  _end(won) {
    this.isOver = true;
    this.won    = won;
    this.phase  = GamePhase.OVER;
    this._emit('end', { won, stats: { ...this.stats } });
  }
}
