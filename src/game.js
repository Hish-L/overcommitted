// Core game state + rules: player movement, carrying, stations, initiatives,
// chaos events and the inevitable collapse.
import * as THREE from 'three';
import { ITEMS, PROCESS, RECIPES, REQUESTERS, TUNING } from './data.js';
import { makePlayer, makeItemMesh, emojiSprite, emojiTexture, setLabel, tickMatrix, labelSprite } from './models.js';
import { HotDesk } from './hotdesk.js';
import { makeFire, animateFire } from './world.js';
import { sfx } from './audio.js';

const PLAYER_R = 0.3;
const EYE_HEIGHT = 1.35;
// After "Check In": the lift climbs the glass shaft from RIDE_FROM while the camera
// glides from the menu shot into the player's eyes (done by INTRO_TIME), then
// the rest of the ride is first person (free to look around)...
const RIDE_FROM = -20;
const INTRO_TIME = 3.5;
const RISE = { from: 0, to: 7.5 };
// ...then we turn to face the doors, they open, the glass door slides, and we walk out
const TURN = { from: 7.5, to: 8 };
const LIFT = { open: 8, glass: 8.4, walk: 8.8, end: 10.5 };
const smooth = (k) => k * k * (3 - 2 * k);
const LOOK_SENS = 0.0025;
const TURN_SPEED = 2.6; // rad/s for arrow-key turning
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STATION_FOR = {};
for (const [proc, map] of Object.entries(PROCESS)) for (const raw of Object.keys(map)) STATION_FOR[raw] = proc;
const PROC_NAME = { workstation: '💻 Dev Workstation (hold E)', meeting: '🗣️ Meeting Room', legal: '⚖️ Legal', finance: '💰 Finance', server: '🖥️ Server Rack' };

// ---------------------------------------------------------------------------
class Item {
  constructor(type, scene) {
    this.scene = scene;
    this.contents = [];
    this.mesh = new THREE.Group();
    this.setType(type);
  }
  get def() { return ITEMS[this.type]; }
  setType(type) {
    this.type = type;
    if (this.inner) this.mesh.remove(this.inner);
    this.inner = makeItemMesh(ITEMS[type]);
    this.mesh.add(this.inner);
    this.refreshContents();
  }
  refreshContents() {
    if (this.contentIcons) this.mesh.remove(this.contentIcons);
    this.contentIcons = null;
    if (this.type !== 'folder' || !this.contents.length) {
      if (this.inner) this.inner.userData.icon.visible = true;
      return;
    }
    this.inner.userData.icon.visible = false;
    const g = new THREE.Group();
    const n = this.contents.length;
    this.contents.forEach((t, i) => {
      const s = emojiSprite(ITEMS[t].emoji, 0.3);
      s.position.set((i - (n - 1) / 2) * 0.26, 0.32, 0);
      g.add(s);
    });
    this.mesh.add(g);
    this.contentIcons = g;
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
  }
}

// ---------------------------------------------------------------------------
// One side of a conversation: the body stays still and the talker's head (and
// everything on it, hair included) bobs up and down; the listener holds still.
function animateChat(ud, talking, t) {
  ud.headY ??= ud.head.position.y;
  ud.body.position.y = 0;
  ud.head.rotation.set(0, 0, talking ? 0 : 0.1);
  ud.head.position.y = ud.headY + (talking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0);
  ud.armR.rotation.set(0, 0, 0);
}

// Back to the normal idle: gentle bob and a slow look around, arms down.
function restPose(ud, talking, t) {
  ud.body.position.y = Math.sin(t * 2) * 0.015 + (talking ? Math.abs(Math.sin(t * 14)) * 0.04 : 0);
  ud.head.rotation.set(0, Math.sin(t * 0.7) * 0.3, 0);
  if (ud.headY != null) ud.head.position.y = ud.headY;
  ud.armR.rotation.set(talking ? -0.6 + Math.sin(t * 9) * 0.5 : 0, 0, 0);
}

