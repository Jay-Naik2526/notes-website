<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { PageStore, type Manifest } from './pack';
	import { app } from '#lib/state.svelte.js';
	import { COLORS, uid, type MarkColor } from '#lib/marks.js';

	let {
		manifest,
		docId,
		initialPage = 0,
		tool = 'off',
		color = 'y',
		onpage,
		onzoom
	}: {
		manifest: Manifest;
		docId: string;
		initialPage?: number;
		/** pen tool: draw highlights, drop sticky notes, or none (plain reading) */
		tool?: 'off' | 'highlight' | 'note';
		color?: MarkColor;
		onpage?: (i: number) => void;
		onzoom?: (z: number) => void;
	} = $props();

	const GUTTER = 12;
	const TOP_PAD = 24;
	const CHROME = 60; // sticky bar height we scroll under
	const BREATH = 10; // gap between the bar and a page we jump to
	// A viewer is created per document ({#key} in the page), so reading the prop once is intended.
	// svelte-ignore state_referenced_locally
	const n = manifest.pages;

	let stageEl = $state<HTMLElement>();
	/** document y of the top of the page stack (the sticky bar sits above it in the flow) */
	let offset = 0;
	const measure = () => {
		if (stageEl) offset = stageEl.getBoundingClientRect().top + window.scrollY;
	};
	/** scroll position relative to the page stack */
	const sy = () => window.scrollY - offset;

	let vw = $state(window.innerWidth);
	let vh = $state(window.innerHeight);
	let zoom = $state(1);
	let pinch = $state(1); // native pinch-zoom factor from visualViewport
	const dpr = window.devicePixelRatio || 1;

	const gap = $derived(vw < 640 ? 10 : 18);
	// slides are landscape: let them use more of a wide screen
	// svelte-ignore state_referenced_locally
	const maxW = manifest.ar[0] < 0.9 ? 1040 : 860;
	const pageW = $derived(Math.min(vw - GUTTER * 2, maxW) * zoom);
	const layout = $derived.by(() => {
		const tops: number[] = new Array(n);
		let y = TOP_PAD;
		for (let i = 0; i < n; i++) {
			tops[i] = y;
			y += pageW * manifest.ar[i] + gap;
		}
		return { tops, total: y + 96 };
	});
	// Only ask for the 2x tier when the screen can actually show the extra pixels.
	const hiNeeded = $derived(pageW * dpr * pinch > manifest.md.w * 1.3);

	let win = $state({ from: 0, to: Math.min(n - 1, 2), v0: 0, v1: 0 });
	let current = 0;
	const range = $derived(Array.from({ length: win.to - win.from + 1 }, (_, k) => win.from + k));

	const urls = $state<Record<string, string>>({});
	const scan = $state<Record<number, boolean>>({});
	const t0 = performance.now();

	// svelte-ignore state_referenced_locally
	const store = new PageStore(manifest);
	store.onready = (key, url) => {
		urls[key] = url;
		// The copier scan bar plays only for pages that arrive right after the document opens.
		// Never while scrolling: that is a hundreds-of-times-a-day action and must stay instant.
		if (key.startsWith('md:') && performance.now() - t0 < 2200) {
			const i = Number(key.slice(3));
			if (i >= win.v0 && i <= win.v1) scan[i] = true;
		}
	};
	store.onevict = (key) => {
		delete urls[key];
	};

	// largest i with tops[i] <= y
	function idx(y: number) {
		const t = layout.tops;
		let lo = 0;
		let hi = n - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (t[mid] <= y) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	function compute() {
		const y = sy();
		const buf = vh * 1.2;
		const next = {
			from: idx(y - buf),
			to: Math.min(n - 1, idx(y + vh + buf)),
			v0: idx(y),
			v1: Math.min(n - 1, idx(y + vh))
		};
		if (next.from !== win.from || next.to !== win.to || next.v0 !== win.v0 || next.v1 !== win.v1) win = next;
		const cur = idx(y + vh * 0.4);
		if (cur !== current) {
			current = cur;
			onpage?.(cur);
		}
	}

	// don't fetch anything until we've scrolled to the starting page (saves pointless downloads)
	let ready = $state(false);
	// The sharp tier is big (decode + GPU upload). While the reader is flinging through pages we only
	// handle the light tier, and upgrade the pages they stop on once scrolling settles.
	let settled = $state(true);
	let settleTimer: ReturnType<typeof setTimeout>;

	$effect(() => {
		const w = win;
		const hi = hiNeeded && settled;
		if (!ready) return;
		const jobs: { tier: 'md' | 'hi'; i: number }[] = [];
		for (let i = w.from; i <= w.to; i++) {
			jobs.push({ tier: 'md', i });
			if (hi && i >= w.v0 - 1 && i <= w.v1 + 1) jobs.push({ tier: 'hi', i });
		}
		store.setWanted(jobs, Math.round((w.v0 + w.v1) / 2));
	});

	// layout changes (zoom / resize) move every page: recompute which ones are on screen
	$effect(() => {
		layout;
		compute();
	});

	let ticking = false;
	function onScroll() {
		if (hiNeeded) {
			settled = false;
			clearTimeout(settleTimer);
			settleTimer = setTimeout(() => (settled = true), 170);
		}
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			ticking = false;
			compute();
		});
	}
	/** Run a layout-changing update while keeping the same spot of the same page under the reader's eye. */
	async function reflow(change: () => void) {
		const i = idx(sy());
		const frac = (sy() - layout.tops[i]) / (pageW * manifest.ar[i]);
		change();
		await tick();
		measure();
		window.scrollTo(window.scrollX, offset + layout.tops[i] + frac * pageW * manifest.ar[i]);
	}
	function onResize() {
		vh = window.innerHeight; // the mobile URL bar collapsing only changes height: no reflow needed
		if (window.innerWidth !== vw) reflow(() => (vw = window.innerWidth));
	}

	export async function setZoom(z: number) {
		z = Math.min(3, Math.max(0.6, Math.round(z * 100) / 100));
		if (z === zoom) return;
		await reflow(() => {
			zoom = z;
		});
		onzoom?.(z);
		window.scrollTo((document.documentElement.scrollWidth - window.innerWidth) / 2, window.scrollY);
	}
	export function zoomBy(f: number) {
		return setZoom(zoom * f);
	}
	export function goToPage(i: number) {
		i = Math.min(n - 1, Math.max(0, i));
		window.scrollTo(window.scrollX, offset + layout.tops[i] - CHROME - BREATH);
	}

	// ---------- annotations ----------
	type Draft = { p: number; x0: number; y0: number; x1: number; y1: number };
	let draft = $state<Draft | null>(null);
	let focusNote = $state('');
	let pendingDelete: string | null = null;
	let moved = false;

	const lineH = (p: number) => (manifest.ar[p] > 1 ? 0.0135 : 0.045); // one text line, as a fraction of the page height

	function pt(e: PointerEvent, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
	}
	function pdown(e: PointerEvent, p: number) {
		if (tool === 'off' || (e.pointerType === 'mouse' && e.button !== 0)) return;
		if ((e.target as HTMLElement).closest('.note, .ear')) return;
		if (tool === 'note') return; // notes are placed on click (see pclick), after the browser has finished moving focus
		const el = e.currentTarget as HTMLElement;
		const { x, y } = pt(e, el);
		// a tap on an existing highlight removes it; a drag makes a new one
		pendingDelete = app.marksOn(docId, p).find((m) => m.k === 'h' && x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h)?.id ?? null;
		moved = false;
		el.setPointerCapture(e.pointerId);
		draft = { p, x0: x, y0: y, x1: x, y1: y };
	}
	function pclick(e: MouseEvent, p: number) {
		if (tool !== 'note' || (e.target as HTMLElement).closest('.note, .ear')) return;
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = (e.clientX - r.left) / r.width;
		const y = (e.clientY - r.top) / r.height;
		const id = uid();
		app.addMark(docId, { id, k: 'n', p, x: Math.min(Math.max(x, 0), 0.72), y: Math.min(Math.max(y, 0), 0.9), t: '' });
		focusNote = id;
	}
	function pmove(e: PointerEvent) {
		if (!draft) return;
		const { x, y } = pt(e, e.currentTarget as HTMLElement);
		if (Math.abs(x - draft.x0) > 0.006 || Math.abs(y - draft.y0) > 0.004) moved = true;
		draft = { ...draft, x1: x, y1: y };
	}
	function pup() {
		const d = draft;
		draft = null;
		if (!d) return;
		if (!moved) {
			if (pendingDelete) app.removeMark(docId, pendingDelete);
			return;
		}
		const w = Math.abs(d.x1 - d.x0);
		if (w < 0.015) return;
		const dy = Math.abs(d.y1 - d.y0);
		const lh = lineH(d.p);
		const h = dy > lh * 1.6 ? dy : lh; // a roughly horizontal swipe snaps to one clean line
		const y = dy > lh * 1.6 ? Math.min(d.y0, d.y1) : (d.y0 + d.y1) / 2 - lh / 2;
		app.addMark(docId, { id: uid(), k: 'h', p: d.p, x: Math.min(d.x0, d.x1), y: Math.max(0, y), w, h, c: color });
	}
	function focusOnMount(node: HTMLTextAreaElement, id: string) {
		if (focusNote === id) {
			node.focus();
			focusNote = '';
		}
	}
	function noteBlur(id: string, text: string) {
		if (!text.trim()) app.removeMark(docId, id);
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === '+' || e.key === '=') zoomBy(1.15);
		else if (e.key === '-') zoomBy(1 / 1.15);
		else if (e.key === '0') setZoom(1);
		else if (e.key === 'ArrowRight' || e.key === 'j') goToPage(current + 1);
		else if (e.key === 'ArrowLeft' || e.key === 'k') goToPage(current - 1);
		else return;
		e.preventDefault();
	}

	// ctrl/cmd + wheel (and trackpad pinch) zooms the page instead of the whole browser UI
	function onWheel(e: WheelEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		e.preventDefault();
		zoomBy(Math.exp(-e.deltaY * 0.01));
	}

	onMount(() => {
		const vv = window.visualViewport;
		let vt: ReturnType<typeof setTimeout>;
		const onVv = () => {
			clearTimeout(vt);
			vt = setTimeout(() => (pinch = vv?.scale ?? 1), 140);
		};
		vv?.addEventListener('resize', onVv);
		window.addEventListener('wheel', onWheel, { passive: false });
		(async () => {
			await tick();
			measure();
			// we always set our own starting scroll (navigation keeps the previous page's scroll otherwise)
			if (initialPage > 0) goToPage(initialPage);
			else window.scrollTo(0, 0);
			compute();
			ready = true;
		})();
		return () => {
			vv?.removeEventListener('resize', onVv);
			window.removeEventListener('wheel', onWheel);
			store.dispose();
		};
	});
