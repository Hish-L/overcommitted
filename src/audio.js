// Tiny synth sound effects via WebAudio — no asset files.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = 'square', vol = 0.06, when = 0, slide = 0) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock: () => ac(),
  toggleMute: () => (muted = !muted),
  get muted() { return muted; },
  pickup: () => tone(520, 0.07, 'square', 0.04, 0, 200),
  drop: () => tone(360, 0.07, 'square', 0.04, 0, -120),
  type: () => tone(900 + Math.random() * 400, 0.025, 'square', 0.015),
  done: () => { tone(660, 0.08, 'triangle', 0.07); tone(990, 0.12, 'triangle', 0.07, 0.08); },
  deliver: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.08)); },
  wrong: () => { tone(200, 0.25, 'sawtooth', 0.06, 0, -80); },
  email: () => { tone(880, 0.08, 'sine', 0.08); tone(1320, 0.12, 'sine', 0.06, 0.09); },
  overdue: () => { tone(300, 0.2, 'sawtooth', 0.06); tone(220, 0.3, 'sawtooth', 0.06, 0.2); },
  alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 600 : 800, 0.15, 'square', 0.05, i * 0.16); },
  shred: () => tone(120, 0.3, 'sawtooth', 0.05, 0, 60),
  ruin: () => tone(400, 0.4, 'sine', 0.06, 0, -300),
  dash: () => tone(250, 0.08, 'sine', 0.04, 0, 300),
  gameover: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.08, i * 0.3)); },
};
