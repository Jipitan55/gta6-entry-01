// Vesper City — all sound is synthesised WebAudio: no audio files, no network.
// Shots, siren, pickup, mission stingers, engine hum. M toggles mute.

'use strict';

const AudioSys = (() => {
  let ctx = null, master = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // engine hum: low sawtooth, gain follows speed (set by setEngine)
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      // police siren: triangle wobbling between two tones
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start(); sirenLfo.start();
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    shoot() { noise(0.12, 0.5, 2600); tone(180, 0.09, 'square', 0.22, 60); },
    punch() { noise(0.08, 0.35, 700); },
    crash() { noise(0.25, 0.45, 500); tone(90, 0.2, 'sine', 0.3, 45); },
    pickup() { tone(660, 0.09, 'sine', 0.25); setTimeout(() => tone(990, 0.14, 'sine', 0.25), 90); },
    mission() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 110)); },
    fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.16), i * 160)); },
    honk() { tone(370, 0.18, 'square', 0.12); tone(466, 0.18, 'square', 0.1); },
    setEngine(on, speedRatio) {
      if (!ctx || muted) return;
      const target = on ? 0.05 + 0.075 * Math.abs(speedRatio) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + 90 * Math.abs(speedRatio), ctx.currentTime, 0.1);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.3);
    },
  };
})();
