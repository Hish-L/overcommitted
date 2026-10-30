// Low-poly mesh builders for the office. Everything is built from primitives,
// no external assets needed.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  }
  return matCache.get(key);
}

export function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, color, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Canvas textures (emoji + labels)
// ---------------------------------------------------------------------------
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const emojiTex = new Map();
export function emojiTexture(emoji) {
  if (!emojiTex.has(emoji)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `92px ${EMOJI_FONT}`;
    g.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTex.set(emoji, t);
  }
  return emojiTex.get(emoji);
}

export function emojiSprite(emoji, size = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

export function labelTexture(text, bg = '#1d2533', fg = '#ffffff') {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `bold 40px "Segoe UI", Helvetica, Arial, ${EMOJI_FONT}`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 64;
  g.font = font;
  g.fillStyle = bg;
  roundRect(g, 2, 2, w - 4, 60, 18);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData = { aspect: w / 64 };
  return t;
}

export function labelSprite(text, height = 0.32, bg, fg) {
  const tex = labelTexture(text, bg, fg);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(height * tex.userData.aspect, height, 1);
  s.renderOrder = 10;
  s.userData.height = height;
  return s;
}

export function setLabel(sprite, text, bg, fg) {
  const old = sprite.material.map;
  const tex = labelTexture(text, bg, fg);
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  sprite.scale.set(sprite.userData.height * tex.userData.aspect, sprite.userData.height, 1);
  old.dispose();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR = [0x2b1b0e, 0x6b4423, 0xe6c35c, 0x111111, 0xa0522d, 0x888888];

export function makePerson({ shirt = 0x3366cc, pants = 0x2a2f3a, skin, hair, tie = false, bald = false, scale = 1 } = {}) {
  skin ??= SKIN[(Math.random() * SKIN.length) | 0];
  hair ??= HAIR[(Math.random() * HAIR.length) | 0];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = cyl(0.07, 0.07, 0.36, pants);
  const legR = legL.clone();
  legL.position.set(-0.09, 0.18, 0);
  legR.position.set(0.09, 0.18, 0);
  root.add(legL, legR);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.26, 4, 12), mat(shirt));
  torso.position.y = 0.6;
  torso.castShadow = true;
  body.add(torso);

  if (tie) {
    const t = box(0.06, 0.24, 0.02, 0xaa2222);
    t.position.set(0, 0.64, 0.2);
    body.add(t);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mat(skin));
  head.position.y = 1.0;
  head.castShadow = true;
  body.add(head);

  let hairM = null;
  if (!bald) {
    hairM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(hair));
    hairM.position.y = 1.03;
    hairM.rotation.x = -0.25;
    body.add(hairM);
  }

  const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeo, mat(0x111111));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.065, 1.02, 0.17);
  eyeR.position.set(0.065, 1.02, 0.17);
  body.add(eyeL, eyeR);

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8), mat(shirt));
  const armR = armL.clone();
  armL.position.set(-0.25, 0.62, 0);
  armR.position.set(0.25, 0.62, 0);
  body.add(armL, armR);

  root.scale.setScalar(scale);
  root.userData = { body, legL, legR, armL, armR, head, eyes: [eyeL, eyeR], hair: hairM };
  return root;
}

const GOATEE_SKIN = 0xd9a383;

// Bald with a goatee (moustache + chin beard). Eyes move onto the head so the
// face details all turn together. Head-local coords: head centre at origin.
function addGoatee(p) {
  const { head, eyes } = p.userData;
  for (const e of eyes) head.attach(e);
  const beard = 0x2b1b0e;
  const stache = box(0.11, 0.02, 0.03, beard);
  stache.position.set(0, -0.06, 0.175);
  const chin = box(0.07, 0.08, 0.04, beard);
  chin.position.set(0, -0.125, 0.14);
  chin.rotation.x = -0.4;
  for (const s of [-1, 1]) {
    const side = box(0.015, 0.06, 0.02, beard);
    side.position.set(s * 0.05, -0.095, 0.16);
    head.add(side);
  }
  head.add(stache, chin);
  return p;
}

// The exec in the boardroom: bald, goatee, white shirt, black pants and tie.
export function makeExec() {
  return addGoatee(makePerson({ shirt: 0xf7f7f5, pants: 0x151515, tie: true, skin: GOATEE_SKIN, bald: true, scale: 1.35 }));
}

