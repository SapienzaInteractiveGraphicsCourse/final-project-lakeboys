// DEFUSE-DECK 3D — Entry Point
// Esame: Interactive Graphics — Three.js + tween.js, no framework UI
//
// Architettura (src/):
//   core/     logica pura (stato, combo) — nessuna dipendenza da DOM/Three
//   scene/    mondo 3D (scena, stanza, carte)
//   systems/  sistemi di gioco (carte 3D, input)
//   ui/       HUD e overlay DOM
//   GameManager.js orchestratore dei turni

import { update as tweenUpdate } from '@tweenjs/tween.js';

import { SceneManager } from './src/scene/SceneManager.js';
import { RoomModel }    from './src/scene/RoomModel.js';
import { CardSystem }   from './src/systems/CardSystem.js';
import { InputManager } from './src/systems/InputManager.js';
import { HUD }          from './src/ui/HUD.js';
import { GameManager }  from './src/GameManager.js';

// ── Bootstrap: mondo 3D ───────────────────────────────────────────────────────
const sceneManager = new SceneManager();
const roomModel    = new RoomModel();
const cardSystem   = new CardSystem(sceneManager.scene);

sceneManager.scene.add(roomModel.group);

// ── Bootstrap: sistemi e UI ───────────────────────────────────────────────────
const hud = new HUD();

const gameManager = new GameManager({ hud, cardSystem });

// Mano iniziale: 8 carte a ventaglio sul banco
cardSystem.deal(8);
hud.setDeckCount(cardSystem.deckCount);

// REQUIRES: THREE.Raycaster — InputManager gestisce tutta l'interazione
const inputManager = new InputManager({
  camera: sceneManager.camera,
  renderer: sceneManager.renderer,
  cardSystem, gameManager, sceneManager, hud,
});
gameManager.attachInput(inputManager);

// ── Animation Loop ────────────────────────────────────────────────────────────
function animate(time) {
  requestAnimationFrame(animate);

  // REQUIRES: tween.js update — guida le animazioni procedurali del progetto
  tweenUpdate(time);

  const t = sceneManager.clock.getElapsedTime();
  sceneManager.update(time);
  roomModel.update(t);

  sceneManager.render();
}

animate(0);
