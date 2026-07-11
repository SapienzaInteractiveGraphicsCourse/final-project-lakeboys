// DEFUSE-DECK 3D — TextureFactory
//
// REQUIRES: Texture maps — Color map, Normal map, Roughness map, Metalness map
// I materiali principali (cemento, legno, metallo) usano set PBR fotografici da
// public/textures/ (ambientCG, CC0). Restano procedurali via Canvas API solo le
// carte (olografico PCB, tinta per-seme), la banda hazard e i numeri delle carte.

import * as THREE from 'three';

// ── Helper base ────────────────────────────────────────────────────────────────

function makeTex(sz, drawFn) {
  const cv  = document.createElement('canvas');
  cv.width  = cv.height = sz;
  const ctx = cv.getContext('2d');
  drawFn(ctx, sz);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

// Imposta il tiling e anisotropia su una texture già creata
function tile(tex, rx, ry, aniso = 4) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = aniso;
  return tex;
}

// ── Caricamento texture da file (public/textures) ───────────────────────────
// I materiali principali (cemento, legno, metallo) usano set PBR fotografici
// scaricati da ambientCG (CC0) invece delle mappe generate via Canvas.
// Cache dei byte immagine: chiamate ripetute allo stesso file riusano lo stesso
// Image (una sola richiesta HTTP), ma ogni THREE.Texture resta indipendente e
// riceve il proprio onLoad → needsUpdate. Così superfici diverse (pavimento,
// pareti, basamento) possono tilare la stessa texture con densità diverse.
THREE.Cache.enabled = true;
const _loader  = new THREE.TextureLoader();
const TEX_BASE = 'public/textures/';

// Carica una texture da file. isColor=true → spazio colore sRGB; le mappe dati
// (normal/roughness/metalness) restano in spazio lineare.
function loadFileTex(path, isColor, rx, ry, aniso = 8) {
  const tex = _loader.load(TEX_BASE + path);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = aniso;
  return tex;
}

// Prefissi dei set PBR presenti in public/textures/
const CONCRETE_DIR = 'Concrete042C_1K-JPG/Concrete042C_1K-JPG_';
const WOOD_DIR     = 'Planks037A_1K-JPG/Planks037A_1K-JPG_';
const METAL_DIR    = 'PaintedMetal006_1K-JPG/PaintedMetal006_1K-JPG_';

// ════════════════════════════════════════════════════════════════════════════════
// CARTE — Color (olografico PCB) · Normal · Roughness
// ════════════════════════════════════════════════════════════════════════════════

// REQUIRES: Color map — tracce PCB olografiche, accentColor per-seme
export function cardHoloMap(sz = 256, accentHex = 0x55aaff) {
  const css = '#' + accentHex.toString(16).padStart(6, '0');

  return makeTex(sz, (ctx, s) => {
    // Sfondo: gradiente diagonale molto scuro
    const gr = ctx.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0,   '#060c1c');
    gr.addColorStop(0.5, '#0b1428');
    gr.addColorStop(1,   '#040810');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = css;
    ctx.lineWidth   = 0.9;
    ctx.globalAlpha = 0.24;

    // Tracce orizzontali spezzate (PCB bus lines)
    for (let y = 10; y < s; y += 14) {
      ctx.beginPath();
      let x = 0;
      while (x < s) {
        const seg = Math.random() > 0.32 ? Math.random() * 28 + 8 : 0;
        if (seg) { ctx.moveTo(x, y); ctx.lineTo(x + seg, y); }
        x += (seg || 0) + Math.random() * 8 + 3;
      }
      ctx.stroke();
    }

    // Tracce verticali brevi (stub / via connectors)
    for (let x = 10; x < s; x += 18) {
      if (Math.random() > 0.52) {
        const y0 = Math.random() * s;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + Math.random() * 36 + 8);
        ctx.stroke();
      }
    }

    // Via pads (cerchi di giunzione)
    ctx.fillStyle   = css;
    ctx.globalAlpha = 0.32;
    for (let i = 0; i < 22; i++) {
      const vx = Math.floor(Math.random() * (s / 18)) * 18 + Math.random() * 3;
      const vy = Math.floor(Math.random() * (s / 14)) * 14 + Math.random() * 3;
      ctx.beginPath();
      ctx.arc(vx, vy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lieve bagliore olografico diagonale (effetto iridescente)
    ctx.globalAlpha = 0.06;
    const holo = ctx.createLinearGradient(0, 0, s, 0);
    holo.addColorStop(0,    'transparent');
    holo.addColorStop(0.3,  css);
    holo.addColorStop(0.7,  'transparent');
    holo.addColorStop(1,    css);
    ctx.fillStyle = holo;
    ctx.fillRect(0, 0, s, s);

    ctx.globalAlpha = 1;
  });
}

