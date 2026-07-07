// DEFUSE-DECK 3D — systems/flight
//
// Helper condiviso per far volare un oggetto lungo un ARCO (bezier quadratica).
// Usato per la pescata dal mazzo, la giocata verso la bomba e lo scarto.
//
// REQUIRES: tween.js + animazione procedurale — la traiettoria è calcolata
// via codice ogni frame: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2, dove P1 è il
// punto di controllo sollevato sopra il punto medio.

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';

export function flyArc(obj, to, {
  height = 1.2,                        // quanto si alza l'arco sopra i due estremi
  dur = 400,
  delay = 0,
  easing = Easing.Quadratic.InOut,
  onUpdate = null,
  onComplete = null,
} = {}) {
  const from = obj.position.clone();
  const target = to.clone ? to.clone() : new THREE.Vector3(to.x, to.y, to.z);
  const mid = from.clone().lerp(target, 0.5);
  mid.y = Math.max(from.y, target.y) + height;

  return new Tween({ t: 0 })
    .to({ t: 1 }, dur)
    .delay(delay)
    .easing(easing)
    .onUpdate(({ t }) => {
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      obj.position.set(
        a * from.x + b * mid.x + c * target.x,
        a * from.y + b * mid.y + c * target.y,
        a * from.z + b * mid.z + c * target.z,
      );
      onUpdate?.(t);
    })
    .onComplete(() => onComplete?.())
    .start();
}
