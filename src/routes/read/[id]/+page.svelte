<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Viewer from '#lib/platen/Viewer.svelte';
	import { app } from '#lib/state.svelte.js';
	import { pomo } from '#lib/timer.svelte.js';
	import { COLORS, type MarkColor } from '#lib/marks.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const doc = $derived(data.doc);
	const n = $derived(data.manifest.pages);
	const outline = $derived(data.manifest.outline ?? []);

	// ?p=12 (from search / a shared link) wins over the remembered page
	function startPage() {
		const p = parseInt(page.url.searchParams.get('p') ?? '', 10);
		return Number.isFinite(p) ? Math.min(Math.max(p - 1, 0), data.manifest.pages - 1) : (app.last[data.doc.id] ?? 0);
	}
	// svelte-ignore state_referenced_locally
	const initial = startPage();
	// svelte-ignore state_referenced_locally
	let cur = $state(initial);

	let viewer = $state<Viewer>();
	let zoomPct = $state(100);
	let jump = $state('');
	let editing = $state(false);

	// search result / shared link opened while already reading this document: just jump
	$effect(() => {
		const p = parseInt(page.url.searchParams.get('p') ?? '', 10);
		if (Number.isFinite(p)) untrack(() => viewer?.goToPage(p - 1));
	});

	function onpage(i: number) {
		cur = i;
		app.visit(doc.id, i);
	}
	function commitJump() {
		const v = parseInt(jump, 10);
		editing = false;
		if (!Number.isNaN(v)) viewer?.goToPage(v - 1);
	}

	// ---------- little messages ----------
	let note = $state('');
	let noteTimer: ReturnType<typeof setTimeout>;
	function flash(msg: string) {
		note = msg;
		clearTimeout(noteTimer);
		noteTimer = setTimeout(() => (note = ''), 1800);
	}

	// ---------- more-actions menu ----------
	let menu = $state(false);
	async function copyText() {
		menu = false;
		try {
			const r = await fetch(`/lib/text/${doc.id}.json`);
			const t: string[] = await r.json();
			const txt = t[cur]?.trim();
			if (!txt) return flash('No text on this page');
			await navigator.clipboard.writeText(txt);
			flash(`Copied page ${cur + 1}`);
		} catch {
			flash("Couldn't copy");
		}
	}
	async function share() {
		menu = false;
		const url = `${location.origin}/read/${doc.id}?p=${cur + 1}`;
		const title = `${doc.title} · page ${cur + 1}`;
		try {
			if (navigator.share) {
				await navigator.share({ title, url });
				return;
			}
			await navigator.clipboard.writeText(url);
			flash('Link to this page copied');
		} catch (e) {
			if ((e as Error).name !== 'AbortError') flash("Couldn't share");
		}
	}

	// ---------- dog-ears ----------
	const eared = $derived(app.hasEar(doc.id, cur));
	function toggleEar() {
		menu = false;
		app.toggleEar(doc.id, cur);
		flash(app.hasEar(doc.id, cur) ? `Dog-eared page ${cur + 1}` : 'Dog-ear removed');
	}

	// ---------- pen ----------
	let penOpen = $state(false);
	let tool = $state<'highlight' | 'note'>('highlight');
	let color = $state<MarkColor>('y');
	function togglePen() {
		menu = false;
		penOpen = !penOpen;
	}

	// ---------- 3 AM mode ----------
	function toggleNight() {
		menu = false;
		app.night = !app.night;
		app.save();
	}

	// ---------- contents drawer ----------
	let drawer = $state<null | 'contents' | 'ears' | 'notes'>(null);
	function chapterAt(p: number) {
		for (let i = outline.length - 1; i >= 0; i--) if (outline[i].p <= p) return outline[i];
		return null;
	}
	const activeChapter = $derived(chapterAt(cur));
	const ears = $derived(app.ears[doc.id] ?? []);
	const myMarks = $derived(app.marks[doc.id] ?? []);
	const notes = $derived(myMarks.filter((m) => m.k === 'n').sort((a, b) => a.p - b.p));
	const hlPages = $derived.by(() => {
		const c = new Map<number, number>();
		for (const m of myMarks) if (m.k === 'h') c.set(m.p, (c.get(m.p) ?? 0) + 1);
		return [...c.entries()].sort((a, b) => a[0] - b[0]);
	});
	function go(p: number) {
		viewer?.goToPage(p);
		drawer = null;
	}
	$effect(() => {
		if (drawer === 'contents') {
			// bring the current chapter into view when the drawer opens
			queueMicrotask(() => document.querySelector('.drawer .cur')?.scrollIntoView({ block: 'center' }));
		}
	});

	// ---------- full-screen & immersive reader ----------
	let isFullscreen = $state(false);
	let isImmersive = $state(false);
	const inFull = $derived(isFullscreen || isImmersive);
	// svelte-ignore state_referenced_locally
	let presentation = $state(doc.kind === 'slides');
	let spread = $state(false);

	let barVisible = $state(true);
	let barTimer: ReturnType<typeof setTimeout>;
	let isBarHovered = $state(false);

	// ---------- toolbar visibility & zen mode ----------
	let toolbarHidden = $state(false);
	let barScrolledAway = $state(false);
	let lastScrollY = 0;
	let scrollAcc = 0;

	const isBarHidden = $derived(
		toolbarHidden ||
		(inFull && !barVisible) ||
		(!inFull && barScrolledAway && !menu && !drawer && !penOpen && !editing)
	);

	function hideToolbar() {
		toolbarHidden = true;
		menu = false;
		clearTimeout(barTimer);
	}

	function showToolbar() {
		toolbarHidden = false;
		barScrolledAway = false;
		barVisible = true;
		wakeBar();
	}

	function toggleToolbarHidden() {
		if (isBarHidden) showToolbar();
		else hideToolbar();
	}

	function onWindowScroll() {
		if (toolbarHidden || inFull) return;
		const y = typeof window !== 'undefined' ? window.scrollY : 0;
		const dy = y - lastScrollY;

		if (y < 40) {
			barScrolledAway = false;
			scrollAcc = 0;
		} else if (dy > 10) {
			// Scrolling down on mobile/tablet: tuck the bar away
			if (typeof window !== 'undefined' && window.innerWidth < 768) {
				scrollAcc += dy;
				if (scrollAcc > 35 && !menu && !drawer && !penOpen && !editing) {
					barScrolledAway = true;
				}
			}
		} else if (dy < -6) {
			// Scrolling up: reveal the bar
			scrollAcc = 0;
			barScrolledAway = false;
		}
		lastScrollY = y;
	}

	function wakeBar() {
		if (toolbarHidden) return;
		if (inFull) {
			barVisible = true;
			clearTimeout(barTimer);
			if (!isBarHovered && !menu && !drawer && !penOpen && !editing) {
				barTimer = setTimeout(() => {
					if (!isBarHovered && !menu && !drawer && !penOpen && !editing) {
						barVisible = false;
					}
				}, 3200);
			}
		}
	}

	async function toggleFullscreen() {
		menu = false;
		if (inFull) {
			if (typeof document !== 'undefined' && document.fullscreenElement) {
				await document.exitFullscreen().catch(() => {});
			}
			isFullscreen = false;
			isImmersive = false;
			barVisible = true;
			clearTimeout(barTimer);
		} else {
			if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
				try {
					await document.documentElement.requestFullscreen();
					isFullscreen = true;
				} catch {
					isImmersive = true;
				}
			} else {
				isImmersive = true;
			}
			barVisible = true;
			wakeBar();
			// Mobile landscape support for slides
			if (doc.kind === 'slides' && typeof screen !== 'undefined' && 'orientation' in screen && 'lock' in screen.orientation) {
				try {
					// @ts-ignore
					await screen.orientation.lock('landscape').catch(() => {});
				} catch {}
			}
		}
	}

	function onFsChange() {
		isFullscreen = !!(typeof document !== 'undefined' && document.fullscreenElement);
		if (!isFullscreen && !isImmersive) {
			barVisible = true;
			clearTimeout(barTimer);
		}
	}

	// Mobile orientation check for landscape hint
	let isMobilePortrait = $state(false);
	let dismissLandscape = $state(false);
	function checkOrientation() {
		if (typeof window !== 'undefined') {
			isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
		}
	}
	$effect(() => {
		checkOrientation();
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (menu) {
				menu = false;
				return;
			}
			if (drawer) {
				drawer = null;
				return;
			}
			if (penOpen) {
				penOpen = false;
				return;
			}
			if (toolbarHidden) {
				showToolbar();
				return;
			}
			if (inFull) {
				toggleFullscreen();
				return;
			}
			return;
		}
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === 'f' || e.key === 'F') {
			e.preventDefault();
			toggleFullscreen();
		} else if (e.key === 'z' || e.key === 'Z') {
			e.preventDefault();
			toggleToolbarHidden();
		} else if (e.key === 'b') toggleEar();
		else if (e.key === 't') drawer = drawer ? null : 'contents';
		else if (e.key === 'h') togglePen();
		else if (e.key === 'm') toggleNight();
		else if (e.key === 'p') {
			if (doc.kind === 'slides') presentation = !presentation;
			else spread = !spread;
		} else if (e.key === 'ArrowRight' || (doc.kind === 'slides' && e.key === ' ')) {
			viewer?.nextPage();
		} else if (e.key === 'ArrowLeft' || (doc.kind === 'slides' && e.key === ' ' && e.shiftKey)) {
			viewer?.prevPage();
		}
	}
