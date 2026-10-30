// The world outside the office: Westpac Place (275 Kent St, Sydney) and its
// neighbourhood, stylised + distance-compressed so it reads from the game camera.
//
// Orientation: the map's "up" faces WEST towards Darling Harbour.
//   -z = west (water)   +z = east (Kent St / CBD core)
//   +x = north (Barangaroo, Harbour Bridge)   -x = south (Cockle Bay)
// The office floor is y = 0, roughly level 14 of the tower: about three quarters of
// the way up the Amex building across the road. 1 unit ≈ 1.5 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

// Red "W" from the official Westpac logo (Westpac_logo.svg on Wikimedia Commons, fill #ed1a3a)
const WESTPAC_W = 'M 298.9375,517.98718 C 299.74873,518.32968 300.28125,520.42468 300.28125,520.42468 L 305.3125,537.92468 C 305.89249,540.11468 307.7275,541.26843 309.78125,541.26843 L 320.8125,541.26843 C 320.02252,541.12718 319.15625,538.79968 319.15625,538.79968 L 313.5625,521.39343 C 312.75748,518.73468 311.4,517.98718 309.34375,517.98718 L 298.9375,517.98718 z M 345.625,517.98718 C 343.56375,517.98718 342.23001,518.73468 341.4375,521.39343 L 335.8125,538.79968 C 335.8125,538.79968 334.95498,541.12718 334.15625,541.26843 L 345.1875,541.26843 C 347.25125,541.26843 349.06875,540.11468 349.65625,537.92468 L 354.6875,520.42468 C 354.6875,520.42468 355.23623,518.32968 356.0625,517.98718 L 345.625,517.98718 z M 321.375,518.11218 L 321.375,541.26843 L 333.65625,541.26843 L 333.65625,518.11218 L 321.375,518.11218 z';

export const GROUND = -34;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// One texture tile = one structural bay wide x one floor high.
function curtainWall({ glass, mullion, spandrel, spandrelH = 0.28, vary = 0.1 }) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = mullion;
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shade(glass, 1 + vary));
    grad.addColorStop(1, shade(glass, 1 - vary));
    g.fillStyle = grad;
    g.fillRect(3, 3, w - 6, h * (1 - spandrelH) - 3);
    g.fillStyle = spandrel;
    g.fillRect(0, h * (1 - spandrelH), w, h * spandrelH);
  });
}

function punchedWindows({ wall, glass, cols = 2, winW = 0.55, winH = 0.55 }) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < cols; i++) {
      const cw = w / cols;
      g.fillStyle = glass;
      g.fillRect(i * cw + (cw * (1 - winW)) / 2, h * 0.18, cw * winW, h * winH);
    }
  });
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function streetTexture() {
  // one tile = one 30x30 city block, roads around the edge
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2c2f33'; // asphalt
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a7a49a'; // footpath
    g.fillRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#8f8d86'; // block / plaza
    g.fillRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#e9e6d8'; // lane markings
    for (let i = 0; i < w; i += 12) {
      g.fillRect(i, 0, 6, 1.5);
      g.fillRect(0, i, 1.5, 6);
    }
    g.fillStyle = '#d9d9d9'; // pedestrian crossings
    for (let i = 0; i < 5; i++) {
      g.fillRect(14 + i * 3, 2, 1.5, 9);
      g.fillRect(2, 14 + i * 3, 9, 1.5);
    }
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
// Box whose UVs are in "bays x floors" so facade textures tile at true scale.
function facadeBox(w, h, d, bay = 1, floor = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * du) / bay, (uv.getY(i) * dv) / floor);
    }
  }
  return geo;
}

function lambert(opts) {
  return new THREE.MeshLambertMaterial(opts);
}

const roofMat = lambert({ color: 0x9a9b9c });
const plantMat = lambert({ color: 0xb9babb });

