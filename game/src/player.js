// Player controller: WASD + mouse look, acceleration and friction so
// stopping to aim pays, crouch and jump, AABB collision per axis.
// The same step() also drives the camera — the camera IS the player.
import * as THREE from 'three';
import { collideCircle } from './map.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.05;
export const PLAYER_RADIUS = 0.38;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ACCEL_GROUND = 42;
const ACCEL_AIR = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;
const GRAVITY = 20;

// Input state is written by input.js and read here — one object, no globals.
export function makeInputState() {
  return {
    forward: false, back: false, left: false, right: false,
    jump: false, crouch: false, fire: false, reload: false,
    buy: false, use: false, useHeld: false,
    buyKey: 0, // 1..6 pressed this tick, 0 = none
    lookDX: 0, lookDY: 0,
  };
}

// Axis-separated movement: move X, resolve, then move Z, resolve. That way a
// wall never eats the whole step and the player slides along it.
export function stepPlayer(c, input, dt, time) {
  const speed = c.crouched ? CROUCH_SPEED : WALK_SPEED;
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  let wishX = 0;
  let wishZ = 0;
  if (input.forward) { wishX += -sin; wishZ += -cos; }
  if (input.back) { wishX += sin; wishZ += cos; }
  if (input.left) { wishX += -cos; wishZ += sin; }
  if (input.right) { wishX += cos; wishZ += -sin; }
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0) {
    wishX = (wishX / wishLen) * speed;
    wishZ = (wishZ / wishLen) * speed;
  }

  const accel = c.onGround ? ACCEL_GROUND : ACCEL_AIR;
  c.vel.x += (wishX - c.vel.x) * Math.min(1, accel * dt / speed * 0.9 + dt * 2.2);
  c.vel.z += (wishZ - c.vel.z) * Math.min(1, accel * dt / speed * 0.9 + dt * 2.2);
  if (wishLen === 0 && c.onGround) {
    // Ground friction bleeds speed fast when no key is held.
    const f = Math.max(0, 1 - FRICTION * dt);
    c.vel.x *= f;
    c.vel.z *= f;
    if (Math.hypot(c.vel.x, c.vel.z) < 0.05) { c.vel.x = 0; c.vel.z = 0; }
  }

  c.pos.x += c.vel.x * dt;
  collideCircle(c.pos, PLAYER_RADIUS, c.pos.y);
  c.pos.z += c.vel.z * dt;
  collideCircle(c.pos, PLAYER_RADIUS, c.pos.y);

  // Crouch toggles eye height; jump only from the ground.
  c.crouched = !!input.crouch;
  if (input.jump && c.onGround) {
    c.vel.y = JUMP_SPEED;
    c.onGround = false;
  }
  c.vel.y -= GRAVITY * dt;
  c.pos.y += c.vel.y * dt;
  if (c.pos.y <= 0) {
    c.pos.y = 0;
    c.vel.y = 0;
    c.onGround = true;
  }

  // Mouse look: yaw wraps, pitch clamps so the view never flips.
  c.yaw -= input.lookDX * 0.0023;
  c.pitch -= input.lookDY * 0.0023;
  c.pitch = Math.max(-1.53, Math.min(1.53, c.pitch));
  input.lookDX = 0;
  input.lookDY = 0;

  return time;
}

export function eyeHeight(c) {
  const target = c.crouched ? EYE_CROUCH : EYE_STAND;
  return c.pos.y + target;
}

// Apply the player's view to the camera, including recoil kick that
// recovers over 0.4 s (weapons.js writes c.recoilPitch / c.recoilYaw).
export function applyCamera(camera, c, recoil) {
  camera.position.set(c.pos.x, eyeHeight(c), c.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = c.yaw + (recoil ? recoil.yaw : 0);
  camera.rotation.x = c.pitch + (recoil ? recoil.pitch : 0);
  camera.rotation.z = 0;
}

export function speed2d(c) {
  return Math.hypot(c.vel.x, c.vel.z);
}
