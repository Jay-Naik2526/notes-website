<script lang="ts">
	import { app } from '#lib/state.svelte.js';
	import { seeded, type Subject } from '#lib/library.js';

	let { subject: s, index = 0 }: { subject: Subject; index?: number } = $props();

	const rot = $derived((seeded(s.slug, 3) - 0.5) * 4.4); // -2.2..2.2 deg, stable per folder
	const drop = $derived(Math.round((seeded(s.slug, 4) - 0.5) * 14));
	const pages = $derived(s.docs.reduce((a, d) => a + d.pages, 0));
	// how much of this subject has been read on this device, one OMR bubble per file
	const prog = $derived.by(() => {
		let read = 0;
		for (const d of s.docs) read += Math.min(d.pages, (app.furthest[d.id] ?? -1) + 1);
		return { pct: pages ? Math.round((read / pages) * 100) : 0, st: s.docs.map((d) => app.status(d.id, d.pages)) };
	});
</script>

<a
	class="folder"
	href="/s/{s.slug}"
	style:--c={s.color}
	style:--rot="{rot}deg"
	style:--drop="{drop}px"
	style:--i={index}
	onclick={() => (app.vt = s.slug)}
>
	<span class="vt" style:view-transition-name={app.vt === s.slug ? 'folder' : 'none'}>
		<span class="back"><span class="tab">{s.slug.toUpperCase()}</span></span>
		<span class="sheet s1"></span>
		<span class="sheet s2"></span>
		<span class="front">
			<span class="label">
				<span class="name">{s.name}</span>
			</span>
			<span class="sub">{s.sub}</span>
			<span class="meta">{s.docs.length} {s.docs.length === 1 ? 'file' : 'files'} · {pages} pages</span>
			<span class="prog" aria-label="{prog.pct}% read">
				{#each prog.st as st, i (i)}<i data-s={st}></i>{/each}
				<span>{prog.pct ? `${prog.pct}% read` : 'unopened'}</span>
			</span>
		</span>
	</span>
</a>

<style>
	.folder {
		display: block;
		transform: translateY(var(--drop)) rotate(var(--rot));
		transition: transform 260ms var(--ease-out);
		touch-action: manipulation;
	}
	.vt {
		position: relative;
		display: block;
		aspect-ratio: 5 / 4;
	}
	.back {
		position: absolute;
		inset: 16px 0 0;
		background: color-mix(in oklab, var(--c) 78%, black);
		border-radius: 4px 10px 8px 8px;
		box-shadow:
			0 18px 34px rgb(0 0 0 / 0.5),
			0 3px 6px rgb(0 0 0 / 0.4);
	}
	.tab {
		position: absolute;
		left: 14px;
		top: -16px;
		min-width: 92px;
		height: 18px;
		padding: 0 14px;
		background: color-mix(in oklab, var(--c) 78%, black);
		border-radius: 8px 8px 0 0;
		font-family: var(--type);
		font-size: 11px;
		letter-spacing: 0.2em;
		line-height: 18px;
		color: rgb(0 0 0 / 0.55);
	}
	.sheet {
		position: absolute;
		left: 6%;
		right: 6%;
		top: 30px;
		bottom: 40%;
		background: var(--paper);
		border-radius: 3px;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
		transition: transform 260ms var(--ease-out);
	}
	.s1 {
		transform: rotate(-1.6deg);
		background: var(--paper-2);
	}
	.s2 {
		transform: rotate(1.1deg) translateY(4px);
	}
	.front {
		position: absolute;
		inset: 46px 0 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 2px;
		padding: 16px 18px 16px;
		border-radius: 4px 10px 8px 8px;
		color: var(--ink);
		background:
			linear-gradient(rgb(255 255 255 / 0.16), transparent 30%),
			linear-gradient(180deg, var(--c), color-mix(in oklab, var(--c) 86%, black));
		box-shadow: 0 -2px 6px rgb(0 0 0 / 0.25);
	}
	.front::before {
		/* paper fibres */
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: url('/noise.png');
		opacity: 0.08;
		mix-blend-mode: multiply;
	}
	.label {
		align-self: flex-start;
		max-width: 100%;
		padding: 6px 12px 4px;
		background: var(--paper);
		border-radius: 2px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
		transform: rotate(-1deg);
	}
	.name {
		font-family: var(--type);
		font-size: clamp(19px, 5.2vw, 23px);
		line-height: 1.15;
	}
	.sub {
		margin-top: 8px;
		font-family: var(--hand);
		font-size: 23px;
		line-height: 1;
		color: rgb(28 24 20 / 0.82);
	}
	.meta {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgb(28 24 20 / 0.7);
	}

	.prog {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 6px;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgb(28 24 20 / 0.7);
	}
	.prog i {
		width: 11px;
		height: 11px;
		border: 1.8px solid rgb(28 24 20 / 0.6);
		border-radius: 50%;
	}
	.prog i[data-s='1'] {
		background: linear-gradient(90deg, var(--toner) 50%, transparent 50%);
	}
	.prog i[data-s='2'] {
		background: var(--toner);
	}
	.prog span {
		margin-left: 4px;
	}

	/* two folders per row on phones: scale everything down */
	@media (max-width: 600px) {
		.vt {
			aspect-ratio: 1 / 1.05;
		}
		.back {
			inset: 12px 0 0;
		}
		.tab {
			top: -12px;
			min-width: 56px;
			height: 14px;
			padding: 0 8px;
			font-size: 9px;
			line-height: 14px;
		}
		.sheet {
			top: 22px;
		}
		.front {
			inset: 34px 0 0;
			padding: 10px;
		}
		.label {
			padding: 4px 8px 3px;
		}
		.name {
			font-size: 14px;
		}
		.sub {
			margin-top: 6px;
			font-size: 20px;
		}
		.meta {
			font-size: 9px;
			letter-spacing: 0.08em;
		}
		.prog {
			font-size: 8.5px;
			letter-spacing: 0.04em;
		}
		.prog i {
			width: 9px;
			height: 9px;
		}
	}

	@media (hover: hover) {
		.folder:hover {
			transform: translateY(calc(var(--drop) - 8px)) rotate(0deg);
		}
		.folder:hover .s1 {
			transform: translateY(-14px) rotate(-2.4deg);
		}
		.folder:hover .s2 {
			transform: translateY(-8px) rotate(1.6deg);
		}
	}
	.folder:active {
		transform: translateY(var(--drop)) rotate(var(--rot)) scale(0.985);
		transition-duration: 90ms;
	}
	@media (prefers-reduced-motion: reduce) {
		.folder,
		.sheet {
			transition: none;
		}
	}
</style>
