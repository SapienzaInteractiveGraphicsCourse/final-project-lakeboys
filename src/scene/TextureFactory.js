// DEFUSE-DECK 3D — TextureFactory
//
// REQUIRES: Texture maps — Color map, Normal map, Roughness map, Metalness map
// Tutte le texture sono generate proceduralmente via Canvas API (nessun file .png esterno).
// Ogni funzione restituisce un THREE.CanvasTexture pronto all'uso.

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

// ════════════════════════════════════════════════════════════════════════════════
// LEGNO — Color · Normal · Roughness
// ════════════════════════════════════════════════════════════════════════════════

// REQUIRES: Color map — venatura generata con doppia sinusoide incommensurabile
export function woodColorMap(sz = 512) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        // Doppia sinusoide: frequenze incommenssurabili → pattern aperiodico (legno organico)
        const g = (Math.sin(x * 0.12 + Math.sin(y * 0.038) * 6.8) + 1) * 0.5;
        const k = (Math.sin(x * 0.43 + y * 0.066) + 1) * 0.5 * 0.18;
        const v = g + k;

        d[i]   = Math.min(255, 60 + v * 58);    // R — canale caldo
        d[i+1] = Math.min(255, 32 + v * 30);    // G
        d[i+2] = Math.min(255,  9 + v * 14);    // B
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Nodi del legno (sfumature radiali scure)
    [[s * 0.28, s * 0.37, 26], [s * 0.71, s * 0.62, 20], [s * 0.50, s * 0.82, 17]]
      .forEach(([kx, ky, kr]) => {
        const gr = ctx.createRadialGradient(kx, ky, 1, kx, ky, kr);
        gr.addColorStop(0, 'rgba(16,6,2,0.78)');
        gr.addColorStop(1, 'rgba(16,6,2,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(kx - kr, ky - kr, kr * 2, kr * 2);
      });
  });
}

// REQUIRES: Normal map — derivata della sinusoide codificata in R·G·B
export function woodNormalMap(sz = 512) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i  = (y * s + x) * 4;
        // La derivata dx della venatura dà la pendenza sul piano X (normale R)
        const dx = Math.cos(x * 0.12 + Math.sin(y * 0.038) * 6.8) * (0.12 * 15);
        const dy = Math.cos(x * 0.43 + y * 0.066) * (0.066 * 10) * 0.6;

        d[i]   = Math.max(0, Math.min(255, 128 + dx)); // R = X normal
        d[i+1] = Math.max(0, Math.min(255, 128 + dy)); // G = Y normal
        d[i+2] = 255;                                    // B = Z (verso viewer)
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// REQUIRES: Roughness map — fibre ruvide, cime della venatura leggermente più lucide
export function woodRoughnessMap(sz = 256) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const g = (Math.sin(x * 0.12 + Math.sin(y * 0.038) * 6.8) + 1) * 0.5;
        // Cime: roughness 0.68; fibre: 0.88
        const v = Math.floor(175 + g * 48);
        d[i] = d[i+1] = d[i+2] = v;
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

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

// ════════════════════════════════════════════════════════════════════════════════
// CEMENTO — Color · Normal · Roughness  (pavimento e pareti del bunker)
// ════════════════════════════════════════════════════════════════════════════════

// REQUIRES: Color map — cemento industriale con macchie, crepe e fughe tra le piastre
export function concreteColorMap(sz = 512) {
  return makeTex(sz, (ctx, s) => {
    // Base grigio-bluastra scura
    ctx.fillStyle = '#2a2c33';
    ctx.fillRect(0, 0, s, s);

    // Macchie di sporco / umidità (rettangoli morbidi sovrapposti)
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5
        ? `rgba(20,22,28,${a})`
        : `rgba(70,74,84,${a * 0.8})`;
      const w = Math.random() * 60 + 10;
      ctx.fillRect(Math.random() * s, Math.random() * s, w, w * (Math.random() * 0.6 + 0.5));
    }

    // Fughe tra le piastre (griglia 1/2)
    ctx.strokeStyle = 'rgba(8,9,12,0.85)';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();

    // Crepe sottili ramificate
    ctx.strokeStyle = 'rgba(10,11,14,0.6)';
    for (let i = 0; i < 7; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      ctx.lineWidth = Math.random() * 1.2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = Math.floor(Math.random() * 6) + 4;
      for (let k = 0; k < steps; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

// REQUIRES: Normal map — granulosità del cemento + rilievo delle fughe
export function concreteNormalMap(sz = 512) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const grain = (Math.random() - 0.5) * 10;
        // incavo lungo le fughe centrali
        const seamX = Math.abs(x - s / 2) < 3 ? (x < s / 2 ? -40 : 40) : 0;
        const seamY = Math.abs(y - s / 2) < 3 ? (y < s / 2 ? -40 : 40) : 0;
        d[i]   = Math.max(0, Math.min(255, 128 + grain + seamX));
        d[i+1] = Math.max(0, Math.min(255, 128 + grain + seamY));
        d[i+2] = 255;
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// REQUIRES: Roughness map — cemento opaco con chiazze lievemente lucide (umidità)
export function concreteRoughnessMap(sz = 256) {
  return makeTex(sz, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const d   = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, 205 + (Math.random() - 0.5) * 60));
      d[i] = d[i+1] = d[i+2] = v;
      d[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
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
    map:          tile(concreteColorMap(512),     tileX, tileY),
    normalMap:    tile(concreteNormalMap(512),    tileX, tileY),
    roughnessMap: tile(concreteRoughnessMap(256), tileX, tileY),
  };
}

export function getWoodMaps(tileX = 3.5, tileY = 2.2) {
  return {
    map:          tile(woodColorMap(512),    tileX, tileY),
    normalMap:    tile(woodNormalMap(512),   tileX, tileY),
    roughnessMap: tile(woodRoughnessMap(256), tileX, tileY),
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
