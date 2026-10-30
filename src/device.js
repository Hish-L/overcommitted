// Touch vs keyboard/mouse mode. Starts from the primary pointer and then
// follows whatever the player actually uses (hybrid laptops, BT keyboards).
const listeners = [];
export const device = { touch: false };

export function setTouch(on) {
  if (device.touch === on) return;
  device.touch = on;
  document.body.classList.toggle('touch', on);
  for (const fn of listeners) fn(on);
}

export const onDeviceChange = (fn) => listeners.push(fn);

// The words for an action in on-screen hints, e.g. `hold E` vs `hold 🛠️`
const KEYS = { grab: 'Space', work: 'hold E' };
const TOUCH = { grab: '✋', work: 'hold 🛠️' };
export const keyHint = (action) => (device.touch ? TOUCH : KEYS)[action];

setTouch(matchMedia('(pointer: coarse)').matches);
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
  else if (e.pointerType === 'mouse') setTouch(false);
}, true);
window.addEventListener('keydown', () => setTouch(false), true);
