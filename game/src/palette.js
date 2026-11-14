// Kestrel Yard palette: dusk freight terminal — amber sodium lamps against a
// teal dusk sky. Six colours carry the whole look, so the scene reads at a glance.
import * as THREE from 'three';

export const PALETTE = {
  sky: 0x1d2f3d, // cool teal dusk, used for fog + background
  ground: 0x2a2d33, // asphalt yard
  concrete: 0x565b63, // container walls, pale grey
  rust: 0x8a5a34, // rusted steel containers
  amber: 0xf2a63b, // Kestrel team + sodium lamps
  teal: 0x35c4b5, // Harbor team + cool fill
  ink: 0x11141a, // dark trim, shadows
  cream: 0xe9e2d2, // HUD ink, painted markings
};

const cache = new Map();

// One shared material per (colour, roughness) pair — no per-frame allocation
// and no duplicate materials scattered through the map builder.
export function mat(color, roughness = 0.85, metalness = 0.05) {
  const key = `${color}|${roughness}|${metalness}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    cache.set(key, m);
  }
  return m;
}

export function glowMat(color, intensity = 1.6) {
  const key = `glow|${color}|${intensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
    cache.set(key, m);
  }
  return m;
}

// A box mesh placed in the world, castShadow on, receiveShadow on.
export function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A flat painted floor marking (yard line, site letter) — a thin plane just
// above the asphalt so z-fighting never shows.
export function floorMark(w, d, material, x, z, rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rotY;
  mesh.position.set(x, 0.02, z);
  mesh.receiveShadow = true;
  return mesh;
}
