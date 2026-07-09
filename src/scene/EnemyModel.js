// DEFUSE-DECK 3D — EnemyModel : "THE WARDEN"
//
// Il nemico che gioca contro di te: un automa sospeso che sorveglia la bomba.
// Ti scruta mentre selezioni le carte, esulta e scaglia energia verso la bomba
// quando fallisci, va in cortocircuito quando vinci.
//
// REQUIRES: Hierarchical model (≥3 livelli annidati)
//   Warden (Group)                    ← reazioni: lunge / recoil / sink
//     └── HoverPivot (Group)          ← idle: galleggiamento + dondolio (Math.sin)
//           ├── Body (Group)          → core, corazza, anello, luce pettorale
//           ├── Head (Group)          → cupola, occhio ciclope, corna, antenna
//           ├── ArmL (Group)          → braccio (pivot spalla)
//           │     └── ForearmL (Group)→ avambraccio + artiglio (pivot gomito)
//           ├── ArmR (Group)
//           │     └── ForearmR (Group)
//           └── Thrusters             → ugelli emissivi sotto il corpo
//
// REQUIRES: Procedural animation — idle via Math.sin; reazioni via tween.js.
// Costruito interamente con primitive Three.js (niente modelli importati).

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { ENEMY_POS, BOMB_POS } from './config.js';

const EYE_COLOR = 0xff2a10;

