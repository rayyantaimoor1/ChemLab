/**
 * sound.js — the lab's sounds, made in the app (BUILD_UI.md stage UI.9).
 *
 * Owner's decision (2026-11-21): sound, yes - but synthesised here with
 * the browser's own Web Audio engine rather than shipped as recordings. So
 * there are no sound files, nothing downloaded, no licences to check, and
 * nothing added to the installer.
 *
 * OFF by default. A school machine stays silent until a teacher turns the
 * top bar's Sound switch on, and until then not even an audio context is
 * made. Every sound here already has something to see on the bench, so
 * nothing is lost with it off (UI.9's check).
 *
 *   pour    shaped noise, as long as the pour      ← the stream arcing
 *   fizz    a crackle of tiny pops, busier and     ← the bubbles, at the
 *           louder the faster the gas comes off       same curated gasRate
 *   boil    a low rumble with bubbles bursting,    ← the rolling boil
 *           for as long as anything is boiling
 *   clink   glass set down on something            ← the vessel snapping in
 *   hazard  a soft two-tone alert                  ← the hazard alert itself
 *
 * The choices of which sound and how strong are plain functions with no
 * audio in them, so tests/sound.test.js can check them.
 */

/** Fizz by the curated gasRate: how loud, and how many pops a second. */
export const FIZZ = {
  slow: { gain: 0.05, popsPerSecond: 10 },
  steady: { gain: 0.08, popsPerSecond: 24 },
  vigorous: { gain: 0.12, popsPerSecond: 55 },
};

/** The fizz for a rate; null (no rate on record) is the steady middle. */
export function fizzFor(gasRate) {
  return FIZZ[gasRate] || FIZZ.steady;
}

/** How long a pour sounds, in seconds, from how much is poured. */
export function pourSeconds(amountMl) {
  return Math.max(0.35, Math.min(1.2, 0.3 + (Number(amountMl) || 0) / 30));
}

let enabled = false;
let ctx = null;
let noise = null;
let boilTimer = null;
let boilRumble = null;

/** Turns the lab's sound on or off. Off stops anything still sounding. */
export function setSoundEnabled(on) {
  enabled = !!on;
  if (!enabled) {
    setBoiling(false);
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
}

export function soundEnabled() {
  return enabled;
}

/** The audio context, made only once sound is on. */
function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Two seconds of white noise, made once and reused. */
function noiseBuffer(ac) {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** A noise source through a filter and a gain envelope. */
function noiseVoice(ac, { type, frequency, q = 1, gain, attack, hold, release, at = ac.currentTime }) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + attack);
  amp.gain.setValueAtTime(gain, at + attack + hold);
  amp.gain.linearRampToValueAtTime(0, at + attack + hold + release);
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(at, Math.random());
  src.stop(at + attack + hold + release + 0.05);
  return { filter, amp };
}

/** A short sine blip - a bubble bursting, a ring of glass. */
function tone(ac, { frequency, gain, decay, at = ac.currentTime, type = 'sine', glideTo = null }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + decay);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

/**
 * Plays one of the lab's sounds, if sound is on. Returns whether it played.
 * @param {'pour'|'fizz'|'clink'|'hazard'} name
 * @param {object} [opts]  pour: { amountMl }; fizz: { gasRate, seconds }
 */
export function playSound(name, opts = {}) {
  const ac = audio();
  if (!ac) return false;
  const now = ac.currentTime;

  if (name === 'pour') {
    const seconds = pourSeconds(opts.amountMl);
    const { filter } = noiseVoice(ac, { type: 'bandpass', frequency: 700, q: 0.9, gain: 0.09, attack: 0.08, hold: seconds, release: 0.25 });
    // The pitch rises as the receiving vessel fills.
    filter.frequency.linearRampToValueAtTime(1300, now + seconds);
    return true;
  }

  if (name === 'fizz') {
    const { gain, popsPerSecond } = fizzFor(opts.gasRate);
    const seconds = opts.seconds ?? 1.6;
    noiseVoice(ac, { type: 'highpass', frequency: 4500, gain: gain * 0.35, attack: 0.05, hold: seconds, release: 0.4 });
    const pops = Math.round(popsPerSecond * seconds);
    for (let k = 0; k < pops; k += 1) {
      tone(ac, { frequency: 2200 + Math.random() * 3200, gain: gain * (0.4 + Math.random() * 0.6), decay: 0.012, at: now + Math.random() * seconds });
    }
    return true;
  }

  if (name === 'clink') {
    for (const [frequency, g] of [[2380, 0.06], [3720, 0.04], [5150, 0.025]]) {
      tone(ac, { frequency, gain: g, decay: 0.45 });
    }
    return true;
  }

  if (name === 'hazard') {
    // Soft, not a siren: three pairs of notes, enough to look up for.
    for (let k = 0; k < 3; k += 1) {
      tone(ac, { frequency: 660, gain: 0.07, decay: 0.16, at: now + k * 0.42, type: 'triangle' });
      tone(ac, { frequency: 880, gain: 0.07, decay: 0.16, at: now + k * 0.42 + 0.18, type: 'triangle' });
    }
    return true;
  }
  return false;
}

/**
 * The boil: a low rumble with bubbles bursting, for as long as anything on
 * the bench is boiling. Called on every redraw with whether something is.
 */
export function setBoiling(on) {
  if (!on || !enabled) {
    if (boilTimer) clearInterval(boilTimer);
    boilTimer = null;
    if (boilRumble) {
      try { boilRumble.stop(); } catch { /* already stopped */ }
      boilRumble = null;
    }
    return;
  }
  if (boilTimer) return;
  const ac = audio();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  const amp = ac.createGain();
  amp.gain.value = 0.05;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
  boilRumble = src;
  boilTimer = setInterval(() => {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 3; k += 1) {
      tone(ctx, { frequency: 260 + Math.random() * 380, glideTo: 520 + Math.random() * 500, gain: 0.035, decay: 0.07, at: t + Math.random() * 0.2 });
    }
  }, 220);
}
