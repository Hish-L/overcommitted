// Builds the corporate office scene from the ASCII map in data.js.
import * as THREE from 'three';
import { MAP as BASE_MAP, STATIONS, ITEMS, DESK_STATIONS } from './data.js';
import * as M from './models.js';
import { GROUND } from './city.js';

const FLOOR = new Set(['.', '@']);
const DESK_SCALE = 1.05; // cubicle desks are drawn 5% larger than a tile

export function buildWorld(scene, { shadowSize = 2048 } = {}) {
  const H = BASE_MAP.length;
  const W = BASE_MAP[0].length;
  BASE_MAP.forEach((row, i) => {
    if (row.length !== W) throw new Error(`MAP row ${i} has length ${row.length}, expected ${W}`);
  });

  // seat the desk stations at random desks; the rest stay dev workstations
  const MAP = BASE_MAP.map((row) => [...row]);
  const desks = [];
  MAP.forEach((row, r) => row.forEach((ch, c) => ch === 'W' && desks.push([c, r])));
  for (let i = desks.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [desks[i], desks[j]] = [desks[j], desks[i]];
  }
  // cubicles open sideways onto the aisle. Station people only sit on wide
  // (2-tile) aisles, so a fully seated aisle never walls anything off.
  const baseFloor = (c, r) => FLOOR.has(BASE_MAP[r]?.[c]);
  const facing = (c, r) => (baseFloor(c - 1, r) ? -1 : 1);
  const wide = desks.filter(([c, r]) => baseFloor(c + 2 * facing(c, r), r));
  if (wide.length < DESK_STATIONS.length) throw new Error('Not enough wide-aisle desks for DESK_STATIONS');
  const seated = new Set();
  MAP.forEach((row, r) => row.forEach((ch, c) => STATIONS[ch]?.regular && seated.add(`${c},${r}`)));
  DESK_STATIONS.forEach((key, i) => {
    const [c, r] = wide[i];
    MAP[r][c] = key;
    seated.add(`${c},${r}`);
  });

  const toWorld = (c, r) => ({ x: c - W / 2 + 0.5, z: r - H / 2 + 0.5 });
  const charAt = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? MAP[r][c] : '#');
  const isFloor = (c, r) => FLOOR.has(charAt(c, r));

  // --- lights -------------------------------------------------------------
  // warm, slightly low afternoon sun over a cool sky fill, so lit faces pop
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8c7b68, 1.1));
  const sun = new THREE.DirectionalLight(0xffe4b8, 2.7);
  sun.position.set(7, 13, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);

  // --- floor --------------------------------------------------------------

  const floorTex = makeCarpetTexture(W, H);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- walls & stations ----------------------------------------------------
  const wallHeight = () => 1.1;
  const stations = [];
  const grid = [];
  let spawn = { x: 0, z: 0 };
  let lift = null;
  let elevator = null;
  let tvPlaced = false;
  const posters = [
    ['ZERO\nTRUST\nZERO\nSLEEP', '#c0392b'],
    ['THINK\nBEFORE\nYOU\nCLICK', '#2c3e50'],
    ['SHIFT\nLEFT\n(AND\nRIGHT)', '#16a085'],
    ['AI\nFIRST\nPLAN\nLATER', '#8e44ad'],
    ['WE ❤\nAUDITS', '#d35400'],
  ];
  let posterIdx = 0;

  for (let r = 0; r < H; r++) {
    grid.push([]);
    for (let c = 0; c < W; c++) {
      const ch = MAP[r][c];
      const { x, z } = toWorld(c, r);
      if (ch === '@') spawn = { x, z };
      if (FLOOR.has(ch)) {
        grid[r].push(null);
        continue;
      }
      if (ch === 'w') {
        // plain white feature wall, full height; one seamless block per patch
        if (charAt(c - 1, r) !== 'w' && charAt(c, r - 1) !== 'w') {
          let cw = 1, rh = 1;
          while (charAt(c + cw, r) === 'w') cw++;
          while (charAt(c, r + rh) === 'w') rh++;
          // 0.32 deep (half of 80% of the oak ledge), flush against the glass on the top/bottom edges
          const depth = r === 0 || r + rh - 1 === H - 1 ? M.OAK_DEPTH * 0.8 * 0.5 : rh;
          const cz = r === 0 ? z - 0.4 + depth / 2 : r + rh - 1 === H - 1 ? z + rh - 1 + 0.4 - depth / 2 : z + (rh - 1) / 2;
          const w = M.box(cw, 2.2, depth, 0xf6f6f3);
          w.position.set(x + (cw - 1) / 2, 1.1, cz);
          scene.add(w);
          if (r === 0 && !tvPlaced) {
            // wall TV on the white wall by the coffee machine
            tvPlaced = true;
            const tv = M.makeTV();
            tv.scale.setScalar(1.6);
            tv.position.set(x + (cw - 1) / 2, 1.5, cz + depth / 2 + 0.045);
            scene.add(tv);
          }
        }
        grid[r].push({ solid: true });
        continue;
      }
      if (ch === 'g') {
        // the entrance the hot-deskers arrive through: an automatic single-pane
        // glass sliding door in the bottom glass line, sliding left when it opens
        const door = M.makeSlidingDoor();
        door.position.set(x, 0, z + 0.4);
        scene.add(door);
        const pane = door.userData.pane;
        pane.userData.x = pane.position.x;
        pane.userData.slide = -0.95;
        lift = { x, z: z - 0.1, tile: { c, r: r - 1 }, doors: [pane] };
        elevator = buildElevator(x, z + 0.4);
        grid[r].push({ solid: true });
        continue;
      }
      if (ch === '<') {
        // armchair backed right up to the right-hand glass
        const chair = M.makeArmchair();
        chair.position.set(x - 0.1, 0, z);
        chair.rotation.y = -Math.PI / 2;
        scene.add(chair);
        const win = M.makeWindowWall();
        win.rotation.y = Math.PI / 2;
        win.position.set(x + 0.4, 0, z);
        scene.add(win);
        grid[r].push({ solid: true });
        continue;
      }
      if (ch === 'p') {
        const p = M.makePlanterSegment();
        // flush against the glass, same depth as the white wall beside it
        p.position.set(x, 0, z + 0.4 - M.PLANTER_DEPTH / 2);
        p.rotation.y = Math.PI;
        scene.add(p);
        if (r === H - 1) {
          const win = M.makeWindowWall();
          win.position.set(x, 0, z + 0.4);
          scene.add(win);
        }
        grid[r].push({ solid: true });
        continue;
      }
      if (ch === '#') {
        const corner = (r === 0 || r === H - 1) && (c === 0 || c === W - 1);
        if (corner) {
          const p = c === W - 1 ? M.makeMiniTree() : M.makePlant();
          p.position.set(x, 0, z);
          scene.add(p);
          if (c === W - 1) {
            // glass wraps the right-hand corners behind the trees
            const front = M.makeWindowWall();
            front.position.set(x, 0, z + (r === 0 ? -0.4 : 0.4));
            const side = M.makeWindowWall();
            side.rotation.y = Math.PI / 2;
            side.position.set(x + 0.4, 0, z);
            scene.add(front, side);
          }
        } else if (r === 0 || r === H - 1 || c === W - 1) {
          // top, right and bottom are floor-to-ceiling glass looking out over the city
          const win = M.makeWindowWall();
          if (c === W - 1) {
            win.rotation.y = Math.PI / 2;
            win.position.set(x + 0.4, 0, z);
          } else {
            win.position.set(x, 0, z + (r === 0 ? -0.4 : 0.4));
          }
          scene.add(win);
        } else {
          const h = wallHeight(r);
          const w = M.box(1, h, 1, 0xcfc9ba);
          w.position.set(x, h / 2, z);
          scene.add(w);
          if (c === 0 && posterIdx < posters.length) {
            const [txt, col] = posters[posterIdx++];
            const p = M.makePoster(txt, col);
            p.position.set(x + 0.51, 1.15, z);
            p.rotation.y = Math.PI / 2;
            scene.add(p);
          }
        }
        grid[r].push({ solid: true });
        continue;
      }

      const key = ch === 'B' ? 'C' : ch;
      const def = STATIONS[key];
      if (!def) throw new Error(`Unknown map char "${ch}"`);
      const st = makeStation(key, def, c, r);
      if (ch === 'B') st.initialItem = 'playbook';
      stations.push(st);
      grid[r].push({ solid: true, station: st });
    }
  }

  // Glass lift shaft on the outside of the building, right behind the sliding
  // door, glazed to match Westpac Place's blue-green curtain wall so you can
  // watch the car ride up. The car (glass, walnut and brass, marble floor) is
  // its own group so the intro can raise it from the street. z0 is the glass
  // line; the car opens toward -z. The player starts the game in it.
  function buildElevator(x, z0) {
    const zf = z0 + 0.2, zb = z0 + 1.85, D = zb - zf, zc = (zf + zb) / 2;
    const add = (parent, m, px, py, pz) => { m.position.set(px, py, pz); parent.add(m); return m; };

    // --- shaft: see-through glass panes + light mullions, open at the top
    const glass = new THREE.MeshStandardMaterial({
      color: 0x3f6f86, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.3, depthWrite: false,
    });
    const top = 2.6, Hs = top - GROUND, yc = (top + GROUND) / 2;
    const zs0 = zf - 0.1, zs1 = zb + 0.15, Ds = zs1 - zs0, zsc = (zs0 + zs1) / 2;
    for (const sx of [-1, 1]) add(scene, new THREE.Mesh(new THREE.BoxGeometry(0.03, Hs, Ds), glass), x + sx * 0.95, yc, zsc);
    add(scene, new THREE.Mesh(new THREE.BoxGeometry(1.9, Hs, 0.03), glass), x, yc, zs1);
    const mullion = 0xc9d3d8;
    for (const [px, pz] of [[-0.95, zs0], [0.95, zs0], [-0.95, zs1], [0.95, zs1]]) {
      add(scene, M.box(0.07, Hs, 0.07, mullion), x + px, yc, pz);
    }
    for (let y = GROUND + 2.5; y <= top + 0.01; y += 2.5) {
      for (const sx of [-1, 1]) add(scene, M.box(0.05, 0.06, Ds, mullion), x + sx * 0.95, y, zsc);
      add(scene, M.box(1.9, 0.06, 0.05, mullion), x, y, zs1);
    }

    // --- landing at office level (fixed): steel frame + threshold
    const steel = { metalness: 0.5, roughness: 0.4 };
    add(scene, M.box(1.0, 0.04, 0.3, 0x3a3d42), x, 0.02, z0 + 0.05);
    for (const sx of [-1, 1]) add(scene, M.box(0.4, 2.6, 0.1, 0xc9cdd1, steel), x + sx * 0.65, 1.3, zf - 0.05);
    add(scene, M.box(0.9, 0.5, 0.1, 0xc9cdd1, steel), x, 2.35, zf - 0.05);

    // --- the car: glass walls on brass frames over walnut kick panels and a
    // marble floor, so you can see who's riding it (and the view from inside)
    const car = new THREE.Group();
    scene.add(car);
    const walnut = 0x5a3520, brass = 0xc9a24a;
    const shiny = { metalness: 0.75, roughness: 0.3 };
    const carGlass = new THREE.MeshStandardMaterial({
      color: 0xdff1f6, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, D), new THREE.MeshStandardMaterial({ map: M.marbleTexture(), roughness: 0.2, metalness: 0.05 }));
    floor.receiveShadow = true;
    add(car, floor, x, 0.02, zc);
    add(car, M.box(1.7, 0.25, D + 0.1, 0x2a2b2e), x, -0.125, zc);                     // underside
    const kick = 0.3, gh = 2.4 - kick;
    for (const sx of [-1, 1]) {
      add(car, M.box(0.04, kick, D, walnut, { roughness: 0.55 }), x + sx * 0.8, kick / 2, zc);         // walnut kick panels
      add(car, new THREE.Mesh(new THREE.BoxGeometry(0.02, gh, D), carGlass), x + sx * 0.8, kick + gh / 2, zc); // glass sides
      add(car, M.box(0.02, 0.03, D - 0.1, brass, shiny), x + sx * 0.775, 0.9, zc);   // brass rail
      add(car, M.box(0.35, 2.4, 0.06, walnut, { roughness: 0.55 }), x + sx * 0.625, 1.2, zf + 0.03); // door jambs
      for (const pz of [zb - 0.02, zc]) add(car, M.box(0.05, 2.4, 0.05, brass, shiny), x + sx * 0.8, 1.2, pz); // brass posts
    }
    add(car, M.box(1.6, kick, 0.04, walnut, { roughness: 0.55 }), x, kick / 2, zb);
    add(car, new THREE.Mesh(new THREE.BoxGeometry(1.6, gh, 0.02), carGlass), x, kick + gh / 2, zb);      // glass back
    add(car, M.box(0.05, 2.4, 0.05, brass, shiny), x, 1.2, zb);
    add(car, M.box(1.2, 0.04, 0.05, brass, shiny), x, 0.95, zb - 0.06);                // handrail
    add(car, M.box(0.9, 0.3, 0.06, walnut, { roughness: 0.55 }), x, 2.25, zf + 0.03);   // door header
    for (const [w, d, px, pz] of [[1.66, 0.05, 0, zb], [1.66, 0.05, 0, zf + 0.03], [0.05, D, -0.8, zc], [0.05, D, 0.8, zc]]) {
      add(car, M.box(w, 0.05, d, brass, shiny), x + px, 2.42, pz);                     // brass cap rail
      add(car, M.box(w, 0.04, d, brass, shiny), x + px, kick, pz);                      // brass sill rail
    }
    // warm cove light just under the cap rail
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
    for (const sx of [-1, 1]) add(car, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, D - 0.1), glow), x + sx * 0.77, 2.36, zc);
    // brass button panel with lit buttons beside the door
    add(car, M.box(0.02, 0.36, 0.14, brass, shiny), x + 0.77, 1.2, zf + 0.3);
    for (let i = 0; i < 4; i++) {
      add(car, new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffb347 : 0xf3e6c4 })), x + 0.757, 1.08 + i * 0.08, zf + 0.3);
    }
    // champagne-brass doors, just inside the car front
    const doors = [-1, 1].map((sx) => {
      const d = add(car, M.box(0.46, 2.08, 0.03, 0xcbb27a, shiny), x + sx * 0.23, 1.05, zf + 0.08);
      d.userData.x = d.position.x;
      d.userData.slide = sx * 0.45;
      return d;
    });
    return { x, z: z0 + 1.2, doors, car };
  }

  function makeStation(key, def, c, r) {
    const { x, z } = toWorld(c, r);
    // face toward an adjacent floor tile (prefer south so interior desks face camera)
    // cubicle desks open sideways onto the aisle; everything else prefers south
    const onDesk = seated.has(`${c},${r}`);
    let dir = [0, 1];
    const order = key === 'C' || key === 'W' || onDesk ? [[-1, 0], [1, 0], [0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const d of order) {
      if (isFloor(c + d[0], r + d[1])) { dir = d; break; }
    }
    const border = r === 0 || r === H - 1 || c === 0 || c === W - 1;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(dir[0], dir[1]);
    scene.add(group);

    let model;
    let slotLocal = new THREE.Vector3(0, 0.87, 0.05);
    switch (onDesk ? 'desk' : key) {
      // a person working at a cubicle; hand-offs go on the desk beside them
      case 'desk': model = M.makeCubicleDesk(false); slotLocal.set(-0.28, 0.89, -0.02); break;
      case 'O': model = M.makeOakTableSegment(); slotLocal.set(0, 0.84, 0.05); break;
      case 'W': model = M.makeCubicleDesk(true); slotLocal.set(0, 0.89, 0.16); break;
      case 'C': model = M.makeCubicleDesk(false); slotLocal.set(0, 0.89, 0.16); break;
      case 'S': model = M.makeServerRack(); slotLocal.set(0, 0.86, 0.5); break;
      case 'J': model = M.makeCoffeeMachine(); break;
      case 'F': model = M.makeCabinet(); slotLocal.set(0, 0.87, 0.55); break;
      case 'R': model = M.makeShredder(); slotLocal.set(0, 0.9, 0); break;
      case 'M': model = M.makeMeetingTable(); slotLocal.set(-0.1, 0.82, 0.1); break;
      case 'D': model = M.makeBoardroomWindow(); slotLocal.set(0, 0.92, 0.1); break;
      default: model = M.makeDesk();
    }
    if (key === 'W' || key === 'C' || onDesk) model.scale.setScalar(DESK_SCALE);
    if (def.regular === 'hacker') model.userData.screen.material = M.matrixScreenMaterial();
    group.add(model);

    // back wall for border stations so the room stays enclosed
    if (border && r === 0) {
      // top edge is glass; line it up with the other top windows
      const win = M.makeWindowWall();
      win.position.set(0, 0, -0.4);
      group.add(win);
    } else if (border && r === H - 1) {
      const win = M.makeWindowWall();
      win.position.set(0, 0, -0.9);
      group.add(win);
    } else if (border && key !== 'D') {
      const h = wallHeight(r) * (r === H - 1 ? 1 : 1);
      const bw = M.box(1, h, 0.22, r === 0 ? 0xd9d4c7 : 0xcfc9ba);
      bw.position.set(0, h / 2, -0.89);
      group.add(bw);
    }

    // NPC behind the desk
    let npc = null;
    if (def.shirt != null || def.regular) {
      npc = def.regular === 'goatee' ? M.makeGoateeGuy()
        : def.regular === 'hacker' ? M.makeHacker()
        : M.makePerson({ shirt: def.shirt });
      if (onDesk) {
        // pulled up to the desk edge facing their monitor, legs under the desk
        const chair = model.userData.chair;
        chair.position.set(0.14, 0, 0.66);
        chair.rotation.y = 0;
        M.seatPerson(npc);
        npc.position.x = 0.14 * DESK_SCALE;
        npc.position.y += 0.02;
        npc.position.z = 0.63 * DESK_SCALE;
        npc.rotation.y = Math.PI;
      } else {
        npc.position.set(0, 0, -0.58);
      }
      group.add(npc);
    }
    const boardroomMiddle = key === 'D' && (
      (charAt(c - 1, r) === 'D' && charAt(c + 1, r) === 'D') || (charAt(c, r - 1) === 'D' && charAt(c, r + 1) === 'D'));
    if (boardroomMiddle) {
      npc = M.makeExec();
      npc.position.set(0, 0, -0.75);
      group.add(npc);
      const tag = M.labelSprite('RJ', 0.17, '#8a6d1d');
      tag.position.set(0, 1.9, -0.75);
      group.add(tag);
      // Patrizia sits on RJ's left (he faces +z, so his left is +x)
      const patrizia = M.makePatrizia();
      patrizia.scale.setScalar(1.05);
      patrizia.position.set(0.7, 0, -0.85);
      // turned in toward each other, still open to the room; game.js animates the chat
      npc.userData.chatAngle = 0.9;
      patrizia.rotation.y = -0.9;
      npc.rotation.y = 0.9;
      npc.userData.chatWith = patrizia.userData.person;
      group.add(patrizia);
      const ptag = M.labelSprite('Patrizia', 0.17, '#8a6d1d');
      ptag.position.set(0.7, 1.9, -0.85);
      group.add(ptag);
    }

    // floating label (only for the first tile of a run of same stations)
    let label = null;
    let icon = null;
    const first = key === 'D' ? boardroomMiddle : onDesk || (charAt(c - 1, r) !== key && charAt(c, r - 1) !== key);
    if (key !== 'C' && key !== 'W' && key !== 'O' && !def.regular && first) {
      let text = def.label;
      if (def.kind === 'dispenser') text = `${def.label} ${ITEMS[def.item].emoji}`;
      if (key === 'D') text = '🏛️ EXEC BOARDROOM — deliver 📁 here';
      if (key === 'M') text = '🗣️ Meeting Room';
      if (key === 'S') text = 'Server Rack 🖥️';
      if (key === 'R') text = 'Shredder 🗑️';
      const bg = def.kind === 'dispenser' ? '#1d2533' : def.kind === 'deliver' ? '#8a6d1d' : '#3a2050';
      // eye-level signage for first person: smaller, hung just above head height
      label = M.labelSprite(text, 0.17, bg);
      const ly = key === 'D' ? 2.2 : 1.85;
      label.position.set(x, ly, z);
      scene.add(label);
    }
    if (def.kind === 'dispenser') {
      icon = M.emojiSprite(ITEMS[def.item].emoji, 0.3);
      if (onDesk) icon.position.set(slotLocal.x, 1.3, slotLocal.z);
      else icon.position.set(0, 1.45, 0.15);
      group.add(icon);
    }

    const toWorldPos = (v) => v.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(group.rotation.y)).add(group.position);
    const slot = toWorldPos(slotLocal);
    // seated people lean out into the aisle, so they get their own small collision circle
    const seat = onDesk && npc ? toWorldPos(npc.position) : null;
    const bump = seat ? { x: seat.x, z: seat.z, r: 0.18 } : null;

    // progress bar (two sprites)
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthTest: false }));
    barBg.scale.set(0.8, 0.12, 1);
    barBg.center.set(0, 0.5);
    barBg.renderOrder = 11;
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x33dd66, depthTest: false }));
    barFg.scale.set(0.76, 0.08, 1);
    barFg.center.set(0, 0.5);
    barFg.renderOrder = 12;
    barBg.position.set(slot.x - 0.4, slot.y + 1.0, slot.z);
    barFg.position.set(slot.x - 0.38, slot.y + 1.0, slot.z);
    barBg.visible = barFg.visible = false;
    scene.add(barBg, barFg);

    return {
      key, def, kind: def.kind, c, r, x, z, dir, group, model, npc, label, icon, slot, bump,
      dispense: def.kind === 'dispenser' ? { item: def.item, label: def.label, lines: def.lines } : null,
      item: null,
      progress: 0,
      overT: 0,
      done: false,
      fire: false,
      fireT: 0,
      extT: 0,
      fireFx: null,
      barBg, barFg,
      chatterT: Math.random() * 2,
    };
  }

  // four small chairs spread evenly along the oak ledge
  const oak = stations.filter((s) => s.key === 'O');
  if (oak.length) {
    const x0 = Math.min(...oak.map((s) => s.x)) - 0.5;
    const x1 = Math.max(...oak.map((s) => s.x)) + 0.5;
    for (let i = 0; i < 4; i++) {
      const ch = M.makeChair();
      ch.scale.setScalar(0.8);
      ch.position.set(x0 + ((i + 0.5) * (x1 - x0)) / 4, 0, oak[0].z + M.OAK_DEPTH / 2 - 0.14); // tucked under
      ch.rotation.y = (Math.random() - 0.5) * 0.1;
      scene.add(ch);
    }
  }

  const tileAt = (x, z) => {
    const c = Math.floor(x + W / 2);
    const r = Math.floor(z + H / 2);
    return { c, r };
  };
  const cell = (c, r) => (r >= 0 && r < H && c >= 0 && c < W ? grid[r][c] : { solid: true });

  return { W, H, grid, stations, spawn, lift, elevator, toWorld, tileAt, cell };
}

