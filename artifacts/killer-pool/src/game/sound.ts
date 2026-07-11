let ctx: AudioContext | null = null;
let masterVolume = parseFloat(localStorage.getItem('killerPoolVolume') || '1.0');
let isMuted = localStorage.getItem('killerPoolMuted') === 'true';

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const masterGainNode: GainNode | null = null;
function getMasterGain(a: AudioContext) {
  const g = a.createGain();
  g.gain.value = isMuted ? 0 : masterVolume;
  g.connect(a.destination);
  return g;
}

function noise(context: AudioContext, duration: number): AudioBufferSourceNode {
  const buf = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = context.createBufferSource();
  src.buffer = buf;
  return src;
}

export const sound = {
  setVolume(vol: number) {
    masterVolume = vol;
    localStorage.setItem('killerPoolVolume', vol.toString());
  },
  getVolume() { return masterVolume; },
  setMuted(muted: boolean) {
    isMuted = muted;
    localStorage.setItem('killerPoolMuted', muted.toString());
  },
  getMuted() { return isMuted; },

  // Called when the cue strikes the cue ball
  cueStrike(power = 0.5) {
    if (isMuted) return;
    const a = ac();
    const mg = getMasterGain(a);
    const t = a.currentTime;
    const vol = 0.35 + power * 0.45;

    // Woody thwack: bandpass-filtered noise burst
    const ns = noise(a, 0.09);
    const bpf = a.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 700 + power * 700;
    bpf.Q.value = 2.5;
    const ng = a.createGain();
    ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    ns.connect(bpf); bpf.connect(ng); ng.connect(mg);
    ns.start(t);

    // Resonant body tone
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const og = a.createGain();
    og.gain.setValueAtTime(vol * 0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og); og.connect(mg);
    osc.start(t); osc.stop(t + 0.14);
  },

  // Called on ball-ball collision; speed is the impact speed
  ballClick(speed = 3) {
    if (isMuted) return;
    const a = ac();
    const mg = getMasterGain(a);
    const t = a.currentTime;
    const vol = Math.min(1, speed / 10) * 0.55;
    if (vol < 0.04) return;

    // High-freq sine transient
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100 + speed * 30, t);
    osc.frequency.exponentialRampToValueAtTime(350, t + 0.045);
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g); g.connect(mg);
    osc.start(t); osc.stop(t + 0.06);

    // Crisp noise click on top
    const ns = noise(a, 0.012);
    const hpf = a.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2500;
    const ng = a.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    ns.connect(hpf); hpf.connect(ng); ng.connect(mg);
    ns.start(t);
  },

  // Called when a ball drops into a pocket
  pocketDrop() {
    if (isMuted) return;
    const a = ac();
    const mg = getMasterGain(a);
    const t = a.currentTime;

    // Deep bass thud
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = a.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(mg);
    osc.start(t); osc.stop(t + 0.32);

    // Rolling/tumble noise (ball falling through pocket)
    const ns = noise(a, 0.45);
    const lpf = a.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 380;
    const ng = a.createGain();
    ng.gain.setValueAtTime(0.0, t + 0.05);
    ng.gain.linearRampToValueAtTime(0.28, t + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    ns.connect(lpf); lpf.connect(ng); ng.connect(mg);
    ns.start(t + 0.05);

    // Mid-freq click of ball hitting the pocket edge
    const osc2 = a.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(480, t);
    osc2.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    const g2 = a.createGain();
    g2.gain.setValueAtTime(0.4, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc2.connect(g2); g2.connect(mg);
    osc2.start(t); osc2.stop(t + 0.08);
  },
};
