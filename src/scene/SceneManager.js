// DEFUSE-DECK 3D — SceneManager
// REQUIRES: Three.js scene, camera, renderer, dynamic lighting

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getWoodMaps } from './TextureFactory.js';
import { FLOOR_Y, CEIL_Y, TABLE_TOP_Y, ROOM_BACK_Z } from './config.js';

export class SceneManager {
  constructor() {
    this.scene    = new THREE.Scene();
    this.camera   = null;
    this.renderer = null;
    this.clock    = new THREE.Clock();

    // Lights — kept as instance properties so other modules can modify them
    this.spotLight    = null;
    this.ambientLight = null;
    this.controls     = null;

    // Bedside lamp group (cord + cap + shade + bulb)
    this.lampGroup    = null;
    this.lampBulb     = null;

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.renderer.shadowMap.enabled = true;
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
    this.camera.position.set(0, 5.0, 12.4);
    this.camera.lookAt(new THREE.Vector3(0, 0.7, -2.0));
  }

  // ── Scene base ──────────────────────────────────────────────────────────────

  _initScene() {
    this.scene.background = new THREE.Color(0x05060a);
    // Fog leggera: dà profondità al bunker senza nascondere il tavolo
    this.scene.fog = new THREE.FogExp2(0x06070c, 0.026);

    // REQUIRES: Texture — environment map PROCEDURALE (PMREM da RoomEnvironment,
    // scena generata via codice: nessuna immagine importata).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.015;
    pmrem.dispose();
  }

  // ── Lights ──────────────────────────────────────────────────────────────────
  // REQUIRES: Dynamic lighting — at least one dynamic light (SpotLight)

  _initLights() {
    // 1. SpotLight principale: illumina il tavolo da gioco del giocatore
    this.spotLight = new THREE.SpotLight(0xfff0cc, 120);
    this.spotLight.position.set(0, 6.0, 4.5);
    this.spotLight.target.position.set(0, TABLE_TOP_Y, 3.0);
    this.spotLight.angle    = Math.PI / 5;
    this.spotLight.penumbra = 0.45;
    this.spotLight.decay    = 2;
    this.spotLight.distance = 20;
    this.spotLight.castShadow = true;
    this.spotLight.shadow.mapSize.set(1024, 1024);
    this.spotLight.shadow.camera.near = 0.5;
    this.spotLight.shadow.camera.far  = 18;
    this.spotLight.shadow.bias        = -0.001;
    this.scene.add(this.spotLight, this.spotLight.target);

    // 2. Ambient — schiarisce leggermente tutta la scena
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

  // ── Atmosphere ──────────────────────────────────────────────────────────────

  _initAtmosphere() {
    // Warm fill per l'area di gioco davanti alla camera
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
    this.controls.target.set(0, 0.7, -2.0);
    this.controls.minDistance    = 4;
    this.controls.maxDistance    = 28;
    this.controls.maxPolarAngle  = Math.PI / 2.05;
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
  // REQUIRES: Procedural animation — dondolii e flicker via Math.sin, no keyframes

  update(/* time */) {
    const t = this.clock.getElapsedTime();

    // Lampada da comodino: dondolio lento + leggero flicker della lampadina
    if (this.lampGroup) {
      this.lampGroup.rotation.z = Math.sin(t * 0.55) * 0.022;
      this.lampGroup.rotation.x = Math.cos(t * 0.48) * 0.015;
    }
    if (this.lampBulb) {
      const lampFlick = 1.0 + Math.sin(t * 9.3) * 0.05 + Math.sin(t * 23.1) * 0.02;
      this.lampBulb.material.emissiveIntensity = 4.5 * lampFlick;
    }

    // Pulviscolo: lento moto rotatorio + galleggiamento sinusoidale
    if (this.dust) {
      this.dust.rotation.y = t * 0.012;
      this.dust.position.y = Math.sin(t * 0.3) * 0.25;
    }

    this.controls.update();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
