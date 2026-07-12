// DEFUSE-DECK 3D — GameManager (orchestratore)
//
// DUELLO a turni stile Balatro contro il Warden.
//   • All'inizio SCEGLI UN JOKER (modificatore 3D sul banco, dal concept).
//   • TU giochi mani di poker → carichi la barra DISINNESCO (verde);
//     ogni 25% un modulo della bomba si apre fisicamente.
//   • IL WARDEN cala le sue carte con l'artiglio → carica il SOVRACCARICO.
//   • Chi riempie per primo la propria barra vince: tu disinneschi, lui detona.
//
// Responsabilità: SOLO la sequenza di gioco. Ogni dominio è delegato:
//   core/GameState   → stato e regole (puro)
//   core/combos      → valutazione delle mani (puro)
//   core/jokers      → modificatori di punteggio (puro)
//   core/difficulty  → parametri dei livelli (puro)
//   ui/HUD           → tutto il DOM
//   systems/Audio    → effetti sonori procedurali
//   systems/Effects  → camera shake e flash
//   systems/Particles→ burst di scintille (THREE.Points)
//   systems/Jokers   → offerta/scelta dei joker 3D
//   scene/*          → resa 3D (reazioni di Warden e bomba)

import * as THREE from 'three';
import { scoreHand, bestHand } from './core/combos.js';
import { GameState, GamePhase, RULES } from './core/GameState.js';
import { JOKERS, applyJokers } from './core/jokers.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from './core/difficulty.js';
import { t, comboLabel } from './core/i18n.js';

// Tempi della sequenza del turno nemico (ms)
const ENEMY_TIMING = Object.freeze({
  CARDS_DELAY: 300,     // le carte partono dall'artiglio dopo il wind-up del braccio
  CHARGE_DELAY: 950,    // il Warden carica l'energia dopo aver calato le carte
  IMPACT_DELAY: 1500,   // l'energia colpisce la bomba
  CLEANUP_DELAY: 1500,  // le carte del nemico spariscono, torna il tuo turno
});

// Cinematica sulla bomba: la camera impiega CAM_IN ms ad arrivare; l'apertura
// del modulo (e le particelle) partono in sincrono all'arrivo, poi la camera
// indugia CAM_HOLD ms e torna alla vista precedente in CAM_OUT ms.
const BOMB_CINE = Object.freeze({
  CAM_IN: 750, CAM_HOLD: 1500, CAM_OUT: 850,
});

export class GameManager {
  constructor({
    hud, audio, effects, particles,
    sceneManager, roomModel, cardSystem, enemyAI, enemyModel, bombModel, jokerSystem,
  }) {
    this.hud        = hud;
    this.audio      = audio;
    this.effects    = effects;
    this.particles  = particles;
    this.scene      = sceneManager;
    this.roomModel  = roomModel;
    this.cards      = cardSystem;
    this.enemyAI    = enemyAI;
    this.enemyModel = enemyModel;
    this.bombModel  = bombModel;
    this.jokers     = jokerSystem;
    this.input      = null;   // assegnato via attachInput()

    this.difficulty     = DEFAULT_DIFFICULTY;
    this.activeJokerDef = null;

    // La partita parte in fase CHOOSING: prima si sceglie il joker
    this.state = new GameState(RULES, GamePhase.CHOOSING);
    hud.bindState(this.state);

    this._banner('banner.standby', '#98927f');
    this._status('status.systemActive', '#98927f');
    hud.setThreat(this.enemyAI.threatMultiplier());
    hud.setDeckCount(this.cards.deckCount);
    this._refreshActions(0);
  }

  attachInput(inputManager) { this.input = inputManager; }

  // ── Banner / stato con memoria (per il cambio lingua a partita in corso) ─────
  // Memorizzano l'ultima chiave i18n + variabili, così relocalize() può
  // ri-renderizzare nella nuova lingua. Le variabili possono contenere getter
  // (es. nome joker) così restano corrette anche dopo il cambio.
  _banner(key, color, vars) {
    this._lastBanner = { key, color, vars };
    this.hud.setTurnBanner(t(key, vars), color);
  }

  _status(key, color, vars) {
    this._lastStatus = { key, color, vars };
    this.hud.setStatus(t(key, vars), color);
  }

  relocalize() {
    const b = this._lastBanner, s = this._lastStatus;
    if (b) this.hud.setTurnBanner(t(b.key, b.vars), b.color);
    if (s) this.hud.setStatus(t(s.key, s.vars), s.color);
  }

  // ── Accessori di compatibilità (usati da InputManager) ──────────────────────
  get phase()        { return this.state.phase; }
  get isOver()       { return this.state.isOver; }
  get discardsLeft() { return this.state.discardsLeft; }
  get isChoosingJoker() { return this.state.phase === GamePhase.CHOOSING; }

  // Punteggio del giocatore: base (combos) + joker attivo
  computeHandScore(cards) {
    const jokers = this.activeJokerDef ? [this.activeJokerDef] : [];
    return applyJokers(scoreHand(cards), cards, jokers);
  }

