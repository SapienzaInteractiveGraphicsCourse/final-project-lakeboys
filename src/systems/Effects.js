// DEFUSE-DECK 3D — systems/Effects
//
// Effetti di regia condivisi: camera shake e flash a schermo.
//
// Il camera shake NON modifica lo stato persistente della camera:
// l'offset viene applicato subito prima del render e rimosso subito dopo
// (beforeRender/afterRender nel loop di main.js). Così OrbitControls non
// "assorbe" mai l'offset e non c'è deriva della visuale.

export class Effects {
  constructor(camera) {
    this.camera = camera;

    // Shake attivi: { amount, duration, elapsed }
    this._shakes = [];
    this._offset = { x: 0, y: 0, z: 0 };

    this._flashEl = document.getElementById('flash');
  }

  // ── Camera shake ────────────────────────────────────────────────────────────
  // amount: ampiezza massima (unità mondo) · duration: ms
  shake(amount = 0.1, duration = 400) {
    this._shakes.push({ amount, duration, elapsed: 0 });
  }

  // Chiamato una volta per frame con il delta in ms
  update(dtMs) {
    this._offset.x = this._offset.y = this._offset.z = 0;
    if (this._shakes.length === 0) return;

    this._shakes = this._shakes.filter(s => {
      s.elapsed += dtMs;
      if (s.elapsed >= s.duration) return false;
      const fade = 1 - s.elapsed / s.duration;
      const a = s.amount * fade;
      this._offset.x += (Math.random() - 0.5) * 2 * a;
      this._offset.y += (Math.random() - 0.5) * 2 * a * 0.6;
      this._offset.z += (Math.random() - 0.5) * 2 * a * 0.4;
      return true;
    });
  }

  beforeRender() {
    this.camera.position.x += this._offset.x;
    this.camera.position.y += this._offset.y;
    this.camera.position.z += this._offset.z;
  }

  afterRender() {
    this.camera.position.x -= this._offset.x;
    this.camera.position.y -= this._offset.y;
    this.camera.position.z -= this._offset.z;
  }

  // ── Flash a schermo (impatti, vittoria, esplosione) ─────────────────────────
  flash(color = '#ffffff', peak = 0.85) {
    const el = this._flashEl;
    if (!el) return;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(peak);
    void el.offsetWidth;   // forza il reflow: la transizione riparte dal picco
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = '0';
  }
}
