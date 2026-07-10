// DEFUSE-DECK 3D — systems/Particles
//
// Burst di particelle PROCEDURALI con THREE.Points: scintille per gli impatti
// del Warden, energia verde per i moduli disinnescati, coriandoli per i joker.
//
// REQUIRES: Procedural animation — posizioni e velocità integrate via codice
//           ogni frame (update); nessun sistema particellare importato.

import * as THREE from 'three';

const MAX_BURSTS = 12;   // limite di sicurezza per le performance

export class Particles {
  constructor(scene) {
    this.scene   = scene;
    this._bursts = [];
  }

  // ── Genera un burst ─────────────────────────────────────────────────────────
  // position: THREE.Vector3 (mondo) · color: esadecimale
  burst({
    position,
    color   = 0xffaa33,
    count   = 36,
    speed   = 3.0,     // velocità media iniziale (unità/s)
    life    = 750,     // durata ms
    size    = 0.08,
    gravity = 4.5,     // accelerazione verso il basso (unità/s²)
    upBias  = 0.6,     // spinta iniziale verso l'alto
  } = {}) {
    if (!position || this._bursts.length >= MAX_BURSTS) return;

    const positions  = new Float32Array(count * 3);   // tutte a (0,0,0) locali
    const velocities = new Array(count);
    for (let i = 0; i < count; i++) {
      // Direzione casuale su sfera + bias verso l'alto
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const v     = speed * (0.4 + Math.random() * 0.9);
      velocities[i] = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * v,
        Math.abs(Math.cos(phi)) * v * upBias + v * 0.35,
        Math.sin(phi) * Math.sin(theta) * v,
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color, size,
      transparent: true, opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geom, mat);
    points.position.copy(position);
    this.scene.add(points);

    this._bursts.push({ points, velocities, life, age: 0, gravity });
  }

  // ── Integrazione per frame (dt in ms) ───────────────────────────────────────
  update(dtMs) {
    if (this._bursts.length === 0) return;
    const dt = Math.min(dtMs, 60) / 1000;   // clamp per i tab in background

    this._bursts = this._bursts.filter(b => {
      b.age += dtMs;
      const k = b.age / b.life;
      if (k >= 1) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        return false;
      }

      const pos = b.points.geometry.attributes.position;
      for (let i = 0; i < b.velocities.length; i++) {
        const v = b.velocities[i];
        v.y -= b.gravity * dt;
        pos.array[i * 3]     += v.x * dt;
        pos.array[i * 3 + 1] += v.y * dt;
        pos.array[i * 3 + 2] += v.z * dt;
      }
      pos.needsUpdate = true;
      b.points.material.opacity = 1 - k * k;   // dissolvenza quadratica
      return true;
    });
  }
}
