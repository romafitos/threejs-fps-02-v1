// Single game-state object: every module reads and writes this one place,
// so the round, the economy, the bomb and the scoreboard can never disagree.
// No module keeps its own copy of the match.
import * as THREE from 'three';

// Deterministic RNG (mulberry32): the same seed replays the same round, so
// ?shot= captures and the bot soak test are reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEAPONS = {
  rifle: { name: 'Longspur AR-9', price: 2700, damage: 34, headMult: 4, rate: 0.11, mag: 30, reserve: 90, spread: 0.0022, auto: true, kick: 0.011, range: 120 },
  smg: { name: 'Tempest-9', price: 1500, damage: 26, headMult: 4, rate: 0.075, mag: 32, reserve: 96, spread: 0.004, auto: true, kick: 0.009, range: 70 },
  pistol: { name: 'P9 Sidearm', price: 300, damage: 28, headMult: 4, rate: 0.22, mag: 12, reserve: 36, spread: 0.003, auto: false, kick: 0.014, range: 60 },
  smoke: { name: 'Vapor-9 Smoke', price: 400, damage: 0, headMult: 1, rate: 1.0, mag: 1, reserve: 0, spread: 0, auto: false, kick: 0, range: 30 },
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossStreakBonus: 500,
  lossStreakCap: 3400,
  plantReward: 300,
  armorPrice: 650,
  kitPrice: 400,
};

export const ROUND = {
  freezeSeconds: 3,
  buySeconds: 15,
  roundSeconds: 100,
  plantSeconds: 3.5,
  fuseSeconds: 40,
  defuseSeconds: 5,
  defuseKitSeconds: 2.5,
  winRounds: 8,
  maxRounds: 15,
  endSeconds: 5,
};

export function freshState() {
  return {
    phase: 'menu', // menu | freeze | buy | live | planted | end
    round: 1,
    score: { kestrel: 0, harbor: 0 },
    lossStreak: { kestrel: 0, harbor: 0 },
    timer: 0,
    timeLeft: ROUND.roundSeconds,
    money: { kestrel: 0, harbor: 0 },
    bomb: { state: 'carried', site: null, fuse: 0, carrier: null, plantProgress: 0, defuseProgress: 0, defuser: null },
    players: [], // one entry per combatant, player first
    killFeed: [],
    events: [], // transient UI events: { kind, text, at }
    winner: null,
    winReason: '',
    rng: makeRng(1),
    seed: 1,
    tick: 0,
    smokeClouds: [], // { pos, radius, until }
    roundLog: [],
  };
}

// A combatant record. Bots and the player share this shape so combat,
// rounds and the HUD treat them identically.
export function makeCombatant(id, team, name, isPlayer, role) {
  return {
    id,
    team, // 'kestrel' | 'harbor'
    name,
    isPlayer,
    role, // carrier | entry | support | anchor | rotator
    alive: true,
    health: 100,
    armor: 0,
    hasKit: false,
    weapon: 'pistol',
    money: ECONOMY.startMoney,
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    kills: 0,
    deaths: 0,
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    vel: new THREE.Vector3(),
    crouched: false,
    onGround: true,
    // bot brain
    waypoint: 0,
    route: [],
    holdUntil: 0,
    reactAt: 0,
    burstLeft: 0,
    burstPause: 0,
    lastShotAt: 0,
    heardAt: 0,
    heardPos: new THREE.Vector3(),
    target: null,
    speed: 4.4,
  };
}
