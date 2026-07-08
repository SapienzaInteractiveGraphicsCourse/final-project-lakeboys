// DEFUSE-DECK 3D — SceneManager
// REQUIRES: Three.js scene, camera, renderer, dynamic lighting

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getWoodMaps } from './TextureFactory.js';
import {
  BOMB_POS, FLOOR_Y, CEIL_Y, TABLE_TOP_Y, ROOM_BACK_Z, PLAYER_EYE,
} from './config.js';

// Preset di inquadratura: terza persona (panoramica) e prima persona (occhi dell'artificiere)
const CAMERA_VIEWS = {
  third: { pos: new THREE.Vector3(0, 5.0, 12.4), target: new THREE.Vector3(0, 0.7, -2.0) },
  first: { pos: PLAYER_EYE.clone(),              target: new THREE.Vector3(0, -0.45, -3.0) },
};

export class SceneManager {
  constructor() {
    this.scene    = new THREE.Scene();
    this.camera   = null;
    this.renderer = null;
    this.clock    = new THREE.Clock();

    // Lights — kept as instance properties so other modules can modify them
    this.spotLight    = null;  // Bedside lamp spotlight (now hangs above the bomb)
    this.redLight     = null;  // Bomb warning light (parented to bomb in main.js)
    this.ambientLight = null;
    this.controls     = null;

    // Bedside lamp group (cord + cap + shade + bulb)
    this.lampGroup    = null;
    this.lampBulb     = null;

    // Cables connettono il tavolo alla bomba — si illuminano col voltaggio
    this.cables       = [];
    this._voltageProgress = 0;
    this._redPulse        = 0;   // picco transitorio della luce rossa quando la bomba è colpita

    // Faretto drammatico dedicato
    this.bombSpot  = null;

    // Pulviscolo atmosferico (THREE.Points)
    this.dust = null;

    // Table mesh — legno procedurale (TextureFactory)
    this.table = null;

    this._initRenderer();
    this._initCamera();
    this._initScene();
    this._initLights();
    this._initTable();
    this._initBedsideLamp();
    this._initCables();
    this._initAtmosphere();
    this._initDust();
    this._initControls();
    this._bindResize();
  }

  // ── Renderer ────────────────────────────────────────────────────────────────

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',   // preferisci la GPU dedicata sui portatili
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // PERF: su display retina devicePixelRatio=2 ⇒ 4× i pixel da ombreggiare.
    // Cap a 1.5: dimezza quasi il lavoro per-frame con perdita di nitidezza minima.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.renderer.shadowMap.enabled = true;
    // PERF: PCF semplice invece di PCFSoft — ombre molto più economiche.
    this.renderer.shadowMap.type    = THREE.PCFShadowMap;

    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;

