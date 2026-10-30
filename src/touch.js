// On-screen touch controls, after the usual mobile-shooter layout:
// - left side: a floating joystick that appears under the thumb and fades on release
// - right side: drag anywhere to look
// - right thumb: contextual buttons (grab/place, hold to work, dash) that only
//   show what's possible right now
// Buttons feed the same key codes the keyboard does, so game.js doesn't care.
const STICK_R = 56; // px the knob can travel from the base
const DEAD = 0.12; // radial dead zone, as a fraction of STICK_R
const LOOK_GAIN = 2.2; // touch drags are shorter than mouse sweeps
const STICK_ZONE = 0.45; // left share of the screen that spawns the joystick
const TAP_MS = 250, TAP_PX = 12;
const HINTS_FOR = 20; // seconds of play the "drag to move / look" hints stay up

const $ = (s) => document.querySelector(s);
const buzz = () => navigator.vibrate?.(8);

export class TouchControls {
  constructor({ pressed, onLook, onPause, onSkip }) {
    this.pressed = pressed;
    this.onLook = onLook;
    this.onSkip = onSkip;
    this.down = new Set();
    this.move = null;
    this.ptrs = new Map();
    this.ui = {};
    this.used = { stick: false, look: false };

    this.el = $('#touch');
    this.stick = $('#stick');
    this.knob = $('#stick-knob');
    this.btns = { main: $('#tb-main'), work: $('#tb-work'), dash: $('#tb-dash') };
    this.mainIcon = this.btns.main.querySelector('.ti');
    this.mainLabel = this.btns.main.querySelector('.tl');

    const el = this.el;
    el.addEventListener('pointerdown', (e) => this.start(e));
    el.addEventListener('pointermove', (e) => this.drag(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.end(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#tb-pause').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onPause();
    });
  }

  start(e) {
    if (this.ptrs.has(e.pointerId)) return;
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);
    const btn = e.target.closest('.tbtn');
    const p = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() };
    if (btn) {
      p.kind = 'btn';
      p.btn = btn;
      btn.classList.add('down');
      buzz();
      if (btn === this.btns.main) this.pressed.add('Space');
      else if (btn === this.btns.dash) this.pressed.add('ShiftLeft');
      else if (btn === this.btns.work) this.down.add('KeyE');
    } else if (e.clientX < innerWidth * STICK_ZONE && ![...this.ptrs.values()].some((q) => q.kind === 'stick')) {
      p.kind = 'stick';
      // keep the base far enough from the edges that the knob can travel fully
      const m = STICK_R + 8;
      p.bx = Math.min(Math.max(e.clientX, m), innerWidth - m);
      p.by = Math.min(Math.max(e.clientY, m), innerHeight - m);
      this.stick.classList.add('on');
      this.used.stick = true;
      this.drawStick(p, 0, 0);
      this.updateStick(p);
    } else {
      p.kind = 'look';
    }
    this.ptrs.set(e.pointerId, p);
  }

  drag(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.kind === 'look') {
      if (dx || dy) this.used.look = true;
      this.onLook(dx * LOOK_GAIN, dy * LOOK_GAIN);
    } else if (p.kind === 'stick') this.updateStick(p);
  }

  end(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'btn') {
      p.btn.classList.remove('down');
      if (p.btn === this.btns.work) this.down.delete('KeyE');
    } else if (p.kind === 'stick') {
      this.move = null;
      this.stick.classList.remove('on');
    } else if (e.type === 'pointerup' && performance.now() - p.t0 < TAP_MS && Math.hypot(p.x - p.x0, p.y - p.y0) < TAP_PX) {
      this.onSkip?.(); // a tap (not a drag) skips the intro
    }
  }

  updateStick(p) {
    let dx = p.x - p.bx, dy = p.y - p.by;
    let d = Math.hypot(dx, dy);
    // dragged past the rim: the base follows the thumb instead of losing it
    if (d > STICK_R) {
      const k = (d - STICK_R) / d;
      p.bx += dx * k;
      p.by += dy * k;
      dx = p.x - p.bx;
      dy = p.y - p.by;
      d = STICK_R;
    }
    this.drawStick(p, dx, dy);
    const mag = d / STICK_R;
    if (mag < DEAD) {
      this.move = null;
      return;
    }
    const k = (mag - DEAD) / (1 - DEAD) / mag;
    this.move = { x: (dx / STICK_R) * k, y: (dy / STICK_R) * k };
  }

  drawStick(p, dx, dy) {
    this.stick.style.transform = `translate(${p.bx}px, ${p.by}px)`;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // drop everything held (app backgrounded, paused, controls hidden)
  release() {
    for (const id of [...this.ptrs.keys()]) this.end({ pointerId: id });
    this.down.clear();
    this.move = null;
  }

  // once a frame: show/hide the layer and mirror what the game says is possible
  update(game, active) {
    const intro = game.state === 'intro';
    this.set('active', active, () => {
      this.el.classList.toggle('active', active);
      if (!active) this.release();
    });
    if (!active) return;
    this.set('intro', intro, () => this.el.classList.toggle('intro', intro));
    const early = game.time < HINTS_FOR && !intro;
    this.set('hintL', early && !this.used.stick, (v) => $('#th-move').classList.toggle('show', v));
    this.set('hintR', early && !this.used.look, (v) => $('#th-look').classList.toggle('show', v));
    if (intro) return;

    const c = game.touchContext();
    this.set('main', c.icon + c.label, () => {
      this.mainIcon.textContent = c.icon;
      this.mainLabel.textContent = c.label;
    });
    this.set('dim', !c.can, (v) => this.btns.main.classList.toggle('dim', v));
    this.set('work', c.canWork, (v) => this.btns.work.classList.toggle('show', v));
    this.set('workP', c.workProgress.toFixed(2), (v) => this.btns.work.style.setProperty('--p', v));
    this.set('dash', c.dashCooldown.toFixed(2), (v) => this.btns.dash.style.setProperty('--cd', v));
  }

  // only touch the DOM when a value actually changes
  set(key, v, apply) {
    if (this.ui[key] === v) return;
    this.ui[key] = v;
    apply(v);
  }
}
