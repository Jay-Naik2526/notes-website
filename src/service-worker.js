// @ts-nocheck
/// <reference lib="webworker" />
/**
 * Offline support.
 *  - The app shell (JS, CSS, fonts, icons) is cached on install, so the site opens with no signal.
 *  - Notes metadata (library, manifests, extracted text) is cached as you open it (stale-while-revalidate).
 *  - Page images are NOT handled here: the app caches pages itself (Cache API, 500 pages), because Range requests
 *    don't fit the service-worker cache.
 */
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';

const SHELL = `shell-${version}`;
const DATA = 'data-v1';
const abs = (p) => (p.startsWith('/') ? p : '/' + p);
const shellAssets = [...immutable, ...assets]
	.map((a) => abs(a.path))
	.filter((f) => !f.startsWith('/lib/') && !f.startsWith('/_headers') && !f.startsWith('/_routes'));

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL);
			await Promise.all([...shellAssets, '/index.html'].map((u) => cache.add(u).catch(() => {})));
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const k of await caches.keys()) if (k !== SHELL && k !== DATA && k !== 'tee-pages-v1') await caches.delete(k);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin) return;

	// page images and PDFs: straight to the network (the app has its own page cache)
	if (url.pathname.startsWith('/lib/packs/') || url.pathname.startsWith('/lib/orig/') || req.headers.has('range')) return;

	// notes metadata: answer from cache instantly, refresh in the background
	if (url.pathname.startsWith('/lib/')) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(DATA);
				const hit = await cache.match(req);
				const fresh = fetch(req)
					.then((res) => {
						if (res.ok) cache.put(req, res.clone());
						return res;
					})
					.catch(() => null);
				return hit || (await fresh) || new Response('offline', { status: 503 });
			})()
		);
		return;
	}

	// navigations: network first, then the cached app shell (it is a single-page app)
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req).catch(async () => (await caches.match('/index.html')) || new Response('offline', { status: 503 }))
		);
		return;
	}

	// app shell assets: cache first
	event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
