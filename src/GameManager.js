// DEFUSE-DECK 3D — GameManager (orchestratore)
//
// Partita a mani di poker stile Balatro:
//   • TU giochi mani di poker → carichi la barra DISINNESCO (verde);
//     ogni 25% un modulo della bomba si apre fisicamente.
//   • Raggiunta la soglia, la bomba è disinnescata (l'avversario arriverà).
//
// Responsabilità: SOLO la sequenza di gioco. Ogni dominio è delegato:
//   core/GameState   → stato e regole (puro)
//   core/combos      → valutazione delle mani (puro)
//   ui/HUD           → tutto il DOM
//   systems/Audio    → effetti sonori procedurali
//   systems/Effects  → camera shake e flash
//   systems/Particles→ burst di scintille (THREE.Points)
//   scene/*          → resa 3D (reazioni della bomba)

import * as THREE from 'three';
import { scoreHand, bestHand } from './core/combos.js';
import { GameState, GamePhase, RULES } from './core/GameState.js';

export class GameManager {
  constructor({ hud, audio, effects, particles, sceneManager, cardSystem, bombModel }) {
    this.hud       = hud;
    this.audio     = audio;
    this.effects   = effects;
    this.particles = particles;
    this.scene     = sceneManager;
    this.cards     = cardSystem;
    this.bombModel = bombModel;
    this.input     = null;   // assegnato via attachInput()

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
  // Chiamato da InputManager dopo l'animazione delle carte verso la bomba.
  async playPlayerHand(score) {
    if (this.state.isOver || this.state.phase !== GamePhase.PLAYER) return;

    this.audio.playHand(score.mult);
    this.hud.setDeckCount(this.cards.deckCount);

    // Reveal stile Balatro: chips × mult contano, poi slam del totale
    await this.hud.revealScore(score);

    const won = this.state.applyPlayerScore(score);
    this.hud.floatGain(score.total, score.combo?.color ?? '#a4c46a', 'defuse');
    this.scene.setVoltageProgress(this.state.defuseProgress);

    // Moduli della bomba: ogni 25% di progresso se ne apre uno fisicamente
    const stages = this.bombModel?.setDefuseProgress?.(this.state.defuseProgress) ?? [];
    if (stages.length && !won) {
      this.audio.stageDefused();
      this.hud.setStatus(`✓ Modulo ${stages[stages.length - 1]}/3 della bomba disinnescato`, '#a4c46a');
      this.particles.burst({
        position: this._bombTopPosition(), color: 0x66ffaa,
        count: 44, speed: 3.2, life: 800,
      });
      this.effects.shake(0.03, 260);
    }

    // Le mani grosse scuotono la scena
    if (score.mult >= 4) {
      this.effects.shake(0.05 + score.mult * 0.01, 320);
      this.effects.flash(score.combo?.color ?? '#ffffff', 0.18);
      const comboHex = score.combo ? new THREE.Color(score.combo.color).getHex() : 0x66ffaa;
      this.particles.burst({
        position: this._bombTopPosition(), color: comboHex,
        count: 26, speed: 2.4, life: 600,
      });
    }

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
    this.effects.flash('#a4c46a', 0.5);
    this.audio.victory();
    this.particles.burst({
      position: this._bombTopPosition(), color: 0x66ffaa,
      count: 60, speed: 4, life: 1100, gravity: 3,
    });
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

  // Punto sopra la bomba (mondo) per particelle e impatti
  _bombTopPosition() {
    const p = this.bombModel?.group?.position;
    return p ? new THREE.Vector3(p.x, p.y + 1.6, p.z) : new THREE.Vector3(-8.8, 2, -4.6);
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
