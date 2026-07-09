// DEFUSE-DECK 3D — CardSystem
//
// Gestisce le carte 3D di ENTRAMBI i giocatori:
//   • Mano persistente del giocatore (8 carte) disposta a ventaglio.
//   • Carte calate dal Warden, mostrate vicino a lui durante il suo turno.
//
// REQUIRES: Fan layout via Math.sin / Math.cos per posizione e rotazione radiale
// REQUIRES: Hierarchical — ogni carta è un Card3D (Group → Mesh figli)
// REQUIRES: tween.js — pesca/scarto/giocata e comparsa delle carte nemiche

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { Card3D } from '../scene/Card3D.js';
import { ENEMY_POS } from '../scene/config.js';

const SUITS  = ['volt', 'wire', 'chip', 'cap'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const HAND_SIZE = 8;

export class CardSystem {
  constructor(scene) {
    this.scene      = scene;
    this.hand       = [];               // Card3D[] del giocatore
    this.deck       = this._generateDeck();
    this.discardPile = [];              // dati carta scartati/giocati (per il reshuffle)
    this.enemyCards = [];               // Card3D[] mostrati durante il turno del Warden
    this.sortMode   = 'value';          // 'value' | 'suit' — ordinamento del ventaglio
    this.deckModel  = null;             // mazzo 3D sul banco (assegnato da main.js)
  }

  get deckCount() { return this.deck.length; }

  setDeckModel(deckModel) {
    this.deckModel = deckModel;
    this._syncDeckVisual();
  }

  // Allinea le pile 3D (mazzo + scarti) ai conteggi reali
  _syncDeckVisual() {
    this.deckModel?.setCount(this.deck.length);
    this.deckModel?.setDiscardCount(this.discardPile.length);
  }

  // ── Ordinamento della mano ──────────────────────────────────────────────────
  // 'value': decrescente per valore. 'suit': raggruppa per seme, poi per valore.
  toggleSort() {
    this.sortMode = this.sortMode === 'value' ? 'suit' : 'value';
    this._sortHand();
    this._arrangeFan();
    return this.sortMode;
  }

  _sortHand() {
    const suitOrder = (s) => SUITS.indexOf(s);
    this.hand.sort((a, b) =>
      this.sortMode === 'value'
        ? b.value - a.value || suitOrder(a.suit) - suitOrder(b.suit)
        : suitOrder(a.suit) - suitOrder(b.suit) || b.value - a.value
    );
  }

  // ── Mazzo ───────────────────────────────────────────────────────────────────
  _generateDeck() {
    const deck = [];
    SUITS.forEach(suit => {
      VALUES.forEach(value => {
        // Le carte alte valgono più "chips" (game design Balatro-like)
        deck.push({ suit, value, voltage: Math.round(value * 1.9) });
      });
    });
    return this._shuffle(deck);
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Pesca `count` dati-carta, rimescolando gli scarti se il mazzo si esaurisce
  _drawData(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        this.deck = this._shuffle(this.discardPile);
        this.discardPile = [];
        if (this.deck.length === 0) this.deck = this._generateDeck();
        // La pila degli scarti torna nel mazzo: animazione + suono di riffle
        this.deckModel?.shuffle();
        window.App?.audio?.shuffle?.();
      }
      out.push(this.deck.shift());
    }
    return out;
  }

  // ── Distribuzione iniziale ──────────────────────────────────────────────────
  deal(count = HAND_SIZE) {
    this.clearHand();
    this._drawData(count).forEach(data => this._spawnHandCard(data));
    this._sortHand();
    this._arrangeFan();
    this._syncDeckVisual();
    return this.hand;
  }

  // Pesca fino a riempire di nuovo la mano e ridispone il ventaglio
  drawToFull() {
    const need = HAND_SIZE - this.hand.length;
    if (need > 0) this._drawData(need).forEach(data => this._spawnHandCard(data));
    this._sortHand();
    this._arrangeFan();
    this._syncDeckVisual();
    return this.hand;
  }

  _spawnHandCard(data) {
    const card = new Card3D(data);
    this.hand.push(card);
    this.scene.add(card.group);
  }

  // ── Rimozione carte (giocate o scartate) ───────────────────────────────────
  // Rimuove i Card3D dalla mano e dalla scena, conserva i dati negli scarti.
  removeCards(cards) {
    cards.forEach(card => {
      this.discardPile.push({ suit: card.suit, value: card.value, voltage: card.voltage });
      this.scene.remove(card.group);
      this.hand = this.hand.filter(c => c !== card);
    });
    this._arrangeFan();
    this._syncDeckVisual();
  }

  // ── Layout a ventaglio (giocatore) ──────────────────────────────────────────
  // REQUIRES: Math.sin / Math.cos per posizionamento e rotazione radiale.
  // Le carte stanno su un arco nel piano XZ; ogni carta "guarda" il centro
  // dell'arco (verso il giocatore). Lo spread si adatta al numero di carte.
  _arrangeFan() {
    const N = this.hand.length;
    if (N === 0) return;

    const arcRadius  = 7.0;
    const arcCenter  = new THREE.Vector3(0, 0.3, 3.6 + arcRadius);
    const totalAngle = Math.min(0.115 * (N - 1), 0.82);  // spread adattivo (compatto → entra in 1ª persona)
    const tiltX      = -Math.PI / 4.5;                   // ~40° verso camera

    let drawIndex = 0;   // per sfalsare le carte appena pescate dal mazzo

    this.hand.forEach((card, i) => {
      const t     = N === 1 ? 0 : (i / (N - 1) - 0.5) * 2;   // ∈ [-1, +1]
      const angle = t * (totalAngle / 2);

      // REQUIRES: sin/cos — posizione sulla curva dell'arco
      const px = Math.sin(angle) * arcRadius;
      const pz = arcCenter.z - Math.cos(angle) * arcRadius;

      // Anima dolcemente verso la nuova posa (le carte appena pescate scivolano in mano)
      const targetPos = new THREE.Vector3(px, arcCenter.y, pz);
      const targetRot = new THREE.Euler(tiltX, angle, t * 0.06);

      // Le carte selezionate restano sollevate anche dopo un riordino
      const lift = card.isSelected ? 0.30 : 0;
      const tiltSel = card.isSelected ? -0.32 : 0;
      const visualPos = { x: targetPos.x, y: targetPos.y + lift, z: targetPos.z };
      const visualRot = { x: targetRot.x + tiltSel, y: targetRot.y, z: card.isSelected ? 0 : targetRot.z };

      if (card._dealt) {
        new Tween(card.group.position).to(visualPos, 260).easing(Easing.Cubic.Out).start();
        new Tween(card.group.rotation).to(visualRot, 260).easing(Easing.Cubic.Out).start();
      } else {
        // Prima comparsa: la carta parte SDRAIATA A FACCIA IN GIÙ in cima al
        // mazzo fisico e vola in mano girandosi (flip di rivelazione).
        const start = this.deckModel?.getTopWorldPosition() ?? new THREE.Vector3(6.5, 3.0, 2.0);
        const delay = drawIndex * 70;   // pescate una alla volta, non in blocco
        drawIndex += 1;

        card.group.position.copy(start);
        card.group.scale.setScalar(0.95);
        // rotation.x = +90°: piatta sul mazzo col fronte verso il tavolo
        card.group.rotation.set(Math.PI / 2, targetRot.y, 0);

        new Tween(card.group.position)
          .to(visualPos, 420).delay(delay).easing(Easing.Back.Out).start();
        new Tween(card.group.rotation)
          .to(visualRot, 420).delay(delay).easing(Easing.Cubic.Out).start();
        new Tween(card.group.scale)
          .to({ x: 1, y: 1, z: 1 }, 420).delay(delay).easing(Easing.Cubic.Out).start();
        card._dealt = true;
      }

      // Posa base aggiornata (usata da hover/selezione in InputManager)
      card.basePos.copy(targetPos);
      card.baseRot.copy(targetRot);
    });
  }

  // ── Carte del WARDEN ────────────────────────────────────────────────────────
  // Mostra le carte che il nemico ha calato, in un ventaglio sospeso davanti a lui.
  // Se `origin` è fornito (posizione mondo dell'artiglio), le carte volano da lì
  // al proprio posto nel ventaglio — il Warden le "lancia" fisicamente.
  // REQUIRES: Math.sin/cos per il ventaglio · tween.js per la comparsa.
  showEnemyPlay(cardDataArray, origin = null) {
    this.clearEnemyPlay();
    const N = cardDataArray.length;
    if (N === 0) return;

    // Centro del ventaglio: davanti al Warden, leggermente più in basso, verso la camera
    const center     = new THREE.Vector3(ENEMY_POS.x, ENEMY_POS.y - 0.6, ENEMY_POS.z + 2.4);
    // Spaziatura FISSA maggiore della larghezza carta (0.62 × scala 1.15 ≈ 0.71):
    // così le carte restano affiancate e leggibili invece di sovrapporsi.
    const spacing    = 0.82;
    const totalAngle = Math.min(0.16 * (N - 1), 0.7);

    cardDataArray.forEach((data, i) => {
      const card = new Card3D(data);
      card.group.userData = {};   // non interagibile col raycaster

      const t     = N === 1 ? 0 : (i / (N - 1) - 0.5) * 2;
      const angle = t * (totalAngle / 2);
      const px = center.x + (i - (N - 1) / 2) * spacing;
      const py = center.y - Math.abs(t) * 0.14;   // lieve arco: i bordi scendono
      const pz = center.z + i * 0.03;             // sfalsa in Z (niente z-fighting)

      // Le carte del nemico guardano la camera: fronte (+z) verso la camera,
      // lieve inclinazione verso l'alto (la camera è sopraelevata) e ventaglio in Y.
      const finalRot = new THREE.Euler(-0.34, angle * 0.6, t * 0.05);
      // Parte dall'artiglio del Warden (se fornito) o appena sopra lo slot
      if (origin) card.group.position.copy(origin);
      else        card.group.position.set(px, py + 0.6, pz - 0.5);
      // Parte di dorso (ruotata di 180° sull'asse Y) e si gira rivelandosi
      card.group.rotation.set(finalRot.x, finalRot.y + Math.PI, finalRot.z);
      card.group.scale.setScalar(origin ? 0.15 : 0.01);
      this.scene.add(card.group);
      this.enemyCards.push(card);

      // Volo verso lo slot (in sincrono con i flick del gomito) + flip di rivelazione
      const dur = origin ? 420 : 360;
      new Tween(card.group.position)
        .to({ x: px, y: py, z: pz }, dur).delay(i * 90).easing(Easing.Cubic.Out).start();
      new Tween(card.group.scale)
        .to({ x: 1.15, y: 1.15, z: 1.15 }, dur).delay(i * 90).easing(Easing.Back.Out).start();
      new Tween(card.group.rotation)
        .to({ y: finalRot.y }, 420).delay(i * 90 + 200).easing(Easing.Cubic.Out).start();
    });
  }

  clearEnemyPlay() {
    this.enemyCards.forEach((card, i) => {
      const drift = (Math.random() - 0.5) * 1.6;
      // Le carte si disintegrano volando verso l'alto con una vite
      new Tween(card.group.position)
        .to({ x: card.group.position.x + drift, y: card.group.position.y + 1.4, z: card.group.position.z - 0.8 }, 340)
        .delay(i * 40).easing(Easing.Quadratic.In).start();
      new Tween(card.group.rotation)
        .to({ z: (Math.random() - 0.5) * 2.5, y: card.group.rotation.y + drift }, 340)
        .delay(i * 40).easing(Easing.Quadratic.In).start();
      new Tween(card.group.scale)
        .to({ x: 0.01, y: 0.01, z: 0.01 }, 320).delay(i * 40 + 60).easing(Easing.Cubic.In)
        .onComplete(() => this.scene.remove(card.group)).start();
    });
    this.enemyCards = [];
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  clearHand() {
    this.hand.forEach(c => this.scene.remove(c.group));
    this.hand = [];
  }

  getCardGroups() { return this.hand.map(c => c.group); }

  computeVoltage(cards) { return cards.reduce((sum, c) => sum + c.voltage, 0); }
}
