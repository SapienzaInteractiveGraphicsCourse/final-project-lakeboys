// DEFUSE-DECK 3D — Entry Point
// Esame: Interactive Graphics — Three.js + tween.js, no framework UI
//
// Architettura (src/):
//   core/     logica pura (stato, combo) — nessuna dipendenza da DOM/Three
//   scene/    mondo 3D (scena, stanza, bomba, carte)
//   systems/  sistemi di gioco (carte 3D, input, effetti di regia)
//   ui/       HUD e overlay DOM
//   GameManager.js orchestratore dei turni

import { update as tweenUpdate } from '@tweenjs/tween.js';

import { SceneManager } from './src/scene/SceneManager.js';
import { RoomModel }    from './src/scene/RoomModel.js';
import { BombModel }    from './src/scene/BombModel.js';
import { CardSystem }   from './src/systems/CardSystem.js';
import { InputManager } from './src/systems/InputManager.js';
import { Effects }      from './src/systems/Effects.js';
import { Particles }    from './src/systems/Particles.js';
import { HUD }          from './src/ui/HUD.js';
import { GameManager }  from './src/GameManager.js';

// ── Bootstrap: mondo 3D ───────────────────────────────────────────────────────
const sceneManager = new SceneManager();
const roomModel    = new RoomModel();
const bombModel    = new BombModel();
const cardSystem   = new CardSystem(sceneManager.scene);

sceneManager.scene.add(roomModel.group);
sceneManager.scene.add(bombModel.group);

// REQUIRES: Hierarchical model — PointLight rossa figlia del gruppo bomba
sceneManager.redLight.position.set(0, 0.1, 0);
bombModel.group.add(sceneManager.redLight);
bombModel.redLight = sceneManager.redLight;   // esposta per le animazioni della bomba

// ── Bootstrap: sistemi e UI ───────────────────────────────────────────────────
const effects   = new Effects(sceneManager.camera);
const particles = new Particles(sceneManager.scene);
const hud       = new HUD();

const gameManager = new GameManager({
  hud, effects, particles,
  sceneManager, cardSystem, bombModel,
});

// Mano iniziale: 8 carte a ventaglio sul banco
cardSystem.deal(8);
hud.setDeckCount(cardSystem.deckCount);

// REQUIRES: THREE.Raycaster — InputManager gestisce tutta l'interazione
const inputManager = new InputManager({
  camera: sceneManager.camera,
  renderer: sceneManager.renderer,
  cardSystem, gameManager, sceneManager, hud, particles,
});
gameManager.attachInput(inputManager);

// Esposto globalmente per debug e per i trigger dei modelli (BombModel → effects)
window.App = {
  sceneManager, roomModel, bombModel,
  cardSystem, gameManager, inputManager,
  effects, particles, hud,
};

// ── Animation Loop ────────────────────────────────────────────────────────────
let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);
  const dt = Math.min(time - lastTime, 100);   // clamp: tab in background
  lastTime = time;

  // REQUIRES: tween.js update — guida TUTTE le animazioni procedurali del progetto
  tweenUpdate(time);

  const t = sceneManager.clock.getElapsedTime();
  sceneManager.update(time);
  roomModel.update(t);
  bombModel.update(t);
  particles.update(dt);

  // Camera shake: offset applicato SOLO durante il render (niente deriva Orbit)
  effects.update(dt);
  effects.beforeRender();
  sceneManager.render();
  effects.afterRender();
}

animate(0);