// The regular by the lift: bald, goatee, glasses, white business shirt,
// jeans and black/red Jordans.
export function makeGoateeGuy() {
  const p = addGoatee(makePerson({ shirt: 0xf7f7f5, pants: 0x3d5f8c, skin: GOATEE_SKIN, bald: true }));
  const { body, head, legL, legR } = p.userData;

  // shirt collar + buttons
  for (const s of [-1, 1]) {
    const c = box(0.09, 0.05, 0.02, 0xffffff);
    c.position.set(s * 0.05, 0.84, 0.16);
    c.rotation.z = s * 0.5;
    body.add(c);
  }
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), mat(0xd8d8d4));
    b.position.set(0, 0.76 - i * 0.09, 0.2);
    body.add(b);
  }

  // glasses
  const frame = mat(0x111111);
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 16), frame);
    lens.position.set(s * 0.065, 0.02, 0.18);
    const arm = box(0.008, 0.008, 0.17, 0x111111);
    arm.position.set(s * 0.115, 0.03, 0.09);
    head.add(lens, arm);
  }
  const bridge = box(0.04, 0.008, 0.008, 0x111111);
  bridge.position.set(0, 0.03, 0.185);
  head.add(bridge);

  // black/red Jordans on the end of each leg (leg-local, so they follow seatPerson)
  for (const leg of [legL, legR]) {
    const upper = box(0.13, 0.09, 0.22, 0x151515);
    upper.position.set(0, -0.15, 0.04);
    const sole = box(0.135, 0.025, 0.225, 0xc8102e);
    sole.position.set(0, -0.2, 0.04);
    const toe = box(0.135, 0.04, 0.06, 0xc8102e);
    toe.position.set(0, -0.17, 0.13);
    const heel = box(0.135, 0.06, 0.04, 0xc8102e);
    heel.position.set(0, -0.14, -0.06);
    leg.add(upper, sole, toe, heel);
  }
  return p;
}

// Long hair down the back and over both ears. Moves the hair cap and eyes onto
// the head so everything turns and bobs together with it.
function addLongHair(p, hair) {
  const { head } = p.userData;
  for (const o of [p.userData.hair, ...p.userData.eyes]) if (o) head.attach(o);
  const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 12), mat(hair));
  fall.scale.set(1.25, 1, 0.55);
  fall.position.set(0, -0.14, -0.1);
  head.add(fall);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 10), mat(hair));
    side.scale.set(0.7, 1, 1.4);
    side.position.set(sx * 0.165, -0.08, -0.01);
    side.rotation.z = sx * 0.08;
    head.add(side);
  }
  return p;
}

// A person in a business suit: jacket in `suit`, white shirt V-neck with
// lapels. Men get matching trousers, a tie and black shoes; women get a
// pencil skirt, bare legs, black heels and long hair.
export function makeSuitPerson({ suit = 0x2b3344, tie = 0xaa2222, skin = 0xf1c27d, hair, woman = false, scale = 1 } = {}) {
  const p = makePerson({ shirt: suit, pants: woman ? skin : suit, skin, hair, scale });
  const { body, legL, legR } = p.userData;
  const shirt = box(0.13, 0.2, 0.02, 0xf4f4f2);
  shirt.position.set(0, 0.76, 0.19);
  body.add(shirt);
  if (!woman) {
    const t = box(0.05, 0.22, 0.02, tie);
    t.position.set(0, 0.7, 0.203);
    body.add(t);
  }
  for (const sx of [-1, 1]) {
    const lapel = box(0.05, 0.24, 0.02, new THREE.Color(suit).multiplyScalar(0.7).getHex());
    lapel.position.set(sx * 0.08, 0.74, 0.196);
    lapel.rotation.z = sx * 0.3;
    body.add(lapel);
  }
  if (woman) {
    addLongHair(p, hair);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.24, 14), mat(suit));
    skirt.position.y = 0.32;
    skirt.castShadow = true;
    p.add(skirt);
  }
  for (const leg of [legL, legR]) {
    const shoe = woman ? box(0.09, 0.06, 0.16, 0x111111) : box(0.12, 0.07, 0.2, 0x111111);
    shoe.position.set(0, -0.16, 0.03);
    leg.add(shoe);
  }
  return p;
}

