// DEFUSE-DECK 3D — PlayerModel : "L'ARTIFICIERE"
//
// Il personaggio del giocatore: un artificiere in tuta antibomba seduto al lato
// vicino del tavolo, chino sulle carte e rivolto verso la bomba.
// In terza persona lo vedi di spalle (sopra la spalla); in prima persona la
// camera si pone all'altezza dei suoi occhi.
//
// REQUIRES: Hierarchical model (≥3 livelli annidati)
//   Operator (Group)                  ← posa nel mondo, rivolto verso -z
//     └── Bust (Group)                ← respiro idle (Math.sin)
//           ├── Torso (Group)         → tuta, pettorina, spalline, collare
//           ├── Head (Group)          → casco, visiera, faro frontale
//           ├── ArmL (Group)          → braccio (pivot spalla)
//           │     └── ForearmL (Group)→ avambraccio + guanto (pivot gomito)
//           └── ArmR (Group)
//                 └── ForearmR (Group)
//
// REQUIRES: Procedural animation — respiro e micro-dondolio via Math.sin.
// Costruito interamente con primitive Three.js (nessun modello importato).

import * as THREE from 'three';
import { PLAYER_POS } from './config.js';

const ACCENT = 0x33ddaa;   // verde-acqua: richiama il colore "TU / DISINNESCO"

