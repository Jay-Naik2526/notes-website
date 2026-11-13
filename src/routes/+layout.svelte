<script lang="ts">
	import '@fontsource/special-elite';
	import '@fontsource/caveat/500.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Lamp from '#lib/ui/Lamp.svelte';
	import SearchPalette from '#lib/ui/SearchPalette.svelte';
	import FocusTimer from '#lib/ui/FocusTimer.svelte';
	import Eggs from '#lib/ui/Eggs.svelte';
	import { app } from '#lib/state.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// In the reader the lamp and the grain are removed entirely: pages are shown exactly as rendered.
	const reading = $derived(page.route.id === '/read/[id]');
	const lampMode = $derived(reading ? 'off' : 'follow');
	$effect(() => {
		document.documentElement.toggleAttribute('data-reader', reading);
		document.documentElement.toggleAttribute('data-night', reading && app.night);
	});

	onMount(() => {
		// "Install as app": keep the browser's prompt so the desk can offer it as a button
		const onPrompt = (e: Event) => {
			e.preventDefault();
			app.install = e as unknown as { prompt: () => Promise<void> };
		};
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', () => (app.install = null));
		// offline shell + cached notes (production only, so development never serves stale files)
		if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		return () => window.removeEventListener('beforeinstallprompt', onPrompt);
	});

	onNavigate((nav) => {
		if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>TEE Hall</title>
</svelte:head>

<Lamp mode={lampMode} />
<div class="shell">
	{@render children()}
	{#if !reading}
		<footer>
			<span class="by">made by</span> <span class="name">Jay Naik</span>
		</footer>
	{/if}
</div>
<SearchPalette />
<FocusTimer floating={!reading} />
<Eggs />

<style>
	/* pages grow to fill the screen, the footer sits under them */
	.shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.shell > :global(main) {
		flex: 1 0 auto;
		/* in a flex column, auto side margins would shrink a page to its content: keep it full width */
		width: 100%;
	}
	footer {
		padding: 18px 20px max(22px, env(safe-area-inset-bottom));
		text-align: center;
		color: var(--pencil);
	}
	.by {
		font-family: var(--mono);
		font-size: 10.5px;
		letter-spacing: 0.24em;
		text-transform: uppercase;
	}
	.name {
		font-family: var(--hand);
		font-size: 24px;
		line-height: 1;
		color: var(--paper);
		opacity: 0.85;
	}
</style>
