// DEFUSE-DECK 3D — Entry Point
// Esame: Interactive Graphics — Three.js + tween.js, no framework UI
//
// Architettura (src/):
//   core/     logica pura (stato, combo, AI) — nessuna dipendenza da DOM/Three
//   scene/    mondo 3D (scena, stanza, bomba, Warden, artificiere, carte)
//   systems/  sistemi di gioco (carte 3D, input, audio, effetti di regia)
//   ui/       HUD e overlay DOM
//   GameManager.js orchestratore dei turni

import { update as tweenUpdate } from '@tweenjs/tween.js';

import { SceneManager }  from './src/scene/SceneManager.js';
import { RoomModel }     from './src/scene/RoomModel.js';
import { BombModel }     from './src/scene/BombModel.js';
import { EnemyModel }    from './src/scene/EnemyModel.js';
import { DeckModel }     from './src/scene/DeckModel.js';
import { CardSystem }    from './src/systems/CardSystem.js';
import { InputManager }  from './src/systems/InputManager.js';
import { AudioManager }  from './src/systems/AudioManager.js';
import { Effects }       from './src/systems/Effects.js';
import { Particles }     from './src/systems/Particles.js';
import { JokerSystem }   from './src/systems/JokerSystem.js';
import { EnemyAI }       from './src/core/EnemyAI.js';
import { HUD }           from './src/ui/HUD.js';
import { GameManager }   from './src/GameManager.js';

// ── Bootstrap: mondo 3D ───────────────────────────────────────────────────────
const sceneManager = new SceneManager();
const roomModel    = new RoomModel();
const bombModel    = new BombModel();
const enemyModel   = new EnemyModel();
const deckModel    = new DeckModel();        // mazzo fisico + pila degli scarti
const cardSystem   = new CardSystem(sceneManager.scene);
const enemyAI      = new EnemyAI();          // il "cervello" che gioca le carte del Warden

sceneManager.scene.add(roomModel.group);
sceneManager.scene.add(bombModel.group);
sceneManager.scene.add(enemyModel.group);
sceneManager.scene.add(deckModel.group);
cardSystem.setDeckModel(deckModel);

// REQUIRES: Hierarchical model — PointLight rossa figlia del gruppo bomba
sceneManager.redLight.position.set(0, 0.1, 0);
bombModel.group.add(sceneManager.redLight);
bombModel.redLight = sceneManager.redLight;   // esposta per animazioni Fase 5

// ── Bootstrap: sistemi e UI ───────────────────────────────────────────────────
const audio       = new AudioManager();
const effects     = new Effects(sceneManager.camera);
const particles   = new Particles(sceneManager.scene);
const jokerSystem = new JokerSystem(sceneManager.scene);
const hud         = new HUD(audio);

const gameManager = new GameManager({
  hud, audio, effects, particles,
  sceneManager, roomModel, cardSystem, enemyAI, enemyModel, bombModel, jokerSystem,
});

// NB: la mano iniziale viene distribuita DOPO la scelta del joker
// (GameManager.chooseJoker), così le carte volano dal mazzo fisico.
hud.setDeckCount(cardSystem.deckCount);

// REQUIRES: THREE.Raycaster — InputManager gestisce tutta l'interazione
const inputManager = new InputManager({
  camera: sceneManager.camera,
  renderer: sceneManager.renderer,
  cardSystem, gameManager, sceneManager, audio, hud, jokerSystem, particles, bombModel,
});
gameManager.attachInput(inputManager);

// Esposto globalmente per debug e per i trigger dei modelli (BombModel → effects)
window.App = {
  sceneManager, roomModel, bombModel, enemyModel, deckModel,
  cardSystem, enemyAI, gameManager, inputManager,
  audio, effects, particles, jokerSystem, hud,
};

// ── Tutorial iniziale: difficoltà + avvio ─────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audio.cardSelect();
  });
});

document.getElementById('btn-start')?.addEventListener('click', () => {
  const diffId = document.querySelector('.diff-btn.active')?.dataset.diff ?? 'standard';
  gameManager.applyDifficulty(diffId);
  hud.hideTutorial();
  audio.cardDraw();
  audio.playMusic();   // passa dal tema del menu al tema della partita (loop)
  // Fase 0: scelta del joker sul banco (il duello parte dopo la scelta)
  gameManager.startJokerChoice();
});

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
  enemyModel.update(t);
  deckModel.update(t);
  jokerSystem.update(t);
  particles.update(dt);

  // Camera shake: offset applicato SOLO durante il render (niente deriva Orbit)
  effects.update(dt);
  effects.beforeRender();
  sceneManager.render();
  effects.afterRender();
}

animate(0);
