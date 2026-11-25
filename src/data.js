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
  n: { kind: 'counter', label: 'Desk', regular: 'neat' },   // white shirt, black pants, brown shoes, always there
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
//       h = a desk with a black-hoodie hacker who's always there,
//       n = the desk where the guy in the white shirt always sits)
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
  'R..Wn..WW..WW..WW..WY..<',
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

// ---------------------------------------------------------------------------
// TOWN HALL STATIONS: the only desks open in town hall mode. Each takes over a
// normal station's seat and item (key = which one); every other station closes.
// ---------------------------------------------------------------------------
export const TOWNHALL_STATIONS = {
  X: { label: 'PenTest', lines: ['We popped prod again lol', 'Scope? What scope?', 'Fresh 0-day, still warm.'] },
  T: { label: 'SBD',     lines: ['Did anyone threat model this?', 'Secure by design, not by accident.', 'Have you considered... zero trust?'] },
  K: { label: 'AppSec',  lines: ['Your dependencies have dependencies.', 'SAST found 9,000 issues. Most are real.', 'Please stop committing secrets.'] },
  L: { label: 'DCA',     lines: ['Here you go. Don\'t lose it.', 'Another one? Sure.', 'It\'s in the system now.'] },
};

// ---------------------------------------------------------------------------
// TOWN HALL DEMO: placeholder achievements (made up), delivered in this order
// (PenTest opens with two, then the teams take turns). `from` is the town hall desk that hands it over:
//   K AppSec · X PenTest · T SBD · L DCA
// `story` is the line told in the big pop-up before the ticket flies up to the
// top of the screen (leave it out for a plain ticket).
// ---------------------------------------------------------------------------
export const TOWNHALL_TICKETS = [
  { name: 'Build the Hydra Scanner',          from: 'X', story: 'The robots are coming! Build a scanner before they find us first.' },
  { name: 'Pentest 120 shiny apps',           from: 'X', story: 'Poke every internet-facing app before someone less friendly does.' },
  { name: 'Train 30 Code Champions',          from: 'K', story: 'Turn 30 developers into champions who think security first.' },
  { name: 'Launch the Blueprint Program',     from: 'T', story: 'Get secure patterns into every new design before it ships.' },
  { name: 'Clear the vulnerability mountain', from: 'L', story: 'The criticals are stacking up. Clear the pile before it topples.' },
  { name: '250 pentest engagements',          from: 'X', story: 'Go-live season! Get every launch tested before the deadline.' },
  { name: 'Swap the scanner',                 from: 'K', story: 'Urgent: bolt automated security checks straight into the pipelines.' },
  { name: 'Sunset the legacy platform',       from: 'T', story: 'Retire the old platform, ahead of schedule for once.' },
  { name: 'Halve the overdue tickets',        from: 'L', story: 'Take back control of governance and wipe half the overdue items.' },
  { name: 'Shields up on every app',          from: 'K', story: 'Quick! Switch on the baseline defences for every public app.' },
  { name: 'Ship the first helper bot',        from: 'T', story: 'Launch the very first AI helper bot into production.' },
  { name: 'Shine a light on encryption',      from: 'L', story: 'Find out where all the keys and certificates actually live.' },
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
  storyHold: 7,              // town hall: seconds a story ticket stays popped up mid-screen before it joins the queue
  startConfidence: 100,
  firstOrderDelay: 1.5,
  // town hall warm-up: [secs before the first story, secs after each story docks before its
  // interruption (calm first, then quicker), secs of quiet between stories]
  townhallWarmup: [6, [15, 8, 4], 4],
  townhallTimeLimit: 270,    // town hall: the demo ends on the achievements screen at 4:30
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
  plantsEvent: false,        // plant-watering distraction on/off
  choreDrain: 0.25,          // confidence/sec per unwatered planter / unshredded paper pile
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
  townhall:   { title: '🏆 WHAT A YEAR', text: 'Look at everything that shipped. Thank you SCA for all your hard work!' },
  confidence: { title: 'LEADERSHIP HAS LOST CONFIDENCE', text: 'You\'ve been "reorganized" into a new team called "Special Projects".' },
};
