// Input: keyboard + mouse, pointer lock, and the buy-menu keys. Shot modes
// never need pointer lock — they auto-start, so headless captures work.
import { resumeAudio } from './audio.js';

export function bindInput(input, canvas, onPlay) {
  const keys = {};
  let locked = false;

  function press(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': input.forward = true; break;
      case 'KeyS': case 'ArrowDown': input.back = true; break;
      case 'KeyA': case 'ArrowLeft': input.left = true; break;
      case 'KeyD': case 'ArrowRight': input.right = true; break;
      case 'Space': input.jump = true; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': input.crouch = true; break;
      case 'KeyR': input.reload = true; break;
      case 'KeyE': input.useHeld = true; break;
      case 'KeyB': input.buy = true; break;
      case 'Digit1': input.buyKey = 1; break;
      case 'Digit2': input.buyKey = 2; break;
      case 'Digit3': input.buyKey = 3; break;
      case 'Digit4': input.buyKey = 4; break;
      case 'Digit5': input.buyKey = 5; break;
      case 'Digit6': input.buyKey = 6; break;
      default: break;
    }
    keys[code] = true;
  }

  function release(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': input.forward = false; break;
      case 'KeyS': case 'ArrowDown': input.back = false; break;
      case 'KeyA': case 'ArrowLeft': input.left = false; break;
      case 'KeyD': case 'ArrowRight': input.right = false; break;
      case 'Space': input.jump = false; break;
      case 'ControlLeft': case 'ControlRight': case 'KeyC': input.crouch = false; break;
      case 'KeyR': input.reload = false; break;
      case 'KeyE': input.useHeld = false; break;
      case 'KeyB': input.buy = false; break;
      default: break;
    }
    keys[code] = false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    press(e.code);
  });
  window.addEventListener('keyup', (e) => release(e.code));
  window.addEventListener('blur', () => {
    for (const code of Object.keys(keys)) release(code);
  });

  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('mousedown', (e) => {
    resumeAudio();
    if (e.button === 0) {
      if (!locked && !window.__shotMode) canvas.requestPointerLock();
      input.fire = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
  });
  // Clicking the play button starts the match and locks the pointer.
  const play = document.getElementById('play');
  if (play) {
    play.addEventListener('click', () => {
      resumeAudio();
      canvas.requestPointerLock();
      if (onPlay) onPlay();
    });
  }
  return { isLocked: () => locked };
}
