// DEFUSE-DECK 3D — EnemyAI
//
// Il "cervello" del Warden: gioca davvero a carte contro di te.
// Ogni turno pesca una mano dal proprio mazzo, sceglie la migliore combo
// possibile (via bestHand) e la gioca per caricare la bomba (SOVRACCARICO).
//
// Logica pura: nessuna dipendenza da Three.js. La resa 3D delle sue carte
// è gestita da CardSystem; qui decidiamo solo *cosa* gioca e *quanto* vale.

import { bestHand } from './combos.js';

const SUITS  = ['volt', 'wire', 'chip', 'cap'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export class EnemyAI {
  constructor() {
    this.handSize   = 7;        // pesca ampia → trova combo migliori
    this.escalation = 0.08;     // crescita di minaccia per turno (vedi core/difficulty)
    this.deck       = this._freshDeck();
    this.discard    = [];
    this.turn       = 0;        // numero di turni giocati (per l'escalation)
  }

  // Applica i parametri del livello di difficoltà scelto (core/difficulty.js)
  configure({ enemyHandSize, escalation } = {}) {
    if (enemyHandSize) this.handSize = enemyHandSize;
    if (escalation)    this.escalation = escalation;
  }

  // ── Mazzo ──────────────────────────────────────────────────────────────────
  _freshDeck() {
    const deck = [];
    SUITS.forEach(suit => {
      VALUES.forEach(value => deck.push({ suit, value, voltage: Math.round(value * 1.9) }));
    });
    return this._shuffle(deck);
  }

  _shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _draw(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        // Rimescola gli scarti quando il mazzo si esaurisce
        this.deck = this._shuffle(this.discard);
        this.discard = [];
        if (this.deck.length === 0) this.deck = this._freshDeck();
      }
      out.push(this.deck.shift());
    }
    return out;
  }

  // ── Escalation ──────────────────────────────────────────────────────────────
  // Il Warden diventa più aggressivo col passare dei turni: non puoi temporeggiare.
  // Moltiplicatore di minaccia: 1.0 al primo turno, cresce di `escalation` a turno.
  threatMultiplier() {
    return 1 + this.turn * this.escalation;
  }

  // ── Gioca un turno ──────────────────────────────────────────────────────────
  // Ritorna:
  //   { playedCards, score, damage, threat, combo }
  // - playedCards: le carte (data) effettivamente calate, da mostrare in 3D
  // - score: oggetto scoreHand della combo scelta
  // - damage: SOVRACCARICO inflitto alla bomba (score.total × escalation)
  playTurn() {
    const hand   = this._draw(this.handSize);
    const choice = bestHand(hand, 5);
    const played = choice.cards;

    // Le carte non giocate tornano nel mazzo scarti; quelle giocate sono "bruciate"
    const playedSet = new Set(played);
    hand.forEach(c => { if (!playedSet.has(c)) this.discard.push(c); });
    this.discard.push(...played);

    const threat = this.threatMultiplier();
    const damage = Math.round(choice.score.total * threat);
    this.turn += 1;

    return {
      playedCards: played,
      score: choice.score,
      combo: choice.score.combo,
      threat,
      damage,
    };
  }

  reset() {
    this.deck    = this._freshDeck();
    this.discard = [];
    this.turn    = 0;
  }
}
