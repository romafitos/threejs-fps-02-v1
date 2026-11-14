# Kestrel Yard — Freight Terminal 7

A round-based tactical FPS in three.js, built for make.fun's `threejs-fps-02`
bounty. 5v5, two teams, three lanes, two bomb sites, an economy and a buy
menu — Counter-Strike-style, with its own map, art, sounds and names.

## The game

- **Teams:** KESTREL (attackers, amber) vs HARBOR (defenders, teal). You plus
  4 friendly bots against 5 enemy bots.
- **Map:** a dusk freight terminal — A-Long container corridor, Mid crane
  gantry, B-Short warehouse interior. Two bomb sites (A: container stack,
  B: warehouse office), a catwalk, climbable crates, sodium lamps, fog.
- **Rounds:** first to 8, max 15. Round timer 100 s, freeze 3 s, buy 15 s.
  Win by eliminating the enemy team, detonating the planted bomb (40 s fuse),
  or defusing it.
- **Economy:** start $800, kill +$300, round win +$3,250, loss +$1,900 (loss
  streak bonus up to $3,400), plant +$300. Buy menu (B): Longspur AR-9
  $2,700, Tempest-9 SMG $1,500, P9 Sidearm $300, Vapor-9 smoke $400, Kevlar
  armor $650, defuse kit $400 (HARBOR).
- **Gunplay:** hitscan with head x4 / torso x1 / limb x0.75 damage, recoil
  that recovers over 0.4 s, spread that punishes moving and jumping, crouch
  and jump, AABB collision, tracers, impact sparks and decals.
- **Bots:** waypoint routes per lane, hold angles, react to gunfire sound
  within 25 m, rotate on bomb intel, retake and defuse. Aim error scales with
  distance and target speed; fire comes in bursts after a 250–450 ms
  reaction delay. Deterministic seeded RNG per round.
- **Sound:** fully procedural WebAudio — gunshots, reload clicks, plant and
  defuse beeps, round horn, footsteps. Zero audio assets, zero network.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

WASD move, mouse look, click fire, R reload, Space jump, Ctrl crouch,
B buy menu, E hold to plant/defuse, 1–6 buy.

## Screenshots

Deterministic captures, seeded: `?shot=cover`, `?shot=buy`, `?shot=plant`,
`?shot=score` (each with `&seed=1`).

## Layout

- `game/src/main.js` — boot + fixed-step 60 Hz loop
- `game/src/state.js` — the single game-state object, economy, weapon defs
- `game/src/map.js` — the yard: lanes, sites, colliders, waypoints, lighting
- `game/src/player.js` — movement, collision, camera
- `game/src/weapons.js` — guns, recoil, spread, buy menu, view model
- `game/src/combat.js` — hitscan, damage zones, tracers, decals, smoke
- `game/src/bots.js` — bot brains: routes, holds, hearing, retakes
- `game/src/rounds.js` — round phases, economy, plant/defuse, win/loss
- `game/src/audio.js` — procedural WebAudio synth
- `game/src/hud.js` — HUD, buy menu, scoreboard
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/shots.js` — deterministic screenshot staging
- `main.ts` — the entrypoint: copies game/ + screenshots/ to /output and
  writes the dossier with `vendor/makefun-threejs.ts`

## License

MIT — see LICENSE.