export class PlayerModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Operator';
    this.group.position.copy(PLAYER_POS);
    this.group.scale.setScalar(0.92);
    // Rivolto verso la bomba (−z): chest plate, visiera e faro sono sul
    // lato +z locale; rotation.y = π li porta a guardare −z (la bomba). In terza
    // persona vediamo quindi la sua schiena (zaino EOD).
    this.group.rotation.y = Math.PI;

    // Bust isola il respiro idle dal resto della posa
    this.bust = new THREE.Group();
    this.group.add(this.bust);

    this.head = null;
    this.lamp = null;
    this.visor = null;

    this._build();
  }

  // ── Materiali ────────────────────────────────────────────────────────────────
  _matSuit()  { return new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.74, metalness: 0.18 }); }
  _matVest()  { return new THREE.MeshStandardMaterial({ color: 0x3c4033, roughness: 0.82, metalness: 0.08 }); }
  _matTrim()  { return new THREE.MeshStandardMaterial({ color: 0x5e636b, roughness: 0.3,  metalness: 0.9  }); }
  _matGlove() { return new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 0.6,  metalness: 0.25 }); }

  // ── Costruzione ───────────────────────────────────────────────────────────────
  _build() {
    this._buildTorso();
    this._buildHead();
    this._buildArms();
  }

  // Busto: tuta antibomba voluminosa con pettorina, collare e spalline
  _buildTorso() {
    const torso = new THREE.Group();
    torso.name = 'Torso';
    const suit = this._matSuit();
    const vest = this._matVest();
    const trim = this._matTrim();

    // Tronco principale (più largo in basso → corporatura ingombrante)
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 1.25, 20), suit);
    chest.position.y = 0.55;
    chest.castShadow = true;
    torso.add(chest);

    // Piastra pettorale antiframmento
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.42), vest);
    plate.position.set(0, 0.7, 0.34);
    plate.castShadow = true;
    torso.add(plate);

    // Striscia riflettente sulla pettorina (accent)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2,
    });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.09, 0.04), stripeMat);
    stripe.position.set(0, 0.92, 0.56);
    torso.add(stripe);

    // Collare di protezione del collo (torus)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 12, 24), suit);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.18;
    torso.add(collar);

    // Spalline imbottite
    [-1, 1].forEach(s => {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), vest);
      pad.scale.set(1, 0.7, 1);
      pad.position.set(s * 0.66, 1.0, 0.05);
      pad.castShadow = true;
      torso.add(pad);
    });

    // Cinghie incrociate (trim scuro)
    [-0.5, 0.5].forEach(s => {
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.05), trim);
      belt.position.set(s * 0.2, 0.72, 0.57);
      belt.rotation.z = s * 0.28;
      torso.add(belt);
    });

    // ZAINO EOD sul dorso (lato −z locale → verso la camera in terza persona):
    // è ciò che si vede "sopra la spalla". Unità di raffreddamento + bombole.
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.92, 0.34), vest);
    pack.position.set(0, 0.7, -0.52);
    pack.castShadow = true;
    torso.add(pack);
    [-0.22, 0.22].forEach(x => {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.78, 12), trim);
      can.position.set(x, 0.72, -0.66);
      torso.add(can);
    });
    // Indicatore accent sull'unità dorsale
    const packLed = new THREE.MeshStandardMaterial({
      color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.4, roughness: 0.4,
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), packLed);
    led.position.set(0, 1.02, -0.7);
    torso.add(led);

    this.bust.add(torso);
    this.torso = torso;
  }

  // Testa: casco integrale + visiera scura + faro frontale
  _buildHead() {
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.y = 1.62;
    const suit = this._matSuit();
    const trim = this._matTrim();

    // Calotta del casco
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), suit);
    dome.scale.set(1, 1.08, 1.05);
    dome.castShadow = true;
    head.add(dome);

    // Bordo/mentoniera del casco
    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.34, 22), suit);
    jaw.position.y = -0.3;
    head.add(jaw);

    // VISIERA scura curva sul davanti (+z locale → guarda la bomba): vetro
    // riflettente centrato sul lato anteriore della testa.
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0a1417, emissive: 0x0d3340, emissiveIntensity: 0.5,
      roughness: 0.12, metalness: 0.65, side: THREE.DoubleSide,
    });
    this.visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.39, 22, 14, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.30, Math.PI * 0.46),
      visorMat,
    );
    this.visor.position.set(0, -0.04, 0);
    head.add(this.visor);

    // Faro frontale (emissivo) sopra la visiera + luce reale che illumina le carte
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff4d6, emissive: 0xfff0c0, emissiveIntensity: 3, roughness: 0.3,
    });
    this.lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 14), lampMat);
    this.lamp.rotation.x = Math.PI / 2;
    this.lamp.position.set(0, 0.2, 0.36);
    head.add(this.lamp);

    this.lampLight = new THREE.PointLight(0xfff0c0, 6, 6, 2);
    this.lampLight.position.set(0, 0.1, 0.5);
    head.add(this.lampLight);

    // Respiratori laterali (dettaglio trim)
    [-1, 1].forEach(s => {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), trim);
      can.position.set(s * 0.4, -0.16, 0.06);
      head.add(can);
    });

    this.bust.add(head);
    this.head = head;
  }

  // Braccia articolate appoggiate in avanti sul tavolo (verso le carte)
  _buildArms() {
    const makeArm = (sign) => {
      const suit  = this._matSuit();
      const trim  = this._matTrim();
      const glove = this._matGlove();

      const arm = new THREE.Group();          // pivot spalla
      arm.position.set(sign * 0.7, 0.95, 0.1);

      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), trim);
      arm.add(shoulder);

      // Braccio superiore: verso il basso e in avanti (−z)
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.6, 12), suit);
      upper.position.set(0, -0.18, -0.22);
      upper.rotation.x = -0.9;                // proteso in avanti
      upper.castShadow = true;
      arm.add(upper);

      // Avambraccio (pivot al gomito), disteso sul tavolo
      const fore = new THREE.Group();
      fore.position.set(0, -0.34, -0.46);
      const foreMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.62, 12), suit);
      foreMesh.rotation.x = -1.45;            // quasi orizzontale
      foreMesh.position.z = -0.28;
      foreMesh.castShadow = true;
      fore.add(foreMesh);

      // Guanto / mano poggiata
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), glove);
      hand.scale.set(1, 0.7, 1.25);
      hand.position.set(0, -0.02, -0.62);
      fore.add(hand);

      arm.add(fore);
      return { arm, fore };
    };

    const L = makeArm(-1);
    const R = makeArm(1);
    this.armL = L.arm; this.foreL = L.fore;
    this.armR = R.arm; this.foreR = R.fore;
    this.bust.add(this.armL, this.armR);
  }

  // ── Idle per frame ──────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — respiro e micro-dondolio guidati da Math.sin.
  update(t) {
    // Respiro: il busto si solleva e si espande leggermente
    const breath = Math.sin(t * 1.6);
    this.bust.position.y = breath * 0.025;
    this.bust.scale.set(1 + breath * 0.012, 1 + breath * 0.018, 1 + breath * 0.012);

    // Micro-dondolio della testa (concentrazione)
    if (this.head) {
      this.head.rotation.z = Math.sin(t * 0.8) * 0.03;
      this.head.rotation.x = Math.sin(t * 1.1 + 1) * 0.02;
    }

    // Lieve pulsazione del faro frontale
    if (this.lamp) {
      const f = 2.6 + Math.sin(t * 5.0) * 0.4;
      this.lamp.material.emissiveIntensity = f;
      if (this.lampLight) this.lampLight.intensity = 5 + Math.sin(t * 5.0) * 1.2;
    }
  }
}