</script>

<svelte:head><title>{doc.title} · {data.subject.name}</title></svelte:head>

<svelte:window
	onkeydown={onKey}
	onscroll={onWindowScroll}
	onpointerdown={(e) => {
		wakeBar();
		if (menu && !(e.target as HTMLElement).closest('.more')) menu = false;
	}}
	onpointermove={wakeBar}
	ontouchstart={wakeBar}
	onfullscreenchange={onFsChange}
	onresize={checkOrientation}
/>

<div class="read-container" class:immersive-mode={isImmersive}>
{#if isBarHidden}
	<button
		class="bar-reveal-pill"
		onclick={showToolbar}
		aria-label="Show toolbar (page {cur + 1} of {n})"
		title="Show toolbar (z)"
	>
		<span class="brp-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</span>
		<span class="brp-text">{cur + 1} / {n}</span>
	</button>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
	class="bar"
	class:floating={inFull}
	class:hidden={isBarHidden}
	onmouseenter={() => {
		isBarHovered = true;
		wakeBar();
	}}
	onmouseleave={() => {
		isBarHovered = false;
		wakeBar();
	}}
>
	{#if inFull}
		<button class="ib fs-btn" onclick={toggleFullscreen} aria-label="Exit full screen" title="Exit full screen (f / Esc)">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="4 14 10 14 10 20" />
				<polyline points="20 10 14 10 14 4" />
				<line x1="14" y1="10" x2="21" y2="3" />
				<line x1="3" y1="21" x2="10" y2="14" />
			</svg>
		</button>
	{:else}
		<a class="back" href="/s/{data.subject.slug}" aria-label="Back to {data.subject.name}">←</a>
	{/if}
	<button class="ib" onclick={() => { drawer = drawer ? null : 'contents'; wakeBar(); }} aria-label="Contents, dog-ears and notes" title="Contents (t)">☰</button>
	<div class="title">
		<span class="subj">{data.subject.name}{#if app.timer}<span class="tm" class:brk={app.timer.phase === 'break'}> · ☕ {pomo.clock}</span>{/if}</span>
		<span class="doc">{doc.title}</span>
	</div>

	{#if doc.kind === 'slides'}
		<div class="slide-nav">
			<button class="nav-arrow" onclick={() => { viewer?.prevPage(); wakeBar(); }} disabled={cur === 0} aria-label="Previous slide">‹</button>
			<div class="pg">
				<input
					inputmode="numeric"
					aria-label="Go to slide"
					value={editing ? jump : cur + 1}
					onfocus={(e) => {
						editing = true;
						jump = '';
						e.currentTarget.select();
					}}
					oninput={(e) => (jump = e.currentTarget.value)}
					onblur={() => (editing = false)}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							commitJump();
							e.currentTarget.blur();
						}
					}}
				/>
				<span>/ {n}</span>
			</div>
			<button class="nav-arrow" onclick={() => { viewer?.nextPage(); wakeBar(); }} disabled={cur >= n - 1} aria-label="Next slide">›</button>
		</div>
	{:else}
		<div class="pg">
			<input
				inputmode="numeric"
				aria-label="Go to page"
				value={editing ? jump : cur + 1}
				onfocus={(e) => {
					editing = true;
					jump = '';
					e.currentTarget.select();
				}}
				oninput={(e) => (jump = e.currentTarget.value)}
				onblur={() => (editing = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						commitJump();
						e.currentTarget.blur();
					}
				}}
			/>
			<span>/ {n}</span>
		</div>
	{/if}

	<button class="ib wide" class:lit={penOpen} onclick={() => { togglePen(); wakeBar(); }} aria-pressed={penOpen} aria-label="Highlighter and notes" title="Highlight & notes (h)">✎</button>
	<button class="ib" onclick={() => { app.searchOpen = true; wakeBar(); }} aria-label="Search all notes" title="Search (/)">⌕</button>
	<button class="ib wide" class:lit={app.night} onclick={() => { toggleNight(); wakeBar(); }} aria-pressed={app.night} aria-label="3 AM reading mode" title="3 AM mode (m)">☾</button>

	{#if doc.orig}
		<a
			class="ib dl"
			href="/lib/orig/{doc.id}.pdf"
			download="{doc.title}.pdf"
			aria-label="Download original {doc.kind === 'slides' ? 'deck' : 'PDF'}"
			title="Download original ({doc.kind === 'slides' ? 'deck' : 'PDF'})"
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
		</a>
	{/if}

	{#if !inFull}
		<button class="ib fs-btn" onclick={toggleFullscreen} aria-label="Full screen reader" title="Full screen (f)">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 3 21 3 21 9" />
				<polyline points="9 21 3 21 3 15" />
				<line x1="21" y1="3" x2="14" y2="10" />
				<line x1="3" y1="21" x2="10" y2="14" />
			</svg>
		</button>
	{/if}

	<div class="more">
		<button class="ib" onclick={() => { menu = !menu; wakeBar(); }} aria-label="More actions" aria-expanded={menu}>⋯</button>
		{#if menu}
			<div class="menu" role="menu">
				<button role="menuitem" onclick={toggleEar}>{eared ? 'Remove dog-ear' : 'Dog-ear this page'} <kbd>b</kbd></button>
				<button role="menuitem" onclick={togglePen}>{penOpen ? 'Close highlighter' : 'Highlight & sticky notes'} <kbd>h</kbd></button>
				<button role="menuitem" onclick={toggleNight}>{app.night ? 'Back to daylight' : '3 AM mode'} <kbd>m</kbd></button>
				<button role="menuitem" onclick={toggleFullscreen}>{inFull ? 'Exit full screen' : 'Full screen reader'} <kbd>f</kbd></button>
				<button role="menuitem" onclick={toggleToolbarHidden}>{isBarHidden ? 'Show toolbar' : 'Hide toolbar'} <kbd>z</kbd></button>
				{#if doc.kind === 'slides'}
					<button role="menuitem" onclick={() => { presentation = !presentation; menu = false; }}>{presentation ? 'Continuous scroll' : 'Presentation mode'} <kbd>p</kbd></button>
				{:else}
					<button role="menuitem" onclick={() => { spread = !spread; menu = false; }}>{spread ? 'Single page' : 'Two-page spread'} <kbd>p</kbd></button>
				{/if}
				<button role="menuitem" onclick={share}>Share this page</button>
				<button role="menuitem" onclick={copyText}>Copy this page's text</button>
				{#if doc.orig}
					<a role="menuitem" href="/lib/orig/{doc.id}.pdf" download="{doc.title}.pdf" onclick={() => (menu = false)}>Download original PDF</a>
				{/if}
			</div>
		{/if}
	</div>

	<div class="zoom">
		<button onclick={() => { viewer?.zoomBy(1 / 1.2); wakeBar(); }} aria-label="Zoom out">−</button>
		<button class="pct" onclick={() => { viewer?.setZoom(1); wakeBar(); }} aria-label="Reset zoom">{zoomPct}%</button>
		<button onclick={() => { viewer?.zoomBy(1.2); wakeBar(); }} aria-label="Zoom in">+</button>
	</div>

	<button
		class="ib hide-bar-btn"
		onclick={hideToolbar}
		aria-label="Hide toolbar"
		title="Hide toolbar (z)"
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<polyline points="18 15 12 9 6 15" />
		</svg>
	</button>

	<span class="tape" style:transform="scaleX({(cur + 1) / n})" aria-hidden="true"></span>
</header>

{#if penOpen}
	<div class="pen" role="toolbar" aria-label="Highlighter and notes">
		<button class:on={tool === 'highlight'} onclick={() => (tool = 'highlight')}>Highlight</button>
		<button class:on={tool === 'note'} onclick={() => (tool = 'note')}>Sticky note</button>
		{#if tool === 'highlight'}
			<span class="swatches">
				{#each Object.entries(COLORS) as [k, c] (k)}
					<button class="sw" style:background={c.css} aria-label={c.name} aria-pressed={color === k} onclick={() => (color = k as MarkColor)}></button>
				{/each}
			</span>
		{/if}
		<button class="done" onclick={() => (penOpen = false)}>Done</button>
		<p class="hint">{tool === 'highlight' ? 'Swipe across text. Tap a highlight to remove it.' : 'Tap anywhere on a page to stick a note.'}</p>
	</div>
{/if}

{#if note}<div class="note" role="status">{note}</div>{/if}

{#if drawer}
	<div class="scrim" onpointerdown={() => (drawer = null)} role="presentation"></div>
	<aside class="drawer" aria-label="Contents">
		<div class="tabs" role="tablist">
			<button role="tab" aria-selected={drawer === 'contents'} onclick={() => (drawer = 'contents')}>Contents</button>
			<button role="tab" aria-selected={drawer === 'ears'} onclick={() => (drawer = 'ears')}>Dog-ears{ears.length ? ` ${ears.length}` : ''}</button>
			<button role="tab" aria-selected={drawer === 'notes'} onclick={() => (drawer = 'notes')}>Notes{notes.length + hlPages.length ? ` ${notes.length + hlPages.length}` : ''}</button>
			<button class="x" onclick={() => (drawer = null)} aria-label="Close">×</button>
		</div>

		<div class="list">
			{#if drawer === 'contents'}
				{#if outline.length}
					{#each outline as o, i (i)}
						<button class="row l{o.l}" class:cur={o === activeChapter} onclick={() => go(o.p)}>
							<span class="t">{o.t}</span><span class="p">{o.p + 1}</span>
						</button>
					{/each}
				{:else}
					<p class="empty">No chapter list for this file. Search (<kbd>/</kbd>) or type a page number up top.</p>
				{/if}
			{:else if drawer === 'ears'}
				{#each ears as p (p)}
					<div class="row ear">
						<button class="grow" onclick={() => go(p)}>
							<span class="t">Page {p + 1}<small>{chapterAt(p)?.t ?? ''}</small></span>
						</button>
						<button class="rm" onclick={() => app.toggleEar(doc.id, p)} aria-label="Remove dog-ear from page {p + 1}">×</button>
					</div>
				{:else}
					<p class="empty">Nothing folded yet. Press <kbd>b</kbd>, or tap the top-right corner of a page.</p>
				{/each}
			{:else}
				{#each notes as m (m.id)}
					<div class="row ear">
						<button class="grow" onclick={() => go(m.p)}>
							<span class="t hand">{m.k === 'n' ? m.t : ''}<small>page {m.p + 1}</small></span>
						</button>
						<button class="rm" onclick={() => app.removeMark(doc.id, m.id)} aria-label="Delete note">×</button>
					</div>
				{/each}
				{#each hlPages as [p, c] (p)}
					<button class="row" onclick={() => go(p)}>
						<span class="t">{c} highlight{c === 1 ? '' : 's'}<small>page {p + 1}</small></span><span class="p">{p + 1}</span>
					</button>
				{/each}
				{#if !notes.length && !hlPages.length}
					<p class="empty">No marks yet. Press <kbd>h</kbd> to highlight or drop sticky notes. They stay on this device.</p>
				{/if}
			{/if}
		</div>
	</aside>
{/if}

{#if doc.kind === 'slides' && isMobilePortrait && !dismissLandscape}
	<aside class="landscape-hint" role="status">
		<span>↻ Rotate to landscape for full screen slides</span>
		<button class="lh-close" onclick={() => (dismissLandscape = true)} aria-label="Dismiss">✕</button>
	</aside>
{/if}

{#if inFull}
	<div class="fs-tape-container" aria-hidden="true">
		<span class="tape fs-tape" style:transform="scaleX({(cur + 1) / n})"></span>
	</div>
{/if}

{#key doc.id}
	<Viewer
		bind:this={viewer}
		manifest={data.manifest}
		docId={doc.id}
		initialPage={initial}
		tool={penOpen ? tool : 'off'}
		{color}
		{inFull}
		{presentation}
		{spread}
		{onpage}
		onzoom={(z) => (zoomPct = Math.round(z * 100))}
	/>
{/key}
</div>

<style>
	.read-container {
		min-height: 100vh;
	}
	.read-container.immersive-mode {
		position: fixed;
		inset: 0;
		z-index: 50;
		height: 100dvh;
		width: 100vw;
		background: var(--bg);
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	:global(html:has(.immersive-mode)) {
		overflow: hidden;
	}

	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 6px;
		height: var(--chrome);
		padding: env(safe-area-inset-top) 8px 0 6px;
		background: rgb(23 18 14 / 0.94);
		border-bottom: 1px solid rgb(236 227 205 / 0.1);
		transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
	}
	.bar.hidden:not(.floating) {
		transform: translateY(-100%);
		opacity: 0;
		pointer-events: none;
	}
	.bar.floating {
		position: fixed;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 60;
		max-width: min(94vw, 840px);
		border-radius: 9999px;
		padding: 4px 14px;
		background: rgb(23 18 14 / 0.88);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		box-shadow:
			0 8px 32px rgb(0 0 0 / 0.55),
			0 0 0 1px rgb(236 227 205 / 0.12);
		transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
	}
	.bar.floating.hidden {
		opacity: 0;
		transform: translate(-50%, -16px);
		pointer-events: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.bar,
		.bar.floating {
			transition: none;
		}
	}

	.bar-reveal-pill {
		position: fixed;
		top: max(8px, env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		z-index: 65;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 14px;
		font-family: var(--mono);
		font-size: 12px;
		color: var(--paper);
		background: rgb(23 18 14 / 0.88);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 1px solid rgb(236 227 205 / 0.22);
		border-radius: 9999px;
		box-shadow:
			0 6px 20px rgb(0 0 0 / 0.45),
			0 0 0 1px rgb(236 227 205 / 0.08);
		cursor: pointer;
		touch-action: manipulation;
		transition: opacity 180ms ease, transform 180ms ease, background 150ms ease;
		animation: pillFadeIn 200ms ease forwards;
	}
	@keyframes pillFadeIn {
		from {
			opacity: 0;
			transform: translate(-50%, -8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	.bar-reveal-pill:hover {
		background: rgb(23 18 14 / 0.98);
		border-color: rgb(236 227 205 / 0.4);
		transform: translate(-50%, 2px);
	}
	.brp-icon {
		display: grid;
		place-items: center;
		color: var(--pencil);
		transition: transform 150ms ease;
	}
	.bar-reveal-pill:hover .brp-icon {
		color: var(--paper);
		transform: translateY(1px);
	}
	.brp-text {
		letter-spacing: 0.05em;
		font-weight: 500;
	}

	.ib.hide-bar-btn {
		color: var(--pencil);
		transition: transform 160ms ease, color 160ms ease;
	}
	.ib.hide-bar-btn:hover {
		color: var(--paper);
		transform: translateY(-1px);
	}

	.ib.dl, .ib.fs-btn {
		display: inline-grid;
		place-items: center;
		color: var(--paper);
		text-decoration: none;
	}
	.ib.dl:hover, .ib.fs-btn:hover {
		color: #fff;
		transform: scale(1.08);
	}

	.slide-nav {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.nav-arrow {
		background: none;
		border: none;
		color: var(--pencil);
		font-size: 20px;
		line-height: 1;
		padding: 2px 6px;
		cursor: pointer;
		border-radius: 4px;
		touch-action: manipulation;
	}
	.nav-arrow:hover:not(:disabled) {
		color: var(--paper);
		background: rgb(236 227 205 / 0.1);
	}
	.nav-arrow:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.fs-tape-container {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: rgb(0 0 0 / 0.3);
		z-index: 55;
		pointer-events: none;
	}
	.fs-tape {
		position: absolute;
		inset: 0;
		background: var(--hl);
		transform-origin: left;
		transition: transform 120ms linear;
	}

	.landscape-hint {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 70;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 16px;
		background: rgb(23 18 14 / 0.92);
		color: var(--paper);
		font-family: var(--type);
		font-size: 13px;
		border: 1px solid var(--pencil);
		border-radius: 9999px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.6);
		white-space: nowrap;
	}
	.lh-close {
		background: none;
		border: none;
		color: var(--pencil);
		font-size: 14px;
		cursor: pointer;
		padding: 0 4px;
	}
	.lh-close:hover {
		color: var(--paper);
	}
	.back {
		display: grid;
		place-items: center;
		width: 40px;
		height: 44px;
		flex: none;
		font-size: 22px;
		border-radius: 50%;
	}
	.ib {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		flex: none;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 50%;
		font-size: 21px;
		cursor: pointer;
		touch-action: manipulation;
	}
	.ib.lit {
		background: var(--hl);
		color: var(--ink);
	}
	.title {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		margin-left: 4px;
		line-height: 1.2;
	}
	.subj {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--pencil);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tm {
		color: var(--omr);
	}
	.tm.brk {
		color: #f0c987;
	}
	.doc {
		font-family: var(--type);
		font-size: 15px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pg {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 2px;
		font-family: var(--mono);
		font-size: 13px;
		color: var(--pencil);
		white-space: nowrap;
	}
	.pg input {
		width: 4ch;
		padding: 6px 4px;
		text-align: center;
		font: inherit;
		color: var(--paper);
		background: rgb(236 227 205 / 0.08);
		border: 1px solid rgb(236 227 205 / 0.18);
		border-radius: 6px;
	}
	/* the pen and night buttons live in the ⋯ menu on narrow screens */
	.wide {
		display: none;
	}
	.more {
		position: relative;
		flex: none;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 46px;
		min-width: 250px;
		display: flex;
		flex-direction: column;
		padding: 6px;
		background: var(--paper);
		color: var(--ink);
		border-radius: 6px;
		box-shadow: 0 18px 40px rgb(0 0 0 / 0.55);
		font-family: var(--type);
		font-size: 14px;
	}
	.menu button,
	.menu a {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 11px 12px;
		text-align: left;
		background: none;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	kbd {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--pencil);
	}
	@media (hover: hover) {
		.menu button:hover,
		.menu a:hover {
			background: rgb(243 213 74 / 0.55);
		}
		.ib:hover:not(.lit),
		.back:hover,
		.zoom button:hover {
			background: rgb(236 227 205 / 0.1);
		}
	}
	.zoom {
		display: none;
		align-items: center;
		gap: 2px;
	}
	.zoom button {
		min-width: 36px;
		height: 36px;
		padding: 0 8px;
		background: none;
		border: 0;
		border-radius: 8px;
		font-size: 18px;
		cursor: pointer;
	}
	.zoom .pct {
		font-family: var(--mono);
		font-size: 12px;
		min-width: 52px;
	}
	/* phones zoom with a native pinch; buttons are for desktop */
	@media (min-width: 720px) {
		.zoom {
			display: flex;
		}
	}
	@media (min-width: 600px) {
		.wide {
			display: grid;
		}
	}
	/* the paper tape: reading progress, a transform on a static element */
	.tape {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: var(--omr);
		transform-origin: left;
		transition: transform 160ms linear;
	}
	@media (max-width: 460px) {
		.title .subj {
			font-size: 9.5px;
			letter-spacing: 0.1em;
		}
	}

	.note {
		position: fixed;
		left: 50%;
		bottom: max(24px, env(safe-area-inset-bottom));
		translate: -50% 0;
		z-index: 70;
		padding: 10px 16px;
		background: var(--paper);
		color: var(--ink);
		border-radius: 6px;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
		font-family: var(--type);
		font-size: 14px;
	}

	/* pen toolbar */
	.pen {
		position: fixed;
		left: 50%;
		bottom: max(18px, env(safe-area-inset-bottom));
		translate: -50% 0;
		z-index: 60;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: max-content;
		max-width: calc(100vw - 20px);
		padding: 8px;
		color: var(--ink);
		background: var(--paper);
		border-radius: 28px;
		box-shadow: 0 14px 36px rgb(0 0 0 / 0.55);
		font-family: var(--type);
		font-size: 14px;
	}
	.pen > button {
		padding: 9px 14px;
		background: none;
		border: 0;
		border-radius: 20px;
		cursor: pointer;
		color: inherit;
		font: inherit;
		touch-action: manipulation;
	}
	.pen > button.on {
		background: var(--ink);
		color: var(--paper);
	}
	.pen .done {
		background: var(--hl);
	}
	.swatches {
		display: flex;
		gap: 6px;
		padding: 0 4px;
	}
	.sw {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 50%;
		cursor: pointer;
	}
	.sw[aria-pressed='true'] {
		border-color: var(--ink);
	}
	.hint {
		flex-basis: 100%;
		margin: 0;
		text-align: center;
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.04em;
		color: var(--pencil);
	}

	/* contents drawer */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgb(8 5 3 / 0.55);
		animation: fade 180ms ease-out;
	}
	.drawer {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 0;
		z-index: 81;
		width: min(380px, 92vw);
		display: flex;
		flex-direction: column;
		color: var(--ink);
		background: var(--paper);
		box-shadow: 18px 0 50px rgb(0 0 0 / 0.55);
		font-family: var(--type);
		padding-top: env(safe-area-inset-top);
		animation: slide 240ms cubic-bezier(0.22, 0.8, 0.2, 1);
	}
	.tabs {
		display: flex;
		align-items: stretch;
		border-bottom: 2px solid var(--ink);
	}
	.tabs button {
		flex: 1;
		padding: 16px 6px 12px;
		background: none;
		border: 0;
		font: inherit;
		font-size: 14px;
		color: var(--pencil);
		cursor: pointer;
		border-bottom: 3px solid transparent;
		margin-bottom: -2px;
	}
	.tabs button[aria-selected='true'] {
		color: var(--ink);
		border-bottom-color: var(--omr);
	}
	.tabs .x {
		flex: none;
		width: 48px;
		font-size: 22px;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px 0 24px;
	}
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		padding: 10px 18px;
		background: none;
		border: 0;
		border-bottom: 1px dashed rgb(0 0 0 / 0.16);
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.row.l1 {
		padding-left: 36px;
		font-size: 13.5px;
	}
	.row .t {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
		line-height: 1.25;
	}
	.row.l0 .t {
		font-size: 15.5px;
	}
	.row .t small {
		font-family: var(--mono);
		font-size: 10.5px;
		color: var(--pencil);
	}
	.row .t.hand {
		font-family: var(--hand);
		font-size: 19px;
		line-height: 1.05;
	}
	.row .p {
		flex: none;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--pencil);
	}
	.row.cur {
		background: rgb(243 213 74 / 0.6);
	}
	.row.ear {
		padding: 0;
		cursor: default;
	}
	.row .grow {
		flex: 1;
		min-width: 0;
		padding: 10px 0 10px 18px;
		background: none;
		border: 0;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.row .rm {
		padding: 10px 18px;
		background: none;
		border: 0;
		font-size: 20px;
		color: var(--pencil);
		cursor: pointer;
	}
	@media (hover: hover) {
		.row:hover:not(.cur) {
			background: rgb(243 213 74 / 0.35);
		}
	}
	.empty {
		margin: 0;
		padding: 22px 18px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--pencil);
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.drawer,
		.scrim {
			animation: none;
		}
	}
</style>
