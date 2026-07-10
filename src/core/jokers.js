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

export const JOKERS = [
  {
    id: 'multimetro',
    name: 'MULTIMETRO',
    color: 0xe5ae32,
    desc: '+3 mult se giochi COPPIA o DOPPIA COPPIA',
    apply(score) {
      const n = score.combo?.name;
      if (n === 'COPPIA' || n === 'DOPPIA COPPIA') {
        return { mult: 3, note: 'MULTIMETRO +3 mult' };
      }
      return null;
    },
  },
  {
    id: 'bobina',
    name: 'BOBINA TESLA',
    color: 0x93aabb,
    desc: '+6 chips per ogni carta VOLT giocata',
    apply(score, cards) {
      const volts = cards.filter(c => c.suit === 'volt').length;
      if (volts > 0) {
        return { chips: volts * 6, note: `BOBINA +${volts * 6} chips` };
      }
      return null;
    },
  },
  {
    id: 'lente',
    name: 'LENTE DI FOCUS',
    color: 0xa4c46a,
    desc: '+45 chips se giochi una mano di 5 carte',
    apply(score, cards) {
      if (cards.length === 5) {
        return { chips: 45, note: 'LENTE +45 chips' };
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
