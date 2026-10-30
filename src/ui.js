// DOM-based HUD: initiative tickets, meters, toasts, speech bubbles, menus.
import * as THREE from 'three';
import { ITEMS, PROCESS, RECIPES, TUNING, PERFORMANCE_REVIEWS, GAME_OVER_REASONS, STATIONS } from './data.js';

const $ = (sel) => document.querySelector(sel);
const CONTROLS_FULL_FOR = 20; // seconds of play before the controls bar shrinks
const fmt = (s) => {
  const neg = s < 0;
  s = Math.abs(Math.ceil(s));
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.orderEls = new Map();
    this.bubbles = [];
    this.floats = [];
    this.tmp = new THREE.Vector3();
    this.lastHeldKey = '';
    this.buildGuide();
  }

  // ------------------------------------------------------------------ HUD --
  render(game, dt) {
    // tickets
    const heldContents = game.held?.type === 'folder' ? game.held.contents : [];
    const live = new Set();
    for (const o of game.orders) {
      live.add(o.id);
      let el = this.orderEls.get(o.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ticket enter';
        el.innerHTML = `
          <div class="t-head"><span>${o.urgent ? '🚨' : ''}</span><span class="t-time"></span></div>
          <div class="t-name">${o.recipe.name}</div>
          <div class="t-needs">${o.recipe.needs.map((n) => `<span class="chip" data-n="${n}" title="${ITEMS[n].name}">${ITEMS[n].emoji}</span>`).join('')}</div>
          <div class="t-bar"><div></div></div>`;
        $('#orders').appendChild(el);
        this.orderEls.set(o.id, el);
        requestAnimationFrame(() => el.classList.remove('enter'));
      }
      const p = Math.max(0, o.timeLeft / o.timeTotal);
      const bar = el.querySelector('.t-bar div');
      bar.style.width = `${p * 100}%`;
      bar.style.background = p > 0.5 ? '#5af168' : p > 0.25 ? '#ffcc4d' : '#ff6e6e';
      el.querySelector('.t-time').textContent = o.overdue ? `OVERDUE ${fmt(o.timeLeft)}` : fmt(o.timeLeft);
      el.classList.toggle('overdue', o.overdue);
      el.classList.toggle('urgent', o.urgent && !o.overdue);
      el.classList.toggle('panic', !o.overdue && p < 0.2);
      for (const chip of el.querySelectorAll('.chip')) chip.classList.toggle('have', heldContents.includes(chip.dataset.n));
    }
    for (const [id, el] of this.orderEls) {
      if (!live.has(id)) {
        el.remove();
        this.orderEls.delete(id);
      }
    }

    // meters
    const conf = Math.max(0, game.confidence);
    $('#conf-fill').style.width = `${conf}%`;
    $('#conf-fill').style.background = conf > 60 ? '#5af168' : conf > 30 ? '#ffcc4d' : '#ff6e6e';
    $('#conf-val').textContent = Math.round(conf);
    $('#score').textContent = `$${game.score}M`;
    const bl = game.orders.length;
    $('#backlog').textContent = `${bl} / ${TUNING.maxBacklog}`;
    $('#backlog-box').classList.toggle('danger', bl >= TUNING.maxBacklog - 2);
    // full controls for the first stretch, then just the essentials
    $('#controls').classList.toggle('mini', game.time > CONTROLS_FULL_FOR);

    this.updateBubbles(dt);
  }

  setHeld(info) {
    const key = info ? info.emoji + info.hint : '';
    if (key === this.lastHeldKey) return;
    this.lastHeldKey = key;
    const el = $('#held');
    if (!info) {
      el.innerHTML = `<span class="h-empty">Hands free — grab something from a person or desk (Space)</span>`;
      return;
    }
    el.innerHTML = `<span class="h-emoji">${info.emoji}</span><div><div class="h-name">${info.name}</div><div class="h-hint">${info.hint}</div></div>`;
  }

  setStatus(text) {
    const el = $('#status');
    el.textContent = text ?? '';
    el.style.display = text ? 'block' : 'none';
  }

  toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').prepend(el);
    while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  banner(title, text, kind = 'bad') {
    const el = $('#banner');
    el.className = `show ${kind}`;
    el.innerHTML = `<div class="b-title">${title}</div><div class="b-text">${text}</div>`;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => (el.className = ''), 3800);
  }

  titleCard(text, ms = 2000) {
    const el = $('#title-card');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.titleT);
    this.titleT = setTimeout(() => el.classList.remove('show'), ms);
  }

  // -------------------------------------------- world-anchored text (DOM) --
  bubble(obj, text) {
    const old = this.bubbles.find((b) => b.obj === obj && b.kind === 'bubble');
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    $('#world-ui').appendChild(el);
    this.bubbles.push({ kind: 'bubble', obj, el, t: 2.6, y: 1.55 * (obj.scale?.x ?? 1) });
  }

  float(pos, text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `float ${kind}`;
    el.textContent = text;
    $('#world-ui').appendChild(el);
    this.bubbles.push({ kind: 'float', pos: new THREE.Vector3(pos.x, (pos.y ?? 0) + 0.9, pos.z), el, t: 1.8, rise: 0 });
  }

  updateBubbles(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      if (b.t <= 0) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      if (b.kind === 'bubble') {
        b.obj.getWorldPosition(this.tmp);
        this.tmp.y += b.y;
      } else {
        b.rise += dt * 0.6;
        this.tmp.copy(b.pos);
        this.tmp.y += b.rise;
      }
      this.tmp.project(this.camera);
      // behind the camera: hide instead of drawing it mirrored
      b.el.style.display = this.tmp.z > 1 ? 'none' : '';
      b.el.style.transform = `translate(-50%, -100%) translate(${(this.tmp.x * 0.5 + 0.5) * w}px, ${(-this.tmp.y * 0.5 + 0.5) * h}px)`;
      b.el.style.opacity = Math.min(1, b.t * 2);
    }
  }

  clearWorldText() {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
    for (const el of this.orderEls.values()) el.remove();
    this.orderEls.clear();
    $('#toasts').innerHTML = '';
    $('#banner').className = '';
    $('#title-card').classList.remove('show');
    this.setStatus(null);
    this.lastHeldKey = null;
  }

  // ------------------------------------------------------------- screens --
  show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
  }

  showGameOver(game) {
    const reason = GAME_OVER_REASONS[game.gameOverReason];
    const s = game.stats;
    const review = [...PERFORMANCE_REVIEWS].reverse().find((r) => s.delivered >= r.min);
    const pct = s.requested ? Math.round((s.delivered / s.requested) * 100) : 0;
    $('#go-title').textContent = reason.title;
    $('#go-reason').textContent = reason.text;
    $('#go-review-title').textContent = review.title;
    $('#go-review-text').textContent = review.text;
    $('#go-stats').innerHTML = [
      ['Initiatives requested', s.requested],
      ['Initiatives delivered', `${s.delivered} (${pct}%)`],
      ['Delivered late', s.lateDelivered],
      ['Went overdue', s.overdue],
      ['Rejected by execs', s.wrong],
      ['Production incidents', s.fires],
      ['Meetings attended', s.meetings],
      ['Scope creep generated', s.scopeCreep],
      ['Coffees consumed', s.coffee],
      ['Shareholder value', `$${game.score}M`],
      ['Survived', `${Math.floor(game.time / 60)}m ${Math.floor(game.time % 60)}s`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const best = Math.max(game.score, Number(localStorage.getItem('overcommitted-best') || 0));
    localStorage.setItem('overcommitted-best', best);
    $('#go-best').textContent = `Best shareholder value: $${best}M`;
    this.show('#gameover', true);
  }

  // A cheat-sheet of how every deliverable is made.
  buildGuide() {
    const where = {};
    for (const [k, d] of Object.entries(STATIONS)) if (d.kind === 'dispenser') where[d.item] = d.label;
    const procLabel = { workstation: '💻 Dev Workstation <i>(hold E)</i>', meeting: '🗣️ Meeting Room <i>(auto — don\'t let it run long!)</i>', server: '🖥️ Server Rack <i>(auto — grab it before it catches fire!)</i>' };
    const rows = [];
    for (const [proc, map] of Object.entries(PROCESS)) {
      for (const [raw, out] of Object.entries(map)) {
        rows.push(`<tr><td>${ITEMS[raw].emoji} ${ITEMS[raw].name}<small>from ${where[raw]}</small></td><td>→ ${procLabel[proc]} →</td><td><b>${ITEMS[out].emoji} ${ITEMS[out].name}</b></td></tr>`);
      }
    }
    rows.push(`<tr><td>☕ Coffee<small>from Coffee machine</small></td><td>→ ready as-is →</td><td><b>☕ Coffee</b></td></tr>`);
    const recipes = RECIPES.map((r) => `<li><b>${r.name}</b> <span>${r.needs.map((n) => ITEMS[n].emoji).join(' ')}</span></li>`).join('');
    const html = `<table>${rows.join('')}</table><h3>Known initiatives (leadership will invent more)</h3><ul class="recipes">${recipes}</ul>`;
    for (const el of document.querySelectorAll('.guide-content')) el.innerHTML = html;
  }
}
