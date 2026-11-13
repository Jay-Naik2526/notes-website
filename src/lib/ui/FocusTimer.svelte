<script lang="ts">
	import { app } from '#lib/state.svelte.js';
	import { pomo } from '#lib/timer.svelte.js';

	/** show the floating button (hidden in the reader, where the time lives in the top bar instead) */
	let { floating = true }: { floating?: boolean } = $props();
	let open = $state(false);

	// one clock for the whole app: ticks only while a timer is running
	$effect(() => {
		if (!app.timer) return;
		const t = setInterval(() => (pomo.now = Date.now()), 500);
		return () => clearInterval(t);
	});
	$effect(() => {
		if (app.timer && pomo.now >= app.timer.endsAt) pomo.advance();
	});

	const brk = $derived(app.timer?.phase === 'break');
	const C = 2 * Math.PI * 15;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} onpointerdown={(e) => open && !(e.target as HTMLElement).closest('.timer') && (open = false)} />

{#if floating}
	<div class="timer" class:brk>
		{#if open}
			<div class="pop" role="dialog" aria-label="Chai-break timer">
				{#if app.timer}
					<p class="st">{brk ? '☕ Chai break' : 'Focus session'} · <b>{pomo.clock}</b></p>
					<button onclick={() => { pomo.stop(); open = false; }}>Stop</button>
				{:else}
					<p class="st">Study in bursts. The lamp warms up when it's chai time.</p>
					<button onclick={() => { pomo.start(25); open = false; }}>Focus 25 <i>+ 5 break</i></button>
					<button onclick={() => { pomo.start(50); open = false; }}>Focus 50 <i>+ 10 break</i></button>
				{/if}
			</div>
		{/if}
		<button class="fab" onclick={() => (open = !open)} aria-expanded={open} aria-label={app.timer ? `${brk ? 'Break' : 'Focus'} timer ${pomo.clock}` : 'Chai-break timer'}>
			{#if app.timer}
				<svg viewBox="0 0 36 36" width="44" height="44" aria-hidden="true">
					<circle cx="18" cy="18" r="15" class="track" />
					<circle cx="18" cy="18" r="15" class="prog" stroke-dasharray={C} stroke-dashoffset={C * (1 - pomo.fraction)} transform="rotate(-90 18 18)" />
				</svg>
				<span class="clock">{pomo.clock}</span>
			{:else}
				<span class="cup" aria-hidden="true">☕</span>
			{/if}
		</button>
	</div>
{/if}

<style>
	.timer {
		position: fixed;
		left: max(14px, env(safe-area-inset-left));
		bottom: max(14px, env(safe-area-inset-bottom));
		z-index: 70;
		font-family: var(--type);
	}
	.fab {
		position: relative;
		display: grid;
		place-items: center;
		min-width: 48px;
		height: 48px;
		padding: 0;
		background: var(--paper);
		color: var(--ink);
		border: 0;
		border-radius: 24px;
		cursor: pointer;
		box-shadow: 0 8px 22px rgb(0 0 0 / 0.5);
		touch-action: manipulation;
	}
	.fab:has(.clock) {
		min-width: 112px;
	}
	.cup {
		font-size: 22px;
	}
	svg {
		position: absolute;
		left: 2px;
		top: 2px;
	}
	.track {
		fill: none;
		stroke: rgb(0 0 0 / 0.12);
		stroke-width: 3;
	}
	.prog {
		fill: none;
		stroke: var(--omr);
		stroke-width: 3;
		stroke-linecap: round;
	}
	.brk .prog {
		stroke: #c27a1b;
	}
	.clock {
		margin-left: 40px;
		padding-right: 14px;
		font-size: 17px;
		letter-spacing: 0.04em;
	}
	.brk .fab {
		background: #f0c987;
	}
	.pop {
		position: absolute;
		left: 0;
		bottom: 58px;
		width: 240px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px;
		color: var(--ink);
		background: var(--paper);
		border-radius: 6px;
		box-shadow: 0 18px 40px rgb(0 0 0 / 0.55);
	}
	.st {
		margin: 0 0 4px;
		font-size: 13.5px;
		line-height: 1.35;
	}
	.pop button {
		padding: 10px 12px;
		text-align: left;
		font-family: inherit;
		font-size: 14px;
		color: var(--ink);
		background: rgb(0 0 0 / 0.06);
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}
	.pop button i {
		font-family: var(--mono);
		font-style: normal;
		font-size: 11px;
		color: var(--pencil);
	}
	@media (hover: hover) {
		.pop button:hover {
			background: rgb(243 213 74 / 0.6);
		}
	}
</style>
