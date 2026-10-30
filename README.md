# OVERCOMMITTED — A Cyber Division Simulator

An Overcooked-style game built with Three.js. Leadership keeps coming up with security initiatives, you're
the only engineer, and the asks never stop. Eventually the backlog wins. It always does.

## Run it

```bash
npm install
npm run dev        # open the URL it prints (http://localhost:5173)
npm run build      # static build in dist/ (host it anywhere)
```

## How to play

| Key | Action |
| --- | --- |
| Mouse | Look around (click the game to capture the mouse) |
| WASD | Move / strafe |
| ← / → | Turn (if you'd rather not use the mouse) |
| Space | Grab / place / talk to people |
| E (hold) | Work at a Dev Workstation, or fight a fire with the Playbook |
| Shift | Dash |
| Tab | Field Guide (shows how every deliverable is made) |
| P / Esc | Pause (Esc also releases the mouse) · M mute |

1. Initiative tickets show up at the top. Each one lists the deliverables it needs.
2. Get raw inputs from people (AI Vendor, Red Team, SOC, Architect, GRC, IT Helpdesk, Printer, Coffee).
3. Process them. **Dev Workstations** need you to hold E. **Meeting Room / Legal / Finance / Server Racks** run on their own.
4. Take a **Project Folder** from the PMO and put the finished deliverables in it.
5. Hand the folder in at the **Exec Boardroom**.

**Hot-desking:** the day starts at 8:40 AM with every desk free. From 9:00 AM, colleagues step out of the
lift and permanently claim workstations until only 3–4 are left, so plan where you work. They never take a
desk with your stuff on it, one that's on fire, or one you're standing at.

**Ways to fail:** meetings that run too long turn into 🌀 Scope Creep. Infra left sitting on a rack
catches 🔥 fire. Overdue tickets stay in the backlog and drain Leadership Confidence. Open asks beyond 8
means game over.

**Chaos events:** Production Incidents, Reply-All Storms, Reorgs (two teams swap desks), Surprise Audits
and Mandatory Security Training.

## Customizing

Everything that makes it funny lives in `src/data.js`:
- `RECIPES`: the initiatives and what each one needs
- `ITEMS` / `PROCESS`: the deliverables and which station turns what into what
- `STATIONS`: the people/teams, along with their lines
- `MAP`: the office layout in ASCII (each letter is a station)
- `TUNING`: difficulty (how fast ideas show up, timers, penalties)
- `REQUESTERS`, `PERFORMANCE_REVIEWS`, `GAME_OVER_REASONS`: the jokes

## Code layout

- `src/main.js`: renderer, camera auto-framing, input, game loop
- `src/game.js`: game rules (player, carrying, stations, orders, chaos, scoring)
- `src/world.js`: builds the office from the map
- `src/models.js`: low-poly meshes built from primitives (no asset files)
- `src/ui.js` + `index.html` + `src/style.css`: HUD and menus
- `src/audio.js`: synth sound effects through WebAudio
