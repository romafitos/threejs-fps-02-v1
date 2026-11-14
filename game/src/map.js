// Kestrel Yard — Freight Terminal 7. A 64 x 48 m dusk yard with three lanes:
//   A-Long  (west, x ~ -18): container corridor, long sightline to Site A
//   Mid     (centre, x ~ 0): crane gantry, crossfire over the yard
//   B-Short (east, x ~ +18): warehouse interior, close quarters to Site B
// Attackers (KESTREL) spawn south (z +20); defenders (HARBOR) spawn north.
// Site A sits in the container stack, Site B in the warehouse office.
import * as THREE from 'three';
import { PALETTE, mat, glowMat, box, floorMark } from './palette.js';

// Axis-aligned solid: { x0, z0, x1, z1, top }. Movement collides in XZ when
// the collider is taller than a step (top > 1.1); low crates are vaulted over
// by the eye-height test instead of blocking.
export const colliders = [];
export const waypoints = {}; // lane name -> array of { x, z }
export const spawns = { kestrel: [], harbor: [] };
export const sites = {
  A: { x: -19, z: -15, name: 'A — Container Stack' },
  B: { x: 19, z: -15, name: 'B — Warehouse Office' },
};

function solid(x0, z0, x1, z1, top) {
  colliders.push({ x0, z0, x1, z1, top });
}

function wall(group, x0, z0, x1, z1, height, material) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  group.add(box(Math.max(w, 0.4), height, Math.max(d, 0.4), material, cx, height / 2, cz));
  solid(x0, z0, x1, z1, height);
}

function container(group, x, z, rotY, color) {
  const m = mat(color, 0.7, 0.25);
  const c = box(6, 2.6, 2.4, m, x, 1.3, z);
  c.rotation.y = rotY;
  group.add(c);
  // The rotated footprint is approximated by its unrotated AABB; containers
  // are placed axis-aligned in practice (rotY 0 or PI/2 only).
  const w = Math.abs(Math.cos(rotY)) * 6 + Math.abs(Math.sin(rotY)) * 2.4;
  const d = Math.abs(Math.sin(rotY)) * 6 + Math.abs(Math.cos(rotY)) * 2.4;
  solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2.6);
  // Ribbed roof strip so the top reads as corrugated steel from the catwalk.
  const rib = box(5.8, 0.08, 2.2, mat(PALETTE.ink, 0.9, 0.1), x, 2.64, z);
  rib.rotation.y = rotY;
  group.add(rib);
  return c;
}

function crate(group, x, z, s, color) {
  group.add(box(s, s, s, mat(color, 0.9, 0.05), x, s / 2, z));
  solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s);
}

function lamp(group, x, z, color, height = 5.2) {
  const pole = box(0.18, height, 0.18, mat(PALETTE.ink, 0.6, 0.6), x, height / 2, z);
  group.add(pole);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 8),
    glowMat(color, 2.2),
  );
  head.position.set(x, height, z);
  group.add(head);
  const light = new THREE.PointLight(color, 22, 18, 1.8);
  light.position.set(x, height - 0.3, z);
  group.add(light);
  return light;
}

