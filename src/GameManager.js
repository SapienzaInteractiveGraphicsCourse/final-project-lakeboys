// DEFUSE-DECK 3D — GameManager (orchestratore)
//
// DUELLO a turni stile Balatro contro il Warden.
//   • TU giochi mani di poker → carichi la barra DISINNESCO (verde);
//     ogni 25% un modulo della bomba si apre fisicamente.
//   • IL WARDEN cala le sue carte con l'artiglio → carica il SOVRACCARICO.
//   • Chi riempie per primo la propria barra vince: tu disinneschi, lui detona.
//
// Responsabilità: SOLO la sequenza di gioco. Ogni dominio è delegato:
//   core/GameState   → stato e regole (puro)
//   core/combos      → valutazione delle mani (puro)
//   core/difficulty  → parametri dei livelli (puro)
//   ui/HUD           → tutto il DOM
//   systems/Audio    → effetti sonori procedurali
//   systems/Effects  → camera shake e flash
//   systems/Particles→ burst di scintille (THREE.Points)
//   scene/*          → resa 3D (reazioni di Warden e bomba)

import * as THREE from 'three';
import { scoreHand, bestHand } from './core/combos.js';
import { GameState, GamePhase, RULES } from './core/GameState.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from './core/difficulty.js';

// Tempi della sequenza del turno nemico (ms)
const ENEMY_TIMING = Object.freeze({
  CARDS_DELAY: 300,     // le carte partono dall'artiglio dopo il wind-up del braccio
  CHARGE_DELAY: 950,    // il Warden carica l'energia dopo aver calato le carte
  IMPACT_DELAY: 1500,   // l'energia colpisce la bomba
  CLEANUP_DELAY: 1500,  // le carte del nemico spariscono, torna il tuo turno
});

