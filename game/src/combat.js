// Combat: hitscan raycasts against body meshes, damage zones, tracers,
// impact sparks, decals, and the smoke grenade. All hot-loop vectors are
// reused module-level temporaries — no allocation per shot or per frame.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { losBlocked } from './map.js';

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _hitPoint = new THREE.Vector3();
const _sparkVel = new THREE.Vector3();

let tracerPool = [];
let tracerIndex = 0;
let decalPool = [];
let decalIndex = 0;
let sparkPool = [];
let sparkIndex = 0;

// Body meshes live on each combatant's `mesh` (a Group). The head mesh is
// named 'head', torso 'torso', limbs 'limb-*' — damage zones are read from
// the name, so the raycast itself decides the multiplier.
export function registerBodies(scene, combatants) {
  tracerPool = [];
  decalPool = [];
  sparkPool = [];
  tracerIndex = 0;
  decalIndex = 0;
  sparkIndex = 0;
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < 24; i++) {
    const line = new THREE.Line(geo.clone(), tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push(line);
  }
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x0c0d0f, transparent: true, opacity: 0.65 });
  for (let i = 0; i < 40; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), decalMat.clone());
    d.visible = false;
    scene.add(d);
    decalPool.push(d);
  }
  const sparkGeo = new THREE.SphereGeometry(0.03, 6, 4);
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffc861 }));
    s.visible = false;
    scene.add(s);
    sparkPool.push({ mesh: s, vel: new THREE.Vector3(), life: 0 });
  }
}

function showTracer(from, to) {
  const line = tracerPool[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracerPool.length;
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  line.material.opacity = 0.9;
  line.visible = true;
  line.userData.life = 0.35; // long enough to survive a screenshot capture
}

function showDecal(point, normal) {
  const d = decalPool[decalIndex];
  decalIndex = (decalIndex + 1) % decalPool.length;
  d.position.copy(point).addScaledVector(normal, 0.02);
  d.lookAt(_hitPoint.copy(point).add(normal));
  d.visible = true;
}

function showSparks(point, count, rng) {
  for (let i = 0; i < count; i++) {
    const s = sparkPool[sparkIndex];
    sparkIndex = (sparkIndex + 1) % sparkPool.length;
    s.mesh.position.copy(point);
    _sparkVel.set(rng() - 0.5, rng() * 0.8, rng() - 0.5).multiplyScalar(3.5);
    s.vel.copy(_sparkVel);
    s.life = 0.35;
    s.mesh.visible = true;
  }
}

// One hitscan shot from shooter `c`. `targets` are the opposing combatants
// with live meshes; `solids` are the raycastable world meshes (walls, crates,
// containers) so bullets stop on cover.
export function fireHitscan(c, def, targets, solids, state, muzzlePos) {
  const spread = c.spreadNow !== undefined ? c.spreadNow : def.spread;
  _dir.set(
    (c.rng ? c.rng() - 0.5 : 0) * spread * 2,
    (c.rng ? c.rng() - 0.5 : 0) * spread * 2,
    -1,
  ).normalize();
  // Direction from yaw/pitch: forward is -Z rotated by yaw, pitched by pitch.
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  const fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp);
  // Apply the small spread jitter in camera space.
  const right = new THREE.Vector3(cy, 0, -sy);
  const up = new THREE.Vector3(0, 1, 0);
  fwd.addScaledVector(right, _dir.x).addScaledVector(up, _dir.y).normalize();

  // muzzlePos, when given, is already an eye-height origin (bots pass
  // pos.y + 1.5); without one, the shooter's feet + 1.55 m is the eye.
  if (muzzlePos) _origin.copy(muzzlePos);
  else _origin.copy(c.pos).setY(c.pos.y + 1.55);
  _ray.set(_origin, fwd);
  _ray.far = def.range;

  // Nearest hit across enemy bodies and world solids.
  let best = null;
  let bestDist = Infinity;
  let bestTarget = null;
  let bestPart = '';
  const bodyMeshes = [];
  for (const t of targets) {
    if (!t.alive || !t.mesh) continue;
    t.mesh.traverse((o) => { if (o.isMesh) { o.userData.owner = t; bodyMeshes.push(o); } });
  }
  const hits = _ray.intersectObjects([...bodyMeshes, ...solids], false);
  if (hits.length > 0) {
    const h = hits[0];
    best = h;
    bestDist = h.distance;
    if (h.object.userData.owner) {
      bestTarget = h.object.userData.owner;
      bestPart = h.object.name || 'torso';
    }
  }

  const end = best
    ? _hitPoint.copy(best.point)
    : _hitPoint.copy(_origin).addScaledVector(fwd, def.range);
  showTracer(_origin, end);

  if (bestTarget) {
    const mult = bestPart === 'head' ? def.headMult : bestPart.startsWith('limb') ? 0.75 : 1;
    let dmg = def.damage * mult;
    // Armor soaks 50% of torso/limb damage until it is gone.
    if (bestTarget.armor > 0 && bestPart !== 'head') {
      const soaked = Math.min(bestTarget.armor, dmg * 0.5);
      bestTarget.armor -= soaked;
      dmg -= soaked;
    }
    bestTarget.health -= dmg;
    const killed = bestTarget.health <= 0;
    if (killed) {
      bestTarget.health = 0;
      bestTarget.alive = false;
      bestTarget.deaths += 1;
      c.kills += 1;
      c.money += 300;
      state.money[c.team] = c.money;
    }
    state.killFeed.unshift({
      text: `${c.name} ${bestPart === 'head' ? '☠' : '→'} ${bestTarget.name}${killed ? ' ✕' : ''}`,
      at: state.tick,
      kill: killed,
    });
    if (state.killFeed.length > 4) state.killFeed.length = 4;
    if (c.onHit) c.onHit(bestTarget, bestPart === 'head', killed);
    return { hit: true, head: bestPart === 'head', kill: killed, point: best.point.clone() };
  }
  if (best) {
    // World hit: sparks + a dark decal on the surface.
    showSparks(best.point, 5, c.rng || Math.random);
    showDecal(best.point, best.face ? best.face.normal : new THREE.Vector3(0, 1, 0));
  }
  return { hit: false, point: end.clone() };
}

