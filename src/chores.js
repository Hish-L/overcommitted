// Chores: small interruptions (like a fire, but gentler) fixed by walking up
// and holding the work key. Thirsty plants get watered, a pile of confidential
// papers gets fed through the shredder. This file owns their state + animation;
// game.js decides when they start and routes the work key here.
import * as THREE from 'three';
import { box, mat, emojiSprite } from './models.js';

export const CHORES = {
  water: { emoji: '💧', time: 1.0, verb: 'water the plants', call: 'Thirsty plants!', done: '🌿 Much better!', color: 0x55aaff },
  shred: { emoji: '📄', time: 2.6, verb: 'shred the papers', call: 'Papers to shred!', done: '✂️ Shredded. Nothing to see here.', color: 0xffe08a },
};

const GRAVITY = 6;
const SHEETS = 8;
const DRY = new THREE.Color(0xa58c4c);
const rnd = (a, b) => a + Math.random() * (b - a);
const v = new THREE.Vector3(), v2 = new THREE.Vector3();

// a small recycled pool of falling bits (water drops, paper strips)
class Bits {
  constructor(scene, geo, material, n) {
    this.next = 0;
    this.items = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(geo, material);
      m.visible = false;
      scene.add(m);
      return { m, vel: new THREE.Vector3(), life: 0 };
    });
  }
  emit(pos, vel, life) {
    const b = this.items[this.next++ % this.items.length];
    b.m.position.copy(pos);
    b.m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    b.vel.copy(vel);
    b.life = life;
    b.m.visible = true;
  }
  update(dt) {
    for (const b of this.items) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.m.position.y > 0.02) {
        b.vel.y -= GRAVITY * dt;
        b.m.position.addScaledVector(b.vel, dt);
        b.m.rotation.x += dt * 9;
        b.m.rotation.z += dt * 6;
        if (b.m.position.y <= 0.02) { b.m.position.y = 0.02; b.m.rotation.set(0, b.m.rotation.y, 0); } // lies flat on the floor
      }
      b.m.scale.setScalar(Math.min(1, b.life * 8));
      b.m.visible = b.life > 0;
    }
  }
  clear() {
    for (const b of this.items) { b.life = 0; b.m.visible = false; }
  }
}

function makeWateringCan() {
  // held in front of the camera, spout pointing away (-z)
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.15, 14), mat(0x2f8f6b));
  g.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.24, 8), mat(0x2f8f6b));
  spout.position.set(0, 0.04, -0.16);
  spout.rotation.x = -1.05;
  g.add(spout);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.016, 0.035, 10), mat(0xd9dde2));
  rose.position.set(0, 0.105, -0.275);
  rose.rotation.x = -1.05;
  g.add(rose);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), mat(0x24705a));
  handle.position.set(0, 0.02, 0.085);
  handle.rotation.set(0, Math.PI / 2, -Math.PI / 2);
  g.add(handle);
  const tip = new THREE.Object3D();
  tip.position.copy(rose.position);
  g.add(tip);
  g.userData.tip = tip;
  g.visible = false;
  return g;
}

