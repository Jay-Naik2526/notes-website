<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '#lib/state.svelte.js';

	let { mode = 'follow' }: { mode?: 'follow' | 'still' | 'off' } = $props();

	// The lamp is a tiny canvas (1/4 resolution) stretched over the screen. A soft radial gradient
	// scales up perfectly, costs almost nothing to redraw, and never forces the page underneath to repaint.
	const SCALE = 0.25;
	let canvas: HTMLCanvasElement;
	let redraw: () => void = () => {};
	let restart: () => void = () => {};

	// chai break = warm amber lamp, konami = red alert
	const tint = $derived(app.alarm ? 'alarm' : app.timer?.phase === 'break' ? 'break' : 'work');
	const PALETTE = {
		work: { glow: '255, 210, 140', dark: '10, 6, 3' },
		break: { glow: '255, 170, 70', dark: '28, 12, 2' },
		alarm: { glow: '255, 70, 50', dark: '40, 2, 2' }
	} as const;

	$effect(() => {
		mode;
		tint;
		redraw();
		restart(); // leaving the reader: wake the lamp loop up again
	});

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let W = 0;
		let H = 0;
		let x = 0;
		let y = 0;
		let tx = 0;
		let ty = 0;
		let lastMove = -1e9;
		let raf = 0;
		let lastDraw = 0;

		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const weak = ((navigator as any).deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
		const alive = !reduce && !weak;
		// fingers can't hover, so on touch screens the lamp is a wide, gentle glow rather than a spotlight
		const coarse = matchMedia('(pointer: coarse)').matches;

		function size() {
			W = window.innerWidth;
			H = window.innerHeight;
			canvas.width = Math.ceil(W * SCALE);
			canvas.height = Math.ceil(H * SCALE);
			if (!lastMove || x === 0) {
				x = tx = W * 0.5;
				y = ty = H * 0.35;
			}
			draw();
		}

		function draw() {
			ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
			ctx.clearRect(0, 0, W, H);
			if (mode === 'off') return; // reader: pages are shown untouched
			const still = mode === 'still';
			const cx = still ? W * 0.5 : x;
			const cy = still ? -H * 0.08 : y;
			const R = Math.max(W, H) * (still ? 1.05 : coarse ? 1.5 : 0.95);
			const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
			// warm pool of light, long soft falloff, shadowed (but still legible) corners.
			// Same colour for every dark stop so the gradient never shows a ring.
			const P = PALETTE[tint];
			const boost = tint === 'work' ? 1 : 1.9;
			g.addColorStop(0, `rgba(${P.glow}, ${0.1 * boost})`);
			g.addColorStop(0.3, `rgba(${P.glow}, ${0.03 * boost})`);
			g.addColorStop(0.45, `rgba(${P.dark}, 0)`);
			g.addColorStop(0.75, `rgba(${P.dark}, ${still ? 0.14 : 0.3})`);
			g.addColorStop(1, `rgba(${P.dark}, ${still ? 0.4 : coarse ? 0.5 : 0.62})`);
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, W, H);
		}
		redraw = draw;

		function frame(now: number) {
			raf = 0;
			if (document.hidden || mode !== 'follow' || coarse) return;
			const idle = now - lastMove > 3500;
			if (idle && alive) {
				// nobody is steering: let the lamp sway like it is on a flexible arm (30fps is plenty)
				if (now - lastDraw < 33) {
					raf = requestAnimationFrame(frame);
					return;
				}
				tx = W * (0.5 + 0.22 * Math.sin(now / 3300));
				ty = H * (0.38 + 0.16 * Math.sin(now / 2500 + 1.3));
			}
			x += (tx - x) * 0.14;
			y += (ty - y) * 0.14;
			lastDraw = now;
			draw();
			if (idle && alive) raf = requestAnimationFrame(frame);
			else if (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) raf = requestAnimationFrame(frame);
		}
		const kick = () => {
			if (coarse) return; // on mobile/touch screens, lamp is static to ensure 60fps scrolling
			if (!raf) raf = requestAnimationFrame(frame);
		};
		restart = kick;

		function move(e: PointerEvent) {
			tx = e.clientX;
			ty = e.clientY;
			lastMove = performance.now();
			kick();
		}
		function vis() {
			if (!document.hidden) kick();
		}

		size();
		window.addEventListener('resize', size);
		window.addEventListener('pointermove', move, { passive: true });
		document.addEventListener('visibilitychange', vis);
		kick();
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', size);
			window.removeEventListener('pointermove', move);
			document.removeEventListener('visibilitychange', vis);
		};
	});
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 60;
	}
</style>
