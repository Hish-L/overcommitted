// ============================================================================
// GAME DATA — every "ingredient", "recipe" (initiative), station and joke.
// Tweak numbers here to rebalance the game.
// ============================================================================

// ---------------------------------------------------------------------------
// INGREDIENTS
// Raw items come from people/divisions. Most must be "cooked" at a station
// before they can go in a Project Folder.
// ---------------------------------------------------------------------------
export const ITEMS = {
  // raw
  apikey:     { name: 'LLM API Key',         emoji: '🔑', color: 0xf5c542, raw: true },
  exploit:    { name: 'Exploit Kit',         emoji: '💣', color: 0x444444, raw: true },
  logs:       { name: 'Raw Logs (4TB)',      emoji: '📜', color: 0xd9c9a3, raw: true },
  draft:      { name: 'Threat Model Draft',  emoji: '📝', color: 0xffffff, raw: true },
  infraticket:{ name: 'Infra Ticket',        emoji: '🎫', color: 0xc6a7ff, raw: true },

  // cooked
  llm:        { name: 'LLM Integration',     emoji: '🤖', color: 0x55d6be },
  weapon:     { name: 'Weaponized Exploit',  emoji: '🗡️', color: 0xe05555 },
  dataset:    { name: 'Clean Dataset',       emoji: '📊', color: 0x4fa3ff },
  threatmodel:{ name: 'Aligned Threat Model',emoji: '🎯', color: 0xff7a59 },
  infra:      { name: 'Provisioned Infra',   emoji: '🖥️', color: 0x8a8fff },
  coffee:     { name: 'Coffee',              emoji: '☕', color: 0x6f4e37 },

  // ruined / special
  scopecreep: { name: 'Scope Creep',         emoji: '🌀', color: 0x7a3fa0, ruined: true },
  folder:     { name: 'Project Folder',      emoji: '📁', color: 0xf0b030, container: true },
  playbook:   { name: 'Incident Response Playbook', emoji: '🧯', color: 0xff3333, tool: true },
};

// What each station turns things into.
export const PROCESS = {
  workstation: { apikey: 'llm', exploit: 'weapon', logs: 'dataset' },
  meeting:     { draft: 'threatmodel' },
  server:      { infraticket: 'infra' },
};

// ---------------------------------------------------------------------------
// STATIONS
//   kind: dispenser | counter | workstation(manual, hold E) | auto (timer) |
//         deliver | trash
// ---------------------------------------------------------------------------
export const STATIONS = {
  K: { kind: 'dispenser', item: 'apikey',      label: 'AI Vendor',      shirt: 0xff66aa,
       lines: ['Here\'s a key. Please don\'t commit it to GitHub.', 'Our model is 100% hallucination-free*', 'Enterprise tier is only $4M/yr!'] },
  X: { kind: 'dispenser', item: 'exploit',     label: 'Pentest Team',   shirt: 0xcc2222,
       lines: ['We popped prod again lol', 'Scope? What scope?', 'Fresh 0-day, still warm.'] },
  L: { kind: 'dispenser', item: 'logs',        label: 'SOC',            shirt: 0x2266cc,
       lines: ['4TB of logs. Mostly DNS.', 'I haven\'t slept since the SIEM migration.', 'Alert #48,211 today. Enjoy.'] },
  T: { kind: 'dispenser', item: 'draft',       label: 'Sec Architect',  shirt: 0x7755cc,
       lines: ['I drew boxes. Now we need a meeting.', 'It depends.', 'Have you considered... zero trust?'] },
  H: { kind: 'dispenser', item: 'infraticket', label: 'IT Helpdesk',    shirt: 0x999999,
       lines: ['Have you tried turning it off and on?', 'Ticket submitted. ETA: Q7.', 'Please use the portal next time.'] },
  J: { kind: 'dispenser', item: 'coffee',      label: 'Coffee',         shirt: null,
       lines: ['*gurgle*', 'Fuel for the backlog.', 'Decaf is out. Forever.'] },
  F: { kind: 'dispenser', item: 'folder',      label: 'PMO Folders',    shirt: 0xe0a020,
       lines: ['Another project? Here\'s a folder.', 'Please update the RAID log.', 'Is this in the roadmap?'] },

  W: { kind: 'workstation', label: 'Dev Workstation', work: 2.6 },

  M: { kind: 'auto', proc: 'meeting', label: 'Meeting Room', time: 6, overrun: 7, ruin: 'scopecreep', shirt: 0x8899aa,
       lines: ['...synergy...', '...let\'s take this offline...', '...circle back...', '...can everyone see my screen?...'] },
  S: { kind: 'auto', proc: 'server',  label: 'Server Rack', time: 5, overrun: 6, ruin: 'fire',
       lines: ['*fans spinning*', '*blinks aggressively*'] },

  D: { kind: 'deliver', label: 'Exec Boardroom' },
  R: { kind: 'trash',   label: 'Shredder' },
  C: { kind: 'counter', label: 'Desk' },
  Y: { kind: 'counter', label: 'Desk', regular: 'goatee' }, // the bald guy by the lift, always there
  h: { kind: 'counter', label: 'Desk', regular: 'hacker' }, // black-hoodie hacker on a matrix terminal, always there
  O: { kind: 'counter', label: 'Oak Table' },
};