// ---------------------------------------------------------------------------
// Corporate carpet: one continuous piece of grey linear "biophilic" broadloom
// (think stone strata / grass striations flowing across the whole office).
// ---------------------------------------------------------------------------
function makeCarpetTexture(W, H) {
  const PX = 128; // canvas pixels per game tile
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d');
  const rand = (a, b) => a + Math.random() * (b - a);

  g.fillStyle = '#a3adb6';
  g.fillRect(0, 0, c.width, c.height);

  // big soft tonal drift so it doesn't look like flat paint
  for (let i = 0; i < 14; i++) {
    const x = rand(0, c.width), y = rand(0, c.height), r = rand(200, 600);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random() < 0.5 ? '200,203,206' : '40,42,46';
    grad.addColorStop(0, `rgba(${tone},${rand(0.03, 0.07)})`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
  }

  // shared flow field: every strand follows the same gentle waves, so the
  // lines read as one organic pattern running the length of the floor
  const f1 = rand(0.0025, 0.004), f2 = rand(0.008, 0.012), p1 = rand(0, 6), p2 = rand(0, 6);
  const flow = (x, y) => Math.sin(x * f1 + p1 + y * 0.002) * 14 + Math.sin(x * f2 + p2 + y * 0.005) * 4;

  const strands = Math.round(c.height / 2.2);
  for (let i = 0; i < strands; i++) {
    const y = rand(-20, c.height + 20);
    const sage = Math.random() < 0.12; // the "biophilic" bit
    const light = Math.random() < 0.5;
    g.strokeStyle = sage
      ? `rgba(104,158,112,${rand(0.3, 0.5)})`
      : light ? `rgba(195,198,201,${rand(0.1, 0.28)})` : `rgba(48,50,54,${rand(0.1, 0.28)})`;
    g.lineWidth = Math.random() < 0.1 ? rand(1.8, 3) : rand(0.5, 1.2);
    // strands fade in and out along their length instead of running edge to edge
    let x = rand(-200, c.width);
    const end = Math.min(c.width + 20, x + rand(150, 900));
    g.beginPath();
    g.moveTo(x, y + flow(x, y));
    for (; x <= end; x += 4) g.lineTo(x, y + flow(x, y));
    g.stroke();
  }

  // fibre noise
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Fire FX (production incidents)
// ---------------------------------------------------------------------------
export function makeFire() {
  const g = new THREE.Group();
  const flames = [];
  const colors = [0xff3300, 0xff7700, 0xffcc00];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.12 + Math.random() * 0.1, 0.5 + Math.random() * 0.4, 6),
      new THREE.MeshBasicMaterial({ color: colors[i % 3], transparent: true, opacity: 0.85 })
    );
    f.position.set((Math.random() - 0.5) * 0.6, 1.1, (Math.random() - 0.5) * 0.6);
    f.userData.phase = Math.random() * 10;
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff6600, 3, 4);
  light.position.y = 1.6;
  g.add(light);
  const tag = M.emojiSprite('🔥', 0.7);
  tag.position.y = 2.2;
  g.add(tag);
  g.userData = { flames, light };
  return g;
}

export function animateFire(fx, t) {
  for (const f of fx.userData.flames) {
    const p = f.userData.phase;
    f.scale.y = 0.7 + Math.sin(t * 12 + p) * 0.3;
    f.position.y = 1.1 + Math.sin(t * 8 + p) * 0.08;
    f.rotation.y = t * 2 + p;
  }
  fx.userData.light.intensity = 2.5 + Math.sin(t * 20) * 0.8;
}
