// DEFUSE-DECK 3D — InputManager
//
// REQUIRES: THREE.Raycaster per interazione mouse con gli oggetti 3D
// REQUIRES: tween.js — hover, selezione, drag-rotate, ritorno in posizione
//
// Scorciatoie tastiera:
//   1–8 seleziona/deseleziona la carta · INVIO gioca · X scarta
//   S ordina la mano · H suggerimento

import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { BOMB_POS } from '../scene/config.js';

export class InputManager {
  constructor({ camera, renderer, cardSystem, gameManager, sceneManager, hud, particles }) {
    this.camera       = camera;
    this.renderer     = renderer;
    this.cardSystem   = cardSystem;
    this.gameManager  = gameManager;
    this.sceneManager = sceneManager;   // per abilitare/disabilitare OrbitControls
    this.hud          = hud;
    this.particles    = particles;      // scintille sugli impatti delle carte

    // REQUIRES: THREE.Raycaster — unico punto di interazione mouse ↔ scena 3D
    this.raycaster = new THREE.Raycaster();
    this.mouseNDC  = new THREE.Vector2();

    this.hoveredCard   = null;
    this.selectedCards = [];
    this._activeTweens = new Map();

    // Stato drag-rotate
    this._dragCard      = null;
    this._dragLast      = { x: 0, y: 0 };
    this._dragMoved     = false;   // true se il mouse si è spostato abbastanza → non è un click
    this._mouseDownPos  = { x: 0, y: 0 };

    this._bindEvents();
  }

  // ── Binding eventi DOM ───────────────────────────────────────────────────

  _bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousemove',  e => this._onMouseMove(e));
    canvas.addEventListener('mousedown',  e => this._onMouseDown(e));
    canvas.addEventListener('mouseup',    e => this._onMouseUp(e));
    canvas.addEventListener('click',      e => this._onClick(e));

    document.getElementById('btn-play')
      ?.addEventListener('click', () => this._onPlayHand());
    document.getElementById('btn-discard')
      ?.addEventListener('click', () => this._onDiscard());
    document.getElementById('btn-sort')
      ?.addEventListener('click', () => this._onSort());
    document.getElementById('btn-hint')
      ?.addEventListener('click', () => this._onHint());