// Fold a person's arms across their chest: short upper arms at the sides and
// two forearms crossed in front, one over the other, hands tucked at the elbows.
export function crossArms(p) {
  const { body, armL, armR, head } = p.userData;
  for (const a of [armL, armR]) {
    a.scale.y = 0.55;
    a.position.y = 0.7;
  }
  const fore = new THREE.CapsuleGeometry(0.055, 0.34, 4, 8);
  for (const [y, z, tilt, hx] of [[0.6, 0.21, 0.08, 0.2], [0.655, 0.24, -0.08, -0.2]]) {
    const f = new THREE.Mesh(fore, armL.material);
    f.rotation.z = Math.PI / 2 + tilt;
    f.position.set(0, y, z);
    f.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), head.material);
    hand.position.set(hx, y + (hx > 0 ? 0.02 : -0.02), z + 0.02);
    body.add(f, hand);
  }
  return p;
}

// Patrizia, seated beside RJ in the boardroom: cream dress, long black hair.
// Returns her already in a chair, both facing +z.
export function makePatrizia() {
  const g = new THREE.Group();
  const chair = makeChair();
  chair.rotation.y = Math.PI; // backrest behind her
  g.add(chair);

  const dress = 0xf1e6cc, skin = 0xf3cfa8, hair = 0x111111;
  const p = seatPerson(makePerson({ shirt: dress, pants: skin, skin, hair }));
  const { body } = addLongHair(p, hair).userData;
  // dress over the lap, down to the knees
  const lap = box(0.32, 0.1, 0.3, dress);
  lap.position.set(0, 0.37, 0.13);
  p.add(lap);
  // small gold necklace
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20, Math.PI), mat(0xd4af37, { metalness: 0.8, roughness: 0.3 }));
  chain.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI);
  chain.position.set(0, 0.86, 0.07);
  body.add(chain);
  g.add(p);
  g.userData.person = p;
  return g;
}

// Hacker in a black hoodie (hood down) with white drawstrings.
export function makeHacker() {
  const p = makePerson({ shirt: 0x161618, pants: 0x1e1f24 });
  for (const s of [-1, 1]) {
    const cord = box(0.012, 0.14, 0.012, 0xeeeeee);
    cord.position.set(s * 0.04, 0.74, 0.2);
    p.userData.body.add(cord);
  }
  return p;
}

// One shared "digital rain" terminal texture for the hackers' monitors,
// redrawn a few times a second from animateWorld.
let matrix = null;
export function matrixScreenMaterial() {
  if (!matrix) {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    const size = 12;
    const drops = Array.from({ length: Math.ceil(c.width / size) }, () => Math.random() * -20);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // the curved screen is seen from inside its cylinder, so mirror u back
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;
    matrix = { c, g, size, drops, tex, last: 0, mat: new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }) };
  }
  return matrix.mat;
}

const MATRIX_CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789$#@%&<>/\\{}=+*';
export function tickMatrix(t) {
  if (!matrix || t - matrix.last < 0.06) return;
  matrix.last = t;
  const { c, g, size, drops, tex } = matrix;
  g.fillStyle = 'rgba(0, 0, 0, 0.14)';
  g.fillRect(0, 0, c.width, c.height);
  g.font = `bold ${size}px monospace`;
  drops.forEach((y, i) => {
    const ch = MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0];
    g.fillStyle = Math.random() < 0.1 ? '#d8ffd8' : '#22ff55';
    g.fillText(ch, i * size, y * size);
    drops[i] = y * size > c.height && Math.random() > 0.95 ? 0 : y + 1;
  });
  tex.needsUpdate = true;
}

// Sit a person (from makePerson) down: drop the hips onto a chair seat and
// swing the legs forward. Animations only touch the upper body, so this sticks.
export function seatPerson(p) {
  const { legL, legR } = p.userData;
  p.position.y = 0.13;
  for (const leg of [legL, legR]) {
    leg.rotation.x = -Math.PI / 2;
    leg.position.set(leg.position.x, 0.36, 0.17);
  }
  return p;
}