function addBuilding(scene, { x, z, w, d, h, mats, base = GROUND, roofKit = true }) {
  const m = new THREE.Mesh(facadeBox(w, h, d), mats);
  m.position.set(x, base + h / 2, z);
  scene.add(m);
  if (roofKit && w > 6 && d > 6) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w * rand(0.25, 0.45), rand(1.2, 2.5), d * rand(0.25, 0.45)), plantMat);
    p.position.set(x + rand(-w, w) * 0.15, base + h + p.geometry.parameters.height / 2, z + rand(-d, d) * 0.15);
    scene.add(p);
  }
  return m;
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Vertical prism from a 2D shape (shape x -> world x, shape y -> world -z).
function prism(shape, h, mat, segs = 8) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: segs });
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------
function westpacPlace(scene, W, H) {
  // Blue-green glass curtain wall with a spandrel band at every floor.
  const tex = curtainWall({ glass: '#3f6f86', mullion: '#c9d3d8', spandrel: '#2c4756', spandrelH: 0.3 });
  tex.repeat.set(1 / 1.5, 1 / 2.5);
  const glass = lambert({ map: tex });
  const mats = [glass, glass, roofMat, roofMat, glass, glass];

  // main tower under our floor
  const tower = new THREE.Mesh(facadeBox(W, -GROUND - 0.05, H, 1, 1), mats);
  tower.position.set(0, GROUND / 2 - 0.05, 0);
  scene.add(tower);
  // slab edge just under the office floor
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.5, H + 0.3), lambert({ color: 0xdfe3e6 }));
  slab.position.y = -0.3;
  scene.add(slab);

  // The Westpac logo on the south (Kent St) face, just under our floor.
  // Exact vector path of the red W from Westpac_logo.svg (Wikimedia Commons).
  const { paths } = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${WESTPAC_W}"/></svg>`);
  const logoW = 16, depth = 0.6;
  const s = logoW / 57.125; // the W is 57.125 x 23.28 SVG units, origin (298.9375, 517.98718)
  const red = new THREE.MeshStandardMaterial({ color: 0xed1a3a, emissive: 0x4a0812, roughness: 0.45 });
  for (const shape of SVGLoader.createShapes(paths[0])) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
    geo.translate(-(298.9375 + 57.125 / 2), -517.98718, 0);
    geo.scale(s, -s, -1); // SVG y points down; flipping z too keeps the faces the right way out
    geo.translate(0, -1.3, H / 2 + depth);
    scene.add(new THREE.Mesh(geo, red));
  }

  // Westpac Place is two connected towers: the lower north tower sits beside us
  const northH = -GROUND * 0.7;
  addBuilding(scene, { x: W / 2 + 10, z: 0, w: 18, d: H + 4, h: northH, mats });
  // glazed link between them, a few floors below the north tower's roof
  const link = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 6), lambert({ color: 0x5d8aa0 }));
  link.position.set(W / 2 + 0.5, GROUND + northH - 6, 0);
  scene.add(link);
  // podium + forecourt on Kent St
  addBuilding(scene, { x: 4, z: 0, w: W + 26, d: H + 10, h: 8, mats: [glass, glass, lambert({ color: 0x7f8c86 }), roofMat, glass, glass], roofKit: false });
}

