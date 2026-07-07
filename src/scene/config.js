// DEFUSE-DECK 3D — Config / Layout
//
// Single source of truth per le coordinate della scena.
// Spostando la bomba, lampada, faretti e cavi seguono automaticamente
// perché tutti leggono da qui (niente valori sparsi).

import * as THREE from 'three';

// ── Stanza (bunker) ──────────────────────────────────────────────────────────
export const FLOOR_Y     = -2.4;   // pavimento del bunker
export const CEIL_Y      = 7.4;    // soffitto
export const ROOM_HALF_W = 13;     // pareti laterali: x ∈ [-13, 13]
export const ROOM_BACK_Z = -12;    // parete di fondo
export const ROOM_FRONT_Z =  8;    // lato aperto verso la camera (estensione pavimento/soffitto)

// ── Banco di lavoro del giocatore ───────────────────────────────────────────
export const TABLE_TOP_Y = -0.51;  // superficie del banco (le carte si riferiscono a questa)

// ── Bomba (ENORME, sul lato sinistro della stanza) ──────────────────────────
export const BOMB_SCALE = 2.8;
// y viene calcolata da BombModel per appoggiare il fondo sul pavimento.
export const BOMB_POS = new THREE.Vector3(-8.8, 0, -4.6);
