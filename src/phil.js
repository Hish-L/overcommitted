// Phil: wanders the floor at random, flailing, hurling "CIO OVERRIDE" tickets into
// the air. Pure set dressing: no collisions, no effect on the rules.
import * as THREE from 'three';
import { makePerson, labelSprite } from './models.js';

const SPEED = 1.6; // a stroll, not a sprint
const LINES = [
  'CIO OVERRIDE!',
  'This is now priority zero!',
  'Drop everything! Pick it back up! Drop it again!',
  "I've escalated it to myself!",
  'The board wants it YESTERDAY!',
  'Override the override!',
  'Who approved this? Me. Override!',
  'Everything is P1 now!',
  'I just had another idea!',
];
const pick = (a) => a[(Math.random() * a.length) | 0];
const rand = (a, b) => a + Math.random() * (b - a);

// one shared ticket: white card with a red "CIO OVERRIDE" stamp
let ticketMat = null;
function ticketMaterial() {
  if (ticketMat) return ticketMat;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = '#fffdf5';
  x.fillRect(0, 0, 128, 80);
  x.strokeStyle = x.fillStyle = '#d0201a';
  x.lineWidth = 5;
  x.strokeRect(8, 12, 112, 56);
  x.font = 'bold 22px Helvetica, Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('CIO', 64, 36);
  x.fillText('OVERRIDE', 64, 60, 104);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  ticketMat = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, transparent: true });
  return ticketMat;
}
const TICKET_GEO = new THREE.PlaneGeometry(0.32, 0.2);

export class Phil {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.mesh = makePerson({ shirt: 0x1f4fa8, pants: 0x111111, tie: true, hair: 0x888888 }); // blue jacket, black pants
    const tag = labelSprite('Phil', 0.3, '#c0392b');
    tag.position.y = 1.45; // clear of his head, under the speech bubble
    this.mesh.add(tag);
    this.tickets = [];
    this.floor = [];
    for (let r = 0; r < this.world.H; r++) for (let c = 0; c < this.world.W; c++) if (!this.world.grid[r][c]) this.floor.push({ c, r });
  }

  reset() {
    for (const t of this.tickets) { this.game.scene.remove(t.mesh); t.mesh.material.dispose(); }
    this.tickets = [];
    const start = pick(this.floor);
    const p = this.world.toWorld(start.c, start.r);
    this.mesh.position.set(p.x, 0, p.z);
    this.tile = start;
    this.waypoints = [];
    this.walkT = 0;
    this.throwIn = 1;
    this.sayIn = rand(2, 5);
    this.spinT = 0;
    this.game.scene.add(this.mesh);
  }

  update(dt) {
    const m = this.mesh, ud = m.userData;
    if (!this.waypoints.length) {
      // new random destination somewhere reachable
      for (let i = 0; i < 10 && !this.waypoints.length; i++) {
        const path = this.game.hotdesk.path(this.tile, pick(this.floor));
        if (path) this.waypoints = path.slice(1).map(({ c, r }) => this.world.toWorld(c, r));
      }
    }
    const wp = this.waypoints[0];
    if (wp && this.spinT <= 0) {
      const dx = wp.x - m.position.x, dz = wp.z - m.position.z, d = Math.hypot(dx, dz), step = SPEED * dt;
      if (d <= step) {
        m.position.x = wp.x;
        m.position.z = wp.z;
        this.tile = this.world.tileAt(wp.x, wp.z);
        this.waypoints.shift();
      } else {
        m.position.x += (dx / d) * step;
        m.position.z += (dz / d) * step;
        let a = Math.atan2(dx, dz) - m.rotation.y;
        m.rotation.y += Math.atan2(Math.sin(a), Math.cos(a)) * Math.min(1, dt * 12);
      }
    }
    // crazy: legs pumping, arms windmilling over his head, the odd spin-and-hop
    this.walkT += dt * 8;
    const s = Math.sin(this.walkT);
    ud.legL.rotation.x = s * 0.8;
    ud.legR.rotation.x = -s * 0.8;
    ud.armL.rotation.set(Math.sin(this.walkT * 1.3) * 2.6, 0, -0.9 - Math.sin(this.walkT * 0.9) * 0.6);
    ud.armR.rotation.set(Math.cos(this.walkT * 1.1) * 2.6, 0, 0.9 + Math.cos(this.walkT * 0.8) * 0.6);
    ud.body.position.y = Math.abs(s) * 0.08;
    ud.body.rotation.z = Math.sin(this.walkT * 0.5) * 0.15;
    if (this.spinT > 0) {
      this.spinT -= dt;
      m.rotation.y += dt * 14;
      m.position.y = Math.sin((1 - this.spinT / 0.6) * Math.PI) * 0.35;
    } else {
      m.position.y = 0;
      if (Math.random() < dt * 0.15) this.spinT = 0.6;
    }

    this.throwIn -= dt;
    if (this.throwIn <= 0) {
      this.throwIn = rand(0.25, 0.7);
      this.throwTicket();
    }
    this.sayIn -= dt;
    if (this.sayIn <= 0) {
      this.sayIn = rand(4, 8);
      this.game.ui.bubble(m, pick(LINES));
    }

    for (const t of [...this.tickets]) {
      t.age += dt;
      if (t.mesh.position.y > 0.02) {
        t.v.y -= 4 * dt; // light paper: slow fall
        t.v.multiplyScalar(1 - dt * 1.2);
        t.mesh.position.addScaledVector(t.v, dt);
        t.mesh.rotation.x += t.spin.x * dt;
        t.mesh.rotation.y += t.spin.y * dt;
        if (t.mesh.position.y <= 0.02) {
          t.mesh.position.y = 0.02;
          t.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2); // flat on the carpet
        }
      }
      if (t.age > 6) t.mesh.material.opacity = Math.max(0, 1 - (t.age - 6));
      if (t.age > 7) {
        this.game.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.tickets.splice(this.tickets.indexOf(t), 1);
      }
    }
  }

  throwTicket() {
    // ponytail: one material clone per ticket for its own fade; ~20 alive at once
    const mesh = new THREE.Mesh(TICKET_GEO, ticketMaterial().clone());
    mesh.position.copy(this.mesh.position).y += 1.5;
    this.game.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    this.tickets.push({
      mesh, age: 0,
      v: new THREE.Vector3(Math.cos(a) * rand(1, 2.5), rand(3, 5), Math.sin(a) * rand(1, 2.5)),
      spin: new THREE.Vector2(rand(-8, 8), rand(-8, 8)),
    });
  }
}
