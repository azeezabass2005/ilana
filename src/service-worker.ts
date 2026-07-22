/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Hand-rolled shell cache (SPEC §5.3). SvelteKit registers this file
 * automatically in production builds.
 *
 * Rules:
 *   - precache the whole shell, so a cold start with no network still reaches
 *     a usable logging screen
 *   - cache-first for shell assets (they're content-hashed, so never stale)
 *   - navigations fall back to the cached shell, which is what makes every
 *     client-side route work offline
 *   - /sync is network-only and never cached (Phase 3)
 */

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `ilana-${version}`;
// '/' is the adapter-static fallback (index.html) — the entry every route needs.
const ASSETS = [...build, ...files, '/'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return;

	// Sync must always hit the network; a cached sync response would be a lie.
	if (url.pathname.startsWith('/sync')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Navigations: serve the shell so deep links work offline.
			if (req.mode === 'navigate') {
				const shell = await cache.match('/');
				if (shell) return shell;
			}

			const hit = await cache.match(req);
			if (hit) return hit;

			try {
				const res = await fetch(req);
				// Opaque/error responses are not worth persisting.
				if (res.ok && res.type === 'basic') cache.put(req, res.clone());
				return res;
			} catch {
				// Offline and uncached: fall back to the shell for pages,
				// otherwise let the failure surface.
				const shell = await cache.match('/');
				if (shell && req.mode === 'navigate') return shell;
				throw new Error('offline and not cached');
			}
		})()
	);
});
