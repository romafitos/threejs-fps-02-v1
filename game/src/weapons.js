// Weapons: three guns + smoke. Hitscan raycasts against body meshes, with
// head x4 / torso x1 / limb x0.75 damage, recoil that kicks pitch and yaw
// and recovers over 0.4 s, and spread that punishes moving and jumping.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { EYE_STAND, speed2d } from './player.js';

// Recoil state lives on the shooter record (c.recoil = { pitch, yaw }).
export function makeRecoil() {
  return { pitch: 0, yaw: 0, recover: 0 };
}

export function recoverRecoil(c, dt) {
  if (!c.recoil) return;
  // Recoil decays back to zero over ~0.4 s after the last shot.
  const k = Math.max(0, 1 - dt / 0.4);
  c.recoil.pitch *= k;
  c.recoil.yaw *= k;
}

// Spread in radians: still 0.0022, moving 0.028, crouch x0.6, airborne x2.5.
export function currentSpread(c) {
  const def = WEAPONS[c.weapon];
  let s = def.spread;
  const spd = speed2d(c);
  if (spd > 0.6) s = 0.028;
  if (c.crouched) s *= 0.6;
  if (!c.onGround) s *= 2.5;
  return s;
}

// Fire one hitscan shot. `fire` is the shared combat routine in combat.js;
// this module owns the weapon state machine (ammo, reload, fire rate).
export function tryFire(c, now, fireOne) {
  const def = WEAPONS[c.weapon];
  if (c.weapon === 'smoke') return tryThrowSmoke(c, now, fireOne);
  if (c.mag <= 0) {
    if (now - (c.dryAt || 0) > 0.35) {
      c.dryAt = now;
      if (c.onDryFire) c.onDryFire();
    }
    return false;
  }
  if (now - c.lastShotAt < def.rate) return false;
  c.lastShotAt = now;
  c.mag -= 1;
  // Recoil: pitch kick up + a small random yaw drift, both recovered in
  // recoverRecoil. The crosshair gap mirrors currentSpread live (hud.js).
  c.recoil.pitch += def.kick;
  c.recoil.yaw += (c.rng ? c.rng() - 0.5 : Math.random() - 0.5) * def.kick * 0.7;
  fireOne(c, def);
  if (c.onShoot) c.onShoot(def);
  return true;
}

function tryThrowSmoke(c, now, fireOne) {
  if (c.mag <= 0 || now - c.lastShotAt < 1.0) return false;
  c.lastShotAt = now;
  c.mag -= 1;
  fireOne(c, WEAPONS.smoke);
  if (c.onShoot) c.onShoot(WEAPONS.smoke);
  return true;
}

export function startReload(c, now) {
  const def = WEAPONS[c.weapon];
  if (c.reloading || c.mag >= def.mag || c.reserve <= 0) return false;
  c.reloading = true;
  c.reloadUntil = now + (c.weapon === 'rifle' ? 2.4 : c.weapon === 'smg' ? 1.9 : 1.4);
  if (c.onReload) c.onReload();
  return true;
}

export function finishReload(c, now) {
  if (!c.reloading || now < c.reloadUntil) return false;
  const def = WEAPONS[c.weapon];
  const need = def.mag - c.mag;
  const take = Math.min(need, c.reserve);
  c.mag += take;
  c.reserve -= take;
  c.reloading = false;
  return true;
}

// Buy a weapon during the buy phase. Returns a message for the HUD.
export function buyWeapon(c, key, state) {
  const order = ['rifle', 'smg', 'pistol', 'smoke'];
  if (key >= 1 && key <= 4) {
    const id = order[key - 1];
    const def = WEAPONS[id];
    if (c.money < def.price) return 'Not enough money';
    if (id === 'smoke' && c.weapon === 'smoke' && c.mag >= 1) return 'Already carrying smoke';
    c.money -= def.price;
    c.weapon = id;
    c.mag = def.mag;
    c.reserve = def.reserve;
    c.reloading = false;
    return `Bought ${def.name} — $${def.price}`;
  }
  if (key === 5) {
    if (c.armor >= 100) return 'Armor already full';
    if (c.money < 650) return 'Not enough money';
    c.money -= 650;
    c.armor = 100;
    return 'Bought Kevlar armor — $650';
  }
  if (key === 6) {
    if (c.team !== 'harbor') return 'Defuse kit is for HARBOR only';
    if (c.hasKit) return 'Already carrying a defuse kit';
    if (c.money < 400) return 'Not enough money';
    c.money -= 400;
    c.hasKit = true;
    return 'Bought defuse kit — $400';
  }
  return '';
}

// View-model: a simple low-poly gun built from boxes, parented to the camera
// so it bobs with movement and kicks with recoil.
export function makeViewModel(scene, camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.6 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xf2a63b, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.02, -0.46);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.14);
  grip.rotation.x = 0.35;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), amber);
  sight.position.set(0, 0.09, -0.18);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), dark);
  mag.position.set(0, -0.13, -0.05);
  group.add(body, barrel, grip, sight, mag);
  group.position.set(0.24, -0.22, -0.5);
  camera.add(group);
  scene.add(camera);
  return group;
}