export function makePlayer() {
  // standard corporate: white shirt, red tie, charcoal suit trousers, black shoes
  const p = makePerson({ shirt: 0xf4f4f2, pants: 0x3a4556, skin: 0xf1c27d, hair: 0x2b1b0e, scale: 1.15 });
  const { body, legL, legR } = p.userData;
  const tie = box(0.05, 0.24, 0.015, 0xb3202a);
  tie.position.set(0, 0.67, 0.21);
  tie.rotation.x = -0.12;
  body.add(tie);
  const knot = box(0.06, 0.045, 0.025, 0x8f1a22);
  knot.position.set(0, 0.8, 0.195);
  knot.rotation.x = -0.35;
  body.add(knot);
  for (const leg of [legL, legR]) {
    const shoe = box(0.1, 0.05, 0.17, 0x111111);
    shoe.position.set(0, -0.17, 0.03);
    leg.add(shoe);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Furniture & stations
// ---------------------------------------------------------------------------
export function makeDesk(top = 0xc9a77c) {
  const g = new THREE.Group();
  const t = box(0.96, 0.08, 0.96, top);
  t.position.y = 0.82;
  g.add(t);
  const front = box(0.92, 0.72, 0.9, 0xe8e4dc);
  front.position.y = 0.4;
  g.add(front);
  return g;
}

let kbTex = null;
function keyboardTexture() {
  if (kbTex) return kbTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 84;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1c1e';
  g.fillRect(0, 0, 256, 84);
  g.fillStyle = '#4a4d55';
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 15; k++) g.fillRect(6 + k * 16.5, 6 + r * 15, 13, 11);
  }
  g.fillRect(60, 6 + 5 * 15 - 15, 120, 11); // space bar row
  kbTex = new THREE.CanvasTexture(c);
  kbTex.colorSpace = THREE.SRGBColorSpace;
  return kbTex;
}

// Office chair: black seat + back on a gas lift with a star base.
export function makeChair() {
  const g = new THREE.Group();
  const black = 0x1a1a1c;
  const base = cyl(0.22, 0.22, 0.04, black, 5);
  base.position.y = 0.06;
  g.add(base);
  const pole = cyl(0.03, 0.03, 0.34, 0x333336);
  pole.position.y = 0.25;
  g.add(pole);
  const seat = box(0.42, 0.07, 0.4, black);
  seat.position.y = 0.45;
  g.add(seat);
  const back = box(0.4, 0.42, 0.06, black);
  back.position.set(0, 0.72, 0.2);
  back.rotation.x = 0.08;
  g.add(back);
  return g;
}

// Cubicle desk: white top, black legs, light-grey partitions on the back and
// sides, black chair tucked in. +z is the open (aisle) side.
export function makeCubicleDesk(computer = false) {
  const g = new THREE.Group();
  const top = box(0.94, 0.05, 0.9, 0xf5f5f3);
  top.position.y = 0.8;
  g.add(top);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.38, 0.38]) {
      const leg = box(0.05, 0.78, 0.05, 0x111111);
      leg.position.set(x, 0.39, z);
      g.add(leg);
    }
  }
  const grey = 0xd3d5d8;
  const back = box(0.98, 1.2, 0.05, grey);
  back.position.set(0, 0.6, -0.47);
  g.add(back);
  for (const x of [-0.475, 0.475]) {
    const side = box(0.04, 1.0, 0.5, grey);
    side.position.set(x, 0.5, -0.21);
    g.add(side);
  }
  const trim = box(0.98, 0.03, 0.07, 0x9a9da2);
  trim.position.set(0, 1.21, -0.47);
  g.add(trim);

  const chair = makeChair();
  chair.position.set(0.05, 0, 0.36);
  chair.rotation.y = (Math.random() - 0.5) * 0.5;
  g.add(chair);
  g.userData.chair = chair;

  // curved ultra-wide monitor on every desk; dev workstations glow green, the
  // rest show a dim blue screensaver
  const R = 1.0, arc = 0.86 / R, MZ = -0.3;
  const curved = (r, h) => new THREE.CylinderGeometry(r, r, h, 24, 1, true, Math.PI - arc / 2, arc);
  const screen = new THREE.Mesh(curved(R, 0.28), new THREE.MeshBasicMaterial({ color: computer ? 0x0a3d2a : 0x14243d, side: THREE.DoubleSide }));
  screen.position.set(0, 1.1, MZ + R);
  g.add(screen);
  const casing = new THREE.Mesh(curved(R + 0.025, 0.31), mat(0x111111, { side: THREE.DoubleSide }));
  casing.position.set(0, 1.1, MZ + R);
  casing.castShadow = true;
  g.add(casing);
  const neck = box(0.05, 0.18, 0.04, 0x222222);
  neck.position.set(0, 0.92, MZ - 0.04);
  g.add(neck);
  const foot = box(0.26, 0.02, 0.14, 0x222222);
  foot.position.set(0, 0.835, MZ - 0.02);
  g.add(foot);

  // keyboard (with keys) + mouse on a pad, both wired back to the monitor
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.14), [
    mat(0x1c1c1e), mat(0x1c1c1e), new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.6 }),
    mat(0x1c1c1e), mat(0x1c1c1e), mat(0x1c1c1e),
  ]);
  kb.position.set(-0.05, 0.837, 0.02);
  kb.castShadow = true;
  g.add(kb);
  const pad = box(0.2, 0.006, 0.17, 0x2a2d33);
  pad.position.set(0.32, 0.828, 0.04);
  g.add(pad);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat(0x1c1c1e));
  mouse.scale.set(1, 0.55, 1.5);
  mouse.position.set(0.32, 0.842, 0.05);
  mouse.castShadow = true;
  g.add(mouse);
  const cable = (pts) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.006, 5), mat(0x0d0d0d)));
  };
  cable([[-0.05, 0.835, -0.05], [-0.08, 0.828, -0.14], [-0.02, 0.828, -0.24], [0, 0.84, MZ - 0.06]]);
  cable([[0.32, 0.836, -0.003], [0.3, 0.83, -0.1], [0.14, 0.828, -0.22], [0.03, 0.84, MZ - 0.06]]);
  g.userData.screen = screen;
  return g;
}