function amexBuilding(scene) {
  // 12 Shelley St, King Street Wharf (CoxCrone, 11 storeys, ~48 m). Wedge-shaped
  // footprint (OSM way 335696947): straight west face on Shelley St, wide north
  // end, and a long diagonal east face tracking the Western Distributor. North
  // and west are near-black glass + zinc with orange frames and an orange crown;
  // east is charcoal precast with punched windows behind the orange
  // "chopsticks"; south is solid charcoal precast.
  const cx = -8, cz = -48, h = 46; // taller than the real 11 storeys; our floor sits in its upper half
  // footprint corners [x north, z east], metres / 1.5, relative to (cx, cz)
  const NW = [14.5, -14], NE = [16.5, 13.5], SE = [-16, 2], SW = [-17.5, -11];
  const pts = [NW, NE, SE, SW].map(([x, z]) => [cx + x, cz + z]);
  const [mx, mz] = [pts.reduce((a, p) => a + p[0], 0) / 4, pts.reduce((a, p) => a + p[1], 0) / 4];

  const gz = curtainWall({ glass: '#1d262e', mullion: '#3b434a', spandrel: '#e2611c', spandrelH: 0.12, vary: 0.2 });
  gz.repeat.set(1 / 1.8, 1 / 2.9);
  const glassZinc = lambert({ map: gz });
  const pc = punchedWindows({ wall: '#5c6065', glass: '#26323b', cols: 3, winW: 0.5, winH: 0.5 });
  pc.repeat.set(1 / 3.5, 1 / 2.9);
  const precastWin = lambert({ map: pc });
  const precast = lambert({ color: 0x5f6368 });
  const orange = lambert({ color: 0xec661e });

  // one flat facade between two footprint corners, facing away from the centre
  const wall = (a, b, mat) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = b[1] - a[1], nz = -(b[0] - a[0]);
    if (nx * ((a[0] + b[0]) / 2 - mx) + nz * ((a[1] + b[1]) / 2 - mz) < 0) { nx = -nx; nz = -nz; }
    const geo = new THREE.PlaneGeometry(len, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * h);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((a[0] + b[0]) / 2, GROUND + h / 2, (a[1] + b[1]) / 2);
    m.rotation.y = Math.atan2(nx, nz);
    scene.add(m);
    return { len, angle: m.rotation.y, n: [nx / len, nz / len] };
  };
  const [pNW, pNE, pSE, pSW] = pts;
  const north = wall(pNW, pNE, glassZinc);
  const east = wall(pNE, pSE, precastWin);
  wall(pSE, pSW, precast);
  const west = wall(pSW, pNW, glassZinc);

  const roof = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom(pts)), roofMat);
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = GROUND + h;
  scene.add(roof);
  const plant = new THREE.Mesh(new THREE.BoxGeometry(9, 2.5, 7), plantMat);
  plant.position.set(mx + 3, GROUND + h + 1.25, mz - 2);
  scene.add(plant);

  // orange crown wrapping the top of the glass faces
  for (const [a, b, f] of [[pNW, pNE, north], [pSW, pNW, west]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(f.len + 1.2, 2.6, 1.2), orange);
    c.position.set((a[0] + b[0]) / 2 + f.n[0] * 0.4, GROUND + h - 0.9, (a[1] + b[1]) / 2 + f.n[1] * 0.4);
    c.rotation.y = f.angle;
    scene.add(c);
  }

  // leaning, irregularly spaced chopsticks standing just off the east face
  for (let t = 1; t < east.len - 0.5; t += rand(0.8, 2.2)) {
    const k = t / east.len, len = h + rand(-4, 1.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, len, 0.35), orange);
    m.position.set(
      pNE[0] + (pSE[0] - pNE[0]) * k + east.n[0] * 1.1,
      GROUND + len / 2,
      pNE[1] + (pSE[1] - pNE[1]) * k + east.n[1] * 1.1,
    );
    m.rotation.set(0, east.angle, rand(-0.09, 0.09));
    scene.add(m);
  }

  // "AMERICAN EXPRESS" in white letters across the top of the east face, the side
  // we look at from Westpac Place, mounted just proud of the chopsticks
  const signW = 20, signH = 2.4;
  const signTex = canvasTex(1024, 128, (g, w, hh) => {
    g.fillStyle = '#ffffff';
    g.font = 'bold 88px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('AMERICAN EXPRESS', w / 2, hh / 2 + 4, w - 40);
  }, false);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), lambert({ map: signTex, transparent: true, alphaTest: 0.1 }));
  sign.position.set(
    (pNE[0] + pSE[0]) / 2 + east.n[0] * 1.6,
    GROUND + h - signH / 2 - 0.6,
    (pNE[1] + pSE[1]) / 2 + east.n[1] * 1.6,
  );
  sign.rotation.y = east.angle;
  scene.add(sign);
}