export function buildMap(scene) {
  const group = new THREE.Group();
  group.name = 'kestrel-yard';
  scene.add(group);
  colliders.length = 0;

  // --- sky, fog, ground -------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 34, 95);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    mat(PALETTE.ground, 0.95, 0.02),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Painted yard lines: centre line, site boxes, lane arrows.
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.cream, transparent: true, opacity: 0.55 });
  group.add(floorMark(0.3, 44, lineMat, -10, 0));
  group.add(floorMark(0.3, 44, lineMat, 10, 0));
  group.add(floorMark(44, 0.3, lineMat, 0, 0));
  group.add(floorMark(7, 7, lineMat, sites.A.x, sites.A.z));
  group.add(floorMark(7, 7, lineMat, sites.B.x, sites.B.z));

  // --- lights -----------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffb45e, 2.4);
  sun.position.set(-26, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  group.add(sun);
  const hemi = new THREE.HemisphereLight(0x3d6f7a, 0x1a1410, 0.85);
  group.add(hemi);
  lamp(group, sites.A.x, sites.A.z - 4.5, PALETTE.amber);
  lamp(group, sites.B.x, sites.B.z - 4.5, PALETTE.amber);
  lamp(group, 0, 2, PALETTE.teal, 6.5);

  // --- perimeter --------------------------------------------------------
  const concrete = mat(PALETTE.concrete, 0.9, 0.05);
  wall(group, -32, -24, 32, -23.4, 5, concrete); // north
  wall(group, -32, 23.4, 32, 24, 5, concrete); // south
  wall(group, -32, -24, -31.4, 24, 5, concrete); // west
  wall(group, 31.4, -24, 32, 24, 5, concrete); // east

  // --- A-Long: container corridor (west) -------------------------------
  container(group, -22, -8, 0, PALETTE.rust);
  container(group, -22, 2, 0, 0x5a6a72);
  container(group, -24, -16, Math.PI / 2, PALETTE.rust);
  container(group, -14, -18, 0, 0x6b4a2f);
  container(group, -16, -12, 0, PALETTE.rust); // stack base, Site A cover
  const stackTop = box(6, 2.6, 2.4, mat(0x5a6a72, 0.7, 0.25), -16, 3.9, -12);
  group.add(stackTop);
  crate(group, -19, -6, 1.2, 0x7a6a4a);
  crate(group, -13, -4, 1.0, 0x7a6a4a);
  crate(group, -21, 8, 1.4, 0x6b5a3a);

  // --- Mid: crane gantry + crossfire ------------------------------------
  const gantryMat = mat(0x3f4a55, 0.6, 0.5);
  group.add(box(0.5, 7, 0.5, gantryMat, -4, 3.5, -2));
  group.add(box(0.5, 7, 0.5, gantryMat, 4, 3.5, -2));
  group.add(box(9.5, 0.8, 1.2, gantryMat, 0, 7, -2));
  const cab = box(2.2, 1.8, 1.8, mat(PALETTE.amber, 0.5, 0.4), 0, 5.8, -2);
  group.add(cab);
  // Catwalk deck (walkable at y 2.2 — bots and players cross at height via
  // the crate steps; the deck itself is a visual platform, collision via crates).
  group.add(box(8, 0.25, 2.4, mat(0x2e343c, 0.7, 0.4), 0, 2.3, -2));
  crate(group, -2.5, 6, 1.1, 0x7a6a4a);
  crate(group, 2.5, 6, 1.1, 0x7a6a4a);
  crate(group, 0, 10, 1.3, 0x6b5a3a);
  container(group, -6, -12, 0, 0x5a6a72);
  container(group, 7, -10, Math.PI / 2, PALETTE.rust);

  // --- B-Short: warehouse interior (east) -------------------------------
  wall(group, 12, -20, 12.6, -10, 4.5, concrete); // warehouse west wall, gap at z -10..-6
  wall(group, 12, -6, 12.6, -2, 4.5, concrete);
  wall(group, 24, -20, 24.6, -8, 4.5, concrete);
  // Office block at Site B with a doorway gap.
  wall(group, 14, -19, 26, -18.4, 4, mat(0x4a4640, 0.9, 0.05));
  wall(group, 14, -12, 14.6, -8, 4, mat(0x4a4640, 0.9, 0.05));
  const officeRoof = box(12, 0.4, 8, mat(0x33302c, 0.9, 0.05), 20, 4.2, -14);
  group.add(officeRoof);
  crate(group, 16, -11, 1.2, 0x7a6a4a);
  crate(group, 22, -10, 1.0, 0x7a6a4a);
  crate(group, 15, 4, 1.4, 0x6b5a3a);
  container(group, 24, 2, Math.PI / 2, 0x5a6a72);
  container(group, 26, 12, 0, PALETTE.rust);

  // --- attacker-side cover (south) --------------------------------------
  container(group, -8, 16, 0, 0x5a6a72);
  container(group, 8, 14, Math.PI / 2, PALETTE.rust);
  crate(group, 0, 18, 1.2, 0x7a6a4a);
  crate(group, -14, 14, 1.1, 0x6b5a3a);

  // --- site beacons: glowing pylons so both sites read at a glance ------
  for (const [key, site] of Object.entries(sites)) {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 3.4, 10),
      glowMat(key === 'A' ? PALETTE.amber : PALETTE.teal, 1.2),
    );
    pylon.position.set(site.x + 3.4, 1.7, site.z + 3.2);
    group.add(pylon);
    // Floating letter plate above each site.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? PALETTE.amber : PALETTE.teal, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    plate.position.set(site.x, 5.4, site.z);
    plate.rotation.y = Math.PI / 4;
    group.add(plate);
  }

  // --- waypoints: hand-placed routes, one per lane ----------------------
  waypoints.kestrelA = [
    { x: -20, z: 20 }, { x: -20, z: 10 }, { x: -21, z: 0 }, { x: -19, z: -8 }, { x: -19, z: -14 },
  ];
  waypoints.kestrelMid = [
    { x: -2, z: 20 }, { x: -1, z: 10 }, { x: 0, z: 2 }, { x: 0, z: -8 }, { x: -4, z: -13 },
  ];
  waypoints.kestrelB = [
    { x: 20, z: 20 }, { x: 20, z: 10 }, { x: 16, z: 0 }, { x: 15, z: -8 }, { x: 19, z: -14 },
  ];
  waypoints.harborA = [
    { x: -19, z: -15 }, { x: -18, z: -8 }, { x: -14, z: -4 }, { x: -10, z: -2 },
  ];
  waypoints.harborMid = [
    { x: 0, z: -18 }, { x: 0, z: -8 }, { x: 2, z: 0 },
  ];
  waypoints.harborB = [
    { x: 19, z: -15 }, { x: 16, z: -10 }, { x: 14, z: -4 }, { x: 10, z: -2 },
  ];
  waypoints.rotateA = [
    { x: 10, z: -6 }, { x: 0, z: -6 }, { x: -10, z: -8 }, { x: -16, z: -12 },
  ];
  waypoints.rotateB = [
    { x: -10, z: -6 }, { x: 0, z: -6 }, { x: 10, z: -8 }, { x: 16, z: -12 },
  ];

  spawns.kestrel = [
    { x: -22, z: 20, yaw: Math.PI }, { x: -10, z: 21, yaw: Math.PI }, { x: 0, z: 21, yaw: Math.PI },
    { x: 10, z: 21, yaw: Math.PI }, { x: 22, z: 20, yaw: Math.PI },
  ];
  spawns.harbor = [
    { x: -24, z: -20, yaw: 0 }, { x: -12, z: -21, yaw: 0 }, { x: 0, z: -21, yaw: 0 },
    { x: 12, z: -21, yaw: 0 }, { x: 24, z: -20, yaw: 0 },
  ];

  return group;
}