    window.addEventListener('keydown', e => this._onKeyDown(e));
  }

  // ── Scorciatoie da tastiera ──────────────────────────────────────────────

  _onKeyDown(event) {
    if (event.repeat) return;

    const key = event.key.toLowerCase();
    if (event.key >= '1' && event.key <= '8') {
      const card = this.cardSystem.hand[Number(event.key) - 1];
      if (card) this._toggleCard(card);
    }
    else if (event.key === 'Enter') this._onPlayHand();
    else if (key === 'x') this._onDiscard();
    else if (key === 's') this._onSort();
    else if (key === 'h') this._onHint();
  }

  // ── Azioni ausiliarie ─────────────────────────────────────────────────────

  _onSort() {
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;
    const mode = this.cardSystem.toggleSort();
    this.hud.setSortLabel(mode);
  }

  // Aiuto: seleziona automaticamente la miglior mano possibile
  _onHint() {
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;
    const cards = this.gameManager.useSuggestion();
    if (!cards) return;

    [...this.selectedCards].forEach(c => this._deselect(c));
    cards.forEach(c => this._select(c));
    this.gameManager.showPotentialVoltage(this.selectedCards);
  }

  // ── Raycaster utils ──────────────────────────────────────────────────────

  _toNDC(event) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouseNDC.x =  ((event.clientX - r.left) / r.width)  * 2 - 1;
    this.mouseNDC.y = -((event.clientY - r.top)  / r.height) * 2 + 1;
  }

  _hitCard(event) {
    this._toNDC(event);
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.cardSystem.getCardGroups(), true
    );
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData?.isCard) obj = obj.parent;
    return obj?.userData?.cardRef ?? null;
  }

  // ── Mouse Down — avvia drag-rotate ───────────────────────────────────────

  _onMouseDown(event) {
    if (event.button !== 0) return;
    const hit = this._hitCard(event);
    if (!hit || hit.isPlaying) return;

    this._dragCard = hit;
    this._dragLast = { x: event.clientX, y: event.clientY };
    this._mouseDownPos = { x: event.clientX, y: event.clientY };
    this._dragMoved = false;

    // Blocca la camera mentre si ruota la carta
    if (this.sceneManager?.controls) this.sceneManager.controls.enabled = false;

    // Interrompi eventuali tween attivi sulla carta
    this._stopTweens(hit.group);
  }

  // ── Mouse Move — hover + drag-rotate ────────────────────────────────────

  _onMouseMove(event) {
    // Modalità drag-rotate
    if (this._dragCard) {
      const dx = event.clientX - this._dragLast.x;
      const dy = event.clientY - this._dragLast.y;

      const totalDx = event.clientX - this._mouseDownPos.x;
      const totalDy = event.clientY - this._mouseDownPos.y;
      if (Math.abs(totalDx) > 4 || Math.abs(totalDy) > 4) this._dragMoved = true;

      // Ruota la carta: X del mouse → asse Y della carta, Y del mouse → asse X
      this._dragCard.group.rotation.y += dx * 0.012;
      this._dragCard.group.rotation.x += dy * 0.012;

      this._dragLast = { x: event.clientX, y: event.clientY };
      return;
    }

    // Hover normale
    const hit = this._hitCard(event);

    if (this.hoveredCard && this.hoveredCard !== hit) {
      this._tweenOut(this.hoveredCard);
      this.hoveredCard = null;
    }

    if (hit && !hit.isHovered && !hit.isPlaying) {
      hit.isHovered    = true;
      this.hoveredCard = hit;
      this._tweenHover(hit);
    }

    this.renderer.domElement.style.cursor =
      hit && !hit.isPlaying ? 'pointer' : 'default';
  }

  // ── Mouse Up — rilascia la carta e torna in posizione ───────────────────

  _onMouseUp(event) {
    if (!this._dragCard) return;
    const card = this._dragCard;
    this._dragCard = null;

    // Riattiva la camera
    if (this.sceneManager?.controls) this.sceneManager.controls.enabled = true;

    // Tween di ritorno alla rotazione base (o a quella da "selezionata")
    const targetRot = card.isSelected
      ? { x: card.baseRot.x - 0.32, y: card.baseRot.y, z: 0 }
      : { x: card.baseRot.x,       y: card.baseRot.y, z: card.baseRot.z };

    this._stopTweens(card.group);
    const tRot = new Tween(card.group.rotation)
      .to(targetRot, 420)
      .easing(Easing.Elastic.Out)
      .start();
    this._activeTweens.set(card.group, { tRot });
  }

  // ── Hover tween ──────────────────────────────────────────────────────────

  _tweenHover(card) {
    if (card.isSelected) return;
    this._stopTweens(card.group);

    const tPos = new Tween(card.group.position)
      .to({ y: card.basePos.y + 0.18 }, 170)
      .easing(Easing.Quadratic.Out)
      .start();
    const tRot = new Tween(card.group.rotation)
      .to({ x: card.baseRot.x - 0.20 }, 170)
      .easing(Easing.Quadratic.Out)
      .start();
    // La carta "si fa avanti": leggero ingrandimento
    const tScale = new Tween(card.group.scale)
      .to({ x: 1.06, y: 1.06, z: 1.06 }, 170)
      .easing(Easing.Quadratic.Out)
      .start();

    this._activeTweens.set(card.group, { tPos, tRot, tScale });
  }

  _tweenOut(card) {
    card.isHovered = false;
    if (card.isSelected) return;
    this._stopTweens(card.group);

    const tPos = new Tween(card.group.position)
      .to({ x: card.basePos.x, y: card.basePos.y, z: card.basePos.z }, 190)
      .easing(Easing.Quadratic.In)
      .start();
    const tRot = new Tween(card.group.rotation)
      .to({ x: card.baseRot.x, y: card.baseRot.y, z: card.baseRot.z }, 190)
      .easing(Easing.Quadratic.In)
      .start();
    const tScale = new Tween(card.group.scale)
      .to({ x: 1, y: 1, z: 1 }, 190)
      .easing(Easing.Quadratic.In)
      .start();

    this._activeTweens.set(card.group, { tPos, tRot, tScale });
  }

  // ── Click / selezione ────────────────────────────────────────────────────

  _onClick(event) {
    // Se il mousedown ha prodotto un drag, ignora il click
    if (this._dragMoved) { this._dragMoved = false; return; }

    // Si possono selezionare carte solo durante il proprio turno
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;

    const hit = this._hitCard(event);
    if (!hit || hit.isPlaying) return;
    this._toggleCard(hit);
  }

  // Selezione/deselezione condivisa tra click e tastiera (1–8)
  _toggleCard(card) {
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;
    if (card.isPlaying) return;

    if (card.isSelected) {
      this._deselect(card);
    } else {
      if (this.selectedCards.length >= 5) return;
      this._select(card);
    }

    this.gameManager.showPotentialVoltage(this.selectedCards);
  }

  _select(card) {
    card.isSelected = true;
    this.selectedCards.push(card);
    this._stopTweens(card.group);

    new Tween(card.group.position)
      .to({ y: card.basePos.y + 0.30 }, 230)
      .easing(Easing.Back.Out)
      .start();
    new Tween(card.group.rotation)
      .to({ x: card.baseRot.x - 0.32, z: 0 }, 230)
      .easing(Easing.Quadratic.Out)
      .start();
    // Punch di conferma: gonfia e torna (scale 1 → 1.14 → 1)
    new Tween(card.group.scale)
      .to({ x: 1.14, y: 1.14, z: 1.14 }, 110)
      .easing(Easing.Quadratic.Out)
      .chain(
        new Tween(card.group.scale)
          .to({ x: 1, y: 1, z: 1 }, 170)
          .easing(Easing.Quadratic.In)
      )
      .start();

    card.baseMesh.material.emissive         = new THREE.Color(0.06, 0.06, 0.14);
    card.baseMesh.material.emissiveIntensity = 1.0;
  }

  _deselect(card) {
    card.isSelected = false;
    this.selectedCards = this.selectedCards.filter(c => c !== card);
    this._stopTweens(card.group);

    new Tween(card.group.position)
      .to({ x: card.basePos.x, y: card.basePos.y, z: card.basePos.z }, 200)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.rotation)
      .to({ x: card.baseRot.x, y: card.baseRot.y, z: card.baseRot.z }, 200)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.scale)
      .to({ x: 1, y: 1, z: 1 }, 200)
      .easing(Easing.Quadratic.In)
      .start();

    card.baseMesh.material.emissive         = new THREE.Color(0, 0, 0);
    card.baseMesh.material.emissiveIntensity = 0;
  }

  // ── Play Hand ────────────────────────────────────────────────────────────
  // Le carte scelte volano verso la bomba (caricano il DISINNESCO); poi la
  // mano si ricompone pescando dal mazzo.

  _onPlayHand() {
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;
    if (this.selectedCards.length === 0) return;

    this.hud.setActions({});   // disabilita tutto durante l'animazione

    const score  = this.gameManager.computeHandScore(this.selectedCards);
    const played = [...this.selectedCards];
    this.selectedCards = [];
    this.hoveredCard   = null;

    // FASE 1 — le carte si schierano in fila sopra il banco (stile Balatro)
    const n = played.length;
    played.forEach((card, i) => {
      card.isPlaying = true;
      setTimeout(() => this._stageCard(card, i, n), i * 80);
    });

    // FASE 2 — dopo una breve pausa, partono una a una verso la bomba
    const launchStart = n * 80 + 340;
    played.forEach((card, i) => {
      setTimeout(() => this._launchCard(card), launchStart + i * 70);
    });

    setTimeout(() => {
      this.cardSystem.removeCards(played);
      this.cardSystem.drawToFull();
      this.gameManager.playPlayerHand(score);
    }, launchStart + n * 70 + 430);
  }

  // ── Discard ──────────────────────────────────────────────────────────────
  // Scarta le carte selezionate e ne pesca di nuove (costa 1 scarto del turno).

  _onDiscard() {
    if (this.gameManager.phase !== 'player' || this.gameManager.isOver) return;
    if (this.selectedCards.length === 0 || this.gameManager.discardsLeft <= 0) return;

    this.hud.setActions({});   // disabilita tutto durante l'animazione

    const tossed = [...this.selectedCards];
    this.selectedCards = [];
    this.hoveredCard   = null;
    this.gameManager.spendDiscard();

    tossed.forEach((card, i) => {
      card.isSelected = false;
      card.isPlaying  = true;
      setTimeout(() => this._animateDiscardCard(card), i * 60);
    });

    setTimeout(() => {
      this.cardSystem.removeCards(tossed);
      this.cardSystem.drawToFull();
      // Reset preview + riabilita i pulsanti in base alla nuova selezione (vuota)
      this.gameManager.showPotentialVoltage(this.selectedCards);
    }, tossed.length * 60 + 360);
  }

  // FASE 1 — la carta si schiera in fila sopra il banco, dritta verso la camera
  _stageCard(card, i, n) {
    this._stopTweens(card.group);
    const sx = (i - (n - 1) / 2) * 0.85;

    new Tween(card.group.position)
      .to({ x: sx, y: 1.35, z: 2.3 }, 260)
      .easing(Easing.Back.Out)
      .start();
    new Tween(card.group.rotation)
      .to({ x: -0.22, y: 0, z: 0 }, 260)
      .easing(Easing.Cubic.Out)
      .start();
    new Tween(card.group.scale)
      .to({ x: 1.15, y: 1.15, z: 1.15 }, 260)
      .easing(Easing.Back.Out)
      .start();
  }

  // FASE 2 — la carta parte in vite verso la bomba e si converte in energia
  _launchCard(card) {
    new Tween(card.group.position)
      .to({ x: BOMB_POS.x + 1.6, y: 2.4, z: BOMB_POS.z + 1.2 }, 360)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.rotation)
      .to({ x: -Math.PI * 1.2, y: card.group.rotation.y + Math.PI * 2, z: (Math.random() - 0.5) * 0.8 }, 360)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.scale)
      .to({ x: 0.05, y: 0.05, z: 0.05 }, 360)
      .easing(Easing.Quadratic.In)
      .onComplete(() => {
        // Piccolo impatto energetico sulla bomba per ogni carta
        this.particles?.burst({
          position: card.group.position.clone(),
          color: 0x88ffcc, count: 10, speed: 1.8, life: 450, gravity: 2, size: 0.06,
        });
      })
      .start();
  }

  // Carta scartata: vola oltre il bordo destro del banco rimpicciolendosi
  _animateDiscardCard(card) {
    this._stopTweens(card.group);

    new Tween(card.group.position)
      .to({ x: 8.5, y: 0.2, z: 3.2 }, 320)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.rotation)
      .to({ x: Math.PI / 2, y: (Math.random() - 0.5) * 0.6, z: 0 }, 320)
      .easing(Easing.Quadratic.In)
      .start();
    new Tween(card.group.scale)
      .to({ x: 0.05, y: 0.05, z: 0.05 }, 320)
      .easing(Easing.Quadratic.In)
      .start();
  }

  // ── Gestione tween attivi ────────────────────────────────────────────────

  _stopTweens(obj) {
    const active = this._activeTweens.get(obj);
    if (active) {
      active.tPos?.stop();
      active.tRot?.stop();
      active.tScale?.stop();
      this._activeTweens.delete(obj);
    }
  }
}