function internationalTower(scene, { x, z, h, w, d, rot, fins }) {
  // Rogers Stirk Harbour: rounded corners, dark tinted glass, three stacked
  // sections, red/yellow vertical fins as brise-soleil, white expressed core.
  const g = new THREE.Group();
  g.position.set(x, GROUND, z);
  g.rotation.y = rot;
  scene.add(g);
  const tex = curtainWall({ glass: '#26323b', mullion: '#55616a', spandrel: '#1d262d', spandrelH: 0.2, vary: 0.25 });
  tex.repeat.set(1 / 1.5, 1 / 2.6);
  const glass = lambert({ map: tex });
  const white = lambert({ color: 0xf1f1ee });
  const finMats = fins.map((c) => lambert({ color: c }));

  const secH = h / 3;
  const offsets = [[0, 0, 1], [1.5, -1, 0.95], [-1, 0.8, 0.9]];
  offsets.forEach(([ox, oz, s], i) => {
    const sw = w * s, sd = d * s;
    const sec = prism(roundedRect(sw, sd, 4), secH - 1.2, glass);
    sec.position.set(ox, i * secH, oz);
    g.add(sec);
    const band = prism(roundedRect(sw - 0.8, sd - 0.8, 3.6), 1.2, white);
    band.position.set(ox, i * secH + secH - 1.2, oz);
    g.add(band);
    // fins on the long east face and the north end
    const fm = finMats[i % finMats.length];
    const gap = 2.6, thick = 0.18;
    for (let t = -sw / 2 + 4; t <= sw / 2 - 4; t += gap) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(thick, secH - 2, 0.9), fm);
      f.position.set(ox + t, i * secH + (secH - 2) / 2 + 0.4, oz + sd / 2 + 0.6);
      g.add(f);
    }
    for (let t = -sd / 2 + 4; t <= sd / 2 - 4; t += gap) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, secH - 2, thick), fm);
      f.position.set(ox + sw / 2 + 0.6, i * secH + (secH - 2) / 2 + 0.4, oz + t);
      g.add(f);
    }
  });
  // expressed white service core on the harbour (west) side
  const core = new THREE.Mesh(new THREE.BoxGeometry(w * 0.35, h + 5, 3), white);
  core.position.set(0, (h + 5) / 2, -d / 2 - 1.2);
  g.add(core);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 4, d * 0.4), white);
  crown.position.set(0, h + 2, 0);
  g.add(crown);
}

function crownSydney(scene, x, z) {
  // One Barangaroo: a sculpted, twisting three-petal glass tower.
  const H = 175, N = 34;
  const mat = lambert({ color: 0xdce7ee });
  const edge = lambert({ color: 0xf7fafc });
  const petal = (r) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = r * (1 + 0.22 * Math.cos(3 * a));
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
    return s;
  };
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const r = 7 * (0.72 + 0.5 * Math.sin(Math.PI * Math.pow(t, 0.85)));
    const m = prism(petal(r), H / N - 0.25, i % 6 === 5 ? edge : mat, 4);
    m.position.set(x, GROUND + 10 + t * H, z);
    m.rotation.y = t * 1.1;
    scene.add(m);
  }
  addBuilding(scene, { x, z, w: 26, d: 22, h: 10, mats: lambert({ color: 0xcfd6da }), roofKit: false });
}

function harbourBridge(scene) {
  // Distant landmark across the harbour to the north.
  const g = new THREE.Group();
  g.position.set(190, GROUND, 40);
  scene.add(g);
  const steel = lambert({ color: 0x737a80 });
  const granite = lambert({ color: 0xcbb994 });
  const L = 150, top = 48, deck = 22;
  for (const zz of [-5, 5]) {
    for (const [hTop, hEnd] of [[top, deck - 6], [top - 7, deck - 2]]) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30 * 2 - 1;
        pts.push(new THREE.Vector3(t * L / 2, hEnd + (hTop - hEnd) * (1 - t * t), zz));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.9, 6), steel));
    }
    for (let i = -6; i <= 6; i++) {
      const xx = (i / 7) * L / 2;
      const t = xx / (L / 2);
      const y1 = deck, y2 = deck - 6 + (top - deck + 6) * (1 - t * t);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.6, Math.abs(y2 - y1) + 0.1, 0.6), steel);
      v.position.set(xx, (y1 + y2) / 2, zz);
      g.add(v);
    }
  }
  const d = new THREE.Mesh(new THREE.BoxGeometry(L + 70, 1.6, 13), steel);
  d.position.y = deck;
  g.add(d);
  for (const sx of [-1, 1]) {
    for (const zz of [-6, 6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(7, deck + 18, 5), granite);
      p.position.set(sx * (L / 2 + 4), (deck + 18) / 2, zz);
      g.add(p);
    }
  }
}

function ferry(scene) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 3), lambert({ color: 0x1f6b3a }));
  hull.position.y = 0.7;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.4, 2.6), lambert({ color: 0xf1e6c8 }));
  cabin.position.y = 2.1;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.3, 2.7), lambert({ color: 0xf2c230 }));
  trim.position.y = 2.9;
  g.add(hull, cabin, trim);
  scene.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Land & water
