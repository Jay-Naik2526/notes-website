<script lang="ts">
	import { app } from '#lib/state.svelte.js';
	import { seeded } from '#lib/library.js';
	import * as sfx from '#lib/sfx.js';

	// Hidden things for people who poke around.
	//  1. Konami code: the exam hall goes red alert for a few seconds.
	//  2. Type "chai" anywhere: a tea ring appears on the desk (and stays).
	const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
	let konami = 0;
	let typed = '';
	let flash = $state(false);

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.matches?.('input, textarea')) return;
		const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
		konami = k === KONAMI[konami] ? konami + 1 : k === KONAMI[0] ? 1 : 0;
		if (konami === KONAMI.length) {
			konami = 0;
			alarm();
		}
		if (e.key.length === 1) {
			typed = (typed + k).slice(-4);
			if (typed === 'chai') {
				typed = '';
				app.tea = Math.min(6, app.tea + 1);
				app.save();
				if (app.sound) sfx.bell();
			}
		}
	}
	function alarm() {
		app.alarm = true;
		flash = true;
		if (app.sound) sfx.stamp();
		setTimeout(() => (app.alarm = false), 4200);
		setTimeout(() => (flash = false), 2600);
	}
</script>

<svelte:window onkeydown={onKey} />

{#each Array.from({ length: app.tea }, (_, i) => i) as i (i)}
	<svg class="ring" viewBox="0 0 100 100" aria-hidden="true" style:left="{12 + seeded('tea', i) * 76}%" style:top="{14 + seeded('tea', i + 9) * 72}%" style:--r="{seeded('tea', i + 3) * 360}deg">
		<circle cx="50" cy="50" r="40" />
		<circle cx="50" cy="50" r="35" class="thin" />
		<path d="M20 38 A34 34 0 0 1 40 18" class="splash" />
	</svg>
{/each}

{#if flash}
	<div class="alarm" aria-hidden="true">REVISE!</div>
{/if}

<style>
	/* behind the content, above the desk */
	.ring {
		position: fixed;
		z-index: -1;
		width: 120px;
		height: 120px;
		translate: -50% -50%;
		rotate: var(--r);
		pointer-events: none;
		opacity: 0.5;
		fill: none;
		stroke: #6b4426;
		mix-blend-mode: screen;
	}
	.ring circle {
		stroke-width: 3.5;
		stroke-opacity: 0.55;
	}
	.ring .thin {
		stroke-width: 1.2;
		stroke-opacity: 0.4;
	}
	.ring .splash {
		stroke-width: 2;
		stroke-linecap: round;
		stroke-opacity: 0.5;
	}
	.alarm {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		pointer-events: none;
		font-family: var(--type);
		font-size: clamp(56px, 16vw, 180px);
		letter-spacing: 0.08em;
		color: var(--stamp);
		text-shadow: 0 0 40px rgb(200 50 31 / 0.6);
		animation: slam 2600ms ease-out forwards;
		mix-blend-mode: normal;
	}
	@keyframes slam {
		0% {
			opacity: 0;
			transform: scale(2.6) rotate(-14deg);
		}
		10% {
			opacity: 1;
			transform: scale(1) rotate(-8deg);
		}
		80% {
			opacity: 1;
			transform: scale(1) rotate(-8deg);
		}
		100% {
			opacity: 0;
			transform: scale(1.05) rotate(-8deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.alarm {
			animation: none;
			opacity: 1;
		}
	}
</style>
