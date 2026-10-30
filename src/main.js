import * as THREE from 'three';
import './style.css';
import { buildWorld } from './world.js';
import { buildCity } from './city.js';
import { MAP } from './data.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';
import { MenuHeroes } from './menuHeroes.js';
import { device } from './device.js';
import { TouchControls } from './touch.js';

// ---------------------------------------------------------------- scene --
// phones: fewer pixels and a smaller shadow map keep it smooth and cool
const mobile = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft PCF was removed; blur comes from shadow.radius
// Neutral keeps base colours true (ACES washes them out and darkens them)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb4bac4);
scene.fog = new THREE.Fog(0xb4bac4, 140, 700);

const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 3000);
camera.rotation.order = 'YXZ';

const world = buildWorld(scene, { shadowSize: mobile ? 1024 : 2048 });
const city = buildCity(scene, MAP[0].length, MAP.length);
const ui = new UI(camera);
const game = new Game({ scene, world, ui, camera });
const heroes = new MenuHeroes(document.getElementById('menu-heroes'));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  for (const cam of [camera, game.view.camera]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);
resize();

// --------------------------------------------------------- mouse look --
const canvas = renderer.domElement;
const locked = () => document.pointerLockElement === canvas;
const lockPointer = () => {
  if (!locked() && !device.touch) canvas.requestPointerLock?.()?.catch?.(() => {});
};
const unlockPointer = () => {
  if (locked()) document.exitPointerLock();
};
let unlockedAt = 0;
document.addEventListener('pointerlockchange', () => {
  if (locked()) return;
  unlockedAt = performance.now();
  // browser took the mouse back: pause on Esc like any FPS, but keep
  // running if it was just the window losing focus (blur fires around
  // the same time, so check once things settle)
  setTimeout(() => {
    if (game.state === 'playing' && !locked() && document.hasFocus()) setPaused(true);
  }, 100);
});
document.addEventListener('mousemove', (e) => {
  if (locked()) game.look(e.movementX, e.movementY);
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing' || game.state === 'intro') lockPointer();
});

// ---------------------------------------------------------------- input --
const down = new Set();
const pressed = new Set();
const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (e) => {
  if (BLOCK.has(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => down.clear());

const touch = new TouchControls({
  pressed,
  onLook: (dx, dy) => game.look(dx, dy),
  onPause: () => setPaused(true),
  onSkip: () => game.skipIntro(),
});
const input = {
  down: (c) => down.has(c) || touch.down.has(c),
  pressed: (c) => pressed.has(c),
  move: () => touch.move,
};

// phone things: pause when the app goes to the background, and stop iOS
// pinch-zooming the page
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
const portrait = matchMedia('(orientation: portrait)');
const goFullscreen = () => {
  if (!device.touch || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
};

// ------------------------------------------------------------- screens --
const $ = (s) => document.querySelector(s);
function startGame() {
  sfx.unlock();
  goFullscreen();
  ui.clearWorldText();
  ui.show('#menu', false);
  ui.show('#gameover', false);
  ui.show('#pause', false);
  ui.show('#guide', false);
  ui.show('#hud', false); // shown once the intro fly-in lands
  game.start();
  lockPointer();
}
function setPaused(p) {
  if (game.state === 'playing' && p) game.state = 'paused';
  else if (game.state === 'paused' && !p) game.state = 'playing';
  ui.show('#pause', game.state === 'paused' && $('#guide').classList.contains('hidden'));
  if (game.state === 'playing') lockPointer();
  else unlockPointer();
}
function toggleGuide() {
  const open = $('#guide').classList.contains('hidden');
  ui.show('#guide', open);
  if (game.state === 'playing' || game.state === 'paused') {
    if (open) { game.state = 'paused'; ui.show('#pause', false); }
    else game.state = 'playing';
  }
  if (game.state === 'playing') lockPointer();
  else unlockPointer();
}

$('#btn-start').onclick = startGame;
$('#btn-restart').onclick = startGame;
$('#btn-resume').onclick = () => {
  goFullscreen();
  setPaused(false);
};
function toggleMute() {
  sfx.toggleMute();
  $('#mute').textContent = sfx.muted ? '🔇' : '🔊';
  $('#btn-mute').textContent = sfx.muted ? '🔇 Sound off' : '🔊 Sound on';
}
$('#btn-mute').onclick = toggleMute;
$('#btn-quit').onclick = () => {
  game.state = 'menu';
  unlockPointer();
  ui.clearWorldText();
  ui.show('#pause', false);
  ui.show('#hud', false);
  ui.show('#menu', true);
};
for (const b of document.querySelectorAll('.btn-guide')) b.onclick = toggleGuide;
$('#btn-guide-close').onclick = toggleGuide;

// ----------------------------------------------------------------- loop --
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());

  if (pressed.has('Tab')) toggleGuide();
  // (ignore the Esc that the browser already used to release the mouse)
  if ((pressed.has('Escape') && performance.now() - unlockedAt > 250) || pressed.has('KeyP')) {
    if (!$('#guide').classList.contains('hidden')) toggleGuide();
    else setPaused(game.state === 'playing');
  }
  if (pressed.has('KeyM')) toggleMute();
  if (device.touch && portrait.matches) setPaused(true);
  if (pressed.has('Enter') && (game.state === 'menu' || game.state === 'over')) startGame();
  else if (game.state === 'intro' && (pressed.has('Enter') || pressed.has('Space'))) game.skipIntro();

  city.update(performance.now() / 1000);
  touch.update(game, device.touch && (game.state === 'playing' || game.state === 'intro'));
  game.update(dt, input);
  if (game.state !== 'menu') ui.render(game, game.state === 'playing' ? dt : 0);
  if (game.state === 'over') unlockPointer();
  renderer.render(scene, camera);
  if (game.state === 'menu') heroes.render(performance.now() / 1000);
  // held item on top of everything (its own scene, depth cleared)
  if (game.held && game.state !== 'menu') {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(game.view.scene, game.view.camera);
    renderer.autoClear = true;
  }
  pressed.clear();
  requestAnimationFrame(frame);
}
frame();

// handy for debugging from the console
window.__game = game;
