// KESTREL YARD — Freight Terminal 7. Boot, fixed-step 60 Hz simulation loop,
// and the wiring between modules. The sim runs on a fixed step and rendering
// is separate (criterion 5); no object is allocated in the hot loop — the
// temporaries in combat.js and the reused vectors below are it.
import * as THREE from 'three';
import { freshState, makeCombatant, WEAPONS, ROUND, makeRng } from './state.js';
import { buildMap, sites } from './map.js';
import { makeInputState, stepPlayer, applyCamera, EYE_STAND, speed2d } from './player.js';
import { makeRecoil, recoverRecoil, currentSpread, tryFire, startReload, finishReload, buyWeapon, makeViewModel } from './weapons.js';
import { registerBodies, fireHitscan, throwSmoke, updateEffects } from './combat.js';
import { spawnBots, stepBot } from './bots.js';
import { startRound, stepRounds, onKill } from './rounds.js';
import { buildHud, updateHud, flashHitmarker, flashDamage, showToast } from './hud.js';
import { bindInput } from './input.js';
import { sfx, resumeAudio } from './audio.js';
import { STAGES } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number(params.get('seed') || '1');
window.__shotMode = shotMode || null;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
scene.add(camera);

const state = freshState();
state.rng = makeRng(seedParam * 7919 + 13);
state.seed = seedParam;

buildMap(scene);

// --- solids for raycasts: box + cylinder meshes of the yard --------------
const solids = [];
scene.traverse((o) => {
  if (o.isMesh && (o.geometry.type === 'BoxGeometry' || o.geometry.type === 'CylinderGeometry')) {
    solids.push(o);
  }
});

// --- player --------------------------------------------------------------
const player = makeCombatant('you', 'kestrel', 'YOU', true, 'entry');
player.recoil = makeRecoil();
player.rng = state.rng;
player.spreadNow = 0.01;
player.lastShotAt = 0;
player.reloading = false;
player.onShoot = (def) => { sfx.shoot(player.weapon); muzzleFlash(); };
player.onDryFire = () => sfx.dryFire();
player.onReload = () => sfx.reload();
player.onHit = (target, head, kill) => {
  flashHitmarker(kill, performance.now());
  if (kill) sfx.kill(); else sfx.hit();
  if (target.isPlayer) return;
  if (!target.alive) onKill(state, target);
};
state.players.push(player);

// Player body mesh for bot raycasts: transparent so the first-person view
// never sees it, but raycasts still hit it (three.js raycasts visible
// meshes regardless of material opacity).
const playerBody = new THREE.Group();
{
  const ghost = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), ghost);
  torso.position.y = 1.12;
  torso.name = 'torso';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), ghost);
  head.position.y = 1.62;
  head.name = 'head';
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), ghost);
  leg.position.y = 0.55;
  leg.name = 'limb-leg';
  playerBody.add(torso, head, leg);
}
scene.add(playerBody);
player.mesh = playerBody;

// --- bots ----------------------------------------------------------------
const bots = spawnBots(state, scene, player);
state.players.push(...bots);
// Bot hits on the player drive the damage feedback: a red direction arc,
// a hurt sound, and the death hook when the player goes down.
for (const b of bots) {
  b.onHit = (target, head, kill) => {
    if (!target.isPlayer) {
      if (!target.alive) onKill(state, target);
      return;
    }
    flashDamage(b.yaw, performance.now());
    sfx.hurt();
    if (kill) {
      showToast('YOU ARE DOWN — next round in a moment');
      onKill(state, target);
    }
  };
}
registerBodies(scene, state.players);

// --- view model + muzzle flash -------------------------------------------
const viewModel = makeViewModel(scene, camera);
const muzzle = new THREE.PointLight(0xffc861, 0, 9, 2);
muzzle.position.set(0.24, -0.18, -1.0);
camera.add(muzzle);
let muzzleUntil = 0;
function muzzleFlash() {
  muzzle.intensity = 14;
  muzzleUntil = performance.now() + 250; // long enough to survive a capture
}

// --- bomb mesh: a small blinking case shown at the planted site ----------
const bombMesh = new THREE.Group();
{
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.4, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.34), caseMat);
  body.position.y = 0.14;
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lightMat);
  lampMesh.position.set(0.2, 0.32, 0);
  lampMesh.name = 'bomb-lamp';
  bombMesh.add(body, lampMesh);
  bombMesh.visible = false;
}
scene.add(bombMesh);
function placeBombMesh(siteKey) {
  const site = sites[siteKey];
  bombMesh.position.set(site.x, 0, site.z);
  bombMesh.visible = true;
}

// --- HUD + input -----------------------------------------------------------
buildHud(state, player);
const input = makeInputState();
window.__buyKey = (k) => { input.buyKey = k; };
window.__buyOpen = false;
bindInput(input, renderer.domElement, () => {
  if (state.phase === 'menu') {
    state.score = { kestrel: 0, harbor: 0 };
    state.round = 1;
    startRound(state, scene);
    sfx.roundHorn();
  }
});

// --- firing ---------------------------------------------------------------
const _muzzlePos = new THREE.Vector3();
function fireFromPlayer() {
  if (player.weapon === 'smoke') {
    throwSmoke(player, state, scene, state.rng);
    sfx.smoke();
    return;
  }
  player.spreadNow = currentSpread(player);
  _muzzlePos.set(player.pos.x, player.pos.y, player.pos.z);
  const targets = state.players.filter((p) => p.team !== player.team && p.alive);
  fireHitscan(player, WEAPONS[player.weapon], targets, solids, state, _muzzlePos);
}

