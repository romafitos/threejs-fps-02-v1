// Bots: 5v5 with roles, a waypoint graph per lane, and a small state machine.
//   advance along the lane -> hold an angle -> react to gunfire sound ->
//   rotate on bomb intel -> retake / defuse.
// Aim error scales with distance and target speed; fire comes in bursts
// with a 250–450 ms reaction delay, so fights are readable, not instant.
import * as THREE from 'three';
import { PALETTE, mat, box } from './palette.js';
import { waypoints, collideCircle, losBlocked } from './map.js';
import { WEAPONS } from './state.js';
import { fireHitscan } from './combat.js';

const BOT_NAMES = {
  kestrel: ['Kestrel-1 Vex', 'Kestrel-2 Bram', 'Kestrel-3 Ilo', 'Kestrel-4 Sable'],
  harbor: ['Harbor-1 Moss', 'Harbor-2 Fen', 'Harbor-3 Quill', 'Harbor-4 Tern', 'Harbor-5 Wren'],
};

const _toTarget = new THREE.Vector3();
const _eye = new THREE.Vector3();

// A low-poly soldier: torso, head, limbs, weapon, team chevron above the
// head so teams read at a glance in screenshots.
export function makeBotMesh(team) {
  const group = new THREE.Group();
  const suit = mat(team === 'kestrel' ? 0x6b4a22 : 0x1f4a48, 0.85, 0.1);
  const skin = mat(0xc9a586, 0.8, 0.05);
  const accent = mat(team === 'kestrel' ? PALETTE.amber : PALETTE.teal, 0.6, 0.2);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  torso.name = 'torso';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  head.name = 'head';
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), accent);
  helmet.position.y = 1.78;
  helmet.name = 'head';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), suit);
  legL.position.set(-0.14, 0.55, 0);
  legL.name = 'limb-leg';
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), suit);
  armL.position.set(-0.34, 1.15, 0.1);
  armL.name = 'limb-arm';
  const armR = armL.clone();
  armR.position.x = 0.34;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), mat(0x14161a, 0.5, 0.6));
  gun.position.set(0.2, 1.25, -0.3);
  gun.name = 'torso';
  // Team chevron: a small floating diamond above the head.
  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.3, 4),
    new THREE.MeshBasicMaterial({ color: team === 'kestrel' ? PALETTE.amber : PALETTE.teal }),
  );
  chevron.position.y = 2.15;
  chevron.rotation.y = Math.PI / 4;
  chevron.name = 'marker';
  group.add(torso, head, helmet, legL, legR, armL, armR, gun, chevron);
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

export function spawnBots(state, scene, player) {
  const bots = [];
  const rng = state.rng;
  const kestrelRoles = ['carrier', 'entry', 'entry', 'support'];
  const harborRoles = ['anchor', 'anchor', 'rotator', 'rotator', 'anchor'];
  for (let i = 0; i < 4; i++) {
    bots.push(makeBot(state, 'kestrel', BOT_NAMES.kestrel[i], kestrelRoles[i], i, scene, rng));
  }
  for (let i = 0; i < 5; i++) {
    bots.push(makeBot(state, 'harbor', BOT_NAMES.harbor[i], harborRoles[i], i, scene, rng));
  }
  return bots;
}

function makeBot(state, team, name, role, index, scene, rng) {
  const c = {
    id: `${team}-${index}`,
    team,
    name,
    isPlayer: false,
    role,
    alive: true,
    health: 100,
    armor: 0,
    hasKit: false,
    weapon: 'rifle',
    money: 800,
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    kills: 0,
    deaths: 0,
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    vel: new THREE.Vector3(),
    crouched: false,
    onGround: true,
    waypoint: 0,
    route: [],
    holdUntil: 0,
    reactAt: 0,
    burstLeft: 0,
    burstPause: 0,
    lastShotAt: 0,
    heardAt: -999,
    heardPos: new THREE.Vector3(),
    target: null,
    speed: 4.4,
    rng,
    recoil: { pitch: 0, yaw: 0 },
    spreadNow: 0.01,
    reloading: false,
    reloadUntil: 0,
    state: 'advance', // advance | hold | fight | rotate | plant | defuse | retake
  };
  c.mesh = makeBotMesh(team);
  scene.add(c.mesh);
  return c;
}

