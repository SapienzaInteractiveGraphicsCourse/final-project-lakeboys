// DEFUSE-DECK 3D — scene/DeckModel
//
// Il MAZZO fisico sul banco + la PILA DEGLI SCARTI accanto.
// La pila del mazzo si assottiglia man mano che peschi; gli scarti crescono
// disordinati; quando il mazzo si esaurisce parte l'animazione di rimescolata.
//
// REQUIRES: Hierarchical model — Deck (Group) → DeckStack (Group di slab)
//           → TopOrnament (Group: cornice + emblema). Idem DiscardStack.
// REQUIRES: tween.js — rimescolata (wobble + hop) e discesa dell'ornamento.
// REQUIRES: Procedural animation — pulsazione dell'emblema via Math.sin.

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { DECK_POS, DISCARD_POS } from './config.js';

const SLAB_H     = 0.026;   // spessore visivo di uno "strato" di carte
const MAX_SLABS  = 10;      // strati visibili a mazzo pieno (40 carte → 4 per strato)
const CARDS_PER_SLAB = 4;

export class DeckModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Deck';

    this._deckSlabs    = [];
    this._discardSlabs = [];
    this._deckVisible    = MAX_SLABS;
    this._discardVisible = 0;

    this._buildDeckStack();
    this._buildDiscardStack();
  }

  // ── Materiali ────────────────────────────────────────────────────────────────
  _matBack() {
    return new THREE.MeshStandardMaterial({
      color: 0x101a2e, roughness: 0.45, metalness: 0.35,
    });
  }
  _matEdge() {
    return new THREE.MeshStandardMaterial({
      color: 0x2a3a55, roughness: 0.6, metalness: 0.4,
    });
  }
  _matAccent() {
    return new THREE.MeshStandardMaterial({
      color: 0x5588cc, emissive: 0x4488dd, emissiveIntensity: 0.8,
      roughness: 0.3, metalness: 0.3,
    });
  }

  // ── Mazzo ────────────────────────────────────────────────────────────────────
  _buildDeckStack() {
    this.deckStack = new THREE.Group();
    this.deckStack.name = 'DeckStack';
    this.deckStack.position.copy(DECK_POS);

    const slabGeom = new THREE.BoxGeometry(0.66, SLAB_H, 0.92);
    for (let i = 0; i < MAX_SLABS; i++) {
      const slab = new THREE.Mesh(slabGeom, i % 2 ? this._matBack() : this._matEdge());
      slab.position.y = SLAB_H / 2 + i * SLAB_H;
      // lieve sfasamento per non sembrare un blocco unico
      slab.rotation.y = Math.sin(i * 7.31) * 0.05;
      slab.castShadow = slab.receiveShadow = true;
      this.deckStack.add(slab);
      this._deckSlabs.push(slab);
    }

    // Ornamento del dorso sulla carta in cima: cornice + emblema pulsante
    this.topOrnament = new THREE.Group();
    this.topOrnament.name = 'TopOrnament';
    const rim = this._matAccent();
    const T = 0.012;
    [[0, 0.42, 0.6, T], [0, -0.42, 0.6, T], [0.28, 0, T, 0.86], [-0.28, 0, T, 0.86]]
      .forEach(([x, z, w, d]) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), rim);
        bar.position.set(x, 0, z);
        this.topOrnament.add(bar);
      });
    this.emblem = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 8, 24), this._matAccent());
    this.emblem.rotation.x = Math.PI / 2;
    this.topOrnament.add(this.emblem);

    this._placeOrnament(MAX_SLABS, false);
    this.deckStack.add(this.topOrnament);
    this.group.add(this.deckStack);
  }

  // ── Pila degli scarti ────────────────────────────────────────────────────────
  _buildDiscardStack() {
    this.discardStack = new THREE.Group();
    this.discardStack.name = 'DiscardStack';
    this.discardStack.position.copy(DISCARD_POS);

    const slabGeom = new THREE.BoxGeometry(0.66, SLAB_H, 0.92);
    for (let i = 0; i < MAX_SLABS; i++) {
      const slab = new THREE.Mesh(slabGeom, this._matBack());
      slab.position.set(
        Math.sin(i * 12.9898) * 0.06,          // jitter deterministico:
        SLAB_H / 2 + i * SLAB_H,               // la pila degli scarti è disordinata
        Math.sin(i * 78.233) * 0.06,
      );
      slab.rotation.y = Math.sin(i * 4.57) * 0.28;
      slab.castShadow = slab.receiveShadow = true;
      slab.visible = false;
      this.discardStack.add(slab);
      this._discardSlabs.push(slab);
    }
    this.group.add(this.discardStack);
  }

  // ── API: sincronizza le pile con i conteggi reali ────────────────────────────
  setCount(deckCount) {
    const k = Math.max(0, Math.min(MAX_SLABS, Math.ceil(deckCount / CARDS_PER_SLAB)));
    if (k === this._deckVisible) return;
    this._deckVisible = k;
    this._deckSlabs.forEach((s, i) => { s.visible = i < k; });
    this._placeOrnament(k, true);
  }

  setDiscardCount(discardCount) {
    const k = Math.max(0, Math.min(MAX_SLABS, Math.ceil(discardCount / CARDS_PER_SLAB)));
    if (k === this._discardVisible) return;
    this._discardVisible = k;
    this._discardSlabs.forEach((s, i) => { s.visible = i < k; });
  }

  _placeOrnament(k, animate) {
    const y = k * SLAB_H + 0.006;
    this.topOrnament.visible = k > 0;
    if (animate) {
      new Tween(this.topOrnament.position).to({ y }, 220).easing(Easing.Cubic.Out).start();
    } else {
      this.topOrnament.position.y = y;
    }
  }

  // ── API: punti mondo per le animazioni delle carte ──────────────────────────
  // Le carte pescate nascono in cima al mazzo…
  getTopWorldPosition(target = new THREE.Vector3()) {
    return target.set(DECK_POS.x, DECK_POS.y + this._deckVisible * SLAB_H + 0.03, DECK_POS.z);
  }

  // …e quelle scartate atterrano in cima alla pila degli scarti.
  getDiscardTopPosition(target = new THREE.Vector3()) {
    return target.set(DISCARD_POS.x, DISCARD_POS.y + (this._discardVisible + 1) * SLAB_H + 0.02, DISCARD_POS.z);
  }

  // ── API: rimescolata (il mazzo "saltella" e si riassesta) ────────────────────
  // REQUIRES: tween.js — hop + wobble in catena, nessun keyframe.
  shuffle() {
    const y0 = this.deckStack.position.y;
    new Tween(this.deckStack.position)
      .to({ y: y0 + 0.22 }, 140).easing(Easing.Quadratic.Out)
      .chain(new Tween(this.deckStack.position).to({ y: y0 }, 200).easing(Easing.Bounce.Out))
      .start();
    new Tween(this.deckStack.rotation)
      .to({ y: 0.4 }, 150).easing(Easing.Quadratic.Out)
      .chain(
        new Tween(this.deckStack.rotation).to({ y: -0.25 }, 150).easing(Easing.Quadratic.InOut)
          .chain(new Tween(this.deckStack.rotation).to({ y: 0 }, 220).easing(Easing.Elastic.Out))
      )
      .start();
  }

  // ── Idle per frame ────────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — l'emblema del dorso respira via Math.sin.
  update(t) {
    if (this.emblem && this.topOrnament.visible) {
      this.emblem.material.emissiveIntensity = 0.7 + Math.sin(t * 2.1) * 0.35;
    }
  }
}