  // Miglior mano TENENDO CONTO del joker attivo (scorer personalizzato)
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

  // ── Fase 0: scelta del joker ─────────────────────────────────────────────────
  startJokerChoice() {
    this.jokers.offer(JOKERS);
    this._banner('banner.chooseJoker', '#e5ae32');
    this.hud.pulseTurnBanner();
    this._status('status.chooseJoker', '#98927f');
  }

  chooseJoker(model) {
    if (!this.isChoosingJoker) return;
    const def = this.jokers.choose(model);
    if (!def) return;

    this.activeJokerDef = def;
    this.hud.setJoker(def);
    this.audio.jokerPick();
    this.particles.burst({
      position: model.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
      color: def.color, count: 30, speed: 2.2, life: 650, gravity: 2.5,
    });

    // Inizia il duello vero e proprio: la mano viene DISTRIBUITA ORA,
    // così si vede volare carta per carta dal mazzo fisico sul banco.
    this.state.beginDuel();
    this.cards.deal(8);
    this.audio.cardDraw();
    this.hud.setDeckCount(this.cards.deckCount);
    this._banner('banner.yourTurn', '#a4c46a');
    this.hud.pulseTurnBanner();
    // vars con getter: nome/descrizione restano localizzati anche dopo un cambio lingua
    this._status('status.jokerActive', '#e5ae32', {
      get name() { return def.name; },
      get desc() { return def.desc; },
    });
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
    // Indicatore di progresso: i tubi sul muro dietro il Warden si accendono
    // dal basso verso l'alto man mano che sale il disinnesco.
    this.roomModel?.setDefuseProgress?.(this.state.defuseProgress);

    // Moduli della bomba: ogni 25% di progresso se ne apre uno fisicamente.
    // L'apertura è posticipata di CAM_IN ms: la cinematica porta la camera
    // sulla bomba e il modulo scatta quando è in quadro.
    const stages = this.bombModel?.setDefuseProgress?.(this.state.defuseProgress, BOMB_CINE.CAM_IN) ?? [];
    if (stages.length && !won) {
      this._status('status.moduleDefused', '#a4c46a', { n: stages[stages.length - 1] });
      this.scene.focusOnBomb?.({ inMs: BOMB_CINE.CAM_IN, holdMs: BOMB_CINE.CAM_HOLD, outMs: BOMB_CINE.CAM_OUT });
      // Audio, shake e particelle sincronizzati sull'apertura di ciascun modulo,
      // con i burst centrati sull'elemento che si sta aprendo (serratura/pannello)
      stages.forEach((n, i) => setTimeout(() => {
        this.audio.stageDefused();
        this.effects.shake(0.03, 260);
        this.particles.burst({
          position: this.bombModel?.getStageWorldPosition?.(n) ?? this._bombTopPosition(),
          color: 0x66ffaa, count: 46, speed: 3.4, life: 850, size: 0.09,
        });
        // Coda luminosa: secondo burst più morbido subito dopo lo scatto
        setTimeout(() => this.particles.burst({
          position: this.bombModel?.getStageWorldPosition?.(n) ?? this._bombTopPosition(),
          color: 0xaaffdd, count: 22, speed: 1.8, life: 700, gravity: 2.2, size: 0.06,
        }), 240);
      }, BOMB_CINE.CAM_IN + 60 + i * 260));

      // Mostrata l'apertura del modulo, la bomba torna dritta com'era all'inizio.
      // Parte quando la camera inizia il dolly-out (fine dell'hold) e dura quanto
      // il ritorno, così si raddrizza mentre si torna alla vista normale.
      setTimeout(
        () => this.bombModel?.resetOrientation?.(BOMB_CINE.CAM_OUT),
        BOMB_CINE.CAM_IN + BOMB_CINE.CAM_HOLD,
      );
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
    this._banner('banner.wardenPlays', '#d95b38');
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
    const total = score.total, comboName = score.combo.name;
    this._status('status.suggested', '#e5ae32', {
      get combo() { return comboLabel(comboName); }, v: total,
    });
    return cards;
  }

  // ── Fine partita ────────────────────────────────────────────────────────────
  _win() {
    this._status('status.defused', '#a4c46a');
    this._banner('banner.win', '#a4c46a');
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
    this._status('status.gameOver', '#d95b38');
    this._banner('banner.wardenWins', '#d95b38');
    this.cards.clearEnemyPlay();
    this.enemyModel?.triumph?.();

    // Cinematica: la camera corre sulla bomba, la detonazione parte quando è
    // in quadro (hold più lungo: l'esplosione dura ~1.1 s + detriti).
    this.scene.focusOnBomb?.({ inMs: 620, holdMs: 2200, outMs: 950 });
    setTimeout(() => {
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
    }, 640);

    this._refreshActions(0);
    this._showEnd(false);
  }

  _showEnd(won) {
    this.hud.showEndScreen({
      won,
      stats: this.state.stats,
      turn: this.state.turn,
      difficultyName: this.difficulty.name,
      jokerName: this.activeJokerDef?.name ?? null,
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