    document.body.appendChild(this.renderer.domElement);
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      80
    );
    // Inquadratura iniziale: terza persona (vedi l'artificiere di spalle)
    this.cameraView = 'third';
    this.camera.position.copy(CAMERA_VIEWS.third.pos);
    this.camera.lookAt(CAMERA_VIEWS.third.target);
  }

  // ── Scene base ──────────────────────────────────────────────────────────────

  _initScene() {
    this.scene.background = new THREE.Color(0x05060a);
    // Fog leggera: dà profondità al bunker senza nascondere la bomba
    this.scene.fog = new THREE.FogExp2(0x06070c, 0.026);

    // REQUIRES: Texture — environment map PROCEDURALE (PMREM da RoomEnvironment,
    // scena generata via codice: nessuna immagine importata). Dà riflessi
    // realistici a scocca della bomba e cornici metalliche delle carte.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // MOLTO sottile: solo un filo di riflesso sui metalli, il bunker resta buio
    this.scene.environmentIntensity = 0.015;
    pmrem.dispose();
  }

  // ── Lights ──────────────────────────────────────────────────────────────────
  // REQUIRES: Dynamic lighting — at least one dynamic light (SpotLight)
  // REQUIRES: Procedural animation — red light flicker driven by Math.sin in update()

  _initLights() {
    // 1. SpotLight principale: illumina il tavolo da gioco del giocatore (le carte)
    this.spotLight = new THREE.SpotLight(0xfff0cc, 120);
    this.spotLight.position.set(0, 6.0, 4.5);
    this.spotLight.target.position.set(0, TABLE_TOP_Y, 3.0);
    this.spotLight.angle    = Math.PI / 5;
    this.spotLight.penumbra = 0.45;
    this.spotLight.decay    = 2;
    this.spotLight.distance = 20;
    this.spotLight.castShadow = true;
    // PERF: 1024 invece di 2048 — un quarto della memoria/fill della shadow map.
    this.spotLight.shadow.mapSize.set(1024, 1024);
    this.spotLight.shadow.camera.near = 0.5;
    this.spotLight.shadow.camera.far  = 18;
    this.spotLight.shadow.bias        = -0.001;
    this.scene.add(this.spotLight, this.spotLight.target);

    // 2. Faretto scenico sulla BOMBA gigante (taglio drammatico)
    // PERF: niente ombra qui — ogni luce con castShadow aggiunge un render
    // completo della scena per frame. Teniamo solo l'ombra del tavolo.
    this.bombSpot = new THREE.SpotLight(0xffd2b0, 140, 22, Math.PI / 6, 0.5, 2);
    this.bombSpot.position.set(BOMB_POS.x + 1.5, CEIL_Y - 0.6, BOMB_POS.z + 3.5);
    this.bombSpot.target.position.set(BOMB_POS.x, FLOOR_Y + 2.4, BOMB_POS.z);
    this.scene.add(this.bombSpot, this.bombSpot.target);

    // 3. Red PointLight — bomb warning indicator (riposizionata nella scocca in main.js)
    //    distance ampia perché la bomba è enorme
    this.redLight = new THREE.PointLight(0xff2200, 1.2, 14, 2);
    this.redLight.position.set(0, 0.8, 0);
    this.scene.add(this.redLight);

    // 4. Ambient — schiarisce leggermente tutta la scena
    this.ambientLight = new THREE.AmbientLight(0x1a1f2e, 2.3);
    this.scene.add(this.ambientLight);
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  // REQUIRES: Surface to receive shadows — wood texture + Normal Map

  _initTable() {
    const topGeom = new THREE.BoxGeometry(14, 0.18, 9);
    // REQUIRES: Color map + Normal map + Roughness map — legno procedurale (TextureFactory)
    const woodMaps = getWoodMaps(3.5, 2.2);
    const topMat   = new THREE.MeshStandardMaterial({
      ...woodMaps,
      roughness: 0.82,
      metalness: 0.02,
    });
    this.table = new THREE.Mesh(topGeom, topMat);
    this.table.position.set(0, -0.6, 0);
    this.table.receiveShadow = true;
    this.scene.add(this.table);

    // Trim frontale decorativo
    const trimGeom = new THREE.BoxGeometry(14.05, 0.06, 0.12);
    const trimMat  = new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: 0.9 });
    const trim = new THREE.Mesh(trimGeom, trimMat);
    trim.position.set(0, -0.51, 4.56);
    this.scene.add(trim);

    // Gambe del banco — dal fondo del piano fino al pavimento del bunker
    const legMat = new THREE.MeshStandardMaterial({ color: 0x140a04, roughness: 0.85, metalness: 0.15 });
    const legTop = -0.69;                 // fondo del piano
    const legH   = legTop - FLOOR_Y;      // altezza fino al pavimento
    const legGeom = new THREE.BoxGeometry(0.4, legH, 0.4);
    [[-6.6, -4.1], [6.6, -4.1], [-6.6, 4.1], [6.6, 4.1]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(x, legTop - legH / 2, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });
  }

  // ── Bedside Lamp ────────────────────────────────────────────────────────────
  // REQUIRES: Hierarchical model — Lamp (Group) → cord, cap, shade, bulb

  _initBedsideLamp() {
    const g = new THREE.Group();
    g.name = 'BedsideLamp';
    g.position.set(3.2, 0, 2.8);  // spostata di lato rispetto al centro scena
    this.lampGroup = g;

    // Cord: dal soffitto (y=CEIL_Y) fino alla cima del paralume (y=4.1)
    const cordMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.2 });
    const cordH    = CEIL_Y - 4.1;   // il filo raggiunge il soffitto
    const cordY    = 4.1 + cordH / 2;
    const cord     = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, cordH, 8), cordMat);
    cord.position.y = cordY;
    g.add(cord);

    // Cap (disco di fissaggio in cima al paralume)
    const capMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.55, metalness: 0.75 });
    const cap    = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 16), capMat);
    cap.position.y = 4.1;
    cap.castShadow = true;
    g.add(cap);

    // Shade (paralume troncoconico, aperto)
    // CylinderGeometry(radiusTop, radiusBottom, height, segs, 1, openEnded=true)
    const shadeGeom = new THREE.CylinderGeometry(0.22, 0.55, 0.55, 24, 1, true);
    const shadeMat  = new THREE.MeshStandardMaterial({
      color: 0xc88a3a,
      emissive: 0xff9a3a,
      emissiveIntensity: 0.55,    // il paralume risplende dalla lampadina dentro
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(shadeGeom, shadeMat);
    shade.position.y = 3.78;
    shade.castShadow = true;
    g.add(shade);

    // Anello inferiore (bordo del paralume)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.6, metalness: 0.5 });
    const rim    = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.014, 6, 28), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.505;
    g.add(rim);

    // Lampadina: sfera emissiva all'interno del paralume
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff4cc,
      emissive: 0xfff0a8,
      emissiveIntensity: 4.5,
      roughness: 0.2,
      metalness: 0.05,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 12), bulbMat);
    bulb.position.y = 3.72;
    g.add(bulb);
    this.lampBulb = bulb;

    // PERF: niente PointLight dedicata — il paralume e la lampadina sono già
    // emissivi (brillano senza luce dinamica) e topFill copre l'area.

    this.scene.add(g);
  }

  // ── Cables ─────────────────────────────────────────────────────────────────
  // Cavi che partono dai bordi del tavolo e convergono sulla base della bomba.
  // Ogni cavo ha una soglia di voltaggio: si illumina progressivamente.

  _initCables() {
    const TABLE_Y = TABLE_TOP_Y;   // superficie del banco
    // Base della bomba gigante, lato rivolto verso il banco
    const BASE = new THREE.Vector3(BOMB_POS.x + 1.6, FLOOR_Y + 0.55, BOMB_POS.z + 1.4);

    // Partono dal lato sinistro del banco e attraversano la stanza fino alla bomba
    const specs = [
      { start: new THREE.Vector3(-6.2, TABLE_Y, -2.6), color: 0xff3344, threshold: 0.00 },
      { start: new THREE.Vector3(-6.2, TABLE_Y,  0.2), color: 0xffcc22, threshold: 0.25 },
      { start: new THREE.Vector3(-5.2, TABLE_Y, -3.6), color: 0x33ff88, threshold: 0.50 },
      { start: new THREE.Vector3(-5.2, TABLE_Y,  1.4), color: 0x44ccff, threshold: 0.75 },
    ];

    specs.forEach((spec, idx) => {
      // Cade dal bordo del banco verso il pavimento
      const edge     = new THREE.Vector3(spec.start.x - 0.7, TABLE_Y - 0.6, spec.start.z);
      // Striscia sul pavimento verso la bomba
      const floorMid = new THREE.Vector3(
        (spec.start.x + BASE.x) * 0.5,
        FLOOR_Y + 0.12,
        (spec.start.z + BASE.z) * 0.5,
      );
      // Risale sulla piattaforma fino al connettore
      const near = new THREE.Vector3(BASE.x + 0.7, FLOOR_Y + 0.25, BASE.z + 0.2);

      const curve = new THREE.CatmullRomCurve3(
        [spec.start, edge, floorMid, near, BASE.clone()],
        false,
        'catmullrom',
        0.4,
      );
      const geom = new THREE.TubeGeometry(curve, 96, 0.038, 8, false);

      // Materiale emissivo: parte spento, lo accendiamo via setVoltageProgress
      const mat = new THREE.MeshStandardMaterial({
        color:    new THREE.Color(spec.color).multiplyScalar(0.25),
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: 0.05,
        roughness: 0.55,
        metalness: 0.35,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // PERF: solo i cavi pari hanno una PointLight reale (2 invece di 4).
      // Le luci a intensità 0 pesano comunque nello shader, quindi ne creiamo meno.
      let pl = null;
      if (idx % 2 === 0) {
        pl = new THREE.PointLight(spec.color, 0, 4.5, 2);
        pl.position.copy(floorMid);
        pl.position.y = FLOOR_Y + 0.5;
        this.scene.add(pl);
      }

      // Connettore visivo alla base della bomba (piccolo cilindro)
      const plugMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, roughness: 0.6, metalness: 0.8,
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: 0.0,
      });
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), plugMat);
      plug.position.copy(BASE);
      this.scene.add(plug);

      this.cables.push({
        mesh, light: pl, plug, baseColor: spec.color, threshold: spec.threshold,
      });
    });
  }

  // ── API: aggiorna l'illuminazione dei cavi in base al voltaggio ────────────
  // progress ∈ [0,1]
  setVoltageProgress(progress) {
    this._voltageProgress = Math.max(0, Math.min(1, progress || 0));
  }

  // ── API: picco transitorio della luce rossa (bomba colpita) ─────────────────
  pulseRedLight(boost = 3) {
    this._redPulse = Math.max(this._redPulse, boost);
  }

  // ── Atmosphere ──────────────────────────────────────────────────────────────

  _initAtmosphere() {
    // PERF: ogni PointLight pesa su OGNI fragment della scena (renderer forward).
    // Meglio poche luci chiave che tanti fill.

    // Warm fill per l'area carte
    this.cardLight = new THREE.PointLight(0xffe8cc, 26, 9, 2);
    this.cardLight.position.set(0, 3.0, 5.0);
    this.scene.add(this.cardLight);

    // Wall wash: una sola luce bi-tonale che rivela la parete di fondo
    const backWash = new THREE.PointLight(0x44486a, 14, 24, 2);
    backWash.position.set(0, 4.5, ROOM_BACK_Z + 2);
    this.scene.add(backWash);

    // Soft top fill: dà volume all'intera stanza dall'alto
    const topFill = new THREE.PointLight(0x556070, 10, 30, 2);
    topFill.position.set(0, CEIL_Y - 1, -2);
    this.scene.add(topFill);
  }

  // ── Pulviscolo atmosferico ───────────────────────────────────────────────────
  // REQUIRES: Procedural animation — le particelle galleggiano via Math.sin in update()

  _initDust() {
    const COUNT = 320;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 24;          // x
      positions[i * 3 + 1] = FLOOR_Y + Math.random() * (CEIL_Y - FLOOR_Y); // y
      positions[i * 3 + 2] = ROOM_BACK_Z + Math.random() * 18;             // z
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x9fb0c4,
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.dust = new THREE.Points(geom, mat);
    this.dust.name = 'Dust';
    this.scene.add(this.dust);
  }

  // ── OrbitControls ───────────────────────────────────────────────────────────

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.08;
    this.controls.target.copy(CAMERA_VIEWS.third.target);
    this.controls.minDistance    = 4;
    this.controls.maxDistance    = 28;
    this.controls.maxPolarAngle  = Math.PI / 2.05;
  }

  // ── API: cambio inquadratura (prima ⇄ terza persona) ────────────────────────
  // Interpolazione manuale nel render loop (vedi update()): durante la transizione
  // sospendiamo OrbitControls — altrimenti riposizionerebbe la camera ogni frame
  // annullando il movimento. A fine transizione OrbitControls riprende dal nuovo
  // punto, così puoi comunque ruotare la visuale.
  setCameraView(view) {
    const preset = CAMERA_VIEWS[view] || CAMERA_VIEWS.third;
    this.cameraView = view;
    this.controls.minDistance = view === 'first' ? 1.2 : 4;
    this._camAnim = {
      fromPos: this.camera.position.clone(),
      toPos:   preset.pos.clone(),
      fromTgt: this.controls.target.clone(),
      toTgt:   preset.target.clone(),
      start:   performance.now(),
      dur:     750,   // ms — progresso calcolato dal tempo reale (frame-rate independent)
    };
    return view;
  }

  toggleCameraView() {
    return this.setCameraView(this.cameraView === 'third' ? 'first' : 'third');
  }

  // ── Resize handler ──────────────────────────────────────────────────────────

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ── Per-frame update ────────────────────────────────────────────────────────
  // REQUIRES: Procedural animation — red light flicker via sinusoidal code, no keyframes

  update(/* time */) {
    const t = this.clock.getElapsedTime();

    // Compound sine flicker per la luce rossa della bomba
    const base    = Math.sin(t * 4.1);
    const tremolo = Math.sin(t * 13.7) * 0.3;
    const flicker = 0.55 + 0.45 * Math.abs(base + tremolo);
    this.redLight.intensity = flicker * 1.4 + this._redPulse;
    this._redPulse *= 0.90;   // decadimento del picco da impatto

    // Lampada da comodino: dondolio lento + leggero flicker della lampadina
    if (this.lampGroup) {
      this.lampGroup.rotation.z = Math.sin(t * 0.55) * 0.022;
      this.lampGroup.rotation.x = Math.cos(t * 0.48) * 0.015;
    }
    if (this.lampBulb) {
      const lampFlick = 1.0 + Math.sin(t * 9.3) * 0.05 + Math.sin(t * 23.1) * 0.02;
      this.lampBulb.material.emissiveIntensity = 4.5 * lampFlick;
    }

    // Cavi: ogni cavo si attiva quando il progresso supera la sua soglia,
    // poi pulsa proceduralmente per dare l'impressione di "energia che scorre".
    this.cables.forEach(c => {
      const over = this._voltageProgress - c.threshold;        // quanto siamo oltre la soglia
      // attivazione graduale: 0 sotto soglia, sale fino a 1 nei 0.25 successivi
      const act  = Math.max(0, Math.min(1, over / 0.25));
      const pulse = 0.75 + 0.25 * Math.sin(t * 4.2 + c.threshold * 9);
      const emissive = act > 0 ? (1.4 * pulse + 0.4) * act + 0.05 : 0.05;
      c.mesh.material.emissiveIntensity = emissive;
      if (c.light) c.light.intensity    = act * 1.8 * pulse;
      c.plug.material.emissiveIntensity = act * 1.6;
    });

    // Pulviscolo: lento moto rotatorio + galleggiamento sinusoidale
    if (this.dust) {
      this.dust.rotation.y = t * 0.012;
      this.dust.position.y = Math.sin(t * 0.3) * 0.25;
    }

    // Transizione di inquadratura (prima ⇄ terza persona): interpolazione manuale,
    // basata sul TEMPO REALE (non sul dt per frame) così resta corretta anche se
    // il browser limita i frame. Mentre è attiva, OrbitControls resta sospeso per
    // non annullare il movimento; al termine riprende dal nuovo punto.
    if (this._camAnim) {
      const a = this._camAnim;
      const k = Math.min((performance.now() - a.start) / a.dur, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
      this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
      this.controls.target.lerpVectors(a.fromTgt, a.toTgt, e);
      this.camera.lookAt(this.controls.target);
      if (k >= 1) this._camAnim = null;
    } else {
      this.controls.update();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
