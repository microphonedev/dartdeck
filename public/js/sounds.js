const Sounds = (() => {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.12, delay = 0) {
    if (!enabled) return;
    try {
      const c = ac();
      const t0 = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  function noise(dur, vol = 0.08) {
    if (!enabled) return;
    try {
      const c = ac();
      const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
      const src = c.createBufferSource();
      const g = c.createGain();
      src.buffer = buf;
      g.gain.value = vol;
      src.connect(g); g.connect(c.destination);
      src.start();
    } catch (e) {}
  }

  function click() {
    tone(720, 0.035, 'square', 0.06);
  }

  function hit(score) {
    noise(0.06, 0.1);
    tone(180, 0.08, 'triangle', 0.14);
    tone(900, 0.05, 'square', 0.07, 0.04);
    
    if (score >= 100 && score < 140) {
      tone(1000, 0.08, 'square', 0.08, 0.1);
      tone(1200, 0.1, 'square', 0.06, 0.18);
    } else if (score >= 140 && score < 180) {
      tone(1200, 0.09, 'square', 0.09, 0.08);
      tone(1500, 0.12, 'square', 0.07, 0.16);
      tone(1800, 0.15, 'square', 0.05, 0.24);
    } else if (score === 180) {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.12, 0.1 + i * 0.08));
      tone(1567, 0.45, 'square', 0.1, 0.5);
    }
  }

  function bust() {
    tone(220, 0.2, 'sawtooth', 0.14);
    tone(140, 0.28, 'sawtooth', 0.12, 0.12);
    noise(0.15, 0.08);
  }

  function checkout() {
    [523, 659, 784, 1046, 1319, 1568].forEach((f, i) =>
      tone(f, 0.25, 'square', 0.13, i * 0.08)
    );
  }

  function setEnabled(v) { enabled = !!v; }

  return { click, hit, bust, checkout, setEnabled };
})();