// ---------------------------------------------------------------------------
// Darling Harbour + the main harbour, as one polygon (x, z).
const WATER = [
  [-160, -175], [-160, -140], [-95, -138], [-50, -135], [-15, -132], [8, -125], [18, -110],
  [70, -100], [108, -95], [122, -60], [126, -20], [130, 60], [135, 160], [300, 160],
  [300, -420], [-160, -420],
];
const SHORE = WATER.slice(1, 14); // the wharf edge, from Cockle Bay round to Dawes Point
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const PYRMONT = { x0: -400, x1: 105, z0: -420, z1: -178 };
const NORTH_SHORE = { x0: 300, x1: 700, z0: -420, z1: 420 };
const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
function isLand(x, z) {
  if (inRect(x, z, PYRMONT) || inRect(x, z, NORTH_SHORE)) return true;
  return !inPoly(x, z, WATER);
}

function shapeFrom(points) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  return s;
}

// ---------------------------------------------------------------------------
// Collapse every static mesh under `root` into one mesh per material.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    const parts = Array.isArray(o.material)
      ? geo.groups.map((gr) => {
        const sub = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) {
          const a = geo.attributes[k];
          sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
        }
        return [o.material[gr.materialIndex], sub];
      })
      : [[o.material, geo]];
    for (const [m, g] of parts) {
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m).push(g);
    }
  });
  const out = new THREE.Group();
  for (const [m, geos] of buckets) out.add(new THREE.Mesh(mergeGeometries(geos), m));
  return out;
}

