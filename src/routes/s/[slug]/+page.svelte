<script lang="ts">
	import { app } from '#lib/state.svelte.js';
	import type { Doc } from '#lib/library.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.subject);

	const groups = $derived.by(() => {
		const g: { title: string; note: string; docs: Doc[] }[] = [];
		const notes = s.docs.filter((d) => d.kind !== 'slides');
		const slides = s.docs.filter((d) => d.kind === 'slides');
		if (notes.length) g.push({ title: 'SECTION A', note: 'the notes', docs: notes });
		if (slides.length) g.push({ title: 'SECTION B', note: 'TEE decks', docs: slides });
		return g;
	});

	function mb(b: number) {
		return (b / 1048576).toFixed(b > 10485760 ? 0 : 1);
	}
</script>

<main>
	<a class="back" href="/desk" onclick={() => (app.vt = s.slug)}>← back to the desk</a>

	<header style:--c={s.color}>
		<div class="band" style:view-transition-name="folder">
			<span class="tab">{s.slug.toUpperCase()}</span>
			<h1>{s.name}</h1>
			<p>{s.sub}</p>
		</div>
	</header>

	<section class="paper" aria-label="{s.name} documents">
		<div class="head">
			<span>ANSWER ALL QUESTIONS</span>
			<span>{s.docs.length} {s.docs.length === 1 ? 'FILE' : 'FILES'}</span>
		</div>

		{#each groups as g (g.title)}
			<div class="group">
				<h2><b>{g.title}</b> <i>{g.note}</i></h2>
				<ol>
					{#each g.docs as d, n (d.id)}
						{@const st = app.status(d.id, d.pages)}
						<li>
							<a href="/read/{d.id}" data-sveltekit-preload-data="tap" data-sveltekit-reset="false">
								<span class="q">Q{n + 1}</span>
								<span class="b" data-s={st} role="img" aria-label={st === 2 ? 'finished' : st === 1 ? 'started' : 'not opened'}></span>
								<span class="t">
									<span class="title">{d.title}</span>
									<span class="m">
										{d.pages} {d.kind === 'slides' ? 'slides' : 'pages'} · {mb(d.bytes)} MB
										{#if st === 1 && app.last[d.id]}<em>resume p.{app.last[d.id] + 1}</em>{/if}
									</span>
								</span>
								<span class="go" aria-hidden="true">→</span>
							</a>
						</li>
					{/each}
				</ol>
			</div>
		{/each}
	</section>
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: max(24px, env(safe-area-inset-top)) 16px max(64px, env(safe-area-inset-bottom));
	}
	.back {
		display: inline-block;
		margin-bottom: 18px;
		font-family: var(--hand);
		font-size: 22px;
		color: var(--pencil);
	}

	header {
		margin-bottom: -18px;
		position: relative;
		z-index: 1;
	}
	.band {
		position: relative;
		padding: 26px 24px 30px;
		border-radius: 6px 10px 0 0;
		background:
			linear-gradient(rgb(255 255 255 / 0.16), transparent 40%),
			linear-gradient(180deg, var(--c), color-mix(in oklab, var(--c) 82%, black));
		color: var(--ink);
		box-shadow: 0 -2px 6px rgb(0 0 0 / 0.25);
	}
	.tab {
		position: absolute;
		left: 18px;
		top: -17px;
		height: 18px;
		padding: 0 14px;
		border-radius: 8px 8px 0 0;
		background: color-mix(in oklab, var(--c) 82%, black);
		font-family: var(--type);
		font-size: 11px;
		letter-spacing: 0.2em;
		line-height: 18px;
		color: rgb(0 0 0 / 0.55);
	}
	h1 {
		margin: 0;
		font-family: var(--type);
		font-weight: 400;
		font-size: clamp(30px, 7vw, 46px);
		line-height: 1.05;
	}
	.band p {
		margin: 2px 0 0;
		font-family: var(--hand);
		font-size: 26px;
		line-height: 1;
		color: rgb(28 24 20 / 0.8);
	}

	.paper {
		position: relative;
		padding: 34px 22px 26px;
		border-radius: 3px 3px 6px 6px;
		color: var(--ink);
		background:
			repeating-linear-gradient(transparent 0 33px, rgb(60 90 140 / 0.13) 33px 34px),
			var(--paper);
		box-shadow:
			0 20px 44px rgb(0 0 0 / 0.5),
			0 3px 8px rgb(0 0 0 / 0.35);
		font-family: var(--type);
	}
	.paper::before {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/noise.png');
		opacity: 0.06;
		mix-blend-mode: multiply;
		pointer-events: none;
	}
	.head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.2em;
		color: var(--pencil);
	}
	.group {
		margin-top: 22px;
	}
	h2 {
		margin: 0 0 6px;
		font-weight: 400;
		font-size: 15px;
		letter-spacing: 0.14em;
	}
	h2 b {
		font-weight: 400;
	}
	h2 i {
		margin-left: 6px;
		font-family: var(--hand);
		font-style: normal;
		font-size: 22px;
		letter-spacing: 0;
		color: var(--stamp);
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li a {
		position: relative;
		display: grid;
		grid-template-columns: 34px 24px 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 13px 6px;
		border-bottom: 1px dashed rgb(0 0 0 / 0.25);
		isolation: isolate;
		touch-action: manipulation;
	}
	/* highlighter swipe, transform only */
	li a::before {
		content: '';
		position: absolute;
		inset: 6px -4px;
		z-index: -1;
		background: var(--hl);
		opacity: 0.6;
		border-radius: 2px;
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 280ms var(--ease-out);
	}
	@media (hover: hover) {
		li a:hover::before {
			transform: scaleX(1);
		}
		li a:hover .go {
			transform: translateX(4px);
		}
	}
	li a:active::before {
		transform: scaleX(1);
	}
	.q {
		font-size: 15px;
		color: var(--pencil);
	}
	.b {
		width: 20px;
		height: 20px;
		border: 2px solid var(--omr);
		border-radius: 50%;
	}
	.b[data-s='1'] {
		background: linear-gradient(90deg, var(--toner) 50%, transparent 50%);
	}
	.b[data-s='2'] {
		background: var(--toner);
	}
	.t {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.title {
		font-size: clamp(16px, 4.4vw, 19px);
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.m {
		font-family: var(--mono);
		font-size: 11px;
		letter-spacing: 0.06em;
		color: var(--pencil);
	}
	.m em {
		margin-left: 8px;
		font-family: var(--hand);
		font-style: normal;
		font-size: 19px;
		letter-spacing: 0;
		color: var(--stamp);
	}
	.go {
		font-size: 20px;
		transition: transform 200ms var(--ease-out);
	}
	@media (prefers-reduced-motion: reduce) {
		li a::before,
		.go {
			transition: none;
		}
	}
</style>
