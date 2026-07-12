// DEFUSE-DECK 3D — core/jokers
//
// Definizione dei JOKER (modificatori di punteggio) — richiesti dal concept
// del progetto: "oggetti fisici 3D sul tavolo che alterano il punteggio".
//
// Logica PURA: qui si decide solo COME un joker modifica il punteggio.
// La resa 3D è in scene/JokerModel.js, la gestione in systems/JokerSystem.js.
//
// Ogni joker espone apply(score, cards) → { chips?, mult?, note } | null:
//   ritorna il bonus se la condizione è soddisfatta, altrimenti null.
//
// name/desc sono getter localizzati (core/i18n.js): leggendoli al momento del
// render restituiscono sempre la stringa nella lingua attiva. La `note` viene
// tradotta al momento del calcolo (viene mostrata subito dopo nel reveal).

import { t } from './i18n.js';

export const JOKERS = [
  {
    id: 'multimetro',
    color: 0xe5ae32,
    get name() { return t('joker.multimetro.name'); },
    get desc() { return t('joker.multimetro.desc'); },
    apply(score) {
      const n = score.combo?.name;
      if (n === 'COPPIA' || n === 'DOPPIA COPPIA') {
        return { mult: 3, note: t('joker.multimetro.note', { n: 3 }) };
      }
      return null;
    },
  },
  {
    id: 'bobina',
    color: 0x93aabb,
    get name() { return t('joker.bobina.name'); },
    get desc() { return t('joker.bobina.desc'); },
    apply(score, cards) {
      const volts = cards.filter(c => c.suit === 'volt').length;
      if (volts > 0) {
        return { chips: volts * 6, note: t('joker.bobina.note', { n: volts * 6 }) };
      }
      return null;
    },
  },
  {
    id: 'lente',
    color: 0xa4c46a,
    get name() { return t('joker.lente.name'); },
    get desc() { return t('joker.lente.desc'); },
    apply(score, cards) {
      if (cards.length === 5) {
        return { chips: 45, note: t('joker.lente.note') };
      }
      return null;
    },
  },
];

export const jokerById = (id) => JOKERS.find(j => j.id === id) ?? null;

// ── Applicazione al punteggio ────────────────────────────────────────────────
// Prende lo score base (da combos.scoreHand) e ritorna un NUOVO score con i
// bonus dei joker applicati (immutabile: l'originale non viene toccato).
// total = (chips + bonusChips) × (mult + bonusMult), come in Balatro.
export function applyJokers(baseScore, cards, jokers = []) {
  if (!jokers.length || !baseScore.combo) {
    return { ...baseScore, jokerNotes: [] };
  }

  let bonusChips = 0;
  let bonusMult  = 0;
  const notes = [];

  jokers.forEach(j => {
    const fx = j.apply(baseScore, cards);
    if (!fx) return;
    bonusChips += fx.chips ?? 0;
    bonusMult  += fx.mult ?? 0;
    notes.push({ text: fx.note, color: j.color });
  });

  const chips = baseScore.chips + bonusChips;
  const mult  = baseScore.mult + bonusMult;
  return {
    ...baseScore,
    chips,
    mult,
    total: Math.round(chips * mult),
    jokerNotes: notes,
  };
}