export function makeServerRack() {
  const g = new THREE.Group();
  const rack = box(0.84, 1.9, 0.8, 0x1b1e24, { metalness: 0.4, roughness: 0.4 });
  rack.position.y = 0.95;
  g.add(rack);
  const leds = [];
  for (let i = 0; i < 7; i++) {
    const u = box(0.7, 0.16, 0.02, 0x2a2f38);
    u.position.set(0, 0.35 + i * 0.22, 0.41);
    g.add(u);
    for (let j = 0; j < 3; j++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x33ff66 }));
      led.position.set(0.2 + j * 0.07, 0.35 + i * 0.22, 0.425);
      g.add(led);
      leds.push(led);
    }
  }
  // shelf in front where tickets are dropped
  const shelf = box(0.84, 0.06, 0.3, 0x555b66);
  shelf.position.set(0, 0.82, 0.5);
  g.add(shelf);
  g.userData.leds = leds;
  return g;
}

export function makeCoffeeMachine() {
  const g = makeDesk(0x5a4a3a);
  const m = box(0.42, 0.55, 0.38, 0x2b2b2b, { metalness: 0.5, roughness: 0.3 });
  m.position.set(0, 1.13, -0.15);
  g.add(m);
  const spout = box(0.12, 0.06, 0.12, 0x888888);
  spout.position.set(0, 1.0, 0.07);
  g.add(spout);
  const cup = cyl(0.06, 0.05, 0.11, 0xffffff);
  cup.position.set(0, 0.92, 0.1);
  g.add(cup);
  return g;
}

export function makeCabinet() {
  const g = new THREE.Group();
  const c = box(0.8, 1.2, 0.7, 0x7d8794, { metalness: 0.4 });
  c.position.y = 0.6;
  g.add(c);
  for (let i = 0; i < 3; i++) {
    const h = box(0.24, 0.04, 0.04, 0xcccccc);
    h.position.set(0, 0.3 + i * 0.36, 0.37);
    g.add(h);
  }
  const t = box(0.8, 0.05, 0.6, 0xc9a77c);
  t.position.set(0, 0.84, 0.55);
  g.add(t);
  return g;
}

export function makeShredder() {
  const g = new THREE.Group();
  const b = box(0.6, 0.8, 0.5, 0x333a44);
  b.position.y = 0.4;
  g.add(b);
  const top = box(0.62, 0.08, 0.52, 0x111111);
  top.position.y = 0.84;
  g.add(top);
  const slot = box(0.4, 0.02, 0.05, 0xff4444, { emissive: 0x661111 });
  slot.position.set(0, 0.89, 0);
  g.add(slot);
  return g;
}

