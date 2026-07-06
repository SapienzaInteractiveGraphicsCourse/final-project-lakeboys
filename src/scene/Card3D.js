// DEFUSE-DECK 3D — Card3D
//
// REQUIRES: Hierarchical model
//   Card (Group)
//     └── CardBase (Mesh)          ← corpo principale BoxGeometry sottile
//     └── frame strips (Mesh ×8)   ← cornice in rilievo
//     └── Symbol (Group)           ← simbolo 3D centrale
//           └── symbol meshes
//     └── value dots (Mesh ×n)     ← indicatore valore

import * as THREE from 'three';
import { getCardMaps, rankLabelTexture } from './TextureFactory.js';

// ── Definizione semi ─────────────────────────────────────────────────────────

export const SUIT_DEFS = {
  volt: { baseColor: 0x0b1630, accentColor: 0x55aaff, label: 'VOLT' },
  wire: { baseColor: 0x280d0d, accentColor: 0xff4422, label: 'WIRE' },
  chip: { baseColor: 0x0b280b, accentColor: 0x44ff88, label: 'CHIP' },
  cap:  { baseColor: 0x28250b, accentColor: 0xffdd44, label: 'CAP'  },
};

// ── Card3D ───────────────────────────────────────────────────────────────────

export class Card3D {
  constructor({ suit = 'volt', value = 7, voltage = 10 } = {}) {
    this.suit    = suit;
    this.value   = value;
    this.voltage = voltage;

    this.isSelected = false;
    this.isHovered  = false;

    // REQUIRES: Hierarchical model — Card (Group) contiene tutti i sotto-mesh
    this.group = new THREE.Group();
    this.group.name = 'Card';
    // userData permette al Raycaster (Fase 4) di risalire all'istanza
    this.group.userData = { isCard: true, cardRef: this };

    // Posa base salvata per il ripristino via tween.js (Fase 4)
    this.basePos = new THREE.Vector3();
    this.baseRot = new THREE.Euler();

    this._build();
  }