</script>

<svelte:window onscroll={onScroll} onresize={onResize} onkeydown={onKey} />

<div class="stage" bind:this={stageEl} style:height="{layout.total}px" style:width="max(100%, {pageW + GUTTER * 2}px)" role="document" aria-label="Document pages">
	{#each range as i (i)}
		{@const src = urls['hi:' + i] ?? urls['md:' + i]}
		{@const ear = app.hasEar(docId, i)}
		<!-- Pen tools are pointer-driven by nature; keyboard readers get the page text and the dog-ear button instead. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<div
			class="slot"
			role="group"
			aria-label="Page {i + 1}"
			data-tool={tool}
			style:width="{pageW}px"
			style:height="{pageW * manifest.ar[i]}px"
			style:transform="translate3d(-50%, {layout.tops[i]}px, 0)"
			onpointerdown={(e) => pdown(e, i)}
			onclick={(e) => pclick(e, i)}
			onpointermove={pmove}
			onpointerup={pup}
			onpointercancel={() => (draft = null)}
		>
			<div class="face" style:background-image="url({manifest.lo[i]})">
				{#if src}
					<img {src} alt="Page {i + 1} of {n}" draggable="false" decoding="async" />
				{/if}
			</div>

			{#each app.marksOn(docId, i) as m (m.id)}
				{#if m.k === 'h'}
					<span class="hl" style:left="{m.x * 100}%" style:top="{m.y * 100}%" style:width="{m.w * 100}%" style:height="{m.h * 100}%" style:--c={COLORS[m.c].css}></span>
				{:else}
					<div class="note" style:left="{m.x * 100}%" style:top="{m.y * 100}%">
						<textarea
							value={m.t}
							rows="2"
							placeholder="note…"
							aria-label="Sticky note on page {i + 1}"
							use:focusOnMount={m.id}
							oninput={(e) => app.setNote(docId, m.id, e.currentTarget.value)}
							onblur={(e) => noteBlur(m.id, e.currentTarget.value)}
						></textarea>
						<button class="x" aria-label="Delete note" onpointerdown={(e) => e.preventDefault()} onclick={() => app.removeMark(docId, m.id)}>×</button>
					</div>
				{/if}
			{/each}
			{#if draft && draft.p === i}
				{@const dy = Math.abs(draft.y1 - draft.y0)}
				{@const lh = lineH(i)}
				<span
					class="hl draft"
					style:left="{Math.min(draft.x0, draft.x1) * 100}%"
					style:width="{Math.abs(draft.x1 - draft.x0) * 100}%"
					style:top="{(dy > lh * 1.6 ? Math.min(draft.y0, draft.y1) : (draft.y0 + draft.y1) / 2 - lh / 2) * 100}%"
					style:height="{(dy > lh * 1.6 ? dy : lh) * 100}%"
					style:--c={COLORS[color].css}
				></span>
			{/if}

			<button class="ear" class:on={ear} onclick={() => app.toggleEar(docId, i)} aria-pressed={ear} aria-label={ear ? 'Remove dog-ear from page ' + (i + 1) : 'Dog-ear page ' + (i + 1)} title={ear ? 'Remove dog-ear' : 'Dog-ear this page (b)'}>
				<span class="cut"></span><span class="flap"></span>
			</button>

			{#if i === 0}<span class="staple" aria-hidden="true"></span>{/if}
			{#if scan[i]}
				<span class="scan" aria-hidden="true" onanimationend={() => delete scan[i]}></span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.stage {
		position: relative;
		margin: 0 auto;
	}
	.slot {
		position: absolute;
		left: 50%;
		top: 0;
		overflow: hidden;
		background-color: var(--paper);
		border-radius: 2px;
		box-shadow:
			0 0 0 1px rgb(0 0 0 / 0.25),
			0 10px 28px rgb(0 0 0 / 0.5),
			0 2px 5px rgb(0 0 0 / 0.45);
		contain: layout paint style;
		/* promote once, never repaint while scrolling */
		will-change: transform;
	}
	.face {
		position: absolute;
		inset: 0;
		background-color: var(--paper);
		background-size: 100% 100%;
	}
	/* 3 AM mode: the page itself is inverted; shadows, marks and the dog-ear are not */
	:global(html[data-night]) .face {
		filter: invert(0.92) hue-rotate(180deg) brightness(0.92);
		background-color: #1d1b18;
	}
	:global(html[data-night]) .scan {
		background: #1d1b18;
	}
	.slot[data-tool='highlight'] {
		cursor: crosshair;
		touch-action: pan-y; /* vertical swipes still scroll, horizontal swipes draw */
	}
	.slot[data-tool='note'] {
		cursor: copy;
		touch-action: manipulation;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
		-webkit-user-drag: none;
	}

	/* highlighter marks */
	.hl {
		position: absolute;
		background: var(--c);
		mix-blend-mode: multiply;
		border-radius: 2px;
		pointer-events: none;
	}
	.hl.draft {
		opacity: 0.8;
	}
	:global(html[data-night]) .hl {
		mix-blend-mode: normal;
		opacity: 0.4;
	}

	/* sticky notes */
	.note {
		position: absolute;
		width: min(150px, 38%);
		padding: 4px 6px 6px;
		background: #f6e27a;
		color: #2a2418;
		border-radius: 2px 2px 8px 2px;
		box-shadow:
			0 6px 14px rgb(0 0 0 / 0.35),
			0 1px 2px rgb(0 0 0 / 0.3);
		transform: rotate(-1.5deg);
		z-index: 3;
	}
	.note textarea {
		display: block;
		width: 100%;
		min-height: 46px;
		resize: none;
		background: transparent;
		border: 0;
		outline: none;
		font-family: var(--hand);
		font-size: 23px;
		line-height: 1.12;
		color: #1f1a0e;
	}
	.note textarea::placeholder {
		color: rgb(42 36 24 / 0.45);
	}
	.note .x {
		position: absolute;
		top: -9px;
		right: -9px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--ink);
		color: var(--paper);
		font-size: 14px;
		line-height: 22px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 120ms;
	}
	.note:hover .x,
	.note:focus-within .x {
		opacity: 1;
	}
	@media (hover: none) {
		.note .x {
			opacity: 1;
		}
	}

	/* dog-ear: a folded top-right corner, plus the notch it leaves */
	.ear {
		position: absolute;
		top: 0;
		right: 0;
		width: 46px;
		height: 46px;
		padding: 0;
		background: none;
		border: 0;
		cursor: pointer;
		z-index: 4;
		touch-action: manipulation;
	}
	.ear .cut,
	.ear .flap {
		position: absolute;
		top: 0;
		right: 0;
		width: 30px;
		height: 30px;
		transform-origin: top right;
		transition:
			transform 180ms cubic-bezier(0.22, 0.8, 0.2, 1),
			opacity 120ms;
		opacity: 0;
		transform: scale(0.4);
	}
	.ear .cut {
		background: #17120e;
		clip-path: polygon(0 0, 100% 0, 100% 100%);
	}
	.ear .flap {
		background: linear-gradient(225deg, #cdbf98 40%, #e9dfc2);
		clip-path: polygon(0 0, 100% 100%, 0 100%);
		filter: drop-shadow(-2px 3px 2px rgb(0 0 0 / 0.35));
	}
	.ear.on .cut,
	.ear.on .flap {
		opacity: 1;
		transform: none;
	}
	@media (hover: hover) {
		.ear:not(.on):hover .flap {
			opacity: 0.55;
			transform: scale(0.75);
		}
		.ear:not(.on):hover .cut {
			opacity: 0.55;
			transform: scale(0.75);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ear .cut,
		.ear .flap {
			transition: none;
		}
	}

	/* B: the staple holding the bundle together */
	.staple {
		position: absolute;
		top: 14px;
		left: 12px;
		width: 22px;
		height: 3px;
		border-radius: 1px;
		background: linear-gradient(#cfd2d6, #7d8187);
		transform: rotate(38deg);
		box-shadow: 0 1px 1px rgb(0 0 0 / 0.4);
		opacity: 0.9;
	}

	/* B: copier scan bar. A paper-coloured veil slides down, its leading edge is the lit bar. */
	.scan {
		position: absolute;
		inset: 0;
		background: var(--paper);
		pointer-events: none;
		animation: scan 760ms cubic-bezier(0.32, 0.6, 0.25, 1) forwards;
	}
	.scan::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -4px;
		height: 6px;
		background: linear-gradient(#fffdf0, #ffe7a3);
		box-shadow:
			0 0 14px 4px rgb(255 224 140 / 0.7),
			0 -6px 24px 8px rgb(255 240 190 / 0.35);
	}
	@keyframes scan {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(0, calc(100% + 8px), 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.scan {
			display: none;
		}
	}
</style>