// One 1-tile segment of a long oak ledge fixed to the window line: no legs,
// so a run of segments reads as one continuous slab.
export const OAK_DEPTH = 0.8;
export function makeOakTableSegment() {
  const g = new THREE.Group();
  const top = box(1.0, 0.07, OAK_DEPTH, 0xc9a77a, { roughness: 0.55 });
  top.position.y = 0.8;
  g.add(top);
  const apron = box(1.0, 0.1, 0.04, 0xa98a5e);
  apron.position.set(0, 0.72, OAK_DEPTH / 2 - 0.04);
  g.add(apron);
  return g;
}

// One 1-tile segment of a two-level planter: a low trough on the floor and a
// shelf trough stacked directly above it on a front upright, open at the back
// so the glass shows through. Same depth as the white wall so the two line up.
export const PLANTER_DEPTH = OAK_DEPTH * 0.8 * 0.5;
export function makePlanterSegment() {
  const g = new THREE.Group();
  const trough = 0xe2e0da;
  const greens = [0x3f9b3a, 0x57b947, 0x2f7d32, 0x6cc24a];
  const D = PLANTER_DEPTH, SHELF_Y = 1.3;
  const tiers = [
    { y: 0, h: 0.4 },
    { y: SHELF_Y, h: 0.18 },
  ];
  // one front upright per segment, so a run of segments reads as evenly spaced posts
  const post = box(0.05, SHELF_Y, 0.05, trough);
  post.position.set(-0.475, SHELF_Y / 2, D / 2 - 0.025);
  g.add(post);
  for (const t of tiers) {
    const b = box(1.0, t.h, D, trough);
    b.position.set(0, t.y + t.h / 2, 0);
    g.add(b);
    for (let i = 0; i < 5; i++) {
      const r = 0.1 + Math.random() * 0.07;
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(greens[(Math.random() * greens.length) | 0]));
      leaf.position.set(-0.4 + i * 0.2 + (Math.random() - 0.5) * 0.08, t.y + t.h + r * 0.6, (Math.random() - 0.5) * 0.06);
      leaf.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  return g;
}

export function makeMeetingTable() {
  const g = new THREE.Group();
  const t = box(1.0, 0.07, 0.9, 0x6b4a2f);
  t.position.y = 0.78;
  g.add(t);
  const leg = cyl(0.07, 0.1, 0.75, 0x333333);
  leg.position.y = 0.38;
  g.add(leg);
  const laptop = box(0.3, 0.02, 0.2, 0xaaaaaa);
  laptop.position.set(0.25, 0.83, 0.15);
  g.add(laptop);
  return g;
}

export function makeBoardroomWindow() {
  const g = new THREE.Group();
  const sill = box(1.0, 0.85, 0.8, 0x2a2a35);
  sill.position.y = 0.42;
  g.add(sill);
  const top = box(1.0, 0.07, 0.85, 0xd4af37, { metalness: 0.7, roughness: 0.3 });
  top.position.y = 0.88;
  g.add(top);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x99ccff, transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false })
  );
  glass.position.set(0, 1.5, -0.3);
  g.add(glass);
  const frame = box(1.0, 0.07, 0.08, 0xd4af37, { metalness: 0.7 });
  frame.position.set(0, 2.06, -0.3);
  g.add(frame);
  return g;
}

// One tile of floor-to-ceiling curtain-wall glazing (glass in the local x/y plane).
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xb5dcf2, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false,
});
export function makeWindowWall() {
  const g = new THREE.Group();
  const sill = box(1, 0.2, 0.2, 0xaab2ba);
  sill.position.y = 0.1;
  g.add(sill);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 2.0, 0.03), glassMat);
  glass.position.y = 0.2 + 1.0;
  glass.renderOrder = 2;
  g.add(glass);
  const mullion = box(0.045, 2.2, 0.08, 0xaab2ba);
  mullion.position.set(0.5, 1.1, 0);
  g.add(mullion);
  return g;
}