// Assign each bot its lane route at round start. Kestrel pushes A/Mid/B;
// Harbor anchors hold their site, rotators sit mid and swing on intel.
export function assignRoutes(state, bots) {
  const rng = state.rng;
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.team === 'kestrel') {
      if (b.role === 'carrier') b.route = waypoints.kestrelA;
      else if (b.role === 'entry') b.route = rng() < 0.5 ? waypoints.kestrelMid : waypoints.kestrelB;
      else b.route = rng() < 0.5 ? waypoints.kestrelA : waypoints.kestrelMid;
    } else {
      if (b.role === 'anchor') b.route = rng() < 0.5 ? waypoints.harborA : waypoints.harborB;
      else b.route = waypoints.harborMid;
    }
    b.waypoint = 0;
    b.state = b.team === 'harbor' && b.role === 'anchor' ? 'hold' : 'advance';
    b.holdUntil = state.tick + Math.floor(rng() * 120);
  }
}

function nearestEnemy(b, state) {
  let best = null;
  let bestD = Infinity;
  for (const p of state.players) {
    if (p.team === b.team || !p.alive) continue;
    const d = b.pos.distanceTo(p.pos);
    if (d < bestD) { bestD = d; best = p; }
  }
  return { enemy: best, dist: bestD };
}

function canSee(b, target, state) {
  if (!target) return false;
  const d = b.pos.distanceTo(target.pos);
  if (d > 46) return false;
  if (losBlocked(b.pos.x, b.pos.z, target.pos.x, target.pos.z)) return false;
  // Smoke clouds block sight: a cloud between the two ends the line.
  for (const cloud of state.smokeClouds) {
    if (state.tick > cloud.until) continue;
    const mx = (b.pos.x + target.pos.x) / 2;
    const mz = (b.pos.z + target.pos.z) / 2;
    if (Math.hypot(mx - cloud.pos.x, mz - cloud.pos.z) < cloud.radius) return false;
  }
  // Field of view: ~110 degrees in front.
  _toTarget.copy(target.pos).sub(b.pos).normalize();
  const facing = new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
  return _toTarget.dot(facing) > -0.15 || d < 6;
}

function moveToward(b, x, z, dt, speed) {
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) return true;
  const step = Math.min(d, speed * dt);
  b.pos.x += (dx / d) * step;
  b.pos.z += (dz / d) * step;
  collideCircle(b.pos, 0.38, 0);
  b.yaw = Math.atan2(-dx, -dz);
  b.vel.set((dx / d) * speed, 0, (dz / d) * speed);
  return false;
}

