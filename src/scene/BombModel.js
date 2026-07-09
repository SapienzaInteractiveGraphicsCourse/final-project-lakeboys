// DEFUSE-DECK 3D — BombModel
//
// REQUIRES: Hierarchical model (4 livelli annidati)
//   Bomba (Group)
//     └── Scocca (Group)
//           └── PannelloGroup (Group)   ← pivot per slitta (Fase 5 tentativo 2)
//                 └── Pannello (Mesh)
//     └── Serratura1/2 (Group)          ← pivot per rotazione (Fase 5 tentativo 1)
//           └── Bar, Clasp (Mesh)
//     └── Nucleo (Group)
//           └── Core, Timer, Wires (Mesh)
//
// REQUIRES: Procedural animation — LED blink via Math.sin in update(), nessun keyframe

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { getMetalMaps } from './TextureFactory.js';
import { BOMB_POS, BOMB_SCALE, FLOOR_Y } from './config.js';

export class BombModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Bomba';

    // References esposte per le animazioni di Fase 5
    this.scocca        = null;
    this.pannelloGroup = null;   // slide-out in tentativo 2
    this.serratura1    = null;   // rotate 90° in tentativo 1
    this.serratura2    = null;   // rotate 90° in tentativo 1
    this.nucleo        = null;
    this.core          = null;   // sfera incandescente (rossa → verde col disinnesco)
    this.led           = null;   // LED lampeggiante
    this.antennas      = [];     // fly-away in esplosione
    this.redLight      = null;   // PointLight — assegnata da main.js dopo attach

    // Disinnesco progressivo: ogni soglia apre fisicamente un modulo
    this._defuseProgress = 0;
    this._defuseStage    = 0;    // 0..3 moduli disinnescati

    this._buildScocca();
    this._buildSerrature();
    this._buildNucleo();
    this._buildAntennas();

    // BOMBA ENORME sul lato sinistro della stanza, in piedi sulla piattaforma.
    // Scala uniforme: tutta la gerarchia (e le animazioni in coord. locali) la segue.
    // Fondo bomba (locale) = -1.1; top piattaforma = FLOOR_Y + 0.5.
    // group.y = topPiattaforma - (-1.1 * scala)
    this.group.scale.setScalar(BOMB_SCALE);
    this.group.position.set(
      BOMB_POS.x,
      FLOOR_Y + 0.5 + 1.1 * BOMB_SCALE,
      BOMB_POS.z,
    );
  }

  // ── Materiali condivisi ──────────────────────────────────────────────────────

  _matCase() {
    // REQUIRES: Color map + Normal map + Roughness map + Metalness map (TextureFactory)
    // Le mappe vengono generate una sola volta al primo build e riusate sui cloni
    if (!BombModel._metalMaps) BombModel._metalMaps = getMetalMaps();
    return new THREE.MeshStandardMaterial({
      ...BombModel._metalMaps,
      roughness: 0.50,
      metalness: 0.78,
    });
  }

  _matDark() {
    return new THREE.MeshStandardMaterial({
      color: 0x161d0e, roughness: 0.70, metalness: 0.60,
    });
  }

  // ── Scocca Esterna ─────────────────────────────────────────────────────────
  // REQUIRES: Hierarchical — Scocca (Group) è figlio di Bomba (Group)

  _buildScocca() {
    this.scocca = new THREE.Group();
    this.scocca.name = 'Scocca';

    const mat     = this._matCase();
    const darkMat = this._matDark();

    // Corpo cilindrico principale
    const corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24, 1),
      mat
    );
    corpo.name = 'Corpo';
    corpo.castShadow = corpo.receiveShadow = true;
    this.scocca.add(corpo);

    // Calotta superiore (semisfera)
    const capTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat
    );
    capTop.name = 'CapTop';
    capTop.position.y = 0.6;
    capTop.castShadow = true;
    this.scocca.add(capTop);

    // Calotta inferiore (semisfera capovolta)
    const capBot = capTop.clone();
    capBot.name = 'CapBot';
    capBot.rotation.x = Math.PI;
    capBot.position.y = -0.6;
    this.scocca.add(capBot);

    // Costole circumferenziali (nervature decorative)
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.505, 0.022, 8, 26),
        darkMat
      );
      rib.rotation.x = Math.PI / 2;
      rib.position.y = -0.3 + i * 0.3;
      rib.castShadow = true;
      this.scocca.add(rib);
    }

    // ── Pannello laterale (si stacca nel tentativo 2) ──────────────────────
    // REQUIRES: Hierarchical — PannelloGroup (Group) è figlio di Scocca (Group)
    //           Il pivot è sulla superficie del cilindro per permettere lo slide lineare
    this.pannelloGroup = new THREE.Group();
    this.pannelloGroup.name = 'PannelloGroup';
    this.pannelloGroup.position.set(0.5, 0.05, 0);  // superficie cilindro

    const pannelloMat = new THREE.MeshStandardMaterial({
      color: 0x3c5025, roughness: 0.42, metalness: 0.82,
    });
    const pannello = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.80, 0.44),
      pannelloMat
    );
    pannello.name = 'Pannello';
    pannello.position.x = 0.035;   // flush alla superficie
    pannello.castShadow = pannello.receiveShadow = true;
    this.pannelloGroup.add(pannello);

    // Rivetti agli angoli del pannello
    const rivetMat  = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.95, roughness: 0.12 });
    const rivetGeom = new THREE.CylinderGeometry(0.020, 0.020, 0.038, 8);
    [[-0.15, -0.32], [0.15, -0.32], [-0.15, 0.32], [0.15, 0.32]].forEach(([pz, py]) => {
      const r = new THREE.Mesh(rivetGeom, rivetMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(0.076, py, pz);
      this.pannelloGroup.add(r);
    });

    this.scocca.add(this.pannelloGroup);
    this.group.add(this.scocca);
  }

  // ── Serrature ──────────────────────────────────────────────────────────────
  // REQUIRES: Hierarchical — ogni Serratura è un Group (pivot) con Mesh figlie
  //           Ruotare il Group anima il catenaccio sull'asse Y senza spostare l'origine

  _buildSerrature() {
    const lockMat = new THREE.MeshStandardMaterial({
      color: 0xc8c8c8, roughness: 0.12, metalness: 0.96,
    });

    const makeSerratura = (name, posX, sign) => {
      const pivot = new THREE.Group();
      pivot.name = name;
      // Il pivot è esattamente sulla superficie del cilindro
      pivot.position.set(posX, 0.18, 0);

      // Braccio orizzontale — si estende verso l'esterno dal pivot
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.052, 0.052), lockMat);
      barH.position.x = sign * 0.15;
      barH.castShadow = true;

      // Gancio verticale all'estremità
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.20, 0.052), lockMat);
      clasp.position.set(sign * 0.30, 0.08, 0);
      clasp.castShadow = true;

      // Testina cilindrica (dettaglio)
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.068, 10), lockMat);
      head.rotation.z = Math.PI / 2;
      head.position.set(sign * 0.30, -0.02, 0);
      head.castShadow = true;

      pivot.add(barH, clasp, head);
      return pivot;
    };

    // Serratura sinistra (sign = -1: il braccio punta verso -x)
    this.serratura1 = makeSerratura('Serratura1', -0.5, -1);
    // Serratura destra  (sign = +1: il braccio punta verso +x)
    this.serratura2 = makeSerratura('Serratura2',  0.5,  1);

    // Figlie dirette di Bomba (Group), NON di Scocca — dimostrazione gerarchia multi-branch
    this.group.add(this.serratura1, this.serratura2);
  }

  // ── Nucleo Interno ─────────────────────────────────────────────────────────
  // REQUIRES: Hierarchical — Nucleo (Group) è figlio di Bomba (Group)

  _buildNucleo() {
    this.nucleo = new THREE.Group();
    this.nucleo.name = 'Nucleo';

    // Sfera centrale incandescente
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 1.4,
      roughness: 0.18, metalness: 0.25,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 18), coreMat);
    core.name = 'Core';
    this.nucleo.add(core);
    this.core = core;

    // Display timer (visibile sul frontale del cilindro)
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.75 });
    const housing    = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.19, 0.04), housingMat);
    housing.name     = 'TimerHousing';
    housing.position.set(0, 0.42, 0.48);
    this.nucleo.add(housing);

    const timerMat = new THREE.MeshStandardMaterial({
      color: 0x001500, emissive: 0x00ff55, emissiveIntensity: 1.8, roughness: 0.9,
    });
    const timer  = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.012), timerMat);
    timer.name   = 'Timer';
    timer.position.set(0, 0.42, 0.502);
    this.nucleo.add(timer);

    // Fili colorati (red / yellow / green — classica triade della bomba)
    [[0xff2200, 0], [0xffdd00, Math.PI * 2 / 3], [0x33ff00, Math.PI * 4 / 3]].forEach(([col, angle], i) => {
      const wireMat  = new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 });
      const wireGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6);
      const wire     = new THREE.Mesh(wireGeom, wireMat);
      wire.name = `Wire${i + 1}`;
      const r = 0.26;
      wire.position.set(Math.cos(angle) * r, 0.06, Math.sin(angle) * r);
      // Inclina il filo verso il core
      wire.rotation.z = Math.cos(angle) * 0.45;
      wire.rotation.x = Math.sin(angle) * 0.45;
      wire.castShadow = true;
      this.nucleo.add(wire);
    });

    // LED lampeggiante sulla superficie (animato proceduralmente in update())
    // REQUIRES: Procedural animation — nessun keyframe, solo Math.sin
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3.0,
    });
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), ledMat);
    this.led.name = 'LED';
    this.led.position.set(0.18, 0.28, 0.47);
    this.nucleo.add(this.led);

    this.group.add(this.nucleo);
  }

  // ── Dettagli: antenne ───────────────────────────────────────────────────────

  _buildAntennas() {
    const antMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.38, metalness: 0.88 });
    [-0.18, 0.18].forEach(ox => {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.026, 0.26, 8), antMat);
      ant.position.set(ox, 1.14, 0.06);
      ant.castShadow = true;
      this.group.add(ant);
      this.antennas.push(ant);   // referenza per l'animazione esplosione
    });
  }

  // ── Update per frame ────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — LED blink e lieve oscillazione

  update(t) {
    if (this.led) {
      // Il LED rallenta man mano che la bomba viene disinnescata
      const rate = 2.5 - this._defuseProgress * 1.6;
      const blink = Math.round(Math.abs(Math.sin(t * rate)));
      this.led.material.emissiveIntensity = blink * 3.0 + 0.1;
    }
    // Il nucleo si "raffredda": rosso incandescente → verde stabile
    if (this.core && !this._exploded) {
      const k = this._defuseProgress;
      this.core.material.emissive.setRGB(1 - 0.9 * k, 0.07 + 0.85 * k, 0.05 + 0.15 * k);
    }
    // Oscillazione: bloccata dopo l'esplosione per non resettare le parti volate via
    if (!this._exploded) {
      this.group.rotation.y = Math.sin(t * 0.22) * 0.04;
    }
  }

  // ── Disinnesco progressivo (soglie 25% / 50% / 75%) ──────────────────────────
  // Chiamato dal GameManager quando la barra DISINNESCO avanza. Ogni soglia
  // superata apre fisicamente un modulo (animazione gerarchica via tween.js).
  // Ritorna l'elenco degli stadi appena scattati (per audio/particelle).
  setDefuseProgress(progress) {
    if (this._exploded) return [];
    this._defuseProgress = Math.max(this._defuseProgress, Math.min(progress, 1));

    const thresholds = [0.25, 0.5, 0.75];
    const fired = [];
    while (this._defuseStage < thresholds.length &&
           this._defuseProgress >= thresholds[this._defuseStage]) {
      this._defuseStage += 1;
      this._playDefuseStage(this._defuseStage);
      fired.push(this._defuseStage);
    }
    return fired;
  }

  _playDefuseStage(n) {
    this._shakeBomb(0.02, 300);

    if (n === 1) {
      // Modulo 1: la serratura sinistra scatta aperta
      new Tween(this.serratura1.rotation)
        .to({ y: this.serratura1.rotation.y + Math.PI / 2 }, 900)
        .easing(Easing.Elastic.Out)
        .start();
    }
    if (n === 2) {
      // Modulo 2: la serratura destra scatta aperta
      new Tween(this.serratura2.rotation)
        .to({ y: this.serratura2.rotation.y - Math.PI / 2 }, 900)
        .easing(Easing.Elastic.Out)
        .start();
    }
    if (n === 3) {
      // Modulo 3: il pannello di accesso si apre in sicurezza (senza cadere)
      new Tween(this.pannelloGroup.position)
        .to({ x: this.pannelloGroup.position.x + 0.5 }, 800)
        .easing(Easing.Cubic.InOut)
        .start();
      new Tween(this.pannelloGroup.rotation)
        .to({ y: 0.35 }, 800)
        .easing(Easing.Cubic.InOut)
        .start();
      // Il LED diventa verde: bomba quasi in sicurezza
      if (this.led) {
        this.led.material.color.setHex(0x00ff66);
        this.led.material.emissive.setHex(0x00ff66);
      }
    }
  }

  // ── Reazione: la bomba viene colpita dal SOVRACCARICO del Warden ─────────────
  // Picco breve della luce rossa + micro-scossa. Generato via tween.js (no keyframe).
  pulse() {
    if (this._exploded) return;
    this._shakeBomb(0.03, 260);
    // La luce rossa è guidata da SceneManager ogni frame: gli chiediamo un picco decadente
    window.App?.sceneManager?.pulseRedLight?.(3.5);
  }

  // ── FASE 5: Animazioni Procedurali del Fallimento ────────────────────────────
  // REQUIRES: tween.js — TUTTI i movimenti sotto sono generati via codice, nessun keyframe

  triggerDefuseFail(n) {
    if (n === 1) this._animateLocks();
    if (n === 2) this._animatePanelSlide();
    if (n === 3) this._animateExplosion();
  }

  // ── Tentativo 1: le serrature ruotano di 90° attorno al proprio pivot ─────────
  // REQUIRES: Hierarchical animation — ruotiamo il Group (pivot), non i Mesh figli.
  //           Il pivot è sulla superficie del cilindro → rotazione Y = catenaccio che si apre.

  _animateLocks() {
    this._shakeBomb(0.05, 550);

    // REQUIRES: tween.js Elastic.Out — effetto "scatto meccanico" della serratura
    new Tween(this.serratura1.rotation)
      .to({ y: this.serratura1.rotation.y + Math.PI / 2 }, 950)
      .easing(Easing.Elastic.Out)
      .delay(80)
      .start();

    new Tween(this.serratura2.rotation)
      .to({ y: this.serratura2.rotation.y - Math.PI / 2 }, 950)
      .easing(Easing.Elastic.Out)
      .delay(80)
      .start();

    // Flash rosso sulla luce: intensità spike poi torna al normale
    if (this.redLight) {
      new Tween({ i: this.redLight.intensity })
        .to({ i: 8 }, 120)
        .easing(Easing.Quadratic.Out)
        .chain(
          new Tween({ i: 8 })
            .to({ i: 1.2 }, 600)
            .easing(Easing.Quadratic.In)
            .onUpdate(o => { this.redLight.intensity = o.i; })
        )
        .onUpdate(o => { this.redLight.intensity = o.i; })
        .start();
    }
  }

  // ── Tentativo 2: il pannello laterale scivola via e cade ──────────────────────
  // REQUIRES: tween.js — PannelloGroup.position.x in spazio locale di Scocca.
  //           La gerarchia garantisce che il pannello si muova correttamente
  //           anche se Scocca viene ruotata in seguito.

  _animatePanelSlide() {
    this._shakeBomb(0.08, 400);

    const px0 = this.pannelloGroup.position.x;
    const py0 = this.pannelloGroup.position.y;

    // Slide verso +X (fuori dal cilindro)
    new Tween(this.pannelloGroup.position)
      .to({ x: px0 + 2.4 }, 650)
      .easing(Easing.Cubic.Out)
      .start();

    // Dopo 500 ms: caduta per gravità simulata + rotazione
    new Tween(this.pannelloGroup.position)
      .to({ y: py0 - 1.1 }, 700)
      .easing(Easing.Quadratic.In)
      .delay(500)
      .start();

    new Tween(this.pannelloGroup.rotation)
      .to({ z: -Math.PI / 3 }, 700)
      .easing(Easing.Quadratic.In)
      .delay(500)
      .start();

    // Spike luce rossa
    if (this.redLight) {
      new Tween({ i: this.redLight.intensity })
        .to({ i: 12 }, 150)
        .easing(Easing.Quadratic.Out)
        .chain(
          new Tween({ i: 12 })
            .to({ i: 1.2 }, 800)
            .easing(Easing.Quadratic.In)
            .onUpdate(o => { this.redLight.intensity = o.i; })
        )
        .onUpdate(o => { this.redLight.intensity = o.i; })
        .start();
    }
  }

  // ── Tentativo 3: esplosione radiale — GAME OVER ────────────────────────────────
  // REQUIRES: tween.js — separazione radiale delle parti del modello gerarchico.
  //           Ogni Group/Mesh figlio di Bomba (Group) vola in una direzione distinta.
  // REQUIRES: Animazione procedurale — intensità luce rossa spike via tween.js

  _animateExplosion() {
    this._exploded = true;
    const D = 1100;  // durata base ms

    // NB: gli offset sono in spazio locale e vengono amplificati dalla scala
    // della bomba (BOMB_SCALE). Sono quindi tenuti contenuti per restare in scena.

    // Scocca — vola in alto e verso il retro
    new Tween(this.scocca.position)
      .to({ y: 1.1, z: 0.5 }, D)
      .easing(Easing.Quadratic.Out)
      .start();
    new Tween(this.scocca.rotation)
      .to({ x: Math.PI * 0.9, z: 0.5 }, D)
      .easing(Easing.Quadratic.Out)
      .start();

    // Serratura1 — vola a sinistra e ruota su sé stessa
    new Tween(this.serratura1.position)
      .to({ x: -1.5, y: 0.9, z: 0.4 }, D)
      .easing(Easing.Quadratic.Out)
      .delay(50)
      .start();
    new Tween(this.serratura1.rotation)
      .to({ y: this.serratura1.rotation.y + Math.PI * 3 }, D)
      .easing(Easing.Quadratic.Out)
      .start();

    // Serratura2 — vola a destra e ruota su sé stessa
    new Tween(this.serratura2.position)
      .to({ x: 1.5, y: 0.9, z: 0.4 }, D)
      .easing(Easing.Quadratic.Out)
      .delay(50)
      .start();
    new Tween(this.serratura2.rotation)
      .to({ y: this.serratura2.rotation.y - Math.PI * 3 }, D)
      .easing(Easing.Quadratic.Out)
      .start();

    // Nucleo — esplode verso la camera
    new Tween(this.nucleo.position)
      .to({ y: 1.0, z: 1.1 }, D * 0.85)
      .easing(Easing.Quadratic.Out)
      .delay(80)
      .start();
    new Tween(this.nucleo.rotation)
      .to({ x: Math.PI, y: Math.PI * 2 }, D)
      .easing(Easing.Quadratic.Out)
      .start();

    // Antenne — volano ai lati opposti
    this.antennas.forEach((ant, i) => {
      new Tween(ant.position)
        .to({ x: ant.position.x * 3.2, y: 1.1, z: 0.4 }, D * 0.9)
        .easing(Easing.Quadratic.Out)
        .delay(i * 60)
        .start();
      new Tween(ant.rotation)
        .to({ z: (i === 0 ? -1 : 1) * Math.PI * 1.5 }, D)
        .easing(Easing.Quadratic.Out)
        .start();
    });

    // REQUIRES: Luce rossa esplode a massima intensità via tween.js
    if (this.redLight) {
      new Tween({ i: this.redLight.intensity })
        .to({ i: 35 }, 180)
        .easing(Easing.Quadratic.Out)
        .onUpdate(o => { this.redLight.intensity = o.i; })
        .start();
    }

    // Spotlight si tinge di rosso e si spegne (ambiente di distruzione)
    const sm = window.App?.sceneManager;
    if (sm?.spotLight) {
      // Cambio colore → rosso
      new Tween({ r: 1.0, g: 0.94, b: 0.8 })
        .to({ r: 1.0, g: 0.04, b: 0.0 }, 250)
        .easing(Easing.Quadratic.Out)
        .onUpdate(o => sm.spotLight.color.setRGB(o.r, o.g, o.b))
        .start();
      // Poi si spegne lentamente
      new Tween({ i: sm.spotLight.intensity })
        .to({ i: 0 }, 1600)
        .easing(Easing.Quadratic.In)
        .delay(220)
        .onUpdate(o => { sm.spotLight.intensity = o.i; })
        .start();
    }

    this._cameraShake(0.24, 1500);
    this._shakeBomb(0.18, 500);
  }

  // ── Helpers: vibrazione procedurale ─────────────────────────────────────────
  // Implementata con setInterval (codice JS puro) — nessun keyframe importato

  _shakeBomb(amount, duration) {
    const ox = this.group.position.x;
    const oz = this.group.position.z;
    let elapsed = 0;
    const STEP = 32;
    const id = setInterval(() => {
      elapsed += STEP;
      const fade = 1 - elapsed / duration;
      this.group.position.x = ox + (Math.random() - 0.5) * amount * 2 * fade;
      this.group.position.z = oz + (Math.random() - 0.5) * amount * fade;
      if (elapsed >= duration) {
        this.group.position.x = ox;
        this.group.position.z = oz;
        clearInterval(id);
      }
    }, STEP);
  }

  // Delegato al sistema Effects: l'offset viene applicato solo al momento del
  // render, così OrbitControls non assorbe mai lo scuotimento (niente deriva).
  _cameraShake(amount, duration) {
    window.App?.effects?.shake?.(amount, duration);
  }
}