// Circle (XZ) vs AABB push-out. Returns true when the mover was pushed.
// `r` is the mover's radius, `y` its foot height: low crates (top <= 1.1)
// are stepped over instead of blocking.
const _tmp = new THREE.Vector3();
export function collideCircle(pos, r, y = 0) {
  let hit = false;
  for (const c of colliders) {
    if (c.top <= 1.1 && y > c.top - 0.35) continue; // step over low crates
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pushL = pos.x - c.x0 + r;
        const pushR = c.x1 - pos.x + r;
        const pushT = pos.z - c.z0 + r;
        const pushB = c.z1 - pos.z + r;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = c.x0 - r;
        else if (m === pushR) pos.x = c.x1 + r;
        else if (m === pushT) pos.z = c.z0 - r;
        else pos.z = c.z1 + r;
      }
      hit = true;
    }
  }
  // Yard bounds.
  pos.x = Math.max(-31, Math.min(31, pos.x));
  pos.z = Math.max(-22.6, Math.min(22.6, pos.z));
  return hit;
}

// Segment vs AABB test in XZ for line-of-sight. Samples the segment —
// cheap, and at bot sight ranges 24 samples never misses a 0.4 m wall.
export function losBlocked(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.9));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    for (const c of colliders) {
      if (c.top > 1.4 && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return true;
    }
  }
  return false;
}

export function siteByKey(key) {
  return sites[key];
}

export { _tmp };