// Polished white marble with soft grey veining, for the lift floor.
export function marbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f1eee8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(${110 + Math.random() * 40}, ${110 + Math.random() * 40}, ${120 + Math.random() * 40}, ${0.15 + Math.random() * 0.3})`;
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    let px = Math.random() * 256, py = Math.random() * 256;
    g.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      const nx = px + (Math.random() - 0.3) * 140, ny = py + (Math.random() - 0.5) * 140;
      g.quadraticCurveTo(px + (Math.random() - 0.5) * 80, py + (Math.random() - 0.5) * 80, nx, ny);
      px = nx; py = ny;
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wall-mounted TV running the obligatory security dashboard. Screen faces +z.
export function makeTV() {
  const g = new THREE.Group();
  const bezel = box(1.3, 0.76, 0.05, 0x0d0d0f);
  g.add(bezel);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const x = c.getContext('2d');
  x.fillStyle = '#0e1726';
  x.fillRect(0, 0, 512, 288);
  x.fillStyle = '#7fa7d9';
  x.font = 'bold 20px Helvetica, Arial, sans-serif';
  x.fillText('SECURITY OPERATIONS DASHBOARD', 20, 34);
  x.fillStyle = '#ffffff';
  x.font = 'bold 22px Helvetica, Arial, sans-serif';
  x.fillText('DAYS SINCE LAST INCIDENT', 20, 82);
  x.fillStyle = '#ff4d4d';
  x.font = 'bold 110px Helvetica, Arial, sans-serif';
  x.fillText('0', 40, 196);
  // alerts-per-hour bars, trending in the wrong direction
  x.fillStyle = '#7fa7d9';
  x.font = '14px Helvetica, Arial, sans-serif';
  x.fillText('ALERTS / HOUR', 300, 82);
  [30, 42, 38, 60, 75, 70, 96, 120].forEach((h, i) => {
    x.fillStyle = i > 5 ? '#ff7a3d' : '#3d8bff';
    x.fillRect(300 + i * 24, 220 - h, 16, h);
  });
  // risk gauge
  x.fillStyle = '#ffffff';
  x.font = 'bold 16px Helvetica, Arial, sans-serif';
  x.fillText('RISK APPETITE:', 20, 250);
  x.fillStyle = '#ffcc33';
  x.fillText('"MEDIUM-ISH"', 152, 250);
  x.fillStyle = '#1f2d44';
  x.fillRect(0, 262, 512, 26);
  x.fillStyle = '#9fb3cc';
  x.font = '14px Helvetica, Arial, sans-serif';
  x.fillText('PATCH TUESDAY IS COMING  •  MFA FATIGUE AT 94%  •  PLEASE STOP CLICKING LINKS', 12, 280);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 0.026;
  g.add(screen);
  return g;
}

// Automatic single-pane glass sliding door in an aluminium frame, set into the
// glass line. The pane (userData.pane) slides along local x; the opening faces -z.
export function makeSlidingDoor() {
  const g = new THREE.Group();
  const alu = 0x8d949b;
  for (const sx of [-1, 1]) {
    const post = box(0.06, 2.2, 0.12, alu, { metalness: 0.6, roughness: 0.35 });
    post.position.set(sx * 0.5, 1.1, 0);
    g.add(post);
  }
  const header = box(1.06, 0.14, 0.14, alu, { metalness: 0.6, roughness: 0.35 });
  header.position.set(0, 2.13, 0);
  g.add(header);
  const sensor = box(0.16, 0.04, 0.05, 0x222222);
  sensor.position.set(0, 2.03, -0.08);
  g.add(sensor);

  const pane = new THREE.Group();
  pane.position.set(0, 0, -0.09); // just inside the glass line, so it slides past it cleanly
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 2.0, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  );
  glass.position.y = 1.03;
  pane.add(glass);
  for (const [w, h, x, y] of [[0.96, 0.04, 0, 2.03], [0.96, 0.04, 0, 0.03], [0.03, 2.04, -0.47, 1.03], [0.03, 2.04, 0.47, 1.03]]) {
    const edge = box(w, h, 0.035, alu, { metalness: 0.6, roughness: 0.35 });
    edge.position.set(x, y, 0);
    pane.add(edge);
  }
  g.add(pane);
  g.userData.pane = pane;

  // entrance mat just inside
  const mat_ = box(0.9, 0.012, 0.55, 0x2e3238);
  mat_.position.set(0, 0.006, -0.45);
  g.add(mat_);
  return g;
}

export function makePlant() {
  const g = new THREE.Group();
  const pot = cyl(0.2, 0.15, 0.35, 0xb5651d);
  pot.position.y = 0.18;
  g.add(pot);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), mat(0x2e8b57));
    leaf.position.set(Math.cos(i * 1.3) * 0.08, 0.6, Math.sin(i * 1.3) * 0.08);
    leaf.rotation.set(Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Oak-frame armchair with light-blue cushions (open box arms, solid front panel).
// Faces +z.
export function makeArmchair() {
  const g = new THREE.Group();
  const oak = 0x96673a, fabric = 0x9fcbea;
  const wood = (w, h, d, x, y, z) => {
    const b = box(w, h, d, oak, { roughness: 0.55 });
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  for (const s of [-1, 1]) {
    const x = s * 0.33;
    wood(0.05, 0.6, 0.05, x, 0.3, 0.3);    // front post
    wood(0.05, 0.64, 0.05, x, 0.32, -0.3); // back post
    wood(0.07, 0.04, 0.72, x, 0.61, 0);    // armrest
    wood(0.04, 0.05, 0.6, x, 0.12, 0);     // lower side rail
  }
  wood(0.66, 0.16, 0.04, 0, 0.2, 0.31);    // front panel
  wood(0.66, 0.05, 0.04, 0, 0.3, -0.31);   // back rail
  wood(0.62, 0.05, 0.6, 0, 0.27, 0);       // seat deck
  const seat = box(0.6, 0.13, 0.56, fabric, { roughness: 0.95 });
  seat.position.set(0, 0.36, 0.03);
  g.add(seat);
  const back = box(0.58, 0.44, 0.13, fabric, { roughness: 0.95 });
  back.position.set(0, 0.64, -0.24);
  back.rotation.x = -0.16;
  g.add(back);
  return g;
}

// Mini indoor tree (think fiddle-leaf fig): big pot, slim trunk, clustered canopy.
export function makeMiniTree() {
  const g = new THREE.Group();
  const pot = cyl(0.26, 0.2, 0.42, 0xf1efe9);
  pot.position.y = 0.21;
  g.add(pot);
  const soil = cyl(0.24, 0.24, 0.03, 0x4a3426);
  soil.position.y = 0.42;
  g.add(soil);
  const trunk = cyl(0.035, 0.05, 1.1, 0x7a5434);
  trunk.position.y = 0.95;
  g.add(trunk);
  const greens = [0x3f9b3a, 0x57b947, 0x2f7d32];
  const blobs = [[0, 1.75, 0, 0.34], [0.2, 1.55, 0.1, 0.26], [-0.2, 1.6, -0.08, 0.27], [0.05, 1.5, -0.22, 0.24], [-0.08, 1.45, 0.2, 0.23], [0.02, 2.0, 0.03, 0.22]];
  blobs.forEach(([x, y, z, r], i) => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(greens[i % greens.length], { flatShading: true }));
    b.position.set(x, y, z);
    b.castShadow = true;
    g.add(b);
  });
  return g;
}

export function makePoster(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.strokeRect(12, 12, 232, 296);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = 'bold 34px Helvetica, Arial';
  const words = text.split('\n');
  words.forEach((w, i) => g.fillText(w, 128, 150 - (words.length - 1) * 20 + i * 42));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: t }));
  return m;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export function makeItemMesh(def) {
  const g = new THREE.Group();
  let base;
  if (def.container) {
    base = box(0.42, 0.06, 0.32, def.color);
    const tab = box(0.14, 0.06, 0.06, def.color);
    tab.position.set(-0.1, 0, -0.18);
    g.add(tab);
  } else if (def.tool) {
    base = box(0.3, 0.38, 0.08, def.color);
    base.position.y = 0.16;
  } else if (def.name === 'Coffee') {
    base = cyl(0.09, 0.07, 0.2, 0xffffff);
    base.position.y = 0.08;
  } else {
    base = box(0.3, 0.08, 0.3, def.color);
  }
  g.add(base);
  const icon = emojiSprite(def.emoji, 0.46);
  icon.position.y = 0.42;
  g.add(icon);
  g.userData.icon = icon;
  return g;
}