// ---------------------------------------------------------------------------
// MAP  (# = wall, . = floor, letters = stations above, @ = player spawn,
//       W = dev workstation desk, B = desk that starts with the Incident Response Playbook,
//       O = oak ledge against the glass, w = white wall, p = two-tier planter,
//       g = automatic glass sliding door where the hot-deskers come in,
//       < = armchair on the right-hand window line, facing into the room,
//       Y = the top-right desk where the goatee guy always sits,
//       h = a desk with a black-hoodie hacker who's always there)
// Every aisle between desk pairs is 2 tiles wide, so people seated on both
// sides never block it.
// Top, right and bottom borders are floor-to-ceiling glass; the left wall holds
// the appliances and the boardroom. Everyone in DESK_STATIONS gets seated at a
// random desk each game; every desk left free is a working dev workstation.
// ---------------------------------------------------------------------------
export const MAP = [
  '#wwwOOOOOOOOOOOOOOOww###',
  'J......................#',
  '#......................#',
  'R..WW..WW..WW..WW..WY..<',
  'D..WW..WW..WW..WW..Wh..#',
  'D..WW..WW..WW..WW..Bh..#',
  'D..WW..WW..WW..WW..Wh..<',
  'S......................#',
  'S.@....................#',
  '##g#MMMpppppppppppppww##',
];

// Stations staffed by a person who sits at a random desk (repeats = more desks).
export const DESK_STATIONS = ['K', 'X', 'L', 'T', 'H', 'F'];

// ---------------------------------------------------------------------------
// INITIATIVES (recipes) — what the higher-ups want. tier unlocks over time.
// ---------------------------------------------------------------------------
export const RECIPES = [
  { name: 'SOC Automation (SOAR)',          needs: ['dataset', 'llm'],                           tier: 0 },
  { name: 'Phishing Simulation Campaign',   needs: ['threatmodel', 'coffee'],                    tier: 0 },
  { name: '"Just Add AI" Rebrand',          needs: ['llm', 'coffee'],                            tier: 0 },
  { name: 'Pentest Engagement',             needs: ['weapon', 'threatmodel'],                    tier: 0 },
  { name: 'AI Code Scanning Harness',       needs: ['llm', 'dataset', 'weapon'],                 tier: 1 },
  { name: 'Offensive Security Harness',     needs: ['weapon', 'llm', 'coffee'],                  tier: 1 },
  { name: 'Deepfake CEO Detector',          needs: ['dataset', 'llm', 'threatmodel'],            tier: 1 },
  { name: 'Zero Trust Rollout',             needs: ['threatmodel', 'infra', 'coffee'],           tier: 1 },
  { name: 'Security Data Lake',             needs: ['dataset', 'infra', 'llm'],                  tier: 1 },
  { name: 'AI Agentic Defense Deployment',  needs: ['llm', 'dataset', 'threatmodel', 'coffee'],  tier: 2 },
  { name: 'Autonomous AI Pentest Platform', needs: ['weapon', 'llm', 'threatmodel', 'dataset'],  tier: 2 },
  { name: 'Single Pane of Glass™',          needs: ['dataset', 'infra', 'llm', 'coffee'],        tier: 2 },
];

