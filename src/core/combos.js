// DEFUSE-DECK 3D — combos.js
//
// Single source of truth per la valutazione delle mani (stile Balatro).
// Usato sia dal giocatore (GameManager) sia dal nemico (EnemyAI), così le
// regole di punteggio sono identiche per entrambi.
//
// Modello di punteggio (come Balatro):
//   total = (baseChips_combo + Σ chips_carte) × mult_combo
// dove chips_carta = valore della carta. Tutte le carte giocate contribuiscono.

// ── Tabella combo ────────────────────────────────────────────────────────────
// Ordine = priorità decrescente. baseChips e mult ispirati a Balatro.
export const COMBOS = [
  { name: 'SCALA COLORE', baseChips: 100, mult: 8, color: '#e5ae32' },
  { name: 'POKER',        baseChips: 60,  mult: 7, color: '#c07a86' },
  { name: 'FULL',         baseChips: 40,  mult: 4, color: '#d95b38' },
  { name: 'COLORE',       baseChips: 35,  mult: 4, color: '#8fae8a' },
  { name: 'SCALA',        baseChips: 30,  mult: 4, color: '#93aabb' },
  { name: 'TRIS',         baseChips: 30,  mult: 3, color: '#cd8b45' },
  { name: 'DOPPIA COPPIA',baseChips: 20,  mult: 2, color: '#b3684a' },
  { name: 'COPPIA',       baseChips: 10,  mult: 2, color: '#c9b36a' },
  { name: 'CARTA ALTA',   baseChips: 5,   mult: 1, color: '#98927f' },
];

const byName = (name) => COMBOS.find(c => c.name === name);

// ── Rilevamento combo ────────────────────────────────────────────────────────
// Ritorna l'entry COMBOS più forte che le carte soddisfano.
export function detectCombo(cards) {
  if (!cards || cards.length === 0) return byName('CARTA ALTA');

  const values = cards.map(c => c.value);
  const suits  = cards.map(c => c.suit);

  // Istogramma dei valori
  const valCount = {};
  values.forEach(v => { valCount[v] = (valCount[v] || 0) + 1; });
  const counts = Object.values(valCount).sort((a, b) => b - a);

  // Colore: stesso seme e almeno 5 carte (poker classico)
  const suitCount = {};
  suits.forEach(s => { suitCount[s] = (suitCount[s] || 0) + 1; });
  const isFlush = Object.keys(suitCount).length === 1 && cards.length >= 5;

  // Scala: 5 carte, valori unici e consecutivi
  const unique = [...new Set(values)].sort((a, b) => a - b);
  let isStraight = unique.length === 5 && cards.length === 5;
  if (isStraight) {
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] !== unique[i - 1] + 1) { isStraight = false; break; }
    }
  }

  if (isStraight && isFlush)              return byName('SCALA COLORE');
  if (counts[0] === 4)                    return byName('POKER');
  if (counts[0] === 3 && counts[1] === 2) return byName('FULL');
  if (isFlush)                            return byName('COLORE');
  if (isStraight)                         return byName('SCALA');
  if (counts[0] === 3)                    return byName('TRIS');
  if (counts[0] === 2 && counts[1] === 2) return byName('DOPPIA COPPIA');
  if (counts[0] === 2)                    return byName('COPPIA');
  return byName('CARTA ALTA');
}

// ── Punteggio di una mano ────────────────────────────────────────────────────
// Ritorna { combo, baseChips, cardChips, chips, mult, total }
export function scoreHand(cards) {
  if (!cards || cards.length === 0) {
    return { combo: null, baseChips: 0, cardChips: 0, chips: 0, mult: 1, total: 0 };
  }
  const combo     = detectCombo(cards);
  const cardChips = cards.reduce((s, c) => s + c.value, 0);
  const chips     = combo.baseChips + cardChips;
  const mult      = combo.mult;
  const total     = Math.round(chips * mult);
  return { combo, baseChips: combo.baseChips, cardChips, chips, mult, total };
}

// ── Migliore mano da un set di carte ─────────────────────────────────────────
// Enumera tutti i sottoinsiemi di dimensione 1..maxSize e restituisce quello
// dal punteggio più alto. Usato dall'AI nemica e dal suggerimento del giocatore.
//   cards:  Card-like[] (devono avere .value e .suit)
//   scorer: funzione di valutazione (default scoreHand); chi chiama può
//           passare la propria versione, così il suggerimento resta coerente
//           con le regole di punteggio effettive.
// Ritorna { cards, score } dove score è l'oggetto dello scorer.
export function bestHand(cards, maxSize = 5, scorer = scoreHand) {
  if (!cards || cards.length === 0) return { cards: [], score: scorer([]) };

  const n = Math.min(cards.length, 8);     // cap di sicurezza per l'enumerazione
  const pool = cards.slice(0, n);
  let best = { cards: [pool[0]], score: scorer([pool[0]]) };

  // Bitmask su tutti i sottoinsiemi non vuoti
  for (let mask = 1; mask < (1 << pool.length); mask++) {
    const subset = [];
    for (let i = 0; i < pool.length; i++) {
      if (mask & (1 << i)) subset.push(pool[i]);
    }
    if (subset.length > maxSize) continue;
    const score = scorer(subset);
    if (score.total > best.score.total) best = { cards: subset, score };
  }
  return best;
}
