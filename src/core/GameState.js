// DEFUSE-DECK 3D — core/GameState
//
// Stato PURO della partita: nessun accesso al DOM né a Three.js.
// Chi orchestra (GameManager) chiama i metodi di transizione; chi presenta
// (HUD) si iscrive agli eventi. Questo separa logica, resa 3D e interfaccia.
//
// Eventi emessi (via on/off):
//   'defuse'      { value, delta, progress }
//   'turn'        { turn, phase }
//   'phase'       { phase }
//   'discard'     { discardsLeft }
//   'suggestion'  { suggestionsLeft }
//   'end'         { won, stats }

export const GamePhase = Object.freeze({
  PLAYER:   'player',
  OVER:     'over',
});

export const RULES = Object.freeze({
  DEFUSE_TARGET:       1400,   // soglia di vittoria (disinnesco)
  DISCARDS_PER_TURN:   3,
  SUGGESTIONS_PER_GAME: 2,     // aiuti "miglior mano" per partita
  MAX_SELECTED:        5,
});

export class GameState {
  constructor(rules = RULES) {
    this.rules = rules;

    this.defuse     = 0;
    this.turn       = 1;
    this.phase      = GamePhase.PLAYER;

    this.discardsLeft    = rules.DISCARDS_PER_TURN;
    this.suggestionsLeft = rules.SUGGESTIONS_PER_GAME;

    this.isOver   = false;
    this.won      = false;

    // Statistiche mostrate a fine partita
    this.stats = {
      handsPlayed:   0,
      discardsUsed:  0,
      bestHandName:  null,
      bestHandTotal: 0,
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
  get defuseProgress() { return Math.min(this.defuse / this.rules.DEFUSE_TARGET, 1); }

  canPlay(selectedCount)    { return this.phase === GamePhase.PLAYER && !this.isOver && selectedCount > 0; }
  canDiscard(selectedCount) { return this.canPlay(selectedCount) && this.discardsLeft > 0; }
  canSuggest()              { return this.phase === GamePhase.PLAYER && !this.isOver && this.suggestionsLeft > 0; }

  // ── Transizioni ─────────────────────────────────────────────────────────────

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
