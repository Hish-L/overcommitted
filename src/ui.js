// DOM-based HUD: initiative tickets, meters, toasts, speech bubbles, menus.
import * as THREE from 'three';
import { ITEMS, PROCESS, RECIPES, TUNING, PERFORMANCE_REVIEWS, GAME_OVER_REASONS, STATIONS, TOWNHALL_STATIONS, TOWNHALL_TICKETS } from './data.js';
import { device, keyHint, onDeviceChange } from './device.js';
import { labels } from './models.js';

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
    onDeviceChange(() => this.buildGuide());
  }

  // ------------------------------------------------------------------ HUD --
  render(game, dt) {
    // tickets
    const heldContents = game.held?.type === 'folder' ? game.held.contents : [];
    const live = new Set();
    for (const o of [...game.done, ...game.orders]) {
      live.add(o.id);
      let el = this.orderEls.get(o.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `ticket${o.story ? ' untimed' : ' enter'}${o.from ? ' achievement' : ''}`;
        el.innerHTML = `
          <div class="t-head"><span>${o.urgent ? '🚨' : ''}</span><span class="t-time"></span><span class="t-tick">✔ Delivered</span></div>
          <div class="t-name">${o.recipe.name}</div>
          ${o.story ? `<div class="t-story">${o.story}</div>` : ''}
          <div class="t-needs">${o.recipe.needs.map((n) => `<span class="chip" data-n="${n}" title="${ITEMS[n].name}">${ITEMS[n].emoji}</span>`).join('')}</div>
          <div class="t-bar"><div></div></div>`;
        $('#orders').appendChild(el);
        this.orderEls.set(o.id, el);
        if (o.story) this.popTicket(el);
        else requestAnimationFrame(() => el.classList.remove('enter'));
      }
      const p = Math.max(0, o.timeLeft / o.timeTotal);
      const bar = el.querySelector('.t-bar div');
      bar.style.width = `${p * 100}%`;
      bar.style.background = p > 0.5 ? '#5af168' : p > 0.25 ? '#ffcc4d' : '#ff6e6e';
      el.querySelector('.t-time').textContent = o.overdue ? `OVERDUE ${fmt(o.timeLeft)}` : fmt(o.timeLeft);
      el.classList.toggle('overdue', o.overdue);
      el.classList.toggle('done', !!o.done);
      if (o.done && o.story && !el.dataset.team) el.querySelector('.t-story').textContent = el.dataset.team = TOWNHALL_STATIONS[o.from].label; // delivered: credit the team
      if (o.done && el.classList.contains('pop')) { el.style.transform = ''; el.classList.remove('pop', 'dock'); } // delivered mid pop-up: dock now
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
    const counting = game.townhall && !game.overload; // town hall: achievements so far, until the finale
    const left = Math.max(0, Math.ceil(TUNING.townhallTimeLimit - game.time));
    $('#backlog-box label').textContent = counting ? `Achievements · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Backlog';
    $('#backlog').textContent = counting ? `${game.achieved.length} / ${TOWNHALL_TICKETS.length}` : `${bl} / ${TUNING.maxBacklog}`;
    $('#backlog-box').classList.toggle('danger', !counting && bl >= TUNING.maxBacklog - 2);
    const bar = game.state === 'playing' && game.hudBar;
    $('#work-bar').classList.toggle('hidden', !bar);
    if (bar) {
      $('#work-bar div').style.width = `${Math.min(1, Math.max(0, bar.p)) * 100}%`;
      $('#work-bar div').style.background = `#${bar.color.toString(16).padStart(6, '0')}`;
    }
    document.body.classList.toggle('townhall', game.mode === 'townhall');
    document.body.classList.toggle('tv-view', game.tvView > 0.5); // watching the eAcademy TV up close
    // full controls for the first stretch, then just the essentials
    $('#controls').classList.toggle('mini', game.time > CONTROLS_FULL_FOR);

    this.updateBubbles(dt);
  }

  setHeld(info) {
    const key = (info ? info.emoji + info.hint : '') + device.touch + device.pad;
    if (key === this.lastHeldKey) return;
    this.lastHeldKey = key;
    const el = $('#held');
    el.classList.toggle('fire', info?.emoji === '🔥');
    if (!info) {
      el.innerHTML = `<span class="h-empty">Hands free — grab something from a person or desk${device.touch ? '' : ` (${keyHint('grab')})`}</span>`;
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

  // Town hall story: the ticket appears big in the middle of the screen with its
  // story line, holds for TUNING.storyHold, then flies up to its slot in the ticket row.
  popTicket(el) {
    el.classList.add('pop');
    const r = el.getBoundingClientRect();
    const s = Math.min(2.2, (innerWidth * 0.8) / r.width, (innerHeight * 0.5) / r.height);
    const to = `translate(${innerWidth / 2 - r.left - r.width / 2}px, ${innerHeight * 0.42 - r.top - r.height / 2}px)`;
    el.style.transform = `${to} scale(${s * 0.6})`;
    el.style.opacity = 0;
    requestAnimationFrame(() => { el.style.transform = `${to} scale(${s})`; el.style.opacity = 1; });
    setTimeout(() => { el.style.transform = ''; el.classList.add('dock'); }, TUNING.storyHold * 1000);
    setTimeout(() => el.classList.remove('pop', 'dock'), TUNING.storyHold * 1000 + 800); // landed (keeps its story line)
  }

  // town hall: thumbs-up guy slides in bottom right with a comment
  thumbsUp(text, ms = 4500) {
    const el = $('#thumbs');
    el.querySelector('.say').textContent = text;
    el.classList.add('show');
    clearTimeout(this.thumbsT);
    this.thumbsT = setTimeout(() => el.classList.remove('show'), ms);
  }

  // Ross leans in from a random screen edge for a couple of seconds, just checking in
  peek(ms = 2000) {
    const el = $('#peek');
    const at = `${5 + Math.random() * 55}%`; // somewhere along that edge
    // [position, hidden/shown transform axis and sign, image turn so his head points in]
    const sides = [
      [{ left: 0, top: at }, 'X', -1, 90],
      [{ right: 0, top: at }, 'X', 1, -90],
      [{ top: 0, left: at }, 'Y', -1, 180],
      [{ bottom: 0, left: at }, 'Y', 1, 0],
    ];
    const [pos, axis, sign, rot] = sides[(Math.random() * sides.length) | 0];
    el.classList.remove('show');
    el.style.cssText = 'transition: none; left: auto; top: auto';
    Object.assign(el.style, pos);
    el.style.setProperty('--hide', `translate${axis}(${sign * 100}%)`);
    el.style.setProperty('--show', `translate${axis}(${sign * 60}%)`);
    el.style.setProperty('--rot', `${rot}deg`);
    void el.offsetWidth; // jump off-screen on the new edge before sliding in
    el.style.transition = '';
    el.classList.add('show');
    clearTimeout(this.peekT);
    this.peekT = setTimeout(() => el.classList.remove('show'), ms);
  }

  banner(title, text, kind = 'bad', ms = 3800) {
    const el = $('#banner');
    el.className = `show ${kind}`;
    el.innerHTML = `<div class="b-title">${title}</div><div class="b-text">${text}</div>`;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => (el.className = ''), ms);
  }

  // html: our own strings only; a <span> is the red half of the logo's two tones
  titleCard(html, ms = 2000, big = false) {
    const el = $('#title-card');
    el.innerHTML = html;
    el.classList.toggle('big', big);
    el.classList.add('show');
    clearTimeout(this.titleT);
    this.titleT = setTimeout(() => el.classList.remove('show'), ms);
  }

  // -------------------------------------------- world-anchored text (DOM) --
  bubble(obj, text, cls = '') {
    const old = this.bubbles.find((b) => b.obj === obj && b.kind === 'bubble');
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = `bubble ${cls}`;
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

  // station signs and name tags (models.js labelSprite), sized like a sprite
  // of the same world height. Call after the scene renders so they don't lag.
  renderLabels(show = true) {
    const h = window.innerHeight, w = window.innerWidth, cam = this.camera;
    for (const o of labels) {
      const d = o.userData;
      if (!d.el) {
        d.el = document.createElement('div');
        d.el.className = 'label';
        d.el.textContent = d.text;
        d.el.style.background = d.bg;
        d.el.style.color = d.fg;
        $('#world-ui').prepend(d.el); // under bubbles and floats
      }
      let vis = show || !!d.always;
      for (let p = o; p && vis; p = p.parent) vis = p.visible;
      const depth = -o.getWorldPosition(this.tmp).applyMatrix4(cam.matrixWorldInverse).z;
      vis &&= depth > cam.near;
      d.el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const px = (d.height * cam.projectionMatrix.elements[5] * h) / (2 * depth); // on-screen height
      this.tmp.applyMatrix4(cam.projectionMatrix);
      d.el.style.fontSize = `${px * 0.625}px`;
      d.el.style.transform = `translate(-50%, -50%) translate(${(this.tmp.x * 0.5 + 0.5) * w}px, ${(-this.tmp.y * 0.5 + 0.5) * h}px)`;
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
    const th = game.mode === 'townhall';
    $('#gameover').classList.toggle('townhall', th);
    $('#btn-restart').textContent = `Try again next ${th ? 'year' : 'quarter'} ↻`;
    $('#go-stats').innerHTML = th ? TOWNHALL_TICKETS.map(({ name: n }) => `<div><span><i class="trophy">✅</i>${n}</span></div>`).join('') : [
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
    if (th) this.fireworks();
  }

  // town hall finale: fireworks behind the achievements card until the screen closes
  fireworks() {
    const cv = $('#fireworks'), x = cv.getContext('2d'), sparks = [];
    let next = 0;
    const frame = (t) => {
      if ($('#gameover').classList.contains('hidden')) return x.clearRect(0, 0, cv.width, cv.height);
      if (cv.width !== innerWidth || cv.height !== innerHeight) [cv.width, cv.height] = [innerWidth, innerHeight];
      if (t > next) { // a new burst every ~0.4s
        next = t + 250 + Math.random() * 350;
        const bx = cv.width * (0.1 + Math.random() * 0.8), by = cv.height * (0.1 + Math.random() * 0.45);
        const hue = Math.random() * 360;
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 4;
          sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: hue + Math.random() * 40 });
        }
      }
      // fade old trails without painting over the backdrop
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = 'rgba(0,0,0,.18)';
      x.fillRect(0, 0, cv.width, cv.height);
      x.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += 0.06; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.life -= 0.012;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        x.fillStyle = `hsla(${p.hue},100%,62%,${p.life})`;
        x.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // A cheat-sheet of how every deliverable is made.
  buildGuide() {
    const where = {};
    for (const [k, d] of Object.entries(STATIONS)) if (d.kind === 'dispenser') where[d.item] = d.label;
    const procLabel = { workstation: `💻 Dev Workstation <i>(${keyHint('work')})</i>`, meeting: '🗣️ Meeting Room <i>(auto — don\'t let it run long!)</i>', server: '🖥️ Server Rack <i>(auto — grab it before it catches fire!)</i>' };
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
