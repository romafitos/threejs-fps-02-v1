// Procedural WebAudio: every sound is synthesised — noise bursts, filtered
// thumps and beeps — so the game ships zero audio assets and makes zero
// network requests. The context starts on the first user gesture.
let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  // One shared white-noise buffer for gunshots, footsteps and impacts.
  const len = ctx.sampleRate * 0.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function resumeAudio() {
  if (ensure() && ctx.state === 'suspended') ctx.resume();
}

function burst(dur, filterFreq, type, gainValue, when = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainValue, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, type, gainValue, when = 0, slideTo = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainValue, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  // Gunshot: a sharp noise crack plus a low thump; pitch per weapon.
  shoot(kind) {
    const pitch = kind === 'rifle' ? 2400 : kind === 'smg' ? 3200 : 1800;
    burst(0.09, pitch, 'highpass', 0.5);
    tone(140, 0.12, 'sine', 0.55, 0, 55);
  },
  dryFire() {
    tone(1200, 0.04, 'square', 0.12);
  },
  reload() {
    tone(900, 0.05, 'square', 0.15);
    tone(600, 0.05, 'square', 0.15, 0.12);
  },
  hit() {
    tone(1900, 0.05, 'sine', 0.25);
  },
  kill() {
    tone(1900, 0.05, 'sine', 0.3);
    tone(2400, 0.08, 'sine', 0.3, 0.06);
  },
  hurt() {
    tone(180, 0.18, 'sawtooth', 0.3, 0, 90);
  },
  plantBeep() {
    tone(1100, 0.07, 'sine', 0.3);
  },
  defuseBeep() {
    tone(880, 0.07, 'sine', 0.3);
  },
  fuseBeep() {
    tone(1500, 0.05, 'sine', 0.22);
  },
  roundHorn() {
    tone(220, 0.5, 'sawtooth', 0.25, 0, 330);
    tone(330, 0.5, 'sawtooth', 0.2, 0.05, 440);
  },
  roundWin() {
    tone(523, 0.15, 'sine', 0.3);
    tone(659, 0.15, 'sine', 0.3, 0.14);
    tone(784, 0.3, 'sine', 0.3, 0.28);
  },
  footstep() {
    burst(0.05, 500, 'lowpass', 0.12);
  },
  buy() {
    tone(700, 0.06, 'sine', 0.25);
    tone(1050, 0.08, 'sine', 0.25, 0.07);
  },
  smoke() {
    burst(0.5, 800, 'bandpass', 0.25);
  },
};