export class Chores {
  // viewScene: the overlay scene held items are drawn in (camera space)
  constructor(scene, camera, world, viewScene) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.list = []; // stations (or planters) with a pending st.chore
    this.drops = new Bits(scene, new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }), 40);
    this.strips = new Bits(scene, new THREE.BoxGeometry(0.014, 0.002, 0.11), mat(0xfdfdf6), 90);
    this.can = makeWateringCan();
    this.can.scale.setScalar(0.8);
    this.can.position.set(0.2, -0.16, -0.6); // low right, clear of the hint box, on screen even in portrait
    viewScene.add(this.can);
    this.pour = 0; // 0..1 how far the can is tipped
    this.shredder = world.stations.find((s) => s.key === 'R');
    // the paper pile sits on the shredder lid, in front of the slot
    this.stack = new THREE.Group();
    this.sheets = Array.from({ length: SHEETS }, (_, i) => {
      const s = box(0.3, 0.004, 0.2, 0xfdfdf6);
      s.userData = { y: 0.885 + i * 0.007, yaw: rnd(-0.25, 0.25) };
      this.stack.add(s);
      return s;
    });
    this.stack.visible = false;
    this.shredder?.model.add(this.stack);
  }

  // start a chore; false if there's nowhere left to put one
  start(kind) {
    let targets = [];
    if (kind === 'water') {
      const p = this.world.planters;
      if (p.length < 3 || p.some((s) => s.chore)) return false;
      const i = Math.floor(Math.random() * (p.length - 2));
      targets = p.slice(i, i + 3); // three in a row, so you water your way along
    } else if (this.shredder && !this.shredder.chore && !this.shredder.fire) targets = [this.shredder];
    for (const st of targets) {
      const tag = emojiSprite(CHORES[kind].emoji, 0.4);
      tag.position.set(st.x, kind === 'water' ? 1.95 : 1.55, st.z);
      this.scene.add(tag);
      st.chore = { kind, t: 0, age: 0, tag };
      this.list.push(st);
    }
    return targets.length > 0;
  }

  // hold-to-work on a chore; true once it's finished
  work(st, dt) {
    const c = st.chore;
    c.t += dt;
    if (c.t < CHORES[c.kind].time) return false;
    this.finish(st);
    if (c.kind === 'water') st.pop = 1;
    else for (let i = 0; i < 30; i++) this.emitStrip(st, 1.6);
    return true;
  }

  finish(st) {
    this.scene.remove(st.chore.tag);
    st.chore = null;
    this.list.splice(this.list.indexOf(st), 1);
  }

  emitStrip(st, power = 1) {
    v.set(st.x, 0.93, st.z);
    v2.set(rnd(-0.7, 0.7), rnd(1.4, 2.6), rnd(-0.7, 0.7)).multiplyScalar(power);
    this.strips.emit(v, v2, rnd(1.6, 2.6));
  }

  // per-frame animation; `active` is the chore station being worked right now (or null)
  update(dt, t, active) {
    const watering = active?.chore?.kind === 'water';
    const shredding = active?.chore?.kind === 'shred';

    // watering can tips in, pours an arc of drops onto both planter shelves, tips back
    this.pour += ((watering ? 1 : 0) - this.pour) * Math.min(1, dt * 10);
    this.can.visible = this.pour > 0.02;
    this.can.rotation.set(-0.75 * this.pour + Math.sin(t * 9) * 0.03, 0.45, 0);
    this.can.position.y = -0.16 - (1 - this.pour) * 0.3;
    if (watering && this.pour > 0.6) {
      // overlay (camera) space → world; the overlay camera has its own FOV, so rescale to land on the same pixel
      this.can.userData.tip.getWorldPosition(v);
      const k = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(55 / 2));
      this.camera.localToWorld(v.set(v.x * k, v.y * k, v.z));
      for (let i = 0; i < 2; i++) {
        const T = 0.32;
        active.model.getWorldPosition(v2);
        v2.x += rnd(-0.45, 0.45);
        v2.y = Math.random() < 0.5 ? 0.5 : 1.5;
        v2.sub(v).divideScalar(T);
        v2.y += 0.5 * GRAVITY * T;
        this.drops.emit(v, v2, T);
      }
    }

    // plants: leaves brown and droop as they dry out, green up and bounce when watered
    for (const st of this.world.planters) {
      const want = st.chore ? Math.max(0, 1 - st.chore.t / CHORES.water.time) : 0;
      st.dry = (st.dry ?? 0) + (want - (st.dry ?? 0)) * Math.min(1, dt * 3);
      st.pop = Math.max(0, (st.pop ?? 0) - dt * 2);
      const d = st.dry, bounce = 1 + Math.sin(st.pop * Math.PI) * 0.35;
      st.model.userData.leaves.forEach((leaf, i) => {
        leaf.material.color.copy(leaf.userData.green).lerp(DRY, d);
        const wiggle = watering && active === st ? Math.sin(t * 22 + i) * 0.08 : 0;
        leaf.scale.set((1 - 0.2 * d) * bounce, (1 - 0.55 * d) * bounce + wiggle, (1 - 0.2 * d) * bounce);
      });
    }

    // papers: the pile drops in sheet by sheet, then each sheet stands up and feeds into the slot
    const sc = this.shredder?.chore;
    this.stack.visible = !!sc;
    if (sc) {
      sc.age += dt;
      const p = (sc.t / CHORES.shred.time) * SHEETS, gone = Math.floor(p), u = p - gone;
      this.sheets.forEach((s, i) => {
        const order = SHEETS - 1 - i; // top of the pile goes first
        s.visible = order >= gone && sc.age > i * 0.07;
        const drop = Math.max(0, 1 - (sc.age - i * 0.07) * 5) * 0.6;
        s.position.set(0, s.userData.y + drop, 0.14);
        s.rotation.set(0, s.userData.yaw, 0);
        if (order !== gone || sc.t <= 0) return;
        const a = Math.min(1, u * 2), b = Math.max(0, u * 2 - 1);
        s.position.set(0, THREE.MathUtils.lerp(s.userData.y, 1.0, a) - b * 0.22, 0.14 * (1 - a));
        s.rotation.set((a * Math.PI) / 2, s.userData.yaw * (1 - a), 0);
      });
      this.shredder.model.position.x = shredding ? Math.sin(t * 70) * 0.006 : 0; // rattle
      if (shredding && Math.random() < dt * 45) this.emitStrip(this.shredder);
    } else if (this.shredder) this.shredder.model.position.x = 0;

    for (const st of this.list) st.chore.tag.position.y += Math.sin(t * 4) * 0.002;
    this.drops.update(dt);
    this.strips.update(dt);
  }

  reset() {
    while (this.list.length) this.finish(this.list[0]);
    for (const st of this.world.planters) st.dry = st.pop = 0;
    this.drops.clear();
    this.strips.clear();
  }
}
