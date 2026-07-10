// DEFUSE-DECK 3D — scene/JokerModel
//
// Resa 3D dei Joker (core/jokers.js): oggetti da banco costruiti SOLO con
// primitive Three.js, uno per tipo.
//
// REQUIRES: Hierarchical model (≥3 livelli annidati)
//   Joker (Group)
//     └── Body (Group)               ← corpo dell'oggetto
//           └── MovingPart (Group)   ← parte animata proceduralmente
//                 └── Mesh…
//
// REQUIRES: Procedural animation — le parti mobili (lancetta, anelli, lente)
//           oscillano via Math.sin in update(t); niente keyframe.
// REQUIRES: THREE.Raycaster — group.userData.isJoker permette il picking.

import * as THREE from 'three';

export class JokerModel {
  constructor(def) {
    this.def = def;

    this.group = new THREE.Group();
    this.group.name = `Joker_${def.id}`;
    this.group.userData = { isJoker: true, jokerRef: this };

    this.basePos = new THREE.Vector3();
    this.baseScale = 1;
    this.floating = false;      // true durante la fase di scelta
    this._phase = Math.random() * Math.PI * 2;
    this._accentMeshes = [];    // mesh evidenziate all'hover

    // Riferimenti alle parti animate proceduralmente
    this.needle = null;   // multimetro
    this.orb    = null;   // bobina
    this.rings  = [];     // bobina
    this.lensArm = null;  // lente

    this._build();
  }

  _matBody()  { return new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.7 }); }
  _matTrim()  { return new THREE.MeshStandardMaterial({ color: 0x777d88, roughness: 0.25, metalness: 0.95 }); }
  _matAccent() {
    return new THREE.MeshStandardMaterial({
      color: this.def.color, emissive: this.def.color,
      emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2,
    });
  }

  _build() {
    switch (this.def.id) {
      case 'multimetro': this._buildMultimeter(); break;
      case 'bobina':     this._buildTeslaCoil();  break;
      case 'lente':      this._buildLens();       break;
      default:           this._buildMultimeter();
    }
  }

  // ── MULTIMETRO: corpo + quadrante + lancetta oscillante ─────────────────────
  _buildMultimeter() {
    const body = new THREE.Group();
    body.name = 'Body';

    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.36), this._matBody());
    caseMesh.position.y = 0.17;
    caseMesh.rotation.x = -0.28;           // inclinato verso il giocatore
    caseMesh.castShadow = true;
    body.add(caseMesh);

    // Quadrante (schermo emissivo)
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), this._matAccent());
    dial.position.set(0, 0.055, 0.185);
    caseMesh.add(dial);
    this._accentMeshes.push(dial);

    // Lancetta (pivot al centro del quadrante → oscilla in update)
    const needlePivot = new THREE.Group();
    needlePivot.name = 'MovingPart';
    needlePivot.position.set(0, 0, 0.006);
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.11, 0.006),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
    );
    needle.position.y = 0.05;
    needlePivot.add(needle);
    dial.add(needlePivot);
    this.needle = needlePivot;

    // Manopola e morsetti (dettagli)
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), this._matTrim());
    knob.rotation.x = Math.PI / 2 - 0.28;
    knob.position.set(0, -0.09, 0.19);
    caseMesh.add(knob);
    [-0.16, 0.16].forEach(x => {
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.05, 10), this._matTrim());
      plug.rotation.x = Math.PI / 2 - 0.28;
      plug.position.set(x, -0.1, 0.19);
      caseMesh.add(plug);
    });

    this.group.add(body);
  }

  // ── BOBINA TESLA: base + colonna + sfera pulsante + anelli rotanti ──────────
  _buildTeslaCoil() {
    const body = new THREE.Group();
    body.name = 'Body';

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.10, 18), this._matBody());
    base.position.y = 0.05;
    base.castShadow = true;
    body.add(base);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.42, 12), this._matTrim());
    column.position.y = 0.31;
    column.castShadow = true;
    body.add(column);

    // Avvolgimenti (torus impilati)
    const coilMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.4, metalness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const wind = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 20), coilMat);
      wind.rotation.x = Math.PI / 2;
      wind.position.y = 0.16 + i * 0.09;
      body.add(wind);
    }

    // Sfera superiore (pulsazione emissiva in update)
    const orbGroup = new THREE.Group();
    orbGroup.name = 'MovingPart';
    orbGroup.position.y = 0.60;
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 14), this._matAccent());
    orbGroup.add(this.orb);
    this._accentMeshes.push(this.orb);

    // Anelli di energia che ruotano attorno alla sfera
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15 + k * 0.045, 0.008, 6, 24), this._matAccent());
      ring.rotation.x = Math.PI / 2.6 + k * 0.5;
      orbGroup.add(ring);
      this.rings.push(ring);
      this._accentMeshes.push(ring);
    }

    body.add(orbGroup);
    this.group.add(body);
  }

  // ── LENTE DI FOCUS: stativo + braccio snodato + anello con vetro ────────────
  _buildLens() {
    const body = new THREE.Group();
    body.name = 'Body';

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.07, 16), this._matBody());
    foot.position.y = 0.035;
    foot.castShadow = true;
    body.add(foot);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.36, 10), this._matTrim());
    pole.position.y = 0.25;
    body.add(pole);

    // Braccio snodato (pivot in cima allo stativo → oscilla in update)
    const arm = new THREE.Group();
    arm.name = 'MovingPart';
    arm.position.y = 0.43;
    const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), this._matTrim());
    armMesh.rotation.z = Math.PI / 2;
    armMesh.position.x = 0.13;
    arm.add(armMesh);

    // Anello della lente + vetro semitrasparente
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 26), this._matAccent());
    ring.position.x = 0.28;
    arm.add(ring);
    this._accentMeshes.push(ring);

    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 26),
      new THREE.MeshStandardMaterial({
        color: this.def.color, emissive: this.def.color, emissiveIntensity: 0.25,
        transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1,
        side: THREE.DoubleSide,
      })
    );
    glass.position.x = 0.28;
    arm.add(glass);

    body.add(arm);
    this.lensArm = arm;
    this.group.add(body);
  }

  // ── Hover highlight (usato dal Raycaster durante la scelta) ─────────────────
  setHighlight(on) {
    this._accentMeshes.forEach(m => { m.material.emissiveIntensity = on ? 2.2 : 0.9; });
    const s = this.baseScale * (on ? 1.12 : 1);
    this.group.scale.setScalar(s);
  }

  // ── Idle per frame ──────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — tutte le parti mobili via Math.sin.
  update(t) {
    if (this.floating) {
      // Durante la scelta: galleggia, ruota su sé stesso e pulsa per farsi notare
      this.group.position.y = this.basePos.y + 0.22 + Math.sin(t * 2 + this._phase) * 0.05;
      this.group.rotation.y = t * 0.8 + this._phase;
      const pulse = 1.6 + Math.sin(t * 3.2 + this._phase) * 0.7;
      this._accentMeshes.forEach(m => { m.material.emissiveIntensity = pulse; });
    }

    if (this.needle) this.needle.rotation.z = Math.sin(t * 2.6 + this._phase) * 0.7;
    if (this.orb) {
      this.orb.material.emissiveIntensity = 0.9 + Math.abs(Math.sin(t * 3 + this._phase)) * 1.4;
    }
    this.rings.forEach((r, i) => { r.rotation.z = t * (1.2 + i * 0.7); });
    if (this.lensArm) this.lensArm.rotation.y = Math.sin(t * 0.9 + this._phase) * 0.35;
  }
}
