// DEFUSE-DECK 3D — core/i18n
//
// Internationalization: English (default) + Italian. Pure module, no Three.js.
//
//   t(key, vars)       → localized string (with {var} interpolation)
//   comboLabel(name)   → localized display name for a combo internal id
//   getLang()/setLang  → read/switch the active language (persisted)
//   onLangChange(fn)   → subscribe to language switches
//   applyStaticDOM()   → localize every [data-i18n] / [data-i18n-html] element
//
// The internal ids of combos (combos.js) stay in their original form and are
// NEVER translated in place — only their DISPLAY name is localized here.

const LANGS = ['en', 'it'];
const STORAGE_KEY = 'defusedeck.lang';

// Default = English. A saved choice (if valid) overrides the default.
let current = 'en';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LANGS.includes(saved)) current = saved;
} catch { /* localStorage may be unavailable */ }

const listeners = new Set();

// ── Dictionaries ──────────────────────────────────────────────────────────────
const DICT = {
  en: {
    // Panels / meters
    'panel.you':        'You · Defuse',
    'panel.warden':     'Warden · Overcharge',
    'meter.threat':     'Threat ×{v}',
    'hud.turn':         'Turn {n}',
    'hud.discards':     '♻ Discards {n}/{m}',
    'hud.hints':        '💡 Hints {n}/{m}',
    'hud.deck':         '🂠 Deck {n}',
    'hud.selectPrompt': 'Select 1 to 5 cards, then <b>PLAY</b>',

    // Buttons
    'btn.discard':   '♻ Discard',
    'btn.sortValue': '⇅ Value',
    'btn.sortSuit':  '⇅ Suit',
    'btn.hint':      '💡 Hint',
    'btn.play':      '⚡ Play',
    'btn.view1':     '👁 1st Person',
    'btn.view3':     '👁 3rd Person',
    'btn.audioOn':   '🔊 Audio',
    'btn.audioOff':  '🔇 Audio',

    // Combo legend
    'legend.title':          'Hands · chips × mult',
    'combo.SCALA COLORE':    'Straight Flush',
    'combo.POKER':           'Four of a Kind',
    'combo.FULL':            'Full House',
    'combo.COLORE':          'Flush',
    'combo.SCALA':           'Straight',
    'combo.TRIS':            'Three of a Kind',
    'combo.DOPPIA COPPIA':   'Two Pair',
    'combo.COPPIA':          'Pair',
    'combo.CARTA ALTA':      'High Card',

    // Joker info / tooltip
    'joker.tooltipLabel': 'Joker',
    'joker.equipHint':    'Click to equip',
    'joker.activeLabel':  'Active joker',

    // Enemy readout
    'enemy.played':     'THE WARDEN PLAYED',
    'enemy.overcharge': '+{n} overcharge',

    // Danger
    'danger.critical': '⚠ CRITICAL OVERCHARGE — finish the game quickly',

    // End screen
    'end.win.title':     '◆ BOMB DEFUSED ◆',
    'end.lose.title':    '✖ DETONATION ✖',
    'end.win.sub':       'You filled the defuse meter before the Warden.',
    'end.lose.sub':      "The Warden's overcharge detonated the bomb.",
    'end.difficulty':    'Difficulty',
    'end.joker':         'Joker',
    'end.turns':         'Turns',
    'end.handsPlayed':   'Hands played',
    'end.bestHand':      'Best hand',
    'end.maxHit':        'Max hit taken',
    'end.discardsUsed':  'Discards used',
    'end.restart':       '↻ New Game',
    'end.none':          '—',

    // Status / banners (GameManager)
    'banner.standby':      '· STANDBY ·',
    'banner.chooseJoker':  '◆ CHOOSE A JOKER',
    'banner.yourTurn':     '► YOUR TURN',
    'banner.wardenPlays':  '◆ THE WARDEN PLAYS…',
    'banner.win':          '◆ YOU WIN',
    'banner.wardenWins':   '✖ THE WARDEN WINS',
    'status.systemActive': '■ System active — defuse before the Warden detonates',
    'status.chooseJoker':  'Click an object on the bench: it stays with you all game',
    'status.jokerActive':  '◆ {name}: {desc}',
    'status.moduleDefused':'✓ Bomb module {n}/3 defused',
    'status.suggested':    '💡 Suggested: {combo} (+{v} V)',
    'status.defused':      '✓ BOMB DEFUSED',
    'status.gameOver':     '☠ GAME OVER — BOOM',

    // Difficulty (display name; internal id stays in difficulty.js)
    'difficulty.recruit':  'Recruit',
    'difficulty.standard': 'Technician',
    'difficulty.veteran':  'Veteran',

    // Jokers
    'joker.multimetro.name': 'MULTIMETER',
    'joker.multimetro.desc': '+3 mult if you play a PAIR or TWO PAIR',
    'joker.multimetro.note': 'MULTIMETER +{n} mult',
    'joker.bobina.name':     'TESLA COIL',
    'joker.bobina.desc':     '+6 chips per VOLT card played',
    'joker.bobina.note':     'TESLA COIL +{n} chips',
    'joker.lente.name':      'FOCUS LENS',
    'joker.lente.desc':      '+45 chips if you play a 5-card hand',
    'joker.lente.note':      'FOCUS LENS +45 chips',

    // Tutorial
    'tut.sub':       'Card duel against the Warden',
    'tut.li1':       'Charge the <b>DEFUSE</b> bar to <span class="accent">1400</span> to disarm the bomb and <b>win</b>.',
    'tut.li2':       'The <b>Warden plays its cards</b> after you and charges <b>OVERCHARGE</b>: if it reaches 1600, the bomb <b>explodes</b>. And every turn it gets <b>more aggressive</b>.',
    'tut.li3':       'You have 8 cards. <b>Click</b> 1 to 5 cards to form a poker hand: it is worth <span class="accent">chips × mult</span>.',
    'tut.li4':       'Press <b>Discard</b> to swap the selected cards (3 discards per turn) and look for better combos.',
    'tut.li5':       'In trouble? <b>Hint</b> selects the best possible hand (limited uses per game).',
    'tut.li6':       "At the start <b>choose a Joker</b> from 3 objects on the bench: it modifies scoring for the whole game.",
    'tut.li7':       'Drag with the mouse to <b>rotate the view</b>; drag a card to inspect it.',
    'tut.diffLabel': 'Difficulty',
    'tut.keys':      '<kbd>1</kbd>–<kbd>8</kbd> select card &nbsp;·&nbsp; <kbd>Enter</kbd> play &nbsp;·&nbsp; <kbd>X</kbd> discard &nbsp;·&nbsp; <kbd>S</kbd> sort<br /><kbd>H</kbd> hint &nbsp;·&nbsp; <kbd>V</kbd> view &nbsp;·&nbsp; <kbd>M</kbd> audio',
    'tut.start':     '⚡ Start',
  },

  it: {
    'panel.you':        'Tu · Disinnesco',
    'panel.warden':     'Warden · Sovraccarico',
    'meter.threat':     'Minaccia ×{v}',
    'hud.turn':         'Turno {n}',
    'hud.discards':     '♻ Scarti {n}/{m}',
    'hud.hints':        '💡 Aiuti {n}/{m}',
    'hud.deck':         '🂠 Mazzo {n}',
    'hud.selectPrompt': 'Seleziona da 1 a 5 carte, poi <b>GIOCA</b>',

    'btn.discard':   '♻ Scarta',
    'btn.sortValue': '⇅ Valore',
    'btn.sortSuit':  '⇅ Seme',
    'btn.hint':      '💡 Aiuto',
    'btn.play':      '⚡ Gioca',
    'btn.view1':     '👁 1ª Persona',
    'btn.view3':     '👁 3ª Persona',
    'btn.audioOn':   '🔊 Audio',
    'btn.audioOff':  '🔇 Audio',

    'legend.title':          'Mani · chips × mult',
    'combo.SCALA COLORE':    'Scala Colore',
    'combo.POKER':           'Poker',
    'combo.FULL':            'Full',
    'combo.COLORE':          'Colore',
    'combo.SCALA':           'Scala',
    'combo.TRIS':            'Tris',
    'combo.DOPPIA COPPIA':   'Doppia Coppia',
    'combo.COPPIA':          'Coppia',
    'combo.CARTA ALTA':      'Carta Alta',

    'joker.tooltipLabel': 'Joker',
    'joker.equipHint':    'Clicca per equipaggiarlo',
    'joker.activeLabel':  'Joker attivo',

    'enemy.played':     'IL WARDEN HA CALATO',
    'enemy.overcharge': '+{n} sovraccarico',

    'danger.critical': '⚠ SOVRACCARICO CRITICO — chiudi la partita in fretta',

    'end.win.title':     '◆ BOMBA DISINNESCATA ◆',
    'end.lose.title':    '✖ DETONAZIONE ✖',
    'end.win.sub':       'Hai riempito la barra di disinnesco prima del Warden.',
    'end.lose.sub':      'Il sovraccarico del Warden ha fatto detonare la bomba.',
    'end.difficulty':    'Difficoltà',
    'end.joker':         'Joker',
    'end.turns':         'Turni',
    'end.handsPlayed':   'Mani giocate',
    'end.bestHand':      'Miglior mano',
    'end.maxHit':        'Colpo max subìto',
    'end.discardsUsed':  'Scarti usati',
    'end.restart':       '↻ Nuova Partita',
    'end.none':          '—',

    'banner.standby':      '· STANDBY ·',
    'banner.chooseJoker':  '◆ SCEGLI UN JOKER',
    'banner.yourTurn':     '► TUO TURNO',
    'banner.wardenPlays':  '◆ IL WARDEN GIOCA…',
    'banner.win':          '◆ HAI VINTO',
    'banner.wardenWins':   '✖ IL WARDEN HA VINTO',
    'status.systemActive': '■ Sistema attivo — disinnesca prima che il Warden detoni',
    'status.chooseJoker':  'Clicca un oggetto sul banco: ti accompagnerà per tutta la partita',
    'status.jokerActive':  '◆ {name}: {desc}',
    'status.moduleDefused':'✓ Modulo {n}/3 della bomba disinnescato',
    'status.suggested':    '💡 Suggerito: {combo} (+{v} V)',
    'status.defused':      '✓ BOMBA DISINNESCATA',
    'status.gameOver':     '☠ GAME OVER — BOOM',

    'difficulty.recruit':  'Recluta',
    'difficulty.standard': 'Artificiere',
    'difficulty.veteran':  'Veterano',

    'joker.multimetro.name': 'MULTIMETRO',
    'joker.multimetro.desc': '+3 mult se giochi COPPIA o DOPPIA COPPIA',
    'joker.multimetro.note': 'MULTIMETRO +{n} mult',
    'joker.bobina.name':     'BOBINA TESLA',
    'joker.bobina.desc':     '+6 chips per ogni carta VOLT giocata',
    'joker.bobina.note':     'BOBINA +{n} chips',
    'joker.lente.name':      'LENTE DI FOCUS',
    'joker.lente.desc':      '+45 chips se giochi una mano di 5 carte',
    'joker.lente.note':      'LENTE +45 chips',

    'tut.sub':       'Duello di carte contro il Warden',
    'tut.li1':       'Carica la barra <b>DISINNESCO</b> fino a <span class="accent">1400</span> per disarmare la bomba e <b>vincere</b>.',
    'tut.li2':       'Il <b>Warden gioca le sue carte</b> dopo di te e carica il <b>SOVRACCARICO</b>: se arriva a 1600, la bomba <b>esplode</b>. E ad ogni turno diventa <b>più aggressivo</b>.',
    'tut.li3':       'Hai 8 carte. <b>Clicca</b> da 1 a 5 carte per formare una mano di poker: vale <span class="accent">chips × mult</span>.',
    'tut.li4':       'Premi <b>Scarta</b> per cambiare le carte selezionate (3 scarti per turno) e cercare combo migliori.',
    'tut.li5':       'In difficoltà? <b>Aiuto</b> seleziona la miglior mano possibile (usi limitati per partita).',
    'tut.li6':       "All'inizio <b>scegli un Joker</b> tra 3 oggetti sul banco: modifica il punteggio per tutta la partita.",
    'tut.li7':       'Trascina col mouse per <b>ruotare la visuale</b>; trascina una carta per ispezionarla.',
    'tut.diffLabel': 'Difficoltà',
    'tut.keys':      '<kbd>1</kbd>–<kbd>8</kbd> seleziona carta &nbsp;·&nbsp; <kbd>Invio</kbd> gioca &nbsp;·&nbsp; <kbd>X</kbd> scarta &nbsp;·&nbsp; <kbd>S</kbd> ordina<br /><kbd>H</kbd> aiuto &nbsp;·&nbsp; <kbd>V</kbd> visuale &nbsp;·&nbsp; <kbd>M</kbd> audio',
    'tut.start':     '⚡ Inizia',
  },
};

// ── API ───────────────────────────────────────────────────────────────────────

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function t(key, vars) {
  const table = DICT[current] ?? DICT.en;
  const str = table[key] ?? DICT.en[key] ?? key;
  return interpolate(str, vars);
}

// Localized display name for a combo internal id (combos.js keeps the id).
export function comboLabel(internalName) {
  return t(`combo.${internalName}`);
}

export function getLang() { return current; }

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  listeners.forEach(fn => { try { fn(lang); } catch (e) { console.error('i18n listener failed:', e); } });
}

export function toggleLang() {
  setLang(current === 'en' ? 'it' : 'en');
  return current;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Localize every element tagged with data-i18n (textContent) or
// data-i18n-html (innerHTML). Called on load and on every language switch.
export function applyStaticDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.documentElement.lang = current;
}