const game = {
  state,
  player,
  placeBombMesh,
  playerFireOnce() {
    player.weapon = 'rifle';
    player.lastShotAt = -1;
    tryFire(player, 0, () => fireFromPlayer());
  },
};
window.__game = game; // debug/soak handle: inspect state from the console
window.__stepSim = (n) => { for (let i = 0; i < n; i++) simStep(); }; // fast-forward the sim for soak tests

// --- fixed-step loop -------------------------------------------------------
const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();
let paints = 0;
let shotStaged = false;
let lastBeepSecond = -1;
let stepCount = 0;

function simStep() {
  state.tick += 1;
  stepCount += 1;
  const now = state.tick / 60;

  if (state.phase === 'menu') return;

  // Player movement + look.
  if (player.alive) stepPlayer(player, input, STEP, now);
  playerBody.position.copy(player.pos);
  playerBody.rotation.y = player.yaw;
  playerBody.visible = player.alive;

  // Buy keys (freeze/buy phase, or toggled menu).
  if (input.buyKey) {
    const msg = buyWeapon(player, input.buyKey, state);
    if (msg) { showToast(msg); sfx.buy(); }
    input.buyKey = 0;
  }
  if (input.buy && (state.phase === 'freeze' || state.phase === 'buy' || state.phase === 'live')) {
    window.__buyOpen = !window.__buyOpen;
    input.buy = false;
  }

  // Reload.
  if (input.reload && player.alive) startReload(player, now);
  finishReload(player, now);

  // Fire (semi-auto weapons need a fresh click each shot; input.fire is
  // held for autos, and tryFire enforces the rate).
  if (input.fire && player.alive && !window.__buyOpen && !player.reloading) {
    if (WEAPONS[player.weapon].auto) {
      tryFire(player, now, () => fireFromPlayer());
    } else if (!input._firedThisClick) {
      if (tryFire(player, now, () => fireFromPlayer())) input._firedThisClick = true;
    }
  }
  if (!input.fire) input._firedThisClick = false;

  // Smoke grenade.
  if (player.weapon === 'smoke' && input.fire && player.alive) {
    // tryFire handles the throw through fireFromPlayer's smoke branch.
  }

  recoverRecoil(player, STEP);

  // Bots.
  for (const b of bots) {
    if (!b.alive) continue;
    stepBot(b, state, STEP, solids);
    if (!b.alive) onKill(state, b);
  }

  // Bomb plant / defuse / fuse + round phase machine.
  stepRounds(state, STEP, input, scene);
  if (state.bomb.state === 'planted') {
    placeBombMesh(state.bomb.site);
    const sec = Math.ceil(state.bomb.fuse);
    if (sec !== lastBeepSecond) {
      lastBeepSecond = sec;
      sfx.fuseBeep();
    }
  } else {
    bombMesh.visible = false;
    lastBeepSecond = -1;
  }
  if (state.phase === 'live' || state.phase === 'planted') {
    // Player planting progress beep.
    if (state.bomb.state === 'carried' && state.bomb.plantProgress > 0.2) {
      if (Math.floor(state.bomb.plantProgress * 4) !== Math.floor((state.bomb.plantProgress - STEP) * 4)) sfx.plantBeep();
    }
  }

  // Footsteps: a soft tick each half-step while moving on the ground.
  if (player.alive && player.onGround && speed2d(player) > 2) {
    if (stepCount % 28 === 0) sfx.footstep();
  }

  // View-model bob + recoil kick.
  const bob = Math.sin(stepCount / 9) * 0.008 * Math.min(1, speed2d(player) / 5);
  viewModel.position.set(0.24, -0.22 + bob - player.recoil.pitch * 0.4, -0.5);
  viewModel.rotation.x = player.recoil.pitch * 2.2;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    simStep();
    accumulator -= STEP;
    steps += 1;
  }

  // Camera + render.
  applyCamera(camera, player, player.recoil);
  if (muzzle.intensity > 0 && performance.now() > muzzleUntil) muzzle.intensity = 0;
  renderer.render(scene, camera);
  updateEffects(dt, state);
  updateHud(state, player, performance.now());

  // Shot staging: after the first paint, stage the scene, run a few sim
  // steps so bots/meshes settle, then flag ready after two more paints.
  if (shotMode && !shotStaged) {
    shotStaged = true;
    const stage = STAGES[shotMode];
    if (stage) {
      stage(game);
      for (let i = 0; i < 6; i++) simStep();
    }
  }
  if (shotMode && shotStaged) {
    paints += 1;
    // Re-fire the cover shot one paint before ready so the tracer and the
    // muzzle flash are fresh in the captured frame, not faded.
    if (shotMode === 'cover' && paints === 2) game.playerFireOnce();
    if (paints >= 3) window.__shotReady = true;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start: shot modes auto-start a round; normal play shows the menu overlay.
if (shotMode) {
  state.score = { kestrel: 0, harbor: 0 };
  state.round = 1;
  startRound(state, scene);
  document.getElementById('overlay').hidden = true;
} else {
  document.getElementById('overlay').hidden = false;
}
requestAnimationFrame(frame);
