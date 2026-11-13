<script lang="ts">
	import { onMount } from 'svelte';
	import gsap from 'gsap';
	import Folder from '#lib/ui/Folder.svelte';
	import { app } from '#lib/state.svelte.js';
	import { seatFor } from '#lib/library.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const subjects = $derived(data.library.subjects);
	let grid: HTMLElement;

	// every page the visitor folded, across all subjects
	const earList = $derived(subjects.flatMap((s) => s.docs.flatMap((d) => (app.ears[d.id] ?? []).map((p) => ({ s, d, p })))));

	const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone;
	let hint = $state('');
	async function install() {
		if (app.install) {
			await app.install.prompt();
		} else {
			hint = 'On iPhone/iPad: tap the Share button, then “Add to Home Screen”.';
		}
	}

	onMount(() => {
		// Coming back from a folder? The shared transition already did the work: stay still.
		if (app.vt || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		gsap.from(grid.children, { y: 40, opacity: 0, rotate: 3, duration: 0.55, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
	});
</script>

<main>
	<header>
		<a class="back" href="/">← hall ticket</a>
		<h1>{app.name ? `Pick a folder, ${app.name.split(' ')[0]}.` : 'Pick a folder.'}</h1>
		<p class="seat">Seat <b>{seatFor(app.name)}</b> · lamp's on, move it around</p>
		<div class="tools">
			<button class="find" onclick={() => (app.searchOpen = true)}>
				<span aria-hidden="true">⌕</span> search every page <kbd>/</kbd>
			</button>
			{#if app.install || ios}
				<button class="find alt" onclick={install}><span aria-hidden="true">⤓</span> install as app</button>
			{/if}
		</div>
		{#if hint}<p class="hint">{hint}</p>{/if}
	</header>

	<div class="grid" bind:this={grid}>
		{#each subjects as s, i (s.slug)}
			<Folder subject={s} index={i} />
		{/each}
	</div>

	{#if earList.length}
		<section class="ears" aria-label="Your dog-ears">
			<h2>Your dog-ears</h2>
			<ul>
				{#each earList as e (e.d.id + ':' + e.p)}
					<li>
						<a href="/read/{e.d.id}?p={e.p + 1}" data-sveltekit-reset="false">
							<i style:background={e.s.color}></i>
							<span>{e.s.name} · {e.d.title}</span>
							<b>p.{e.p + 1}</b>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1040px;
		margin: 0 auto;
		padding: max(28px, env(safe-area-inset-top)) 20px max(64px, env(safe-area-inset-bottom));
	}
	header {
		padding: 10px 0 44px;
	}
	.back {
		font-family: var(--hand);
		font-size: 22px;
		color: var(--pencil);
	}
	h1 {
		margin: 6px 0 4px;
		font-family: var(--type);
		font-weight: 400;
		font-size: clamp(34px, 7vw, 60px);
		line-height: 1.05;
		letter-spacing: 0.01em;
	}
	.seat {
		margin: 0;
		font-family: var(--mono);
		font-size: 12px;
		letter-spacing: 0.1em;
		color: var(--pencil);
	}
	.seat b {
		color: var(--hl);
		font-weight: 500;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 22px;
	}
	.hint {
		margin: 12px 0 0;
		font-family: var(--hand);
		font-size: 21px;
		color: var(--hl);
	}
	.find.alt {
		transform: rotate(0.9deg);
	}
	.ears {
		margin-top: 64px;
		position: relative;
		max-width: 560px;
		padding: 24px 22px 14px;
		color: var(--ink);
		background: var(--paper);
		border-radius: 4px;
		box-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
		transform: rotate(-0.4deg);
		font-family: var(--type);
	}
	/* a folded corner, because of course */
	.ears::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 30px;
		height: 30px;
		background: linear-gradient(225deg, #17120e 50%, #cdbf98 50%);
		border-radius: 0 4px 0 0;
		filter: drop-shadow(-2px 3px 2px rgb(0 0 0 / 0.3));
	}
	.ears h2 {
		margin: 0 0 8px;
		font-weight: 400;
		font-size: 22px;
	}
	.ears ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ears a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 2px;
		border-bottom: 1px dashed rgb(0 0 0 / 0.25);
	}
	.ears i {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 50%;
	}
	.ears span {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		overflow-wrap: anywhere;
	}
	.ears b {
		font-family: var(--hand);
		font-weight: 400;
		font-size: 21px;
		color: var(--stamp);
	}
	@media (hover: hover) {
		.ears a:hover {
			background: rgb(243 213 74 / 0.45);
		}
	}
	.find {
		margin-top: 0;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 11px 16px;
		color: var(--ink);
		background: var(--paper);
		border: 0;
		border-radius: 4px;
		font-family: var(--type);
		font-size: 15px;
		cursor: pointer;
		box-shadow: 0 8px 20px rgb(0 0 0 / 0.4);
		transform: rotate(-0.8deg);
		touch-action: manipulation;
	}
	.find span {
		font-size: 19px;
	}
	.find kbd {
		padding: 1px 7px;
		font-family: var(--mono);
		font-size: 11px;
		border: 1px solid rgb(0 0 0 / 0.3);
		border-radius: 4px;
		color: var(--pencil);
	}
	@media (hover: none) {
		.find kbd {
			display: none;
		}
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 54px 34px;
	}
	@media (max-width: 600px) {
		.grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 40px 14px;
		}
		header {
			padding-bottom: 32px;
		}
	}
</style>