export class GameManager {
  constructor({
    hud, audio, effects, particles,
    sceneManager, cardSystem, enemyAI, enemyModel, bombModel,
  }) {
    this.hud        = hud;
    this.audio      = audio;
    this.effects    = effects;
    this.particles  = particles;
    this.scene      = sceneManager;
    this.cards      = cardSystem;
    this.enemyAI    = enemyAI;
    this.enemyModel = enemyModel;
    this.bombModel  = bombModel;
    this.input      = null;   // assegnato via attachInput()

    this.difficulty = DEFAULT_DIFFICULTY;

    this.state = new GameState(RULES);
    hud.bindState(this.state);

    hud.setTurnBanner('· STANDBY ·', '#98927f');
    hud.setStatus('■ Sistema attivo — disinnesca prima che il Warden detoni');
    hud.setThreat(this.enemyAI.threatMultiplier());
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

  // ── Difficoltà (selezionata nel tutorial, prima dell'inizio) ────────────────
  applyDifficulty(id) {
    this.difficulty = DIFFICULTIES[id] ?? DEFAULT_DIFFICULTY;
    this.state.applyDifficulty(this.difficulty);
    this.enemyAI.configure(this.difficulty);
    this.hud.updateMeters();
    this.hud.setThreat(this.enemyAI.threatMultiplier());
  }

  // ── Avvio del duello (dopo il tutorial) ─────────────────────────────────────
  // La mano viene DISTRIBUITA ORA, così si vede volare carta per carta
  // dal mazzo fisico sul banco.
  startDuel() {
    this.cards.deal(8);
    this.audio.cardDraw();
    this.hud.setDeckCount(this.cards.deckCount);
    this.hud.setTurnBanner('► TUO TURNO', '#a4c46a');
    this.hud.pulseTurnBanner();
    this.showPotentialVoltage(this.input?.selectedCards ?? []);
  }

  // ── Preview durante la selezione ────────────────────────────────────────────
  showPotentialVoltage(cards) {
    const count = cards?.length ?? 0;
    if (count > 0) this.enemyModel?.lockOn?.();
    this.hud.showSelection(count ? this.computeHandScore(cards) : null, count);
    this._refreshActions(count);
  }

  // ── Il giocatore gioca la mano ──────────────────────────────────────────────
  // Chiamato da InputManager dopo l'animazione delle carte verso la bomba.
  async playPlayerHand(score) {
    if (this.state.isOver || this.state.phase !== GamePhase.PLAYER) return;

    this.enemyModel?.onHandPlayed?.();
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
    this._beginEnemyTurn();
  }

  // ── Turno del Warden ────────────────────────────────────────────────────────
  _beginEnemyTurn() {
    this.state.beginEnemyPhase();
    this.hud.setTurnBanner('◆ IL WARDEN GIOCA…', '#d95b38');
    this._refreshActions(0);

    // 1. Il Warden decide la sua giocata
    const play = this.enemyAI.playTurn();
    this.hud.setThreat(this.enemyAI.threatMultiplier());

    // 2. Il braccio si protende (animazione gerarchica) e "lancia" le carte
    this.enemyModel?.dealGesture?.(play.playedCards.length);
    setTimeout(() => {
      const claw = this.enemyModel?.getClawWorldPosition?.() ?? null;
      this.cards.showEnemyPlay(play.playedCards, claw);
      this.audio.enemyPlay();
    }, ENEMY_TIMING.CARDS_DELAY);

    // 3. Reazione fisica: carica energia verso la bomba (più forte se combo alta)
    setTimeout(() => {
      const power = Math.min(play.combo?.mult ?? 1, 8) / 8;   // 0..1
      this.enemyModel?.playCharge?.(power);
    }, ENEMY_TIMING.CHARGE_DELAY);

    // 4. Impatto: applica il danno, aggiorna l'HUD, scuoti la scena
    setTimeout(() => {
      this.hud.showEnemyResult(play);
      const lost = this.state.applyEnemyPlay(play);

      this.hud.floatGain(play.damage, '#d95b38', 'overcharge');
      this.bombModel?.pulse?.();
      this.audio.enemyImpact();
      this.effects.shake(0.04 + (play.combo?.mult ?? 1) * 0.012, 380);
      this.particles.burst({
        position: this._bombTopPosition(), color: 0xff4422,
        count: Math.min(24 + Math.round(play.damage / 12), 60),
        speed: 3.6, life: 700,
      });

      if (this.state.inDanger && !lost) this.audio.alarm();
      if (lost) { this._lose(); return; }

      // 5. Sgombra le carte del nemico e ridà il turno al giocatore
      setTimeout(() => {
        this.cards.clearEnemyPlay();
        this._endEnemyTurn();
      }, ENEMY_TIMING.CLEANUP_DELAY);
    }, ENEMY_TIMING.IMPACT_DELAY);
  }

  _endEnemyTurn() {
    if (this.state.isOver) return;
    this.state.beginPlayerTurn();
    const selected = this.input?.selectedCards ?? [];
    this.showPotentialVoltage(selected);
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
    this.enemyModel?.defeat?.();
    this.particles.burst({
      position: this._bombTopPosition(), color: 0x66ffaa,
      count: 60, speed: 4, life: 1100, gravity: 3,
    });
    this._refreshActions(0);
    this._showEnd(true);
  }

  _lose() {
    this.hud.setStatus('☠ GAME OVER — BOOM', '#d95b38');
    this.hud.setTurnBanner('✖ IL WARDEN HA VINTO', '#d95b38');
    this.cards.clearEnemyPlay();
    this.enemyModel?.triumph?.();
    this.bombModel?.triggerDefuseFail?.(3);   // include il camera shake dell'esplosione
    this.audio.explosion();
    // Detriti incandescenti in due ondate
    this.particles.burst({
      position: this._bombTopPosition(), color: 0xff6622,
      count: 70, speed: 6, life: 1300, gravity: 6, size: 0.11,
    });
    setTimeout(() => this.particles.burst({
      position: this._bombTopPosition(), color: 0xffcc44,
      count: 40, speed: 4, life: 1000, gravity: 5,
    }), 200);
    setTimeout(() => this.effects.flash('#d95b38', 0.9), 120);
    this._refreshActions(0);
    this._showEnd(false);
  }

  _showEnd(won) {
    this.hud.showEndScreen({
      won,
      stats: this.state.stats,
      turn: this.state.turn,
      difficultyName: this.difficulty.name,
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
