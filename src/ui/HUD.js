// DEFUSE-DECK 3D — ui/HUD
//
// TUTTA la manipolazione del DOM vive qui: barra, banner di turno, preview
// della selezione, reveal del punteggio stile Balatro, schermata di fine
// partita e stato dei pulsanti.
//
// Nessuna logica di gioco: l'HUD legge il GameState e reagisce ai suoi eventi.

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(audio) {
    this.audio = audio;   // per i tick del count-up (opzionale)

    this.el = {
      defuseValue:     $('defuse-value'),
      defuseBar:       $('defuse-bar-fill'),
      turnIndicator:   $('turn-indicator'),
      statusLabel:     $('status-label'),
      comboName:       $('combo-name'),
      selectedInfo:    $('selected-info'),
      turnCount:       $('turn-count'),
      discardsLeft:    $('discards-left'),
      deckCount:       $('deck-count'),
      hintsLeft:       $('hints-left'),
      btnPlay:         $('btn-play'),
      btnDiscard:      $('btn-discard'),
      btnSort:         $('btn-sort'),
      btnHint:         $('btn-hint'),
      scoreReveal:     $('score-reveal'),
      endOverlay:      $('end-overlay'),
      legend:          $('combo-legend'),
    };
  }

  // Aggancia gli eventi del GameState: l'HUD si aggiorna da solo
  bindState(state) {
    this.state = state;
    state.on('defuse',     () => this.updateMeters());
    state.on('turn',       ({ turn }) => {
      this.updateMeters();
      this.setTurnBanner(`► TUO TURNO`, '#a4c46a');
      this.pulseTurnBanner();
    });
    state.on('discard',    () => this.updateMeters());
    state.on('suggestion', () => this.updateMeters());
    this.updateMeters();
  }

  // ── Barre e contatori ───────────────────────────────────────────────────────
  updateMeters(extra = {}) {
    const s = this.state;
    if (!s) return;

    this._text(this.el.defuseValue, `${s.defuse} / ${s.rules.DEFUSE_TARGET}`);
    if (this.el.defuseBar) this.el.defuseBar.style.width = `${s.defuseProgress * 100}%`;

    this._text(this.el.turnCount,    `Turno ${s.turn}`);
    this._text(this.el.discardsLeft, `♻ Scarti ${s.discardsLeft}/${s.rules.DISCARDS_PER_TURN}`);
    this._text(this.el.hintsLeft,    `💡 Aiuti ${s.suggestionsLeft}/${s.rules.SUGGESTIONS_PER_GAME}`);

    if (extra.deck !== undefined) {
      this._text(this.el.deckCount, `🂠 Mazzo ${extra.deck}`);
    }
  }

  setDeckCount(count) { this._text(this.el.deckCount, `🂠 Mazzo ${count}`); }

  // ── Banner di turno / stato ─────────────────────────────────────────────────
  setTurnBanner(text, color) {
    const el = this.el.turnIndicator;
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  pulseTurnBanner() {
    const el = this.el.turnIndicator;
    if (!el) return;
    el.classList.remove('banner-pulse');
    void el.offsetWidth;
    el.classList.add('banner-pulse');
  }

  setStatus(text, color = '#98927f') {
    const el = this.el.statusLabel;
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  // ── Preview della selezione ─────────────────────────────────────────────────
  showSelection(score, count) {
    const info = this.el.selectedInfo;
    const cb   = this.el.comboName;
    if (!info) return;

    if (!count) {
      info.innerHTML = 'Seleziona da 1 a 5 carte, poi <b>GIOCA</b>';
      info.style.color = '#98927f';
      if (cb) cb.textContent = '';
      this.highlightLegend(null);
      return;
    }

    info.innerHTML =
      `<span class="chips">${score.chips} chips</span> ` +
      `× <span class="mult">${score.mult} mult</span> ` +
      `= <b style="color:${score.combo.color}">+${score.total} V</b>`;
    info.style.color = '#d8cfb8';

    if (cb && score.combo) {
      cb.textContent = score.combo.name;
      cb.style.color = score.combo.color;
    }
    this.highlightLegend(score.combo?.name ?? null);
  }

  // Evidenzia la riga della legenda corrispondente alla combo corrente
  highlightLegend(comboName) {
    if (!this.el.legend) return;
    this.el.legend.querySelectorAll('.row').forEach(row => {
      row.classList.toggle('active', row.dataset.combo === comboName);
    });
  }

  // ── Reveal del punteggio (stile Balatro) ────────────────────────────────────
  // Sequenza: nome combo → count-up di chips e mult → slam del totale.
  // Ritorna una Promise risolta quando il totale è stato mostrato.
  revealScore(score) {
    const el = this.el.scoreReveal;
    if (!el) return Promise.resolve();

    return new Promise(resolve => {
      const color = score.combo?.color ?? '#e5ae32';

      el.innerHTML =
        `<div class="sr-combo" style="color:${color}">${score.combo?.name ?? ''}</div>` +
        `<div class="sr-math">` +
          `<span class="sr-chips">0</span><span class="sr-x">×</span>` +
          `<span class="sr-mult">0</span><span class="sr-eq">=</span>` +
          `<span class="sr-total" style="color:${color}"></span>` +
        `</div>`;
      el.classList.add('visible');

      const chipsEl = el.querySelector('.sr-chips');
      const multEl  = el.querySelector('.sr-mult');
      const totalEl = el.querySelector('.sr-total');

      const COUNT_MS = 520;
      const start = performance.now();
      let lastTick = -1;

      const step = (now) => {
        const k = Math.min((now - start) / COUNT_MS, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        chipsEl.textContent = Math.round(score.chips * ease);
        multEl.textContent  = Math.round(score.mult * ease);

        const tick = Math.floor(k * 10);
        if (tick !== lastTick) { lastTick = tick; this.audio?.scoreTick(tick); }

        if (k < 1) { requestAnimationFrame(step); return; }

        // Slam del totale
        totalEl.textContent = `+${score.total} V`;
        totalEl.classList.add('slam');
        this.audio?.scoreSlam();

        setTimeout(() => {
          el.classList.remove('visible');
          resolve();
        }, 700);
      };
      requestAnimationFrame(step);
    });
  }

  // ── Numerino "+X" che sale dalla barra ──────────────────────────────────────
  floatGain(amount, color, which) {
    const anchor = this.el.defuseValue;
    if (!anchor || amount <= 0) return;
    const fx = document.createElement('div');
    fx.className = 'gain-fx';
    fx.textContent = `+${amount}`;
    fx.style.color = color;
    const r = anchor.getBoundingClientRect();
    fx.style.left = `${r.left + r.width / 2}px`;
    fx.style.top  = `${r.top}px`;
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1100);
  }

  // ── Stato dei pulsanti d'azione ─────────────────────────────────────────────
  setActions({ canPlay = false, canDiscard = false, canHint = false } = {}) {
    if (this.el.btnPlay)    this.el.btnPlay.disabled    = !canPlay;
    if (this.el.btnDiscard) this.el.btnDiscard.disabled = !canDiscard;
    if (this.el.btnHint)    this.el.btnHint.disabled    = !canHint;
  }

  setSortLabel(mode) {
    this._text(this.el.btnSort, mode === 'value' ? '⇅ Valore' : '⇅ Seme');
  }

  // ── Schermata di fine partita ───────────────────────────────────────────────
  showEndScreen({ won, stats, turn }) {
    const el = this.el.endOverlay;
    if (!el) return;

    const title = won ? '◆ BOMBA DISINNESCATA ◆' : '✖ DETONAZIONE ✖';
    const sub   = won
      ? 'Hai riempito la barra di disinnesco.'
      : 'La bomba è detonata.';

    el.innerHTML = `
      <div class="end-card ${won ? 'won' : 'lost'}">
        <h1>${title}</h1>
        <div class="end-sub">${sub}</div>
        <div class="end-stats">
          <div class="stat"><span class="stat-label">Turni</span><span class="stat-value">${turn}</span></div>
          <div class="stat"><span class="stat-label">Mani giocate</span><span class="stat-value">${stats.handsPlayed}</span></div>
          <div class="stat"><span class="stat-label">Miglior mano</span><span class="stat-value">${stats.bestHandName ?? '—'} · ${stats.bestHandTotal} V</span></div>
          <div class="stat"><span class="stat-label">Scarti usati</span><span class="stat-value">${stats.discardsUsed}</span></div>
        </div>
        <button id="btn-restart" class="btn">↻ Nuova Partita</button>
      </div>`;

    setTimeout(() => el.classList.add('visible'), 900);

    el.querySelector('#btn-restart')?.addEventListener('click', () => {
      // Il reload è il restart più pulito
      window.location.reload();
    });
  }

  _text(el, text) { if (el) el.textContent = text; }
}