export const REQUESTERS = [
  { who: 'CISO',          lines: ['Saw this at RSA. Can we have it by Friday?', 'The board is asking about this.', 'This is a top priority. Like the other 9.'] },
  { who: 'CIO',           lines: ['Gartner says we\'re behind.', 'Can we just use AI for this?', 'Let\'s make this a quick win.'] },
  { who: 'CEO',           lines: ['My nephew says this is easy.', 'I read about this on LinkedIn.', 'Make it disruptive.'] },
  { who: 'VP of Security',lines: ['I promised this in my all-hands.', 'Low effort, high impact, right?', 'No new headcount though.'] },
  { who: 'The Board',     lines: ['Are we secure yet?', 'Please present this in 1 slide.', 'What\'s our cyber score?'] },
  { who: 'Auditor',       lines: ['This is a finding now.', 'We need evidence. Lots of it.', 'Due by end of quarter.'] },
];

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------
export const TUNING = {
  playerSpeed: 4.6,
  dashSpeed: 11,
  dashTime: 0.16,
  dashCooldown: 0.6,
  maxBacklog: 8,             // game over when backlog would exceed this
  startConfidence: 100,
  firstOrderDelay: 1.5,
  spawnStart: 28,            // seconds between new initiatives at start
  spawnMin: 7,               // ...and it only gets worse
  spawnDecay: 0.92,          // multiplier per spawned initiative
  baseTime: 55,              // ticket time = baseTime + perIngredient * n
  perIngredient: 22,
  expirePenalty: 15,         // confidence lost when a ticket goes overdue
  overdueDrain: 0.35,        // confidence/sec per overdue ticket
  wrongPenalty: 6,
  deliverBonus: 6,           // confidence regained on delivery
  fireDrain: 2.0,            // confidence/sec per burning rack
  fireSpreadTime: 12,        // seconds until an unattended fire spreads
  extinguishTime: 1.4,
  tierUnlock: [0, 60, 150],  // seconds into the game each tier unlocks
  chaosStart: 90,
  chaosEvery: [35, 55],
  // office clock + hot-desking
  dayStart: 8 * 60 + 40,     // game starts at 8:40am (minutes after midnight)
  minutesPerSecond: 1,       // one real second = one office minute
  hotDeskStart: 9 * 60,      // hot-deskers start arriving at 9:00am
  hotDeskRush: 4,            // the first few arrive in a quick 9am rush...
  hotDeskEvery: [6, 11],     // ...then one every this-many seconds
  hotDeskKeepFree: [3, 4],   // they stop once only this many workstations are left
};

export const PERFORMANCE_REVIEWS = [
  { min: 0,  title: 'Performance Improvement Plan', text: 'Your manager has scheduled a "quick sync". Bring your badge.' },
  { min: 3,  title: 'Needs Improvement',            text: 'Great energy! Unfortunately energy is not a KPI.' },
  { min: 6,  title: 'Meets Some Expectations',      text: 'You did your best. Your best was put in a Jira backlog.' },
  { min: 10, title: 'Meets Expectations',           text: 'Congrats! Your reward is 14 more initiatives next quarter.' },
  { min: 15, title: 'Exceeds Expectations',         text: 'You\'ve been promoted to manage this chaos. Good luck.' },
  { min: 22, title: 'Cyber Legend',                 text: 'The CISO took credit for all of it at the board meeting.' },
];

export const GAME_OVER_REASONS = {
  backlog:    { title: 'BACKLOG OVERFLOW', text: 'The Jira board achieved sentience and filed a ticket against you.' },
  confidence: { title: 'LEADERSHIP HAS LOST CONFIDENCE', text: 'You\'ve been "reorganized" into a new team called "Special Projects".' },
};