export function buildCity(scene, W, H) {
  const world = scene;
  scene = new THREE.Group(); // static content collects here, then gets merged
  // sky dome
  const skyGeo = new THREE.SphereGeometry(1400, 32, 16);
  const cols = [];
  const top = new THREE.Color(0x8a9bb0), hor = new THREE.Color(0xb4bac4);
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, pos.getY(i) / 1400);
    const c = hor.clone().lerp(top, Math.pow(k, 0.6));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  world.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));

  // ground with a street grid aligned to 30-unit blocks (our tower centred on one)
  const st = streetTexture();
  st.repeat.set(3000 / 30, 3000 / 30);
  st.offset.set(0.5, 0.5);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), lambert({ map: st }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND;
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(shapeFrom(WATER)),
    new THREE.MeshPhongMaterial({ color: 0x2b6f95, shininess: 80, specular: 0x88aacc })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = GROUND + 0.4;
  scene.add(water);
  // promenade along the wharves: the shoreline offset 6 units inland
  const inner = SHORE.map(([x, z], i) => {
    const [px, pz] = SHORE[Math.max(0, i - 1)], [nx, nz] = SHORE[Math.min(SHORE.length - 1, i + 1)];
    let tx = nx - px, tz = nz - pz;
    const l = Math.hypot(tx, tz);
    let ox = -tz / l, oz = tx / l;
    if (!isLand(x + ox * 3, z + oz * 3)) { ox = -ox; oz = -oz; }
    return [x + ox * 6, z + oz * 6];
  });
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(shapeFrom([...SHORE, ...inner.reverse()])), lambert({ color: 0xc8bfa8 }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = GROUND + 0.5;
  scene.add(edge);
  for (const r of [PYRMONT, NORTH_SHORE]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), lambert({ map: st.clone() }));
    m.material.map.repeat.set((r.x1 - r.x0) / 30, (r.z1 - r.z0) / 30);
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, GROUND + 0.7, (r.z0 + r.z1) / 2);
    scene.add(m);
  }

  // landmarks
  westpacPlace(scene, W, H);
  amexBuilding(scene);
  internationalTower(scene, { x: 32, z: -46, h: 112, w: 28, d: 19, rot: 0.4, fins: [0xd2312b, 0xf2b705, 0xd2312b] });  // Tower Three
  internationalTower(scene, { x: 56, z: -60, h: 119, w: 30, d: 20, rot: 0.15, fins: [0xf2b705, 0xd2312b, 0xf2b705] }); // Tower Two
  internationalTower(scene, { x: 82, z: -70, h: 145, w: 32, d: 21, rot: -0.15, fins: [0xd2312b, 0xe8701e, 0xf2b705] }); // Tower One
  crownSydney(scene, 104, -80);
  // Barangaroo South podiums + Wulugul Walk promenade
  const podium = lambert({ color: 0xd9d6cf });
  for (const [px, pz, pw, pd] of [[30, -32, 26, 10], [58, -44, 22, 10], [80, -52, 20, 10], [45, -76, 18, 10], [70, -86, 26, 8]]) {
    addBuilding(scene, { x: px, z: pz, w: pw, d: pd, h: rand(5, 9), mats: podium, roofKit: false });
  }
  harbourBridge(scene);

  // generic city fabric
  const palettes = [
    () => curtainWall({ glass: '#567d96', mullion: '#c4ccd2', spandrel: '#3d5566' }),
    () => curtainWall({ glass: '#3c4a56', mullion: '#7d8890', spandrel: '#2d3740' }),
    () => curtainWall({ glass: '#7c97a8', mullion: '#e0e4e6', spandrel: '#9aa8b0', spandrelH: 0.35 }),
    () => punchedWindows({ wall: '#d6b98d', glass: '#3e4f5c', cols: 2 }), // Sydney sandstone
    () => punchedWindows({ wall: '#e6e3dc', glass: '#56707f', cols: 3, winW: 0.7 }),
    () => punchedWindows({ wall: '#a65d43', glass: '#33424d', cols: 2 }), // brick warehouses
  ];
  const mats = palettes.map((mk) => {
    const t = mk();
    t.repeat.set(1 / 2, 1 / 2.5);
    const m = lambert({ map: t });
    return [m, m, roofMat, roofMat, m, m];
  });
  const reserved = [
    { x0: -15, x1: 50, z0: -14, z1: 14 },   // Westpac Place
    { x0: -28, x1: 12, z0: -66, z1: -14 }, // Amex, King Street Wharf (and the sightline to it)
    { x0: 12, x1: 130, z0: -105, z1: -22 }, // Barangaroo South
    { x0: -30, x1: 30, z0: 14, z1: 40 },    // keep the Kent St facade visible
  ];
  for (let i = -14; i <= 9; i++) {
    for (let j = -14; j <= 12; j++) {
      const bx = i * 30, bz = j * 30;
      const corners = [[-12, -12], [12, -12], [-12, 12], [12, 12]];
      if (!corners.every(([dx, dz]) => isLand(bx + dx, bz + dz))) continue;
      if (reserved.some((r) => bx + 12 > r.x0 && bx - 12 < r.x1 && bz + 12 > r.z0 && bz - 12 < r.z1)) continue;
      const far = inRect(bx, bz, PYRMONT) || inRect(bx, bz, NORTH_SHORE);
      // CBD core is east/north-east of us; heights fall off with distance
      const core = Math.hypot(bx - 30, bz - 90);
      let maxH = far ? 30 : 25 + 130 * Math.exp(-core / 110);
      if (bz < -15 && !far) maxH = Math.min(maxH, 40); // low-rise towards the wharves
      // immediate neighbours stay well below our floor so the view stays open
      const near = Math.hypot(bx, bz * 1.3);
      if (near < 110) maxH = Math.min(maxH, 8 + near * 0.22);
      const base = far ? GROUND + 0.7 : GROUND;
      const split = pick([1, 2, 2, 4]);
      const parts = split === 1 ? [[0, 0, 24, 24]] : split === 2
        ? (Math.random() < 0.5 ? [[-6, 0, 11, 24], [6, 0, 11, 24]] : [[0, -6, 24, 11], [0, 6, 24, 11]])
        : [[-6, -6, 11, 11], [6, -6, 11, 11], [-6, 6, 11, 11], [6, 6, 11, 11]];
      for (const [ox, oz, pw, pd] of parts) {
        const h = rand(maxH * 0.35, maxH);
        addBuilding(scene, { x: bx + ox, z: bz + oz, w: pw - rand(0, 2), d: pd - rand(0, 2), h, mats: pick(mats), base });
      }
    }
  }

  world.add(mergeStatic(scene));
  const ferries = [ferry(world), ferry(world), ferry(world)];
  return {
    update(t) {
      // ferries crossing Darling Harbour and the main harbour
      const f0 = ((t * 4) % 260) - 150;
      ferries[0].position.set(f0, GROUND + 0.4, -135);
      ferries[0].rotation.y = 0;
      const f1 = ((t * 3 + 120) % 260) - 150;
      ferries[1].position.set(-f1 - 20, GROUND + 0.4, -155);
      ferries[1].rotation.y = Math.PI;
      const f2 = ((t * 5) % 500) - 250;
      ferries[2].position.set(215, GROUND + 0.4, f2);
      ferries[2].rotation.y = Math.PI / 2;
    },
  };
}
