// DEFUSE-DECK 3D — systems/JokerSystem
//
// Gestisce la fase di SCELTA DEL JOKER a inizio partita e il joker attivo:
//   1. offer(defs)  → mostra i joker al centro del banco, fluttuanti
//   2. hover        → evidenziazione via Raycaster (delegata da InputManager)
//   3. choose(m)    → il joker scelto si posa sul bordo del banco, gli altri
//                     svaniscono; resta in scena per tutta la partita
//
// REQUIRES: tween.js per comparsa/scelta · Math.sin per l'idle (JokerModel)

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { JokerModel } from '../scene/JokerModel.js';
import { TABLE_TOP_Y } from '../scene/config.js';

// Posizioni dell'offerta (centro banco, davanti al giocatore)
const OFFER_SPOTS = [
  new THREE.Vector3(-2.3, TABLE_TOP_Y, 1.3),
  new THREE.Vector3( 0.0, TABLE_TOP_Y, 1.1),
  new THREE.Vector3( 2.3, TABLE_TOP_Y, 1.3),
];
// Postazione definitiva del joker scelto (bordo destro del banco)
const HOME_SPOT = new THREE.Vector3(4.9, TABLE_TOP_Y, 1.7);

const OFFER_SCALE = 1.5;
const HOME_SCALE  = 1.05;

export class JokerSystem {
  constructor(scene) {
    this.scene      = scene;
    this.offered    = [];      // JokerModel[] durante la scelta
    this.active     = null;    // JokerModel scelto
    this.isChoosing = false;
    this._hovered   = null;
  }

  // ── Offerta iniziale ────────────────────────────────────────────────────────
  offer(defs) {
    this.isChoosing = true;
    defs.slice(0, OFFER_SPOTS.length).forEach((def, i) => {
      const model = new JokerModel(def);
      model.basePos.copy(OFFER_SPOTS[i]);
      model.baseScale = OFFER_SCALE;
      model.floating  = true;

      model.group.position.copy(OFFER_SPOTS[i]);
      model.group.scale.setScalar(0.01);
      this.scene.add(model.group);
      this.offered.push(model);

      new Tween(model.group.scale)
        .to({ x: OFFER_SCALE, y: OFFER_SCALE, z: OFFER_SCALE }, 450)
        .delay(200 + i * 130)
        .easing(Easing.Back.Out)
        .start();
    });
  }

  getPickGroups() { return this.offered.map(m => m.group); }

  setHover(model) {
    if (this._hovered === model) return;
    this._hovered?.setHighlight(false);
    this._hovered = model;
    model?.setHighlight(true);
  }

  // ── Scelta ──────────────────────────────────────────────────────────────────
  // Ritorna la definizione (core/jokers.js) del joker scelto.
  choose(model) {
    if (!this.isChoosing || !this.offered.includes(model)) return null;
    this.isChoosing = false;
    this._hovered = null;
    model.setHighlight(false);

    // Gli altri joker si dissolvono
    this.offered.filter(m => m !== model).forEach((m, i) => {
      new Tween(m.group.scale)
        .to({ x: 0.01, y: 0.01, z: 0.01 }, 300).delay(i * 70).easing(Easing.Cubic.In)
        .onComplete(() => this.scene.remove(m.group))
        .start();
    });

    // Il joker scelto plana sulla sua postazione a bordo banco
    model.floating = false;
    model.baseScale = HOME_SCALE;
    model.basePos.copy(HOME_SPOT);
    new Tween(model.group.position)
      .to({ x: HOME_SPOT.x, y: HOME_SPOT.y, z: HOME_SPOT.z }, 650)
      .easing(Easing.Cubic.InOut)
      .start();
    new Tween(model.group.scale)
      .to({ x: HOME_SCALE, y: HOME_SCALE, z: HOME_SCALE }, 650)
      .easing(Easing.Cubic.InOut)
      .start();
    new Tween(model.group.rotation)
      .to({ y: -0.5 }, 650)   // leggermente ruotato verso il centro del banco
      .easing(Easing.Cubic.InOut)
      .start();

    this.offered = [];
    this.active  = model;
    return model.def;
  }

  // ── Idle per frame ──────────────────────────────────────────────────────────
  update(t) {
    this.offered.forEach(m => m.update(t));
    this.active?.update(t);
  }
}