export class Game {
  constructor({ scene, world, ui, camera }) {
    this.scene = scene;
    this.world = world;
    this.ui = ui;
    this.camera = camera;

    this.player = makePlayer();
    scene.add(this.player);
    // first person: the body stays in the world (shadow, collisions) but we never
    // see it, except during the intro fly-in, along with a "YOU" tag
    this.youTag = labelSprite('▼ YOU', 0.3, '#e0482f');
    scene.add(this.youTag);
    this.showBody(false);

    // held items live in their own little scene, drawn on top of the world so
    // they never clip into desks or walls (see main.js render)
    const vScene = new THREE.Scene();
    vScene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
    const vSun = new THREE.DirectionalLight(0xffffff, 1.6);
    vSun.position.set(1, 2, 1.5);
    vScene.add(vSun);
    this.view = { scene: vScene, camera: new THREE.PerspectiveCamera(55, 1, 0.01, 10) };

    const hl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 0.98),
      new THREE.MeshBasicMaterial({ color: 0xffee55, transparent: true, opacity: 0.35, depthWrite: false })
    );
    hl.rotation.x = -Math.PI / 2;
    hl.renderOrder = 5;
    scene.add(hl);
    this.highlight = hl;

    this.hotdesk = new HotDesk(this);
    this.state = 'menu';
    this.reset();
  }

  // -------------------------------------------------------------------------
  reset() {
    for (const st of this.world.stations) {
      st.item?.dispose();
      st.item = null;
      st.progress = st.overT = st.extT = st.fireT = 0;
      st.done = false;
      this.setFire(st, false);
      if (st.initialItem) this.placeOn(st, new Item(st.initialItem, this.scene));
    }
    this.held?.dispose();
    this.held = null;
    this.hotdesk.reset();

    if (this.world.elevator) this.world.elevator.car.position.y = RIDE_FROM; // parked down the shaft until Check In
    const p = this.player;
    p.position.set(this.world.spawn.x, 0, this.world.spawn.z);
    p.rotation.y = Math.PI;
    this.yaw = Math.PI;
    this.pitch = -0.25;
    this.vel = new THREE.Vector2();
    this.dashT = 0;
    this.dashCd = 0;
    this.walkT = 0;
    this.wobble = 0;
    this.working = false;
    this.target = null;

    this.time = 0;
    this.orders = [];
    this.nextOrderId = 1;
    this.spawnIn = TUNING.firstOrderDelay;
    this.spawnInterval = TUNING.spawnStart;
    this.confidence = TUNING.startConfidence;
    this.score = 0;
    this.chaosIn = TUNING.chaosStart;
    this.slowT = 0;
    this.training = null;
    this.shake = 0;
    this.lastRecipe = null;
    this.gameOverReason = null;
    this.stats = { delivered: 0, requested: 0, overdue: 0, wrong: 0, fires: 0, scopeCreep: 0, coffee: 0, meetings: 0, lateDelivered: 0 };
  }

  start() {
    this.reset();
    // "Check In": the lift sets off up the glass shaft straight away and the
    // camera glides from the menu shot into the player's eyes inside it
    this.state = 'intro';
    this.introT = 0;
    const lift = this.world.elevator;
    this.player.position.set(lift.x, RIDE_FROM, lift.z);
    this.yaw = Math.PI; // facing the lift doors
    this.pitch = 0;
    this.player.rotation.y = this.yaw;
    this.youTag.position.set(lift.x, RIDE_FROM + 1.95, lift.z);
    this.showBody(true);
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    // the last two points follow the climbing car and are updated every frame
    this.intro = {
      pos: new THREE.CatmullRomCurve3([this.camera.position.clone(), v(), v()]),
      // start looking wherever the camera already is (menu shot, or the game-over view)
      at: new THREE.CatmullRomCurve3([this.camera.position.clone().addScaledVector(this.camera.getWorldDirection(v()), 30), v(), v()]),
    };
  }

  showBody(v) {
    const { body, legL, legR } = this.player.userData;
    for (const part of [body, legL, legR]) part.visible = v;
    this.youTag.visible = v;
  }

  // first-person part of the lift ride, when the player can look around
  riding() {
    return this.state === 'intro' && this.introT >= INTRO_TIME && this.introT < TURN.from;
  }

  skipIntro() {
    if (this.state === 'intro') this.introT = LIFT.end;
  }

  // the car rides up during the fly-in and on in first person (free look); then
  // we turn to the doors, they open (ding), the glass door slides, and we walk out
  updateIntro(dt, input) {
    const prev = this.introT;
    this.introT += dt;
    const t = this.introT;
    const lift = this.world.elevator;
    const y = RIDE_FROM * (1 - smooth(Math.min(1, Math.max(0, (t - RISE.from) / (RISE.to - RISE.from)))));
    lift.car.position.y = y;
    if (t < LIFT.walk) this.player.position.y = y;
    this.youTag.position.y = y + 1.95;
    if (this.riding()) {
      if (input.down('ArrowLeft')) this.yaw += TURN_SPEED * dt;
      if (input.down('ArrowRight')) this.yaw -= TURN_SPEED * dt;
    } else if (t >= TURN.from && t < LIFT.walk) {
      // arrived: turn from wherever we were looking to face the doors
      if (prev < TURN.from) this.turnFrom = { yaw: this.yaw, pitch: this.pitch };
      const k = smooth(Math.min(1, (t - TURN.from) / (TURN.to - TURN.from)));
      const f = this.turnFrom, dy = Math.atan2(Math.sin(Math.PI - f.yaw), Math.cos(Math.PI - f.yaw));
      this.yaw = f.yaw + dy * k;
      this.pitch = f.pitch + (-0.25 - f.pitch) * k;
    }
    this.player.rotation.y = this.yaw;
    if (t < INTRO_TIME) return;
    this.showBody(false);
    if (prev < LIFT.open && t >= LIFT.open) sfx.done();
    if (t >= LIFT.glass) this.hotdesk.doorHold = Math.max(this.hotdesk.doorHold, 0.3);
    this.hotdesk.animateDoors(dt);
    if (t >= LIFT.walk) {
      const k = Math.min(1, (t - LIFT.walk) / (LIFT.end - LIFT.walk));
      const e = smooth(k), sp = this.world.spawn;
      this.player.position.set(lift.x + (sp.x - lift.x) * e, 0, lift.z + (sp.z - lift.z) * e);
      this.walkT += dt * 9;
      this.wobble = k < 1 ? 1 : 0;
    }
    if (t >= LIFT.end) this.finishIntro();
  }

  finishIntro() {
    this.state = 'playing';
    this.intro = null;
    this.showBody(false);
    this.player.position.set(this.world.spawn.x, 0, this.world.spawn.z);
    this.world.elevator.car.position.y = 0;
    this.yaw = Math.PI;
    this.pitch = -0.25;
    this.player.rotation.y = this.yaw;
    this.wobble = 0;
    this.ui.show('#hud', true);
    this.ui.toast('Welcome to the Cyber Division! Leadership has a few small asks...', 'info');
  }

  // Mouse look (called from main.js with pointer-lock movement deltas)
  look(dx, dy) {
    if (this.state !== 'playing' && !this.riding()) return;
    this.yaw -= dx * LOOK_SENS;
    this.pitch = clamp(this.pitch - dy * LOOK_SENS, -1.35, 1.1);
  }

  // A point just in front of the player's eyes, for floating text
  inFront(dist = 1.2) {
    const p = this.player.position;
    return { x: p.x + Math.sin(this.yaw) * dist, y: EYE_HEIGHT - 1.1, z: p.z + Math.cos(this.yaw) * dist };
  }

  // -------------------------------------------------------------------------
  update(dt, input) {
    if (this.state === 'intro') this.updateIntro(dt, input);
    this.animateWorld(dt);
    if (this.state !== 'playing') return;
    this.time += dt;

    this.updatePlayer(dt, input);
    this.updateStations(dt);
    this.hotdesk.update(dt);
    this.updateOrders(dt);
    this.updateChaos(dt);

    if (this.confidence <= 0) this.endGame('confidence');
  }

  // office clock, in minutes after midnight
  clockMinutes() {
    return TUNING.dayStart + this.time * TUNING.minutesPerSecond;
  }

  clockLabel() {
    const m = Math.floor(this.clockMinutes()) % (24 * 60);
    const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
    return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // -------------------------------------------------------------------------
  // PLAYER
  // -------------------------------------------------------------------------
  updatePlayer(dt, input) {
    const p = this.player;
    const ud = p.userData;

    if (this.training) {
      if (input.pressed('KeyE') || input.pressed('KeyJ') || input.pressed('Space')) {
        this.training.have++;
        sfx.type();
        if (this.training.have >= this.training.need) {
          this.training = null;
          sfx.done();
          this.ui.hideTraining();
          this.ui.toast('Training complete! Certificate #84,112 added to your profile.', 'good');
        } else this.ui.showTraining(this.training);
      }
      this.animatePlayer(dt, false);
      return;
    }

    // turning: mouse (see look()) or arrow keys
    if (input.down('ArrowLeft')) this.yaw += TURN_SPEED * dt;
    if (input.down('ArrowRight')) this.yaw -= TURN_SPEED * dt;
    p.rotation.y = this.yaw;

    // movement, relative to where you're looking
    let fwd = 0, side = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fwd += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fwd -= 1;
    if (input.down('KeyD')) side += 1;
    if (input.down('KeyA')) side -= 1;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
    const len = Math.hypot(mx, mz);
    const moving = len > 0;
    if (moving) { mx /= len; mz /= len; }

    this.dashCd -= dt;
    if ((input.pressed('ShiftLeft') || input.pressed('ShiftRight') || input.pressed('KeyK')) && this.dashCd <= 0) {
      this.dashT = TUNING.dashTime;
      this.dashCd = TUNING.dashCooldown;
      sfx.dash();
    }

    const speed = TUNING.playerSpeed * (this.slowT > 0 ? 0.5 : 1);
    let vx = mx * speed, vz = mz * speed;
    if (this.dashT > 0) {
      this.dashT -= dt;
      // dash the way you're moving (or straight ahead if standing still)
      vx = (moving ? mx : fx) * TUNING.dashSpeed;
      vz = (moving ? mz : fz) * TUNING.dashSpeed;
    }
    // a little smoothing so it feels less robotic
    this.vel.x += (vx - this.vel.x) * Math.min(1, dt * 18);
    this.vel.y += (vz - this.vel.y) * Math.min(1, dt * 18);
    p.position.x += this.vel.x * dt;
    p.position.z += this.vel.y * dt;
    this.collide(p.position);
    this.collide(p.position);

    // targeting
    this.target = this.findTarget();
    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x, this.target.slot.y + 0.03, this.target.z);
      this.highlight.material.opacity = 0.25 + Math.sin(this.time * 8) * 0.1;
    } else this.highlight.visible = false;

    if (input.pressed('Space') || input.pressed('KeyJ')) this.interact();

    this.working = false;
    if (input.down('KeyE') || input.down('KeyL')) this.work(dt);

    this.animatePlayer(dt, moving || this.dashT > 0);
    this.animateHeld(dt, moving);
    this.ui.setHeld(this.describeHeld());
  }

  collide(pos) {
    const { tileAt, cell, toWorld } = this.world;
    const { c: c0, r: r0 } = tileAt(pos.x, pos.z);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (!cell(c, r)?.solid) continue;
        const { x, z } = toWorld(c, r);
        const cx = clamp(pos.x, x - 0.5, x + 0.5);
        const cz = clamp(pos.z, z - 0.5, z + 0.5);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < PLAYER_R * PLAYER_R) {
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const push = (PLAYER_R - d) / d;
            pos.x += dx * push;
            pos.z += dz * push;
          } else {
            pos.x = this.world.spawn.x;
            pos.z = this.world.spawn.z;
          }
        }
      }
    }
    // people sitting at desk stations
    for (const st of this.world.stations) {
      const b = st.bump;
      if (!b) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z;
      const min = PLAYER_R + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (min - d);
      pos.z += (dz / d) * (min - d);
    }
  }

  findTarget() {
    const p = this.player.position;
    const fx = Math.sin(this.player.rotation.y), fz = Math.cos(this.player.rotation.y);
    const { tileAt, cell, toWorld } = this.world;
    const probe = tileAt(p.x + fx * 0.75, p.z + fz * 0.75);
    const direct = cell(probe.c, probe.r)?.station;
    if (direct) return direct;
    const { c: c0, r: r0 } = tileAt(p.x, p.z);
    let best = null, bestScore = 0.55;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const st = cell(c, r)?.station;
        if (!st) continue;
        const { x, z } = toWorld(c, r);
        const dx = x - p.x, dz = z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.25) continue;
        const score = (dx * fx + dz * fz) / d;
        if (score > bestScore) { bestScore = score; best = st; }
      }
    }
    return best;
  }

  animatePlayer(dt, moving) {
    const ud = this.player.userData;
    if (moving) this.walkT += dt * 12;
    // waddle: ease in/out so starting and stopping don't snap
    this.wobble += ((moving ? 1 : 0) - this.wobble) * Math.min(1, dt * 10);
    const w = this.wobble, s = Math.sin(this.walkT), bounce = Math.cos(this.walkT * 2);
    const swing = s * 0.75 * w;
    ud.legL.rotation.x = swing;
    ud.legR.rotation.x = -swing;
    ud.body.position.y = Math.abs(s) * 0.08 * w;
    ud.body.rotation.x = 0.12 * w; // eager forward lean
    ud.body.scale.set(1 - bounce * 0.035 * w, 1 + bounce * 0.07 * w, 1 - bounce * 0.035 * w); // squash & stretch
    if (this.held) {
      ud.armL.rotation.x = ud.armR.rotation.x = -1.3;
    } else if (this.working) {
      ud.armL.rotation.x = -1.0 + Math.sin(this.time * 30) * 0.25;
      ud.armR.rotation.x = -1.0 - Math.sin(this.time * 30) * 0.25;
    } else {
      ud.armL.rotation.x = -swing * 0.8;
      ud.armR.rotation.x = swing * 0.8;
    }
    // side-to-side rock from the feet, plus the training-video sway
    ud.body.rotation.z = s * 0.2 * w + (this.training ? Math.sin(this.time * 6) * 0.1 : 0);
  }

  // held item sits bottom-right of view and bobs with your steps
  animateHeld(dt, moving) {
    const it = this.held;
    if (!it) return;
    const b = this.wobble;
    const sway = Math.sin(this.walkT) * 0.025 * b;
    const lift = Math.abs(Math.cos(this.walkT)) * 0.02 * b;
    const busy = this.working ? Math.sin(this.time * 30) * 0.01 : 0;
    it.mesh.position.set(0.28 + sway, -0.3 + lift + busy, -0.85);
    it.mesh.rotation.set(0.35, -0.5, 0);
    // the HUD already names it; just keep a folder's contents visible (smaller)
    it.inner.userData.icon.visible = false;
    it.contentIcons?.scale.setScalar(0.6);
  }

  // -------------------------------------------------------------------------
  // CARRYING
  // -------------------------------------------------------------------------
  hold(item) {
    this.held = item;
    this.view.scene.add(item.mesh);
    item.mesh.scale.setScalar(0.7);
    this.animateHeld(0, false);
  }
  takeHeld() {
    const it = this.held;
    this.held = null;
    if (it) this.view.scene.remove(it.mesh);
    return it;
  }
  placeOn(st, item) {
    st.item = item;
    this.scene.add(item.mesh);
    item.mesh.position.copy(st.slot);
    item.mesh.rotation.set(0, st.group.rotation.y, 0);
    item.mesh.scale.setScalar(1);
    item.refreshContents(); // restore the floating icons hidden while held
    st.progress = 0;
    st.overT = 0;
    st.done = false;
  }
  takeFrom(st) {
    const it = st.item;
    st.item = null;
    st.progress = 0;
    st.overT = 0;
    st.done = false;
    if (it) this.scene.remove(it.mesh);
    return it;
  }

  // Can `type` go into a folder?
  folderable(type) {
    const d = ITEMS[type];
    return !d.raw && !d.ruined && !d.container && !d.tool;
  }
  addToFolder(folder, type, where) {
    if (!this.folderable(type)) {
      const d = ITEMS[type];
      if (d.raw) this.ui.float(where, `Not ready! Take it to ${PROC_NAME[STATION_FOR[type]]}`, 'bad');
      else if (d.ruined) this.ui.float(where, 'That\'s scope creep. Shred it.', 'bad');
      else this.ui.float(where, 'That doesn\'t go in a folder.', 'bad');
      sfx.wrong();
      return false;
    }
    if (folder.contents.includes(type)) {
      this.ui.float(where, 'Folder already has that!', 'bad');
      sfx.wrong();
      return false;
    }
    if (folder.contents.length >= 4) {
      this.ui.float(where, 'Folder is full (4 max)', 'bad');
      sfx.wrong();
      return false;
    }
    folder.contents.push(type);
    folder.refreshContents();
    sfx.pickup();
    return true;
  }

  interact() {
    const st = this.target;
    if (st?.takenBy) {
      this.ui.float(st.slot, '🪑 Taken. Hot-desking is first come, first served.', 'bad');
      sfx.wrong();
      return;
    }
    if (!st) {
      // drop on the floor isn't allowed in an office. HR would have words.
      if (this.held) this.ui.float(this.inFront(), 'Find a desk to put that on', 'info');
      return;
    }
    if (st.fire && !this.held && st.item?.type === 'playbook') {
      this.hold(this.takeFrom(st));
      sfx.pickup();
      return;
    }
    if (st.fire) {
      this.ui.float(st.slot, 'It\'s ON FIRE! Use the 🧯 Playbook (hold E)', 'bad');
      sfx.wrong();
      return;
    }
    const held = this.held;

    switch (st.kind) {
      case 'dispenser': {
        const type = st.dispense.item;
        if (!held) {
          this.hold(new Item(type, this.scene));
          sfx.pickup();
          this.npcSay(st, pick(st.dispense.lines));
          if (type === 'coffee') this.stats.coffee++;
        } else if (held.type === 'folder' && this.folderable(type)) {
          if (this.addToFolder(held, type, st.slot)) this.npcSay(st, pick(st.dispense.lines));
        } else {
          this.ui.float(st.slot, 'Hands full!', 'info');
        }
        return;
      }
      case 'trash': {
        if (!held) return;
        if (held.type === 'playbook') {
          this.ui.float(st.slot, 'You\'re going to need that...', 'bad');
          return;
        }
        if (held.type === 'folder' && held.contents.length) {
          held.contents = [];
          held.refreshContents();
          this.ui.float(st.slot, 'Folder emptied', 'info');
        } else {
          this.takeHeld().dispose();
          this.ui.float(st.slot, held.type === 'scopecreep' ? 'Scope creep shredded 🎉' : 'Shredded', 'info');
        }
        sfx.shred();
        return;
      }
      case 'deliver': {
        if (!held) {
          this.ui.float(st.slot, 'Bring a 📁 Project Folder', 'info');
          return;
        }
        if (held.type !== 'folder') {
          this.ui.float(st.slot, 'Execs only accept Project Folders 📁', 'bad');
          sfx.wrong();
          return;
        }
        if (!held.contents.length) {
          this.ui.float(st.slot, 'An empty folder? Bold strategy.', 'bad');
          sfx.wrong();
          return;
        }
        this.deliver(this.takeHeld(), st);
        return;
      }
      case 'auto': {
        const proc = st.def.proc;
        if (!held && st.item) {
          this.hold(this.takeFrom(st));
          sfx.pickup();
          return;
        }
        if (held && !st.item) {
          if (!PROCESS[proc][held.type]) {
            const wants = Object.keys(PROCESS[proc]).map((k) => `${ITEMS[k].emoji} ${ITEMS[k].name}`).join(', ');
            this.ui.float(st.slot, `${st.def.label} only takes ${wants}`, 'bad');
            sfx.wrong();
            return;
          }
          this.placeOn(st, this.takeHeld());
          sfx.drop();
          if (proc === 'meeting') this.stats.meetings++;
          this.npcSay(st, pick(st.def.lines ?? ['...']));
          return;
        }
        if (held && st.item) this.combine(st);
        return;
      }
      case 'workstation':
      case 'counter': {
        if (!held && st.item) {
          this.hold(this.takeFrom(st));
          sfx.pickup();
        } else if (held && !st.item) {
          this.placeOn(st, this.takeHeld());
          sfx.drop();
        } else if (held && st.item) this.combine(st);
        return;
      }
    }
  }

  combine(st) {
    const held = this.held;
    if (held.type === 'folder' && st.item.type !== 'folder') {
      if (this.addToFolder(held, st.item.type, st.slot)) this.takeFrom(st).dispose();
    } else if (st.item.type === 'folder' && held.type !== 'folder') {
      if (this.addToFolder(st.item, held.type, st.slot)) this.takeHeld().dispose();
    } else {
      this.ui.float(st.slot, 'Hands full!', 'info');
    }
  }

  work(dt) {
    const st = this.target;
    if (!st || st.takenBy) return;
    if (st.fire) {
      if (this.held?.type !== 'playbook') {
        if (Math.random() < dt * 2) this.ui.float(st.slot, 'Need the 🧯 Incident Response Playbook!', 'bad');
        return;
      }
      this.working = true;
      st.extT += dt;
      if (Math.random() < dt * 10) sfx.type();
      if (st.extT >= TUNING.extinguishTime) {
        this.setFire(st, false);
        sfx.done();
        this.ui.float(st.slot, 'Incident resolved! Post-mortem scheduled for 3 hours.', 'good');
      }
      return;
    }
    if (st.kind !== 'workstation' || !st.item) return;
    const result = PROCESS.workstation[st.item.type];
    if (!result) return;
    this.working = true;
    st.progress += dt / st.def.work;
    if (Math.random() < dt * 14) sfx.type();
    if (st.progress >= 1) {
      st.progress = 0;
      st.item.setType(result);
      sfx.done();
      this.ui.float(st.slot, `${ITEMS[result].emoji} ${ITEMS[result].name}!`, 'good');
    }
  }

  npcSay(st, text) {
    if (!st.npc) return;
    st.npc.userData.talkT = 0.5;
    this.ui.bubble(st.npc, text);
  }

  describeHeld() {
    const h = this.held;
    if (!h) return null;
    const d = h.def;
    let hint;
    if (h.type === 'folder') {
      hint = h.contents.length
        ? `Contains ${h.contents.map((t) => ITEMS[t].emoji).join(' ')} — add more or deliver to 🏛️ Exec Boardroom`
        : 'Fill it with finished deliverables, then deliver to 🏛️ Exec Boardroom';
    } else if (d.raw) hint = `Not ready yet → take to ${PROC_NAME[STATION_FOR[h.type]]}`;
    else if (d.ruined) hint = 'Ruined by endless meetings. Toss it in the 🗑️ Shredder';
    else if (d.tool) hint = 'Face a 🔥 fire and hold E to resolve the incident';
    else hint = 'Done! Put it in a 📁 Project Folder';
    return { emoji: d.emoji, name: d.name, hint, contents: h.contents };
  }

  // -------------------------------------------------------------------------
  // STATIONS
  // -------------------------------------------------------------------------
  updateStations(dt) {
    for (const st of this.world.stations) {
      let bar = null;

      if (st.fire) {
        st.fireT += dt;
        this.confidence -= TUNING.fireDrain * dt;
        if (st.fireT >= TUNING.fireSpreadTime) {
          st.fireT = 0;
          this.spreadFire(st);
        }
        if (st.extT > 0) bar = { p: st.extT / TUNING.extinguishTime, color: 0x55aaff };
      } else if (st.kind === 'auto' && st.item) {
        const proc = st.def.proc;
        const result = PROCESS[proc][st.item.type];
        if (result && !st.done) {
          st.progress += dt / st.def.time;
          bar = { p: st.progress, color: 0x33dd66 };
          st.chatterT -= dt;
          if (st.chatterT <= 0 && st.npc) {
            st.chatterT = 2.5 + Math.random() * 2;
            this.npcSay(st, pick(st.def.lines));
          }
          if (st.progress >= 1) {
            st.item.setType(result);
            st.done = true;
            st.overT = 0;
            sfx.done();
            this.ui.float(st.slot, `${ITEMS[result].emoji} ${ITEMS[result].name} ready!`, 'good');
          }
        } else if (st.done && st.def.overrun) {
          st.overT += dt;
          const p = st.overT / st.def.overrun;
          if (p > 0.35) bar = { p, color: Math.sin(this.time * 14) > 0 ? 0xff3333 : 0xffaa00, warn: true };
          if (st.overT >= st.def.overrun) this.ruin(st);
        }
      } else if (st.kind === 'workstation' && st.item && st.progress > 0) {
        bar = { p: st.progress, color: 0x33dd66 };
      }

      if (bar) {
        st.barBg.visible = st.barFg.visible = true;
        st.barFg.scale.x = 0.76 * clamp(bar.p, 0, 1);
        st.barFg.material.color.setHex(bar.color);
      } else st.barBg.visible = st.barFg.visible = false;

      if (st.key === 'W') {
        const busy = this.working && this.target === st;
        st.model.userData.screen.material.color.setHex(st.fire ? 0x661100 : st.takenBy ? 0x1d5fa8 : busy ? (Math.sin(this.time * 20) > 0 ? 0x22ff88 : 0x118844) : st.item ? 0x0d5a3c : 0x0a3d2a);
      }
    }
  }

  ruin(st) {
    if (st.def.ruin === 'fire') {
      st.item.dispose();
      st.item = null;
      st.done = false;
      this.setFire(st, true);
      this.ui.banner('🔥 PRODUCTION INCIDENT!', 'You left infra on the rack too long. Grab the 🧯 Playbook and hold E!', 'bad');
      sfx.alarm();
    } else {
      st.item.setType(st.def.ruin);
      st.done = false;
      st.progress = 1;
      this.stats.scopeCreep++;
      this.ui.float(st.slot, 'Meeting ran long → 🌀 SCOPE CREEP!', 'bad');
      sfx.ruin();
    }
  }

  setFire(st, on) {
    if (on === st.fire) return;
    st.fire = on;
    st.fireT = 0;
    st.extT = 0;
    if (on) {
      this.stats.fires++;
      st.fireFx = makeFire();
      st.fireFx.position.set((st.x + st.slot.x) / 2, st.key === 'S' ? 0.3 : 0, (st.z + st.slot.z) / 2);
      this.scene.add(st.fireFx);
      this.shake = 0.4;
    } else if (st.fireFx) {
      this.scene.remove(st.fireFx);
      st.fireFx = null;
    }
  }

  spreadFire(st) {
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dc, dr]) => this.world.cell(st.c + dc, st.r + dr)?.station)
      .filter((s) => s && !s.fire && s.kind !== 'deliver');
    if (!neighbors.length) return;
    const n = pick(neighbors);
    this.setFire(n, true);
    if (n.item && n.item.type !== 'playbook') {
      n.item.dispose();
      n.item = null;
    }
    this.ui.toast('🔥 The incident is spreading! Nobody updated the runbook.', 'bad');
    sfx.alarm();
  }

  // -------------------------------------------------------------------------
  // ORDERS / INITIATIVES
  // -------------------------------------------------------------------------
  updateOrders(dt) {
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnOrder();
      this.spawnInterval = Math.max(TUNING.spawnMin, this.spawnInterval * TUNING.spawnDecay);
      this.spawnIn = this.spawnInterval;
    }
    for (const o of this.orders) {
      o.timeLeft -= dt;
      if (!o.overdue && o.timeLeft <= 0) {
        o.overdue = true;
        this.stats.overdue++;
        this.confidence -= TUNING.expirePenalty;
        this.shake = 0.3;
        sfx.overdue();
        this.ui.toast(`⏰ "${o.recipe.name}" is OVERDUE. ${o.requester.who} is "disappointed".`, 'bad');
      }
      if (o.overdue) this.confidence -= TUNING.overdueDrain * dt;
    }
  }

  spawnOrder(opts = {}) {
    if (this.orders.length >= TUNING.maxBacklog) {
      this.endGame('backlog');
      return;
    }
    let tier = 0;
    TUNING.tierUnlock.forEach((t, i) => { if (this.time >= t) tier = i; });
    if (opts.maxTier != null) tier = Math.min(tier, opts.maxTier);
    let pool = RECIPES.filter((r) => r.tier <= tier && r !== this.lastRecipe);
    // bias toward the newest tier so the asks get bigger over time
    const top = pool.filter((r) => r.tier === tier);
    const recipe = Math.random() < 0.55 && top.length ? pick(top) : pick(pool);
    this.lastRecipe = recipe;
    const requester = opts.requester ? REQUESTERS.find((r) => r.who === opts.requester) : pick(REQUESTERS);
    const total = opts.time ?? TUNING.baseTime + TUNING.perIngredient * recipe.needs.length;
    const o = {
      id: this.nextOrderId++, recipe, requester, line: pick(requester.lines),
      timeTotal: total, timeLeft: total, overdue: false, urgent: !!opts.urgent, born: this.time,
    };
    this.orders.push(o);
    this.stats.requested++;
    sfx.email();
    this.ui.toast(`📧 ${requester.who}: "${o.line}" → ${recipe.name}`, 'info');
  }

  deliver(folder, st) {
    const key = [...folder.contents].sort().join('|');
    const matches = this.orders.filter((o) => [...o.recipe.needs].sort().join('|') === key);
    folder.dispose();
    if (!matches.length) {
      this.stats.wrong++;
      this.confidence -= TUNING.wrongPenalty;
      sfx.wrong();
      this.shake = 0.2;
      this.ui.float(st.slot, '"That\'s not what I asked for." (It was exactly what they asked for last week)', 'bad');
      return;
    }
    matches.sort((a, b) => a.timeLeft - b.timeLeft);
    const o = matches[0];
    this.orders.splice(this.orders.indexOf(o), 1);
    const base = 20 + 15 * o.recipe.needs.length;
    const bonus = o.overdue ? 0 : Math.round(30 * (o.timeLeft / o.timeTotal));
    const pts = o.overdue ? Math.round(base * 0.4) : base + bonus;
    this.score += pts;
    this.stats.delivered++;
    if (o.overdue) this.stats.lateDelivered++;
    this.confidence = Math.min(TUNING.startConfidence, this.confidence + TUNING.deliverBonus);
    sfx.deliver();
    this.ui.float(st.slot, `+$${pts}M shareholder value!`, 'good');
    this.ui.toast(`✅ Delivered "${o.recipe.name}". ${pick(['The CISO put it on a slide.', 'Leadership: "Great, now make it scale."', 'It\'s already been re-prioritized.', 'Someone asked if it uses AI.', 'Added to the quarterly OKR deck.'])}`, 'good');
    const ceo = this.world.stations.find((s) => s.kind === 'deliver' && s.npc);
    if (ceo) this.npcSay(ceo, pick(['Great. Now do it again.', 'Love it. Can it be blockchain?', 'Ship it!', 'Where\'s the dashboard?', 'Nice. I have 5 more ideas.']));
  }

  // -------------------------------------------------------------------------
  // CHAOS EVENTS
  // -------------------------------------------------------------------------
  updateChaos(dt) {
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.ui.setStatus(null);
    }
    this.chaosIn -= dt;
    if (this.chaosIn > 0) return;
    const [a, b] = TUNING.chaosEvery;
    this.chaosIn = a + Math.random() * (b - a);
    const events = ['incident', 'replyall', 'reorg', 'audit', 'training'];
    this.triggerChaos(pick(events));
  }

  triggerChaos(kind) {
    switch (kind) {
      case 'incident': {
        let options = this.world.stations.filter((s) => s.key === 'S' && !s.fire);
        if (!options.length) options = this.world.stations.filter((s) => s.key === 'W' && !s.fire && !s.takenBy);
        if (!options.length) return;
        const st = pick(options);
        if (st.item && st.item.type !== 'playbook') { st.item.dispose(); st.item = null; }
        this.setFire(st, true);
        this.ui.banner('🔥 PRODUCTION INCIDENT!', 'Someone deployed on a Friday. Grab the 🧯 Playbook and hold E on the fire!', 'bad');
        sfx.alarm();
        break;
      }
      case 'replyall': {
        this.slowT = 10;
        this.ui.setStatus('📨 Reply-All Storm: movement slowed');
        this.ui.banner('📨 REPLY-ALL STORM!', '"Please remove me from this list" ×400. Your inbox is melting — you move at half speed.', 'warn');
        sfx.email();
        break;
      }
      case 'reorg': {
        const people = this.world.stations.filter((s) => s.kind === 'dispenser' && s.npc && s.key !== 'F');
        if (people.length < 2) return;
        const a = pick(people);
        let b = pick(people);
        while (b === a) b = pick(people);
        [a.dispense, b.dispense] = [b.dispense, a.dispense];
        const na = a.npc, nb = b.npc;
        a.group.remove(na); b.group.remove(nb);
        a.group.add(nb); b.group.add(na);
        a.npc = nb; b.npc = na;
        for (const s of [a, b]) {
          if (s.label) setLabel(s.label, `${s.dispense.label} ${ITEMS[s.dispense.item].emoji}`, '#7a1d1d');
          s.icon.material.map = emojiTexture(ITEMS[s.dispense.item].emoji);
          this.npcSay(s, 'I sit here now. Nobody told me either.');
        }
        this.ui.banner('🔀 REORG!', `${a.dispense.label} and ${b.dispense.label} swapped desks. Nobody updated the org chart.`, 'warn');
        sfx.alarm();
        break;
      }
      case 'audit': {
        this.ui.banner('🕵️ SURPRISE AUDIT!', 'The Auditor needs something delivered ASAP. Like, yesterday.', 'warn');
        this.spawnOrder({ urgent: true, time: 50, maxTier: 0, requester: 'Auditor' });
        break;
      }
      case 'training': {
        this.training = { need: 14, have: 0 };
        this.ui.showTraining(this.training);
        sfx.alarm();
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  endGame(reason) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.gameOverReason = reason;
    this.training = null;
    this.ui.hideTraining();
    sfx.gameover();
    this.ui.showGameOver(this);
  }

  // -------------------------------------------------------------------------
  // Ambient animation (runs even on menus)
  // -------------------------------------------------------------------------
  animateWorld(dt) {
    const t = performance.now() / 1000;
    tickMatrix(t);
    // lift doors: open from the ding until just after we've walked out
    const liftOpen = this.state === 'intro' ? this.introT >= LIFT.open : this.state === 'playing' && this.time < 1.5;
    this.liftOpen = (this.liftOpen ?? 0) + ((liftOpen ? 1 : 0) - (this.liftOpen ?? 0)) * Math.min(1, dt * 4);
    for (const d of this.world.elevator?.doors ?? []) d.position.x = d.userData.x + this.liftOpen * d.userData.slide;
    for (const st of this.world.stations) {
      if (st.npc) {
        const ud = st.npc.userData;
        ud.talkT = Math.max(0, (ud.talkT ?? 0) - dt);
        const talking = ud.talkT > 0 || (st.kind === 'auto' && st.item && !st.done);
        if (ud.chatWith) {
          // RJ and Patrizia chat for a while, then turn back to the room and
          // rest for a bit before picking the conversation up again
          const chatting = t % 16 < 11;
          const seat = ud.chatWith.parent, k = 1 - Math.exp(-dt * 3), a = chatting ? ud.chatAngle : 0;
          st.npc.rotation.y += (a - st.npc.rotation.y) * k;
          seat.rotation.y += (-a - seat.rotation.y) * k;
          if (chatting) {
            const rjTurn = ud.talkT > 0 || Math.floor(t / 2.6) % 2 === 0;
            animateChat(ud, rjTurn, t);
            animateChat(ud.chatWith.userData, !rjTurn, t + 1.3);
          } else {
            restPose(ud, ud.talkT > 0, t);
            restPose(ud.chatWith.userData, false, t + 2);
          }
        } else {
          ud.body.position.y = Math.sin(t * 2 + st.c) * 0.015 + (talking ? Math.abs(Math.sin(t * 14)) * 0.04 : 0);
          ud.head.rotation.y = Math.sin(t * 0.7 + st.r) * 0.3;
          ud.armR.rotation.x = talking ? -0.6 + Math.sin(t * 9) * 0.5 : 0;
        }
        if (st.fire) ud.body.rotation.z = Math.sin(t * 20) * 0.15;
        else ud.body.rotation.z = 0;
      }
      if (st.key === 'S') {
        st.model.userData.leds.forEach((l, i) => {
          const on = Math.sin(t * (3 + (i % 5)) + i * 1.7) > 0;
          l.material.color.setHex(st.fire ? (on ? 0xff2200 : 0x330000) : on ? 0x33ff66 : 0x114422);
        });
      }
      if (st.fireFx) animateFire(st.fireFx, t);
      if (st.item) st.item.inner.userData.icon.position.y = 0.42 + Math.sin(t * 3 + st.c) * 0.03;
    }
    // camera: gentle follow + shake
    const cam = this.camera;
    // wide lens + close near plane in first person, long lens for the menu flyover
    const fp = this.state !== 'menu';
    const ease = (k) => k * k * (3 - 2 * k);
    const u = this.state === 'intro' ? ease(Math.min(1, this.introT / INTRO_TIME)) : 1;
    // the intro starts on a longer lens and widens out as it lands in first person
    const fov = !fp ? 36 : this.state === 'intro' ? 36 + 36 * u : 72;
    const near = fp ? 0.05 : 0.5;
    if (cam.fov !== fov || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    // on the menu the frame is shifted so the building sits to the right of the
    // menu card; it eases back to centre as the camera glides into the lift
    const shift = this.state === 'menu' ? 0.2 : this.state === 'intro' ? 0.2 * (1 - u) : 0;
    if (shift > 0.001) {
      const w = window.innerWidth, h = window.innerHeight;
      cam.setViewOffset(w, h, -shift * w, 0, w, h);
    } else if (cam.view?.enabled) cam.clearViewOffset();
    if (this.state === 'menu' && cam.isCamera) {
      // main menu: hovering high over Kent St, looking down on the office floor
      // with the Westpac logo still in view below it, panning slowly left and right
      const a = Math.sin(t * 0.1);
      cam.position.set(a * 8, 24, 30);
      cam.lookAt(a * 2, -2.5, 0.5);
      return;
    }
    if (this.state === 'intro' && this.intro && this.introT < INTRO_TIME) {
      const p = this.player.position, eyeY = p.y + EYE_HEIGHT;
      const { points: P } = this.intro.pos, { points: A } = this.intro.at;
      P[1].set(p.x, eyeY + 0.4, p.z + 4.5); // just outside the shaft, level with the car
      P[2].set(p.x, eyeY, p.z);
      A[1].set(p.x, eyeY, p.z - 1);
      A[2].set(p.x, eyeY, p.z - 1);           // = first-person view at yaw PI, pitch 0
      cam.position.copy(this.intro.pos.getPoint(u));
      cam.lookAt(this.intro.at.getPoint(u));
      // hide the body as the camera reaches the player's head
      this.showBody(Math.hypot(cam.position.x - p.x, cam.position.y - p.y - EYE_HEIGHT, cam.position.z - p.z) > 1.6);
      return;
    }
    // first person: eyes on the player's head, a little step bob
    const p = this.player.position;
    const bob = Math.abs(Math.sin(this.walkT)) * 0.05 * this.wobble;
    cam.position.set(p.x, p.y + EYE_HEIGHT + bob, p.z);
    cam.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    if (this.shake > 0) {
      this.shake -= dt;
      cam.rotation.x += (Math.random() - 0.5) * this.shake * 0.08;
      cam.rotation.y += (Math.random() - 0.5) * this.shake * 0.08;
    }
  }
}