export class EnemyModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Warden';
    this.group.position.copy(ENEMY_POS);
    this.group.scale.setScalar(1.9);   // presenza imponente

    // Yaw di base: l'occhio guarda verso il tavolo del giocatore
    this.baseYaw = Math.atan2(-ENEMY_POS.x, 6 - ENEMY_POS.z);
    this.group.rotation.y = this.baseYaw;

    // HoverPivot isola l'idle (galleggiamento) dalle reazioni (Warden esterno)
    this.hover = new THREE.Group();
    this.group.add(this.hover);

    // Riferimenti animati
    this.head      = null;
    this.eye       = null;
    this.eyeLight  = null;
    this.chestLight = null;
    this.chestMesh  = null;
    this.armL = null; this.armR = null;
    this.foreL = null; this.foreR = null;
    this.antennaTip = null;

    // Stato animazione
    this.eyeBoost   = 1;     // moltiplicatore intensità occhio (tweenato nelle reazioni)
    this._defeated  = false;
    this._restPose  = {};    // angoli di riposo delle braccia per il ritorno

    this._build();
  }

  // ── Materiali ────────────────────────────────────────────────────────────────
  _matHull()  { return new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.9 }); }
  _matDark()  { return new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.55, metalness: 0.8 }); }
  _matTrim()  { return new THREE.MeshStandardMaterial({ color: 0x6a6f78, roughness: 0.25, metalness: 0.95 }); }

  // ── Costruzione ───────────────────────────────────────────────────────────────
  _build() {
    this._buildBody();
    this._buildHead();
    this._buildArms();
    this._buildThrusters();
  }

  // Corpo: nucleo poliedrico + piastre di corazza + anello spalle + luce pettorale
  _buildBody() {
    const body = new THREE.Group();
    body.name = 'Body';
    const hull = this._matHull();
    const dark = this._matDark();
    const trim = this._matTrim();

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), hull);
    core.castShadow = true;
    body.add(core);

    // Piastre di corazza frontali/laterali
    const plateGeom = new THREE.BoxGeometry(0.5, 0.62, 0.18);
    [[-0.42, 0.05, 0.55, 0.25], [0.42, 0.05, 0.55, -0.25], [0, 0.1, 0.7, 0]].forEach(([x, y, z, ry]) => {
      const p = new THREE.Mesh(plateGeom, hull);
      p.position.set(x, y, z);
      p.rotation.y = ry;
      p.castShadow = true;
      body.add(p);
    });

    // Anello delle spalle (collare)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 10, 28), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.42;
    body.add(collar);

    // Cintura inferiore
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.34, 18), dark);
    belt.position.y = -0.55;
    belt.castShadow = true;
    body.add(belt);

    // Luce pettorale (reattore)
    const chestMat = new THREE.MeshStandardMaterial({
      color: 0x55ddff, emissive: 0x33ccff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.1,
    });
    this.chestMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 14), chestMat);
    this.chestMesh.position.set(0, 0.02, 0.62);
    body.add(this.chestMesh);

    this.chestLight = new THREE.PointLight(0x33ccff, 3, 4, 2);
    this.chestLight.position.set(0, 0.02, 0.8);
    body.add(this.chestLight);

    this.hover.add(body);
    this.body = body;
  }

  // Testa: cupola, faceplate inclinata, occhio ciclope, corna, antenna lampeggiante
  _buildHead() {
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.y = 1.02;
    const hull = this._matHull();
    const dark = this._matDark();
    const trim = this._matTrim();

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hull);
    dome.castShadow = true;
    head.add(dome);

    // Mandibola/faceplate angolata (aspetto minaccioso)
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.42, 24), dark);
    face.position.y = -0.2;
    head.add(face);

    // Visiera dell'occhio (alloggiamento scuro)
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 20), dark);
    socket.rotation.x = Math.PI / 2;
    socket.position.set(0, -0.05, 0.36);
    head.add(socket);

    // OCCHIO CICLOPE emissivo
    const eyeMat = new THREE.MeshStandardMaterial({
      color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 2.5, roughness: 0.15, metalness: 0.0,
    });
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 16), eyeMat);
    this.eye.position.set(0, -0.05, 0.44);
    head.add(this.eye);

    this.eyeLight = new THREE.PointLight(EYE_COLOR, 4, 7, 2);
    this.eyeLight.position.set(0, -0.05, 0.7);
    head.add(this.eyeLight);

    // Sopracciglio aggressivo sopra l'occhio
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.1), trim);
    brow.position.set(0, 0.16, 0.4);
    brow.rotation.x = -0.5;
    head.add(brow);

    // Corna
    const hornMat = this._matTrim();
    [-1, 1].forEach(s => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 10), hornMat);
      horn.position.set(s * 0.34, 0.34, -0.05);
      horn.rotation.z = s * -0.5;
      horn.castShadow = true;
      head.add(horn);
    });

    // Antenna con LED lampeggiante
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), dark);
    ant.position.set(0, 0.5, -0.15);
    head.add(ant);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3 });
    this.antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), tipMat);
    this.antennaTip.position.set(0, 0.72, -0.15);
    head.add(this.antennaTip);

    this.hover.add(head);
    this.head = head;
  }

  // Braccia articolate: spalla (pivot) → avambraccio (pivot) → artiglio
  _buildArms() {
    const makeArm = (sign) => {
      const hull = this._matHull();
      const dark = this._matDark();
      const trim = this._matTrim();

      const arm = new THREE.Group();        // pivot spalla
      arm.position.set(sign * 0.78, 0.34, 0.05);

      // Giunto sferico spalla
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), trim);
      arm.add(shoulder);

      // Braccio superiore (verso il basso)
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.62, 12), hull);
      upper.position.y = -0.35;
      upper.castShadow = true;
      arm.add(upper);

      // Gomito
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), trim);
      elbow.position.y = -0.66;
      arm.add(elbow);

      // Avambraccio (pivot al gomito)
      const fore = new THREE.Group();
      fore.position.y = -0.66;
      const foreMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.56, 12), hull);
      foreMesh.position.y = -0.3;
      foreMesh.castShadow = true;
      fore.add(foreMesh);

      // Artiglio: tre dita coniche
      const clawBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), dark);
      clawBase.position.y = -0.6;
      fore.add(clawBase);
      for (let k = 0; k < 3; k++) {
        const finger = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26, 8), trim);
        const a = (k / 3) * Math.PI * 2;
        finger.position.set(Math.cos(a) * 0.08, -0.74, Math.sin(a) * 0.08);
        finger.rotation.x = Math.PI + Math.sin(a) * 0.4;
        finger.rotation.z = -Math.cos(a) * 0.4;
        fore.add(finger);
      }

      arm.add(fore);
      return { arm, fore };
    };

    const L = makeArm(-1);
    const R = makeArm(1);
    this.armL = L.arm; this.foreL = L.fore;
    this.armR = R.arm; this.foreR = R.fore;

    // Posa di riposo: braccia leggermente aperte e piegate
    this.armL.rotation.set(0.1, 0, 0.25);
    this.armR.rotation.set(0.1, 0, -0.25);
    this.foreL.rotation.set(0.5, 0, 0);
    this.foreR.rotation.set(0.5, 0, 0);
    this._restPose = {
      armL: this.armL.rotation.clone(),
      armR: this.armR.rotation.clone(),
      foreL: this.foreL.rotation.clone(),
      foreR: this.foreR.rotation.clone(),
    };

    this.hover.add(this.armL, this.armR);
  }

  // Ugelli a reazione sotto il corpo (effetto sospensione)
  _buildThrusters() {
    const nozzleMat = this._matDark();
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x3aaaff, emissive: 0x33aaff, emissiveIntensity: 3, roughness: 0.4,
    });
    [-0.3, 0.3].forEach(x => {
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 14, 1, true), nozzleMat);
      nozzle.position.set(x, -1.05, 0);
      nozzle.rotation.x = Math.PI;
      this.hover.add(nozzle);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMat);
      glow.position.set(x, -1.2, 0);
      this.hover.add(glow);
    });
    // PERF: le sfere sono già emissive (brillano da sole); niente PointLight
    // dedicata ai thruster — chestLight ed eyeLight bastano per il nemico.
  }

  // ── Idle per frame ──────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — Math.sin guida galleggiamento, dondolio,
  //           scansione della testa e pulsazione dell'occhio (nessun keyframe).
  update(t) {
    // Galleggiamento + dondolio sul HoverPivot (non interferisce con le reazioni)
    this.hover.position.y = Math.sin(t * 1.3) * 0.18;
    this.hover.rotation.z = Math.sin(t * 0.9) * 0.03;
    this.hover.rotation.x = Math.cos(t * 0.7) * 0.02;

    if (!this._defeated && this.head) {
      // Scansione lenta della testa
      this.head.rotation.y = Math.sin(t * 0.55) * 0.32;
      this.head.rotation.x = Math.sin(t * 0.8) * 0.06;
    }

    // Pulsazione occhio: idle * boost (boost tweenato durante le reazioni)
    const eyePulse = 2.2 + Math.sin(t * 3.0) * 0.7;
    if (this.eye) this.eye.material.emissiveIntensity = eyePulse * this.eyeBoost;
    if (this.eyeLight) this.eyeLight.intensity = (2.5 + Math.sin(t * 3.0)) * this.eyeBoost;

    // Luce pettorale
    if (!this._defeated && this.chestMesh) {
      const c = 2.0 + Math.sin(t * 2.2 + 1) * 0.6;
      this.chestMesh.material.emissiveIntensity = c;
      if (this.chestLight) this.chestLight.intensity = c;
    }

    // LED antenna lampeggiante
    if (this.antennaTip) {
      const blink = Math.round(Math.abs(Math.sin(t * 2.5 + 0.5)));
      this.antennaTip.material.emissiveIntensity = blink * 3 + 0.2;
    }
  }

  // ── Helpers tween ─────────────────────────────────────────────────────────────
  _t(target, to, dur, easing = Easing.Cubic.Out, delay = 0) {
    return new Tween(target).to(to, dur).easing(easing).delay(delay).start();
  }

  _boostEye(peak, up = 140, down = 600) {
    new Tween(this)
      .to({ eyeBoost: peak }, up)
      .easing(Easing.Quadratic.Out)
      .chain(new Tween(this).to({ eyeBoost: 1 }, down).easing(Easing.Quadratic.In))
      .start();
  }

  // ── Reazione: aggancio bersaglio (selezione carte) ───────────────────────────
  lockOn() {
    if (this._defeated) return;
    this._boostEye(2.4, 120, 400);
  }

  // ── Posizione mondo dell'artiglio destro ─────────────────────────────────────
  // Usata da CardSystem: le carte del Warden nascono dal suo artiglio.
  getClawWorldPosition(target = new THREE.Vector3()) {
    this.foreR.updateWorldMatrix(true, false);
    return target.set(0, -0.8, 0).applyMatrix4(this.foreR.matrixWorld);
  }

  // ── Reazione: il Warden CALA fisicamente le carte ────────────────────────────
  // REQUIRES: Hierarchical animation — spalla (pivot) e gomito (pivot) tweenati
  // in catena: il braccio si protende e "lancia" una carta per ogni flick.
  dealGesture(cardCount = 3) {
    if (this._defeated) return;

    // Il braccio destro si protende in avanti verso l'area di gioco
    this._t(this.armR.rotation, { x: -1.25, z: -0.35 }, 260, Easing.Back.Out);
    this._t(this.foreR.rotation, { x: 0.55 }, 260, Easing.Cubic.Out);
    this._boostEye(1.8, 150, 500);

    // Un colpetto del gomito per ogni carta calata
    for (let i = 0; i < cardCount; i++) {
      const at = 300 + i * 90;
      this._t(this.foreR.rotation, { x: 0.2 }, 60, Easing.Quadratic.Out, at);
      this._t(this.foreR.rotation, { x: 0.55 }, 90, Easing.Quadratic.In, at + 65);
    }
    // NB: niente ritorno alla posa di riposo qui — nel flusso di gioco segue
    // sempre playCharge(), che riprende il braccio da questa posa e lo riporta.
  }

  // ── Reazione: mano giocata (lieve scatto in avanti) ──────────────────────────
  onHandPlayed() {
    if (this._defeated) return;
    const z0 = this.group.rotation.x;
    this._t(this.group.rotation, { x: z0 + 0.08 }, 160, Easing.Quadratic.Out);
    new Tween(this.group.rotation).to({ x: z0 }, 420).easing(Easing.Elastic.Out).delay(160).start();
  }

  // ── Reazione: il Warden CALA le sue carte → carica la bomba ──────────────────
  // power ∈ [0,1] in base alla forza della combo giocata dal nemico.
  playCharge(power = 0.4) {
    if (this._defeated) return;
    const p = Math.max(0, Math.min(1, power));

    this._boostEye(2.2 + p * 2.2, 130, 650);

    // Solleva un braccio e protende l'altro verso la bomba (gesto di "lancio")
    const lift = 0.5 + p * 0.9;
    this._t(this.armR.rotation, { x: -lift, z: -0.55 }, 320, Easing.Back.Out);
    this._t(this.foreR.rotation, { x: 0.25 }, 320, Easing.Cubic.Out);

    // Affondo laterale verso la bomba e ritorno elastico
    const x0 = this.group.position.x;
    this._t(this.group.position, { x: x0 - (0.4 + p * 0.5) }, 300, Easing.Quadratic.Out);
    new Tween(this.group.position).to({ x: x0 }, 800).easing(Easing.Elastic.Out).delay(360).start();

    // Scarica di energia proporzionale alla potenza
    this._fireEnergyBolt(280);
    if (p > 0.6) this._fireEnergyBolt(440);

    this._returnArms(900);
  }

  // ── Reazione: il giocatore fallisce → il Warden esulta e carica la bomba ─────
  gloat(n = 1) {
    if (this._defeated) return;
    const power = Math.min(n, 3);

    this._boostEye(2.8 + power * 0.6, 130, 700);

    // Alza le braccia in segno di trionfo (più in alto col crescere di n)
    const lift = 0.7 + power * 0.35;
    this._t(this.armL.rotation, { x: -lift, z: 0.6 }, 380, Easing.Back.Out);
    this._t(this.armR.rotation, { x: -lift, z: -0.6 }, 380, Easing.Back.Out);
    this._t(this.foreL.rotation, { x: 0.2 }, 380, Easing.Cubic.Out);
    this._t(this.foreR.rotation, { x: 0.2 }, 380, Easing.Cubic.Out);

    // Si protende verso la bomba (lunge laterale) e torna
    const x0 = this.group.position.x;
    this._t(this.group.position, { x: x0 - 0.8 }, 320, Easing.Quadratic.Out);
    new Tween(this.group.position).to({ x: x0 }, 900).easing(Easing.Elastic.Out).delay(420).start();

    // Scarica di energia: scaglia una sfera verso la bomba
    this._fireEnergyBolt(420 + power * 60);

    // Ritorno alla posa di riposo
    this._returnArms(1100);
  }

  // ── Reazione: GAME OVER → carica finale che fa detonare la bomba ─────────────
  triumph() {
    if (this._defeated) return;
    this._boostEye(6, 160, 1400);

    // Spalanca le braccia verso l'alto
    this._t(this.armL.rotation, { x: -1.9, z: 0.9 }, 300, Easing.Back.Out);
    this._t(this.armR.rotation, { x: -1.9, z: -0.9 }, 300, Easing.Back.Out);

    // Affondo deciso verso la bomba
    const x0 = this.group.position.x, y0 = this.group.position.y;
    this._t(this.group.position, { x: x0 - 1.4, y: y0 + 0.6 }, 380, Easing.Quadratic.Out);
    new Tween(this.group.position).to({ x: x0, y: y0 }, 1400).easing(Easing.Elastic.Out).delay(500).start();

    // Doppia scarica devastante
    this._fireEnergyBolt(220);
    this._fireEnergyBolt(360);
  }

  // ── Reazione: VITTORIA del giocatore → cortocircuito e spegnimento ───────────
  defeat() {
    this._defeated = true;

    // L'occhio muore
    new Tween(this).to({ eyeBoost: 0 }, 1500).easing(Easing.Quadratic.In).start();

    // Sussulto poi crollo: testa e braccia si afflosciano
    this._t(this.head.rotation, { x: 0.6, z: 0.25 }, 1200, Easing.Bounce.Out, 200);
    this._t(this.armL.rotation, { x: 0.9, z: 0.1 }, 1300, Easing.Quadratic.In);
    this._t(this.armR.rotation, { x: 0.9, z: -0.1 }, 1300, Easing.Quadratic.In);
    this._t(this.foreL.rotation, { x: 1.4 }, 1300, Easing.Quadratic.In);
    this._t(this.foreR.rotation, { x: 1.4 }, 1300, Easing.Quadratic.In);

    // Si inclina e sprofonda
    this._t(this.group.rotation, { z: this.group.rotation.z + 0.5, x: 0.3 }, 1600, Easing.Quadratic.In, 300);
    this._t(this.group.position, { y: this.group.position.y - 1.2 }, 1800, Easing.Quadratic.In, 400);

    // La luce pettorale si spegne
    if (this.chestMesh) {
      new Tween({ i: 2 }).to({ i: 0 }, 1400).easing(Easing.Quadratic.In)
        .onUpdate(o => {
          this.chestMesh.material.emissiveIntensity = o.i;
          if (this.chestLight) this.chestLight.intensity = o.i;
        }).start();
    }

    // Scintille da cortocircuito
    this._sparkBurst();
  }

  // ── Effetto: proiettile di energia verso la bomba ────────────────────────────
  _fireEnergyBolt(delay = 0) {
    const boltMat = new THREE.MeshStandardMaterial({
      color: EYE_COLOR, emissive: EYE_COLOR, emissiveIntensity: 4, roughness: 0.3,
    });
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), boltMat);
    const light = new THREE.PointLight(EYE_COLOR, 0, 6, 2);
    bolt.add(light);

    // Punto di partenza: davanti all'occhio, in coordinate mondo
    const start = new THREE.Vector3(0, 1.0, 0.7).applyMatrix4(this.group.matrixWorld);
    const target = new THREE.Vector3(BOMB_POS.x, BOMB_POS.y + 1.5, BOMB_POS.z);
    bolt.position.copy(start);
    bolt.visible = false;
    this.group.parent?.add(bolt);   // aggiungilo alla scena

    new Tween(bolt.position)
      .to({ x: target.x, y: target.y, z: target.z }, 360)
      .easing(Easing.Quadratic.In)
      .delay(delay)
      .onStart(() => { bolt.visible = true; light.intensity = 5; })
      .onComplete(() => {
        // impatto: lampo poi rimozione
        new Tween(bolt.scale).to({ x: 3, y: 3, z: 3 }, 160).easing(Easing.Quadratic.Out).start();
        new Tween({ i: 5 }).to({ i: 0 }, 220).onUpdate(o => light.intensity = o.i)
          .onComplete(() => bolt.parent?.remove(bolt)).start();
      })
      .start();
  }

  // ── Effetto: scintille (cortocircuito alla sconfitta) ────────────────────────
  _sparkBurst() {
    for (let i = 0; i < 14; i++) {
      const sparkMat = new THREE.MeshStandardMaterial({
        color: 0xfff0a0, emissive: 0xffdd66, emissiveIntensity: 5,
      });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), sparkMat);
      const origin = new THREE.Vector3(0, 0.9, 0.4).applyMatrix4(this.group.matrixWorld);
      spark.position.copy(origin);
      this.group.parent?.add(spark);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2
      );
      new Tween(spark.position)
        .to({ x: origin.x + dir.x, y: origin.y + dir.y - 0.5, z: origin.z + dir.z }, 500 + Math.random() * 300)
        .easing(Easing.Quadratic.Out)
        .delay(Math.random() * 400)
        .onComplete(() => spark.parent?.remove(spark))
        .start();
    }
  }

  // ── Ritorno delle braccia alla posa di riposo ────────────────────────────────
  _returnArms(delay) {
    if (this._defeated) return;
    const r = this._restPose;
    this._t(this.armL.rotation, { x: r.armL.x, z: r.armL.z }, 700, Easing.Quadratic.InOut, delay);
    this._t(this.armR.rotation, { x: r.armR.x, z: r.armR.z }, 700, Easing.Quadratic.InOut, delay);
    this._t(this.foreL.rotation, { x: r.foreL.x }, 700, Easing.Quadratic.InOut, delay);
    this._t(this.foreR.rotation, { x: r.foreR.x }, 700, Easing.Quadratic.InOut, delay);
  }
}
