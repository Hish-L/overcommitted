// Hot-desking: from 9am, office workers come in through the glass door, walk to a random
// free dev workstation and sit there for the rest of the game, until only a
// handful of desks are left for the player.
import * as THREE from 'three';
import { TUNING } from './data.js';
import { makePerson, seatPerson } from './models.js';

const SHIRTS = [0x4a6fa5, 0x8899aa, 0xe8e8e8, 0x6b8e6b, 0xb0855a, 0x7a5c99, 0xc9c9c9, 0x2f4f6f, 0xd98c8c, 0x5fa3a3];
const LINES = [
  'Hot desk secured.',
  'I booked this one in the app. Probably.',
  'Ooh, a window seat.',
  'Camera off, on mute, all day.',
  'Is anyone sitting here? Great.',
  'Just here for the free coffee.',
  'I have back-to-backs until 5.',
];
const WALK_SPEED = 2.4;
const pick = (a) => a[(Math.random() * a.length) | 0];
const rand = (a, b) => a + Math.random() * (b - a);

export class HotDesk {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.bots = [];
  }

  reset() {
    for (const b of this.bots) this.game.scene.remove(b.mesh);
    this.bots = [];
    for (const st of this.world.stations) {
      if (st.kind !== 'workstation') continue;
      if (st.chairHome) {
        const chair = st.model.userData.chair;
        chair.position.copy(st.chairHome.pos);
        chair.rotation.y = st.chairHome.rot;
      }
      st.takenBy = st.reservedBy = null;
      st.bump = null;
    }
    this.started = false;
    this.arrivals = 0;
    this.nextIn = 0;
    this.keepFree = TUNING.hotDeskKeepFree[(Math.random() * TUNING.hotDeskKeepFree.length) | 0];
    this.doorOpen = 0;
    this.doorHold = 0;
  }

  freeDesks() {
    return this.world.stations.filter((s) => s.kind === 'workstation' && !s.takenBy && !s.reservedBy);
  }

  update(dt) {
    const g = this.game;
    if (!this.started && g.clockMinutes() >= TUNING.hotDeskStart) {
      this.started = true;
      g.ui.banner('☕ 9:00 AM', 'The hot-deskers have arrived. Grab a workstation while you still can.', 'warn');
    }
    if (this.started && this.freeDesks().length > this.keepFree) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) {
        const spawned = this.spawn();
        this.arrivals += spawned ? 1 : 0;
        const rush = this.arrivals < TUNING.hotDeskRush;
        this.nextIn = spawned ? (rush ? rand(1.2, 2) : rand(...TUNING.hotDeskEvery)) : 3;
      }
    }
    for (const b of [...this.bots]) this.updateBot(b, dt);
    this.animateDoors(dt);
  }

  // ---------------------------------------------------------------------------
  // Grid reasoning: a narrow aisle tile with seated people on both sides is
  // blocked, so seating someone must never cut off anything the player needs.
  // ---------------------------------------------------------------------------
  occupiedFacing(c, r, towardC, extra) {
    const st = this.world.cell(c, r)?.station;
    if (!st) return false;
    if (!(st.bump || st === extra)) return false;
    return st.c + st.dir[0] === towardC && st.dir[1] === 0;
  }

  standable(c, r, extra) {
    if (this.world.cell(c, r)?.solid) return false; // floor tiles are null in the grid
    return !(this.occupiedFacing(c - 1, r, c, extra) && this.occupiedFacing(c + 1, r, c, extra));
  }

  reachable(from, extra) {
    const key = (c, r) => `${c},${r}`;
    const seen = new Set();
    if (!this.standable(from.c, from.r, extra)) return seen;
    const queue = [from];
    seen.add(key(from.c, from.r));
    while (queue.length) {
      const { c, r } = queue.shift();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { c: c + dc, r: r + dr };
        const k = key(n.c, n.r);
        if (seen.has(k) || !this.standable(n.c, n.r, extra)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
    return seen;
  }

  // Would seating someone at `desk` keep every station, every other free desk
  // and the player reachable from the lift?
  safeToTake(desk) {
    const seen = this.reachable(this.world.lift.tile, desk);
    for (const st of this.world.stations) {
      if (st === desk || st.takenBy) continue;
      if (!seen.has(`${st.c + st.dir[0]},${st.r + st.dir[1]}`)) return false;
    }
    const p = this.game.player.position;
    const pt = this.world.tileAt(p.x, p.z);
    return seen.has(`${pt.c},${pt.r}`);
  }

  usable(desk) {
    const g = this.game;
    return !desk.takenBy && !desk.item && !desk.fire && g.target !== desk;
  }

  chooseDesk(bot) {
    const options = this.freeDesks().filter((d) => this.usable(d) && this.safeToTake(d));
    for (const d of options.sort(() => Math.random() - 0.5)) {
      const path = this.path(bot.tile, { c: d.c + d.dir[0], r: d.r + d.dir[1] });
      if (path) return { desk: d, path };
    }
    return null;
  }

  path(from, to) {
    const key = (c, r) => `${c},${r}`;
    const prev = new Map([[key(from.c, from.r), null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.c === to.c && cur.r === to.r) {
        const out = [];
        for (let k = key(cur.c, cur.r); k; k = prev.get(k)) {
          const [c, r] = k.split(',').map(Number);
          out.unshift({ c, r });
        }
        return out;
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { c: cur.c + dc, r: cur.r + dr };
        const k = key(n.c, n.r);
        if (prev.has(k) || !this.standable(n.c, n.r)) continue;
        prev.set(k, key(cur.c, cur.r));
        queue.push(n);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Bots
  // ---------------------------------------------------------------------------
  spawn() {
    const lift = this.world.lift;
    const bot = { tile: { ...lift.tile }, state: 'walk', walkT: Math.random() * 6 };
    const choice = this.chooseDesk(bot);
    if (!choice) return false;
    bot.mesh = makePerson({ shirt: pick(SHIRTS), tie: Math.random() < 0.3 });
    bot.mesh.position.set(lift.x, 0, lift.z);
    bot.mesh.rotation.y = 0;
    this.game.scene.add(bot.mesh);
    this.assign(bot, choice);
    this.bots.push(bot);
    this.doorHold = 1.4;
    return true;
  }

  assign(bot, { desk, path }) {
    bot.desk = desk;
    desk.reservedBy = bot;
    bot.waypoints = path.map(({ c, r }) => this.world.toWorld(c, r));
    bot.state = 'walk';
  }

  updateBot(bot, dt) {
    const m = bot.mesh;
    if (bot.state === 'walk' || bot.state === 'leave') {
      const wp = bot.waypoints[0];
      if (!wp) return this.arrive(bot);
      const dx = wp.x - m.position.x, dz = wp.z - m.position.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (d <= step) {
        m.position.x = wp.x;
        m.position.z = wp.z;
        bot.tile = this.world.tileAt(wp.x, wp.z);
        bot.waypoints.shift();
      } else {
        m.position.x += (dx / d) * step;
        m.position.z += (dz / d) * step;
        turnToward(m, Math.atan2(dx, dz), dt);
      }
      bot.walkT += dt * 11;
      const ud = m.userData;
      const s = Math.sin(bot.walkT) * 0.6;
      ud.legL.rotation.x = s;
      ud.legR.rotation.x = -s;
      ud.armL.rotation.x = -s * 0.7;
      ud.armR.rotation.x = s * 0.7;
      ud.body.position.y = Math.abs(Math.sin(bot.walkT)) * 0.04;
    } else if (bot.state === 'sitting') {
      bot.t += dt / 0.45;
      const k = Math.min(1, bot.t);
      m.position.lerpVectors(bot.from, bot.seat, k);
      turnToward(m, bot.seatRot, dt * 2);
      if (k >= 1) this.seat(bot);
    }
  }

  arrive(bot) {
    if (bot.state === 'leave') {
      this.game.scene.remove(bot.mesh);
      this.bots.splice(this.bots.indexOf(bot), 1);
      return;
    }
    const desk = bot.desk;
    if (!this.usable(desk) || !this.safeToTake(desk)) {
      // someone got here first (or the player is using it); try another desk
      desk.reservedBy = null;
      const choice = this.chooseDesk(bot);
      if (choice) return this.assign(bot, choice);
      const home = this.path(bot.tile, this.world.lift.tile);
      bot.waypoints = (home ?? []).map(({ c, r }) => this.world.toWorld(c, r));
      bot.waypoints.push({ x: this.world.lift.x, z: this.world.lift.z });
      bot.state = 'leave';
      this.doorHold = 1.4;
      return;
    }
    // claim it now so nobody else (or the player) grabs it mid-sit
    desk.takenBy = bot;
    desk.reservedBy = null;
    const g = desk.group;
    const local = new THREE.Vector3(0.14 * desk.model.scale.x, 0, 0.63 * desk.model.scale.x);
    bot.seat = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    bot.seat.y = 0.15;
    bot.seatRot = g.rotation.y + Math.PI;
    bot.from = bot.mesh.position.clone();
    bot.t = 0;
    bot.state = 'sitting';
    desk.bump = { x: bot.seat.x, z: bot.seat.z, r: 0.18 };
  }

  seat(bot) {
    const desk = bot.desk;
    const chair = desk.model.userData.chair;
    desk.chairHome ??= { pos: chair.position.clone(), rot: chair.rotation.y };
    chair.position.set(0.14, 0, 0.66);
    chair.rotation.y = 0;
    const ud = bot.mesh.userData;
    ud.armL.rotation.x = ud.armR.rotation.x = 0;
    ud.body.position.y = 0;
    seatPerson(bot.mesh);
    bot.mesh.position.set(bot.seat.x, 0.15, bot.seat.z);
    bot.mesh.rotation.y = bot.seatRot;
    bot.state = 'seated';
    if (Math.random() < 0.5) this.game.ui.bubble(bot.mesh, pick(LINES));
  }

  animateDoors(dt) {
    this.doorHold -= dt;
    // automatic door: also opens when the player walks up to it
    const { lift } = this.world, p = this.game.player.position;
    const near = Math.hypot(p.x - lift.x, p.z - lift.z) < 1.5;
    const target = this.doorHold > 0 || near ? 1 : 0;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 6);
    for (const d of lift.doors) d.position.x = d.userData.x + this.doorOpen * d.userData.slide;
  }
}

function turnToward(m, target, dt) {
  let d = target - m.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.rotation.y += d * Math.min(1, dt * 12);
}
