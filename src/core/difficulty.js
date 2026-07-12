// DEFUSE-DECK 3D — core/difficulty
//
// Livelli di difficoltà selezionabili nel tutorial. Cambiano solo parametri
// numerici (logica pura): soglia di detonazione, escalation del Warden e
// quante carte pesca ogni turno.
//
// `name` è un getter localizzato (core/i18n.js): il nome mostrato (end screen,
// pulsanti) segue la lingua attiva. Gli id restano stabili e non tradotti.

import { t } from './i18n.js';

export const DIFFICULTIES = Object.freeze({
  recruit: {
    id: 'recruit',
    get name() { return t('difficulty.recruit'); },
    overchargeTarget: 2000,   // più margine prima della detonazione
    escalation: 0.05,         // il Warden cresce del 5% a turno
    enemyHandSize: 7,
  },
  standard: {
    id: 'standard',
    get name() { return t('difficulty.standard'); },
    overchargeTarget: 1600,
    escalation: 0.08,
    enemyHandSize: 7,
  },
  veteran: {
    id: 'veteran',
    get name() { return t('difficulty.veteran'); },
    overchargeTarget: 1400,   // stessa soglia tua: vera corsa alla pari
    escalation: 0.12,
    enemyHandSize: 8,         // pesca di più → trova combo migliori
  },
});

export const DEFAULT_DIFFICULTY = DIFFICULTIES.standard;
