// DEFUSE-DECK 3D — RoomModel (Bunker)
//
// REQUIRES: Hierarchical model — Room (Group) → pareti, pavimento, tubi,
//           lampade a gabbia (sotto-Group), anello di pericolo.
// REQUIRES: Procedural animation — sfarfallio delle luci da lavoro via Math.sin.
// Tutto è costruito con primitive Three.js; nessun modello importato.

import * as THREE from 'three';
import { getConcreteMaps, hazardStripeMap } from './TextureFactory.js';
import {
  FLOOR_Y, CEIL_Y, ROOM_HALF_W, ROOM_BACK_Z, ROOM_FRONT_Z, BOMB_POS,
} from './config.js';

export class RoomModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Room';

    this.workLights = [];   // { bulb, light, phase } — fanno flicker in update()
    this.hazardRing = null; // anello pulsante attorno alla bomba

    // Tubi sul muro di fondo (dietro il Warden) usati come INDICATORE di disinnesco:
    // si accendono dal basso verso l'alto man mano che sale il progresso.
    this.progressPipes   = [];   // { mat, threshold }
    this.pipeLight       = null; // luce verde che ramp-a col progresso
    this._defuseProgress = 0;

    this._buildFloor();
    this._buildWalls();
    this._buildCeiling();
    this._buildPipes();
    this._buildWorkLights();
    this._buildBombPlatform();
    this._buildSignage();
  }

  // ── Pavimento ───────────────────────────────────────────────────────────────
  _buildFloor() {
    const w = ROOM_HALF_W * 2;
    const d = ROOM_FRONT_Z - ROOM_BACK_Z;
    const geom = new THREE.BoxGeometry(w, 0.4, d);
    const mat  = new THREE.MeshStandardMaterial({
      ...getConcreteMaps(7, 6),
      roughness: 0.95,
      metalness: 0.04,
    });
    const floor = new THREE.Mesh(geom, mat);
    floor.position.set(0, FLOOR_Y - 0.2, (ROOM_BACK_Z + ROOM_FRONT_Z) / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  // ── Pareti ──────────────────────────────────────────────────────────────────
  _buildWalls() {
    const h = CEIL_Y - FLOOR_Y;
    const cy = (CEIL_Y + FLOOR_Y) / 2;
    const wallMat = new THREE.MeshStandardMaterial({
      ...getConcreteMaps(5, 3),
      color: 0x6a6e7a,    // tinge più scuro il color map
      roughness: 0.92,
      metalness: 0.05,
    });

    // Parete di fondo
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_HALF_W * 2, h, 0.5), wallMat
    );
    back.position.set(0, cy, ROOM_BACK_Z);
    back.receiveShadow = true;
    this.group.add(back);

    // Pareti laterali
    const depth = ROOM_FRONT_Z - ROOM_BACK_Z;
    [-ROOM_HALF_W, ROOM_HALF_W].forEach(x => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, depth), wallMat);
      side.position.set(x, cy, (ROOM_BACK_Z + ROOM_FRONT_Z) / 2);
      side.receiveShadow = true;
      this.group.add(side);
    });

    // Battiscopa metallico lungo la parete di fondo (dettaglio)
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.6, metalness: 0.7 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(ROOM_HALF_W * 2, 0.35, 0.12), skirtMat);
    skirt.position.set(0, FLOOR_Y + 0.17, ROOM_BACK_Z + 0.31);
    this.group.add(skirt);
  }

  // ── Soffitto ────────────────────────────────────────────────────────────────
  _buildCeiling() {
    const w = ROOM_HALF_W * 2;
    const d = ROOM_FRONT_Z - ROOM_BACK_Z;
    const mat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.95, metalness: 0.05 });
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), mat);
    ceil.position.set(0, CEIL_Y + 0.2, (ROOM_BACK_Z + ROOM_FRONT_Z) / 2);
    this.group.add(ceil);

    // Travi a vista (beam) sul soffitto
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.7, metalness: 0.6 });
    for (let i = -2; i <= 2; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(ROOM_HALF_W * 2, 0.3, 0.45), beamMat);
      beam.position.set(0, CEIL_Y - 0.25, i * 4 - 2);
      beam.castShadow = true;
      this.group.add(beam);
    }
  }

  // ── Tubature lungo la parete di fondo ───────────────────────────────────────
  _buildPipes() {
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d33, roughness: 0.45, metalness: 0.85 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x5a2f1a, roughness: 0.8, metalness: 0.4 });

    // I 3 tubi orizzontali fungono da INDICATORE di progresso: ognuno ha una soglia
    // crescente col numero (il più in basso si accende per primo) e un colore
    // proprio — rosso, blu, verde — così si distinguono anche da spenti (tint).
    const PIPE_Y      = [1.4, 3.2, 5.0];
    const PIPE_COLORS = [0xff3344, 0x3388ff, 0x33ff88];
    PIPE_Y.forEach((y, idx) => {
      const len   = ROOM_HALF_W * 2 - 2;
      const color = PIPE_COLORS[idx];
      const mat = new THREE.MeshStandardMaterial({
        color: 0x24271f, roughness: 0.5, metalness: 0.85,
        emissive: color, emissiveIntensity: 0.0,
      });
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 - idx * 0.02, 0.16 - idx * 0.02, len, 14),
        mat,
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, y, ROOM_BACK_Z + 0.7);
      pipe.castShadow = true;
      this.group.add(pipe);

      // soglia: tubo 0 → 0.00, tubo 1 → 0.33, tubo 2 → 0.67 (fill dal basso)
      this.progressPipes.push({ mat, color, threshold: idx / PIPE_Y.length });

      // Flange/anelli lungo il tubo (decorative, statiche)
      for (let x = -len / 2 + 1; x <= len / 2 - 1; x += 3.2) {
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 14), pipeMat);
        flange.rotation.z = Math.PI / 2;
        flange.position.set(x, y, ROOM_BACK_Z + 0.7);
        this.group.add(flange);
      }
    });

    // Luce che illumina il muro dietro il Warden: intensità ramp col progresso,
    // colore = quello del tubo attualmente più attivo (segue rosso→blu→verde).
    this.pipeLight = new THREE.PointLight(PIPE_COLORS[0], 0, 18, 2);
    this.pipeLight.position.set(0, 3.2, ROOM_BACK_Z + 1.6);
    this.group.add(this.pipeLight);

    // Valvola a volantino (dettaglio scenico)
    const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), pipeMat);
    valveBody.position.set(-7, 3.2, ROOM_BACK_Z + 0.95);
    valveBody.rotation.x = Math.PI / 2;
    this.group.add(valveBody);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), rustMat);
    wheel.position.set(-7, 3.2, ROOM_BACK_Z + 1.2);
    this.group.add(wheel);
  }

  // ── Lampade da lavoro appese (a gabbia) ─────────────────────────────────────
  // REQUIRES: Hierarchical — ogni lampada è un Group (staffa + gabbia + bulbo + luce)
  _buildWorkLights() {
    const specs = [
      { x: -4.5, z:  1.5, color: 0xffd9a0, phase: 0.0 },
      { x:  4.5, z: -7.0, color: 0xcfe2ff, phase: 2.1 },
    ];

    specs.forEach(spec => {
      const g = new THREE.Group();
      g.position.set(spec.x, CEIL_Y - 0.5, spec.z);

      // Asta di sospensione
      const rodMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.6, metalness: 0.7 });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), rodMat);
      rod.position.y = -0.45;
      g.add(rod);

      // Riflettore conico
      const reflMat = new THREE.MeshStandardMaterial({
        color: 0x202225, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide,
      });
      const refl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.55, 18, 1, true), reflMat);
      refl.position.y = -1.05;
      refl.rotation.x = Math.PI;   // apertura verso il basso
      g.add(refl);

      // Bulbo emissivo
      const bulbMat = new THREE.MeshStandardMaterial({
        color: 0xfff4d0, emissive: spec.color, emissiveIntensity: 3.5,
        roughness: 0.2, metalness: 0.0,
      });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), bulbMat);
      bulb.position.y = -1.2;
      g.add(bulb);

      // Gabbia di protezione (archi)
      const cageMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.8 });
      for (let k = 0; k < 4; k++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 14, Math.PI), cageMat);
        arc.rotation.y = (k / 4) * Math.PI;
        arc.rotation.x = Math.PI / 2;
        arc.position.y = -1.2;
        g.add(arc);
      }

      // Luce puntiforme
      const light = new THREE.PointLight(spec.color, 14, 11, 2);
      light.position.y = -1.2;
      light.castShadow = false;
      g.add(light);

      this.group.add(g);
      this.workLights.push({ bulb, light, phase: spec.phase, base: 14 });
    });
  }

  // ── Piattaforma + anello di pericolo sotto la bomba ─────────────────────────
  _buildBombPlatform() {
    // Basamento in cemento
    const baseMat = new THREE.MeshStandardMaterial({
      ...getConcreteMaps(2, 2), roughness: 0.95, metalness: 0.05,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.1, 0.5, 32), baseMat);
    base.position.set(BOMB_POS.x, FLOOR_Y + 0.25, BOMB_POS.z);
    base.receiveShadow = true;
    base.castShadow = true;
    this.group.add(base);

    // Banda hazard attorno al basamento
    const hazardTex = hazardStripeMap(256);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.repeat.set(16, 1);
    const hazardMat = new THREE.MeshStandardMaterial({
      map: hazardTex, roughness: 0.7, metalness: 0.2,
      emissive: 0x111100, emissiveIntensity: 0.4,
    });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.12, 3.12, 0.3, 48, 1, true), hazardMat);
    band.position.set(BOMB_POS.x, FLOOR_Y + 0.4, BOMB_POS.z);
    this.group.add(band);

    // Anello emissivo pulsante (allarme)
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x330000, emissive: 0xff2200, emissiveIntensity: 1.2,
      roughness: 0.5, metalness: 0.3,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.85, 0.08, 10, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(BOMB_POS.x, FLOOR_Y + 0.52, BOMB_POS.z);
    this.group.add(ring);
    this.hazardRing = ring;
  }

  // ── Segnaletica luminosa di pericolo sulla parete di fondo ───────────────────
  _buildSignage() {
    // Pannello "DANGER" semplice: riquadro + triangolo + punto esclamativo
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xf2c200, emissive: 0xf2c200, emissiveIntensity: 0.9,
      roughness: 0.5, metalness: 0.1,
    });
    const triShape = new THREE.Shape();
    triShape.moveTo(0, 0.7);
    triShape.lineTo(-0.7, -0.6);
    triShape.lineTo(0.7, -0.6);
    triShape.closePath();
    const tri = new THREE.Mesh(
      new THREE.ExtrudeGeometry(triShape, { depth: 0.06, bevelEnabled: false }),
      panelMat
    );
    tri.position.set(BOMB_POS.x, 4.4, ROOM_BACK_Z + 0.55);
    this.group.add(tri);

    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.08), darkMat);
    bar.position.set(BOMB_POS.x, 4.35, ROOM_BACK_Z + 0.62);
    this.group.add(bar);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), darkMat);
    dot.position.set(BOMB_POS.x, 4.0, ROOM_BACK_Z + 0.62);
    this.group.add(dot);
  }

  // ── API: progresso di disinnesco [0,1] → accende i tubi sul muro di fondo ────
  setDefuseProgress(progress) {
    this._defuseProgress = Math.max(0, Math.min(1, progress || 0));
  }

  // ── Update per frame ────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — flicker delle luci + pulsazione dell'anello
  update(t) {
    this.workLights.forEach(wl => {
      const f = 1 + Math.sin(t * 11 + wl.phase) * 0.04 + Math.sin(t * 27 + wl.phase) * 0.02;
      wl.light.intensity = wl.base * f;
      wl.bulb.material.emissiveIntensity = 3.5 * f;
    });

    if (this.hazardRing) {
      const pulse = 0.6 + 0.6 * Math.abs(Math.sin(t * 2.2));
      this.hazardRing.material.emissiveIntensity = pulse * 1.6;
    }

    // Tubi-indicatore sul muro di fondo: ogni tubo si attiva gradualmente oltre la
    // sua soglia e pulsa proceduralmente ("energia che scorre"). La luce dietro il
    // Warden segue il colore del tubo più attivo (rosso → blu → verde).
    let maxAct = 0, maxColor = null;
    this.progressPipes.forEach(pp => {
      const act   = Math.max(0, Math.min(1, (this._defuseProgress - pp.threshold) / 0.34));
      const pulse = 0.7 + 0.3 * Math.sin(t * 3.4 + pp.threshold * 8);
      pp.mat.emissiveIntensity = act > 0 ? 1.7 * pulse * act : 0.0;
      if (act > maxAct) { maxAct = act; maxColor = pp.color; }
    });
    if (this.pipeLight) {
      this.pipeLight.intensity = maxAct * 7;
      if (maxColor !== null) this.pipeLight.color.setHex(maxColor);
    }
  }
}
