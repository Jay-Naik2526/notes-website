<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { app } from '#lib/state.svelte.js';
	import { loadLibrary } from '#lib/library.js';
	import { ensureIndex, search, type Hit } from '#lib/search.js';

	let q = $state('');
	let active = $state(0);
	let input = $state<HTMLInputElement>();
	let entries = $state<Awaited<ReturnType<typeof ensureIndex>> | null>(null);
	let list = $state<HTMLElement>();

	const hits = $derived<Hit[]>(entries && q.trim() ? search(entries, q) : []);
	const pagesIndexed = $derived(entries ? entries.reduce((a, e) => a + e.pages.length, 0) : 0);

	$effect(() => {
		if (app.searchOpen) {
			if (!entries) loadLibrary().then(ensureIndex).then((e) => (entries = e));
			tick().then(() => input?.focus());
		}
	});
	$effect(() => {
		hits;
		active = 0;
	});

	function close() {
		app.searchOpen = false;
		q = '';
	}
	function open(h: Hit) {
		close();
		goto(`/read/${h.id}?p=${h.page + 1}`, { reset: false });
	}
	function onWindowKey(e: KeyboardEvent) {
		const typing = (e.target as HTMLElement)?.matches?.('input, textarea');
		if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
			e.preventDefault();
			app.searchOpen = !app.searchOpen;
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(hits.length - 1, active + 1);
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
			scrollActive();
		} else if (e.key === 'Enter' && hits[active]) open(hits[active]);
	}
	async function scrollActive() {
		await tick();
		list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
	}

	/** split a snippet around the query words so we can highlight without {@html} */
	function parts(text: string) {
		const words = q.toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return [{ t: text, m: false }];
		// straight quotes in the query also match curly quotes in the notes
		const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['\u2019\u2018]/g, "['\u2018\u2019]");
		const re = new RegExp(`(${words.map(esc).join('|')})`, 'gi');
		return text.split(re).map((t, i) => ({ t, m: i % 2 === 1 }));
	}
</script>

<svelte:window onkeydown={onWindowKey} />

{#if app.searchOpen}
	<!-- Opens instantly on purpose: search is a repeat action, motion would only slow it down. -->
	<div class="scrim" onpointerdown={close} role="presentation"></div>
	<div class="card" role="dialog" aria-modal="true" aria-label="Search all notes">
		<div class="top">
			<span class="glass" aria-hidden="true">⌕</span>
			<input
				bind:this={input}
				bind:value={q}
				onkeydown={onKey}
				placeholder="search every page of every note"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				enterkeyhint="search"
				role="combobox"
				aria-expanded={hits.length > 0}
				aria-controls="results"
			/>
			<button class="esc" onclick={close} aria-label="Close search">esc</button>
		</div>

		<div class="body" bind:this={list}>
			{#if !entries}
				<p class="msg">Reading the notes…</p>
			{:else if !q.trim()}
				<p class="msg">{pagesIndexed.toLocaleString()} pages indexed. Try “deadlock”, “LR(1)”, “simplex”.</p>
			{:else if !hits.length}
				<p class="msg">Nothing on the desk for “{q}”.</p>
			{:else}
				<ul id="results" role="listbox">
					{#each hits as h, i (h.id + ':' + h.page)}
						<li role="option" aria-selected={i === active}>
							<button onpointermove={() => (active = i)} onclick={() => open(h)} class:on={i === active}>
								<span class="dot" style:background={h.color}></span>
								<span class="meta">
									<span class="t">{h.subject} · {h.title}</span>
									<span class="p">page {h.page + 1}</span>
								</span>
								<span class="snip">
									{#each parts(h.snippet) as p, k (k)}{#if p.m}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div class="foot"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgb(8 5 3 / 0.62);
	}
	.card {
		position: fixed;
		z-index: 81;
		top: max(8vh, env(safe-area-inset-top));
		left: 50%;
		translate: -50% 0;
		width: min(680px, calc(100vw - 24px));
		max-height: min(76dvh, 620px);
		display: flex;
		flex-direction: column;
		color: var(--ink);
		background: var(--paper);
		border-radius: 6px;
		box-shadow:
			0 30px 80px rgb(0 0 0 / 0.65),
			0 4px 12px rgb(0 0 0 / 0.4);
		overflow: hidden;
		font-family: var(--type);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 2px solid var(--ink);
	}
	.glass {
		font-size: 22px;
		color: var(--pencil);
	}
	input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font-family: var(--hand);
		font-size: 29px;
		line-height: 1.1;
		color: #1d2f6f;
		outline: none;
	}
	input::placeholder {
		color: #1d2f6f;
		opacity: 0.35;
	}
	.esc {
		padding: 4px 8px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--pencil);
		background: none;
		border: 1px solid rgb(0 0 0 / 0.25);
		border-radius: 5px;
		cursor: pointer;
	}
	.body {
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 90px;
	}
	.msg {
		margin: 0;
		padding: 22px 18px;
		font-size: 15px;
		color: var(--pencil);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li button {
		display: grid;
		grid-template-columns: 10px 1fr;
		gap: 4px 12px;
		width: 100%;
		padding: 11px 16px;
		text-align: left;
		background: none;
		border: 0;
		border-bottom: 1px dashed rgb(0 0 0 / 0.2);
		cursor: pointer;
		color: inherit;
		font-family: inherit;
	}
	li button.on {
		background: rgb(243 213 74 / 0.55);
	}
	.dot {
		width: 10px;
		height: 10px;
		margin-top: 6px;
		border-radius: 50%;
		grid-row: 1;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}
	.t {
		font-size: 15px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.p {
		flex: none;
		font-family: var(--hand);
		font-size: 19px;
		line-height: 1;
		color: var(--stamp);
	}
	.snip {
		grid-column: 2;
		font-family: var(--mono);
		font-size: 12px;
		line-height: 1.45;
		color: #4b443b;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	mark {
		background: var(--hl);
		color: var(--ink);
		padding: 0 1px;
		border-radius: 2px;
	}
	.foot {
		display: flex;
		gap: 16px;
		padding: 8px 16px;
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.1em;
		color: var(--pencil);
		border-top: 1px solid rgb(0 0 0 / 0.15);
	}
	@media (max-width: 560px) {
		.card {
			top: max(10px, env(safe-area-inset-top));
			max-height: calc(100dvh - 20px);
		}
		.foot {
			display: none;
		}
	}
</style>
