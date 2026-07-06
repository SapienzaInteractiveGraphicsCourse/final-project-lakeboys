// DEFUSE-DECK 3D — GameManager (orchestratore)
//
// Partita a mani di poker stile Balatro:
//   • TU giochi mani di poker → carichi la barra DISINNESCO (verde).
//   • Raggiunta la soglia, la bomba è disinnescata (l'avversario arriverà).
//
// Responsabilità: SOLO la sequenza di gioco. Ogni dominio è delegato:
//   core/GameState   → stato e regole (puro)
//   core/combos      → valutazione delle mani (puro)
//   ui/HUD           → tutto il DOM

import { scoreHand, bestHand } from './core/combos.js';
import { GameState, GamePhase, RULES } from './core/GameState.js';

export class GameManager {
  constructor({ hud, cardSystem }) {
    this.hud   = hud;
    this.cards = cardSystem;
    this.input = null;   // assegnato via attachInput()

    this.state = new GameState(RULES);
    hud.bindState(this.state);

    hud.setTurnBanner('► TUO TURNO', '#a4c46a');
    hud.setStatus('■ Sistema attivo — forma mani di poker e carica il disinnesco');
    hud.setDeckCount(this.cards.deckCount);
    this._refreshActions(0);
  }

  attachInput(inputManager) { this.input = inputManager; }

  // ── Accessori di compatibilità (usati da InputManager) ──────────────────────
  get phase()        { return this.state.phase; }
  get isOver()       { return this.state.isOver; }
  get discardsLeft() { return this.state.discardsLeft; }

  // Punteggio del giocatore (core/combos, logica pura)
  computeHandScore(cards) {
    return scoreHand(cards);
  }

  // Miglior mano possibile dalla mano corrente
  bestFromHand(cards) {
    return bestHand(cards, this.state.rules.MAX_SELECTED, (c) => this.computeHandScore(c));
  }

  // ── Preview durante la selezione ────────────────────────────────────────────
  showPotentialVoltage(cards) {
    const count = cards?.length ?? 0;
    this.hud.showSelection(count ? this.computeHandScore(cards) : null, count);
    this._refreshActions(count);
  }

  // ── Il giocatore gioca la mano ──────────────────────────────────────────────
  // Chiamato da InputManager dopo l'animazione delle carte.
  async playPlayerHand(score) {
    if (this.state.isOver || this.state.phase !== GamePhase.PLAYER) return;

    this.hud.setDeckCount(this.cards.deckCount);

    // Reveal stile Balatro: chips × mult contano, poi slam del totale
    await this.hud.revealScore(score);

    const won = this.state.applyPlayerScore(score);
    this.hud.floatGain(score.total, score.combo?.color ?? '#a4c46a', 'defuse');

    if (won) { this._win(); return; }

    // Senza avversario (per ora): si passa direttamente al turno successivo
    this.state.beginPlayerTurn();
    this.showPotentialVoltage(this.input?.selectedCards ?? []);
  }

  // ── Risorse del turno ───────────────────────────────────────────────────────
  spendDiscard() {
    this.state.spendDiscard();
    this.hud.setDeckCount(this.cards.deckCount);
  }

  // Aiuto "miglior mano": seleziona automaticamente la combo più forte.
  // Ritorna le carte da selezionare, o null se l'aiuto non è disponibile.
  useSuggestion() {
    if (!this.state.canSuggest()) return null;
    const { cards, score } = this.bestFromHand(this.cards.hand);
    if (!cards.length) return null;
    this.state.spendSuggestion();
    this.hud.setStatus(`💡 Suggerito: ${score.combo.name} (+${score.total} V)`, '#e5ae32');
    return cards;
  }

  // ── Fine partita ────────────────────────────────────────────────────────────
  _win() {
    this.hud.setStatus('✓ BOMBA DISINNESCATA', '#a4c46a');
    this.hud.setTurnBanner('◆ HAI VINTO', '#a4c46a');
    this._refreshActions(0);
    this._showEnd(true);
  }

  _showEnd(won) {
    this.hud.showEndScreen({
      won,
      stats: this.state.stats,
      turn: this.state.turn,
    });
  }

  // ── Stato dei pulsanti ──────────────────────────────────────────────────────
  _refreshActions(selectedCount) {
    this.hud.setActions({
      canPlay:    this.state.canPlay(selectedCount),
      canDiscard: this.state.canDiscard(selectedCount),
      canHint:    this.state.canSuggest(),
    });
  }
}