  _build() {
    const def = SUIT_DEFS[this.suit];

    // ── 1. BASE DELLA CARTA ────────────────────────────────────────────────
    // REQUIRES: Color map + Normal map + Roughness map — PCB olografico per-seme
    const cardMaps = getCardMaps(def.accentColor);
    const baseMat  = new THREE.MeshStandardMaterial({
      ...cardMaps,
      color:     def.baseColor,   // tinta il color map con il colore del seme
      roughness: 0.30,
      metalness: 0.18,
    });
    this.baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.88, 0.036),
      baseMat
    );
    this.baseMesh.name = 'CardBase';
    this.baseMesh.castShadow = this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // ── 2. CORNICE IN RILIEVO ─────────────────────────────────────────────
    // REQUIRES: Hierarchical — strip di cornice figlie del Card Group
    this._buildFrame(def.accentColor);

    // ── 3. SIMBOLO 3D CENTRALE ────────────────────────────────────────────
    // REQUIRES: Hierarchical — Symbol (Group) figlio di Card (Group)
    const symbolGroup = new THREE.Group();
    symbolGroup.name = 'Symbol';
    this._buildSymbol(symbolGroup, def);
    this.group.add(symbolGroup);

    // ── Numero della carta (angoli, stile carta da gioco) ─────────────────
    this._buildRankLabels(def.accentColor);
  }

  // ── Cornice ──────────────────────────────────────────────────────────────

  _buildFrame(accentColor) {
    const mat = new THREE.MeshStandardMaterial({
      color: accentColor, roughness: 0.12, metalness: 0.94,
    });
    const T = 0.046, EDGE = 0.014;
    const W = 0.62, H = 0.88;

    // Strisce orizzontali top/bottom
    [H / 2, -H / 2].forEach(y => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(W + EDGE * 2, EDGE * 2, T), mat);
      s.position.set(0, y, 0.002);
      this.group.add(s);
    });

    // Strisce verticali left/right
    [W / 2, -W / 2].forEach(x => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(EDGE * 2, H, T), mat);
      s.position.set(x, 0, 0.002);
      this.group.add(s);
    });

    // Angoli rinforzati (decorazione)
    const cornerGeom = new THREE.BoxGeometry(0.048, 0.048, T * 1.15);
    [1, -1].forEach(sx => [1, -1].forEach(sy => {
      const c = new THREE.Mesh(cornerGeom, mat);
      c.position.set(sx * W / 2, sy * H / 2, 0.003);
      this.group.add(c);
    }));
  }

  // ── Simbolo 3D ───────────────────────────────────────────────────────────

  _buildSymbol(g, def) {
    const accentMat = new THREE.MeshStandardMaterial({
      color: def.accentColor, emissive: def.accentColor,
      emissiveIntensity: 0.28, roughness: 0.18, metalness: 0.72,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d0d, roughness: 0.42, metalness: 0.82,
    });

    switch (this.suit) {
      case 'volt': this._symVolt(g, accentMat); break;
      case 'wire': this._symWire(g, accentMat, darkMat); break;
      case 'chip': this._symChip(g, accentMat, darkMat); break;
      case 'cap':  this._symCap(g, accentMat, darkMat);  break;
    }
  }

  // Fulmine estruso (volt)
  _symVolt(g, mat) {
    // REQUIRES: ExtrudeGeometry — shape 2D estrusa in 3D
    const shape = new THREE.Shape();
    shape.moveTo( 0.04,  0.17);
    shape.lineTo(-0.08,  0.01);
    shape.lineTo( 0.01,  0.01);
    shape.lineTo(-0.04, -0.17);
    shape.lineTo( 0.11, -0.01);
    shape.lineTo( 0.02, -0.01);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.038, bevelEnabled: false });
    const bolt = new THREE.Mesh(geom, mat);
    bolt.position.set(-0.035, -0.005, 0.022);
    g.add(bolt);
  }

  // Connettore circolare (wire)
  _symWire(g, accentMat, darkMat) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 18), accentMat);
    ring.position.z = 0.036;
    g.add(ring);

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.072, 10), darkMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.z = 0.036;
    g.add(rod);

    const connMat = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.95, roughness: 0.08 });
    const conn    = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.038, 0.055), connMat);
    conn.position.set(0, 0, 0.082);
    g.add(conn);
  }

  // Microchip con piedini (chip)
  _symChip(g, accentMat, darkMat) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.21, 0.052), darkMat);
    body.position.z = 0.036;
    g.add(body);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.08, metalness: 1.0 });

    // 3 piedini per lato (left / right)
    for (let i = 0; i < 3; i++) {
      [-0.115, 0.115].forEach(x => {
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.034, 0.016), goldMat);
        pin.position.set(x, -0.055 + i * 0.055, 0.036);
        g.add(pin);
      });
    }

    // Marcatura circolare (dot-1 in alto a sx del chip)
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.030, 8), accentMat);
    mark.position.set(-0.058, 0.058, 0.063);
    g.add(mark);
  }

  // Condensatore elettrolitico (cap)
  _symCap(g, accentMat, darkMat) {
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xaaaacc, roughness: 0.18, metalness: 0.88 });

    // Due armature parallele
    [-0.050, 0.050].forEach(z => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.014), plateMat);
      plate.position.z = 0.036 + z;
      g.add(plate);
    });

    // Terminali
    const leadMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.9 });
    [-0.058, 0.058].forEach(x => {
      const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 6), leadMat);
      lead.rotation.z = Math.PI / 2;
      lead.position.set(x, 0, 0.036);
      g.add(lead);
    });

    // Marcatura + (polo positivo)
    const markH = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.010, 0.006), accentMat);
    const markV = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.055, 0.006), accentMat);
    [markH, markV].forEach(m => { m.position.set(0.058, 0.075, 0.073); g.add(m); });
  }

  // ── Numero della carta (angoli opposti, come una carta da gioco) ──────────
  // Il numero è una texture procedurale su MeshBasicMaterial: non dipende dalle
  // luci, quindi resta sempre brillante e leggibile in qualunque inquadratura.

  _buildRankLabels(accentColor) {
    const tex = rankLabelTexture(this.value, accentColor);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(0.30, 0.30);
    const z   = 0.03;   // appena davanti alla faccia della carta (semi-spessore 0.018)

    // Angolo in alto a sinistra
    const tl = new THREE.Mesh(geo, mat);
    tl.position.set(-0.17, 0.27, z);
    tl.renderOrder = 2;
    this.group.add(tl);

    // Angolo in basso a destra, ruotato di 180° (come sulle carte reali)
    const br = new THREE.Mesh(geo, mat);
    br.position.set(0.17, -0.27, z);
    br.rotation.z = Math.PI;
    br.renderOrder = 2;
    this.group.add(br);
  }
}