// Smoke grenade: a thrown arc that blooms into a translucent cloud. Bots
// treat the cloud as opaque for line-of-sight (bots.js checks state.smokeClouds).
export function throwSmoke(c, state, scene, rng) {
  const start = new THREE.Vector3(c.pos.x, c.pos.y + 1.5, c.pos.z);
  const dir = new THREE.Vector3(-Math.sin(c.yaw), 0.35, -Math.cos(c.yaw)).normalize();
  const land = start.clone().addScaledVector(dir, 9);
  land.y = 0;
  const cloud = { pos: land, radius: 3.2, until: state.tick + 12 * 60, mesh: null };
  const geo = new THREE.SphereGeometry(3.2, 16, 12);
  const m = new THREE.MeshBasicMaterial({ color: 0xcfd4d6, transparent: true, opacity: 0.42, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(land).setY(1.6);
  scene.add(mesh);
  cloud.mesh = mesh;
  state.smokeClouds.push(cloud);
  return cloud;
}

export function updateEffects(dt, state) {
  for (const line of tracerPool) {
    if (!line.visible) continue;
    line.userData.life -= dt;
    line.material.opacity = Math.max(0, line.userData.life / 0.35) * 0.9;
    if (line.userData.life <= 0) line.visible = false;
  }
  for (const s of sparkPool) {
    if (!s.mesh.visible) continue;
    s.life -= dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.vel.y -= 6 * dt;
    if (s.life <= 0) s.mesh.visible = false;
  }
  for (const cloud of state.smokeClouds) {
    if (cloud.mesh) cloud.mesh.material.opacity = 0.42 * Math.min(1, (cloud.until - state.tick) / 60);
  }
}

export function clearSmoke(state, scene) {
  for (const cloud of state.smokeClouds) {
    if (cloud.mesh) scene.remove(cloud.mesh);
  }
  state.smokeClouds.length = 0;
}
