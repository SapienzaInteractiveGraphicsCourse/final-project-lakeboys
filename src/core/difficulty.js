// DEFUSE-DECK 3D — core/difficulty
//
// Livelli di difficoltà selezionabili nel tutorial. Cambiano solo parametri
// numerici (logica pura): soglia di detonazione, escalation del Warden e
// quante carte pesca ogni turno.

export const DIFFICULTIES = Object.freeze({
  recruit: {
    id: 'recruit',
    name: 'RECLUTA',
    overchargeTarget: 2000,   // più margine prima della detonazione
    escalation: 0.05,         // il Warden cresce del 5% a turno
    enemyHandSize: 7,
  },
  standard: {
    id: 'standard',
    name: 'ARTIFICIERE',
    overchargeTarget: 1600,
    escalation: 0.08,
    enemyHandSize: 7,
  },
  veteran: {
    id: 'veteran',
    name: 'VETERANO',
    overchargeTarget: 1400,   // stessa soglia tua: vera corsa alla pari
    escalation: 0.12,
    enemyHandSize: 8,         // pesca di più → trova combo migliori
  },
});

export const DEFAULT_DIFFICULTY = DIFFICULTIES.standard;