// REQUIRES: Normal map — rilievi delle tracce PCB
export function cardNormalMap(sz = 256) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i   = (y * s + x) * 4;
        const onH = (y % 14 < 2) ? 12 : 0;
        const onV = (x % 18 < 2) ? 12 : 0;
        d[i]   = Math.min(255, 128 + onV);
        d[i+1] = Math.min(255, 128 + onH);
        d[i+2] = 255;
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// REQUIRES: Roughness map — carta leggermente lucida (0.28 roughness)
export function cardRoughnessMap(sz = 128) {
  return makeTex(sz, (ctx, s) => {
    ctx.fillStyle = '#474747';
    ctx.fillRect(0, 0, s, s);
  });
}

// REQUIRES: Color map — strisce di pericolo giallo/nero diagonali (banda hazard)
export function hazardStripeMap(sz = 256) {
  return makeTex(sz, (ctx, s) => {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, s, s);
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.translate(-s, -s);
    const band = s / 6;
    for (let x = 0; x < s * 2; x += band * 2) {
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(x, 0, band, s * 2);
    }
    ctx.restore();
    // usura: graffi e sporco sopra le strisce
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, Math.random() * 12 + 2, Math.random() * 12 + 2);
    }
  });
}

// ── Bundle convenience: restituisce l'intero set per ogni materiale ────────────

export function getConcreteMaps(tileX = 6, tileY = 6) {
  return {
    map:          loadFileTex(CONCRETE_DIR + 'Color.jpg',     true,  tileX, tileY),
    normalMap:    loadFileTex(CONCRETE_DIR + 'NormalGL.jpg',  false, tileX, tileY),
    roughnessMap: loadFileTex(CONCRETE_DIR + 'Roughness.jpg', false, tileX, tileY),
  };
}

export function getWoodMaps(tileX = 3.5, tileY = 2.2) {
  return {
    map:          loadFileTex(WOOD_DIR + 'Color.jpg',     true,  tileX, tileY),
    normalMap:    loadFileTex(WOOD_DIR + 'NormalGL.jpg',  false, tileX, tileY),
    roughnessMap: loadFileTex(WOOD_DIR + 'Roughness.jpg', false, tileX, tileY),
  };
}

export function getMetalMaps() {
  return {
    map:          loadFileTex(METAL_DIR + 'Color.jpg',     true,  1, 1),
    normalMap:    loadFileTex(METAL_DIR + 'NormalGL.jpg',  false, 1, 1),
    roughnessMap: loadFileTex(METAL_DIR + 'Roughness.jpg', false, 1, 1),
    metalnessMap: loadFileTex(METAL_DIR + 'Metalness.jpg', false, 1, 1),
  };
}

export function getCardMaps(accentHex) {
  return {
    map:          cardHoloMap(256, accentHex),
    normalMap:    cardNormalMap(256),
    roughnessMap: cardRoughnessMap(128),
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// NUMERO DELLA CARTA — glifo grande e leggibile (color map su MeshBasicMaterial)
// ════════════════════════════════════════════════════════════════════════════════

// Cache per (valore, colore): le carte uguali condividono la stessa texture.
const _rankCache = new Map();

// REQUIRES: Color map — numero disegnato proceduralmente via Canvas API.
// Bianco brillante con contorno nel colore del seme e alone scuro → leggibile
// sul fondo olografico scuro della carta da qualsiasi distanza.
export function rankLabelTexture(value, accentHex = 0xffffff) {
  const key = `${value}_${accentHex}`;
  if (_rankCache.has(key)) return _rankCache.get(key);

  const css = '#' + accentHex.toString(16).padStart(6, '0');
  const tex = makeTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const label = String(value);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin     = 'round';

    // Adatta la dimensione del font per i numeri a due cifre (10, 11)
    let fontSize = 176;
    ctx.font = `900 ${fontSize}px Arial, "Arial Black", sans-serif`;
    while (ctx.measureText(label).width > s * 0.82 && fontSize > 48) {
      fontSize -= 8;
      ctx.font = `900 ${fontSize}px Arial, "Arial Black", sans-serif`;
    }

    const cx = s / 2, cy = s / 2;
    // Alone scuro per contrasto
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur  = 20;
    ctx.lineWidth   = 20;
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.strokeText(label, cx, cy);
    ctx.shadowBlur  = 0;
    // Contorno colorato del seme
    ctx.lineWidth   = 10;
    ctx.strokeStyle = css;
    ctx.strokeText(label, cx, cy);
    // Riempimento bianco brillante
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(label, cx, cy);
  });
  tex.anisotropy = 8;
  _rankCache.set(key, tex);
  return tex;
}
