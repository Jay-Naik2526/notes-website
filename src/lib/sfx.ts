/** Tiny synthesized sound effects: no audio files to download. Off unless the visitor turns it on. */
let ctx: AudioContext | null = null;

function ac() {
	ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
}

function noise(c: AudioContext, dur: number) {
	const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
	const src = c.createBufferSource();
	src.buffer = buf;
	return src;
}

/** Rubber stamp hitting a desk: low thud + short paper slap. */
export function stamp() {
	const c = ac();
	const t = c.currentTime;
	const o = c.createOscillator();
	const g = c.createGain();
	o.type = 'sine';
	o.frequency.setValueAtTime(150, t);
	o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
	g.gain.setValueAtTime(0.7, t);
	g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
	o.connect(g).connect(c.destination);
	o.start(t);
	o.stop(t + 0.25);

	const n = noise(c, 0.09);
	const f = c.createBiquadFilter();
	f.type = 'lowpass';
	f.frequency.value = 1800;
	const ng = c.createGain();
	ng.gain.value = 0.35;
	n.connect(f).connect(ng).connect(c.destination);
	n.start(t);
}

/** Ballpoint scribble: filtered noise swish. */
export function scribble() {
	const c = ac();
	const t = c.currentTime;
	const n = noise(c, 0.32);
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = 3200;
	f.Q.value = 0.8;
	const g = c.createGain();
	g.gain.value = 0.18;
	n.connect(f).connect(g).connect(c.destination);
	n.start(t);
}

/** Two soft pings: a focus session ended / chai is ready. */
export function bell() {
	const c = ac();
	[0, 0.22].forEach((delay, k) => {
		const t = c.currentTime + delay;
		const o = c.createOscillator();
		const g = c.createGain();
		o.type = 'sine';
		o.frequency.value = k ? 880 : 660;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
		o.connect(g).connect(c.destination);
		o.start(t);
		o.stop(t + 1);
	});
}
