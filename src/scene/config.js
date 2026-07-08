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

// ── Mazzo e pila degli scarti (angolo destro del banco) ─────────────────────
export const DECK_POS    = new THREE.Vector3(6.2,  TABLE_TOP_Y, 3.3);
export const DISCARD_POS = new THREE.Vector3(5.05, TABLE_TOP_Y, 3.4);

// ── Bomba (ENORME, sul lato sinistro della stanza) ──────────────────────────
export const BOMB_SCALE = 2.8;
// y viene calcolata da BombModel per appoggiare il fondo sul pavimento.
export const BOMB_POS = new THREE.Vector3(-8.8, 0, -4.6);

// ── Giocatore "L'ARTIFICIERE" (seduto al lato vicino del tavolo) ────────────
// Origine del busto: appena oltre il bordo del tavolo, chino e rivolto alla bomba.
// y basso → in terza persona lo guardi "sopra la spalla", senza coprire le carte.
export const PLAYER_POS = new THREE.Vector3(0, -1.15, 5.7);
// Posizione "occhi" usata dalla camera in prima persona (davanti alla testa,
// inquadra il ventaglio in basso e la bomba di fronte).
export const PLAYER_EYE = new THREE.Vector3(0, 1.55, 5.1);