// One bot tick (fixed step). Returns nothing; writes into b and state.
export function stepBot(b, state, dt, solids) {
  if (!b.alive) {
    if (b.mesh) { b.mesh.visible = false; }
    return;
  }
  const now = state.tick / 60;
  const { enemy, dist } = nearestEnemy(b, state);
  const sees = canSee(b, enemy, state);
  if (sees && enemy) {
    b.target = enemy;
    if (b.state !== 'fight') {
      b.reactAt = state.tick + Math.floor((250 + b.rng() * 200) / 1000 * 60);
      b.state = 'fight';
    }
  } else if (b.state === 'fight' && !sees) {
    b.target = null;
    b.state = b.team === 'harbor' ? 'hold' : 'advance';
  }

  // Hearing: a recent gunshot within 25 m turns the bot toward it.
  if (state.tick - b.heardAt < 90 && b.state !== 'fight') {
    _toTarget.copy(b.heardPos).sub(b.pos);
    if (_toTarget.length() > 1) {
      b.yaw = Math.atan2(-_toTarget.x, -_toTarget.z);
    }
  }

  // Bomb intel: on plant, Harbor rotates to the planted site; whoever
  // carries the bomb pushes to its site and plants.
  if (state.bomb.state === 'planted' && b.team === 'harbor') {
    if (b.state !== 'retake' && b.state !== 'defuse') {
      b.state = 'retake';
      b.route = state.bomb.site === 'A' ? waypoints.rotateA : waypoints.rotateB;
      b.waypoint = 0;
    }
  }
  if (state.bomb.state === 'carried' && state.bomb.carrier === b && b.team === 'kestrel') {
    const site = state.bomb.siteKey || 'A';
    const target = site === 'A' ? waypoints.kestrelA : waypoints.kestrelB;
    b.route = target;
  }

  switch (b.state) {
    case 'advance': {
      const wp = b.route[b.waypoint];
      if (!wp) { b.state = 'hold'; b.holdUntil = state.tick + 180; break; }
      if (moveToward(b, wp.x, wp.z, dt, b.speed)) {
        b.waypoint += 1;
        b.holdUntil = state.tick + Math.floor(b.rng() * 90);
        b.state = 'hold';
      }
      break;
    }
    case 'hold': {
      b.vel.set(0, 0, 0);
      // Scan: slow yaw sweep while holding an angle.
      b.yaw += Math.sin(state.tick / 90 + b.pos.x) * 0.004;
      if (state.tick > b.holdUntil) {
        b.state = 'advance';
      }
      break;
    }
    case 'fight': {
      if (!b.target || !b.target.alive) { b.state = 'advance'; break; }
      // Face the target, strafe a little, fire in bursts.
      _toTarget.copy(b.target.pos).sub(b.pos);
      b.yaw = Math.atan2(-_toTarget.x, -_toTarget.z);
      b.pitch = Math.atan2(_toTarget.y + 1.3, Math.hypot(_toTarget.x, _toTarget.z)) * 0.5;
      if (state.tick >= b.reactAt) {
        if (b.burstLeft <= 0) {
          if (b.burstPause <= 0) {
            b.burstLeft = 3 + Math.floor(b.rng() * 3);
            b.burstPause = 0;
          } else {
            b.burstPause -= 1;
          }
        } else if (now - b.lastShotAt > WEAPONS[b.weapon].rate) {
          b.lastShotAt = now;
          b.burstLeft -= 1;
          if (b.burstLeft === 0) b.burstPause = 24 + Math.floor(b.rng() * 30);
          botShoot(b, state, solids, dist);
        }
      }
      // Strafe sideways while fighting so duels are not statues.
      const strafe = Math.sin(state.tick / 45 + b.pos.z) * 1.2;
      b.pos.x += Math.cos(b.yaw) * strafe * dt;
      b.pos.z += -Math.sin(b.yaw) * strafe * dt;
      collideCircle(b.pos, 0.38, 0);
      break;
    }
    case 'retake': {
      const wp = b.route[b.waypoint];
      if (!wp) { b.state = 'defuse'; break; }
      if (moveToward(b, wp.x, wp.z, dt, b.speed * 1.05)) b.waypoint += 1;
      break;
    }
    case 'defuse': {
      // Stand on the site and defuse (rounds.js tracks the timer).
      const site = state.bomb.site === 'A' ? { x: -19, z: -15 } : { x: 19, z: -15 };
      moveToward(b, site.x, site.z, dt, b.speed);
      break;
    }
    default:
      break;
  }

  // Reload when the mag is dry and no enemy is in sight.
  if (b.mag <= 0 && b.state !== 'fight') {
    const def = WEAPONS[b.weapon];
    b.mag = def.mag;
    b.reserve = Math.max(0, b.reserve - def.mag);
  }

  // Sync the mesh to the body.
  if (b.mesh) {
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y = b.yaw;
    b.mesh.visible = true;
    const chevron = b.mesh.children.find((o) => o.name === 'marker');
    if (chevron) chevron.rotation.y = state.tick / 40;
  }
}

function botShoot(b, state, solids, dist) {
  if (b.mag <= 0) { b.mag = WEAPONS[b.weapon].mag; return; }
  b.mag -= 1;
  const def = WEAPONS[b.weapon];
  // Aim error: grows with distance and with the target's speed, so a
  // sprinting target at 30 m is hard to hit and a still one at 8 m is not.
  const targetSpeed = b.target ? Math.hypot(b.target.vel.x, b.target.vel.z) : 0;
  const error = 0.012 + dist * 0.0011 + targetSpeed * 0.0022;
  const savedYaw = b.yaw;
  const savedPitch = b.pitch;
  b.yaw += (b.rng() - 0.5) * error * 2;
  b.pitch += (b.rng() - 0.5) * error * 2;
  const origin = new THREE.Vector3(b.pos.x, b.pos.y + 1.5, b.pos.z);
  const targets = state.players.filter((p) => p.team !== b.team && p.alive);
  fireHitscan(b, def, targets, solids, state, origin);
  b.yaw = savedYaw;
  b.pitch = savedPitch;
  // Gunfire is heard within 25 m: nearby bots turn toward the shot.
  for (const other of state.players) {
    if (other === b || !other.alive || other.isPlayer) continue;
    if (other.pos.distanceTo(b.pos) < 25) {
      other.heardAt = state.tick;
      other.heardPos.copy(b.pos);
    }
  }
}

// Hide a dead bot's mesh and drop its chevron.
export function onBotDeath(b) {
  if (b.mesh) b.mesh.visible = false;
}
