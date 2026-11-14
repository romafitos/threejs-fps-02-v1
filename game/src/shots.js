// ?shot= capture staging: each mode sets up one deterministic, legible
// scene, runs a few fixed steps, then raises window.__shotReady after two
// painted frames. Shot modes never need pointer lock or a click.
import { WEAPONS, ROUND } from './state.js';

// Stage a mid-round A-Long firefight: the player holds the corridor with
// the rifle, two Harbor bots ahead in the open, a tracer in the air, the
// bomb carrier marked behind the player.
export function stageCover(game) {
  const { state, player } = game;
  state.phase = 'live';
  state.timeLeft = 62;
  state.timer = 62;
  state.score = { kestrel: 3, harbor: 2 };
  player.weapon = 'rifle';
  player.mag = 24;
  player.reserve = 90;
  player.money = 3150;
  player.health = 82;
  player.pos.set(-14, 0, 8);
  player.yaw = 0.45;
  player.pitch = 0.01;
  const harbor = state.players.filter((p) => p.team === 'harbor' && p.alive);
  const kestrel = state.players.filter((p) => p.team === 'kestrel' && !p.isPlayer && p.alive);
  if (harbor[0]) { harbor[0].pos.set(-17, 0, -4); harbor[0].yaw = Math.PI; harbor[0].state = 'fight'; harbor[0].target = player; }
  if (harbor[1]) { harbor[1].pos.set(-19, 0, -11); harbor[1].yaw = Math.PI * 0.9; harbor[1].state = 'fight'; harbor[1].target = player; }
  if (harbor[2]) { harbor[2].pos.set(-12, 0, -14); harbor[2].yaw = Math.PI; }
  if (kestrel[0]) { kestrel[0].pos.set(-12, 0, 2); kestrel[0].yaw = 0; kestrel[0].state = 'fight'; kestrel[0].target = harbor[0]; }
  state.bomb.carrier = kestrel[1] || kestrel[0];
  state.bomb.siteKey = 'A';
  state.killFeed = [
    { text: 'Kestrel-2 Bram → Harbor-3 Quill ✕', at: 0, kill: true },
    { text: 'Harbor-1 Moss → Kestrel-4 Sable', at: 0, kill: false },
  ];
  // One real shot from the player so a tracer + muzzle flash are in frame.
  game.playerFireOnce();
}

// Buy menu open over the yard: money and weapon cards legible.
export function stageBuy(game) {
  const { state, player } = game;
  state.phase = 'buy';
  state.timer = 12;
  state.timeLeft = ROUND.roundSeconds;
  state.score = { kestrel: 1, harbor: 1 };
  player.weapon = 'rifle';
  player.mag = 30;
  player.reserve = 90;
  player.money = 4100;
  player.armor = 0;
  player.pos.set(-6, 0, 18);
  player.yaw = 0.25;
  player.pitch = -0.02;
  window.__buyOpen = true;
  const harbor = state.players.filter((p) => p.team === 'harbor' && p.alive);
  if (harbor[0]) { harbor[0].pos.set(-14, 0, -6); harbor[0].yaw = Math.PI; }
}

// Bomb planted at Site A: fuse counting down, a defuse-kit Harbor bot
// pushing in, the player covering the site.
export function stagePlant(game) {
  const { state, player } = game;
  state.phase = 'planted';
  state.bomb.state = 'planted';
  state.bomb.site = 'A';
  state.bomb.siteKey = 'A';
  state.bomb.fuse = 32;
  state.bomb.defuseProgress = 0.35;
  state.timeLeft = 32;
  state.score = { kestrel: 4, harbor: 4 };
  player.weapon = 'rifle';
  player.mag = 18;
  player.reserve = 60;
  player.money = 2900;
  player.health = 64;
  player.pos.set(-13, 0, -8);
  player.yaw = -0.55;
  player.pitch = 0.0;
  const harbor = state.players.filter((p) => p.team === 'harbor' && p.alive);
  if (harbor[0]) {
    harbor[0].pos.set(-14, 0, -11);
    harbor[0].yaw = Math.PI;
    harbor[0].hasKit = true;
    harbor[0].state = 'defuse';
    state.bomb.defuser = harbor[0];
  }
  if (harbor[1]) { harbor[1].pos.set(-22, 0, -10); harbor[1].yaw = Math.PI * 0.8; }
  state.killFeed = [
    { text: 'YOU → Harbor-2 Fen ✕', at: 0, kill: true },
    { text: 'Kestrel-1 Vex → Harbor-4 Tern ✕', at: 0, kill: true },
  ];
  game.placeBombMesh('A');
}

// Round-end scoreboard: KESTREL leads, kill feed visible.
export function stageScore(game) {
  const { state, player } = game;
  state.phase = 'end';
  state.timer = 4;
  state.round = 9;
  state.winner = 'kestrel';
  state.winReason = 'HARBOR eliminated';
  state.score = { kestrel: 5, harbor: 3 };
  player.weapon = 'smg';
  player.mag = 12;
  player.reserve = 48;
  player.money = 4750;
  player.health = 45;
  player.pos.set(0, 0, 6);
  player.yaw = 0;
  player.pitch = -0.05;
  const p = state.players;
  const set = (name, k, d, money) => {
    const c = p.find((q) => q.name === name);
    if (c) { c.kills = k; c.deaths = d; c.money = money; }
  };
  set('Kestrel-1 Vex', 4, 1, 5200);
  set('Kestrel-2 Bram', 3, 2, 4100);
  set('Kestrel-3 Ilo', 2, 2, 3600);
  set('Kestrel-4 Sable', 1, 3, 2400);
  set('Harbor-1 Moss', 3, 2, 3900);
  set('Harbor-2 Fen', 2, 3, 3100);
  set('Harbor-3 Quill', 1, 3, 2800);
  set('Harbor-4 Tern', 2, 4, 2200);
  set('Harbor-5 Wren', 1, 4, 1900);
  const me = p.find((q) => q.isPlayer);
  if (me) { me.kills = 6; me.deaths = 1; me.money = 4750; }
  state.killFeed = [
    { text: 'YOU → Harbor-5 Wren ✕', at: 0, kill: true },
    { text: 'YOU → Harbor-2 Fen ✕', at: 0, kill: true },
    { text: 'Kestrel-1 Vex → Harbor-4 Tern ✕', at: 0, kill: true },
  ];
}

export const STAGES = { cover: stageCover, buy: stageBuy, plant: stagePlant, score: stageScore };
