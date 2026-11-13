/**
 * Platen: page-pack loader.
 *
 * Documents are pre-rendered at build time into WebP pages concatenated inside "pack" files.
 * The manifest says where each page lives, so we can fetch exactly one page with an HTTP Range request.
 * Everything here is deliberately framework-free so it can be unit-tested and reused.
 */
export type Entry = [shard: number, offset: number, length: number];
export type Tier = { w: number; shards: number; p: Entry[]; bytes: number };
export type Manifest = {
	id: string;
	/** changes when the source file changes, so cached pages never go stale */
	rev?: string;
	/** chapter list for the contents drawer */
	outline?: { t: string; p: number; l: number }[];
	pages: number;
	/** height / width per page */
	ar: number[];
	/** tiny blur-up previews as data URIs */
	lo: string[];
	md: Tier;
	hi: Tier;
};
export type TierName = 'md' | 'hi';

export async function loadManifest(id: string, f: typeof fetch = fetch): Promise<Manifest> {
	const res = await f(`/lib/docs/${id}.json`);
	if (!res.ok) throw new Error(`manifest ${id}: ${res.status}`);
	return res.json();
}

const CACHE_NAME = 'tee-pages-v1';
const CACHE_MAX = 500; // pages kept for instant re-reads and offline

async function cacheGet(key: string): Promise<Blob | null> {
	try {
		const hit = await (await caches.open(CACHE_NAME)).match(key);
		return hit ? await hit.blob() : null;
	} catch {
		return null; // private mode / insecure origin: just use the network
	}
}
let puts = 0;
async function cachePut(key: string, blob: Blob) {
	try {
		const c = await caches.open(CACHE_NAME);
		await c.put(key, new Response(blob, { headers: { 'content-type': 'image/webp' } }));
		if (++puts % 25 === 0) {
			const keys = await c.keys();
			for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) await c.delete(k);
		}
	} catch {
		/* storage full or unavailable */
	}
}

const MAX_INFLIGHT = 4;
/** how many decoded blobs we keep beyond the ones currently wanted (LRU) */
const KEEP_EXTRA = { md: 14, hi: 3 } as const;

type Job = { key: string; tier: TierName; i: number };

export class PageStore {
	/** key -> blob URL ("md:12") */
	private cache = new Map<string, string>();
	private inflight = new Map<string, AbortController>();
	private queue: Job[] = [];
	private wanted = new Set<string>();
	private center = 0;
	/** fallback when a host ignores Range: whole shards kept once */
	private shardBuf = new Map<string, Promise<ArrayBuffer>>();
	private dead = false;

	onready: (key: string, url: string) => void = () => {};
	onevict: (key: string) => void = () => {};

	constructor(
		private m: Manifest,
		private base = '/lib/packs'
	) {}

	static key(tier: TierName, i: number) {
		return `${tier}:${i}`;
	}

	get(key: string) {
		return this.cache.get(key);
	}

	/** Tell the store exactly what is needed right now. Anything else is cancelled or becomes evictable. */
	setWanted(jobs: { tier: TierName; i: number }[], center: number) {
		this.center = center;
		this.wanted = new Set(jobs.map((j) => PageStore.key(j.tier, j.i)));

		// drop queued work nobody needs any more
		this.queue = this.queue.filter((q) => this.wanted.has(q.key));
		// abort in-flight fetches that scrolled away
		for (const [key, ctl] of this.inflight) {
			if (!this.wanted.has(key)) {
				ctl.abort();
				this.inflight.delete(key);
			}
		}
		for (const j of jobs) {
			const key = PageStore.key(j.tier, j.i);
			if (this.cache.has(key)) {
				// touch for LRU: re-insert at the end
				const url = this.cache.get(key)!;
				this.cache.delete(key);
				this.cache.set(key, url);
				continue;
			}
			if (this.inflight.has(key) || this.queue.some((q) => q.key === key)) continue;
			this.queue.push({ key, tier: j.tier, i: j.i });
		}
		this.evict();
		this.pump();
	}

	private evict() {
		for (const tier of ['md', 'hi'] as const) {
			const keys = [...this.cache.keys()].filter((k) => k.startsWith(tier + ':'));
			const unwanted = keys.filter((k) => !this.wanted.has(k));
			const overflow = unwanted.length - KEEP_EXTRA[tier];
			for (let n = 0; n < overflow; n++) {
				const k = unwanted[n]; // oldest first (Map keeps insertion order)
				URL.revokeObjectURL(this.cache.get(k)!);
				this.cache.delete(k);
				this.onevict(k);
			}
		}
	}

	private pump() {
		while (!this.dead && this.inflight.size < MAX_INFLIGHT && this.queue.length) {
			// nearest to the reader's eye first; hi-res never jumps ahead of a missing md page
			let best = 0;
			let bestScore = Infinity;
			for (let n = 0; n < this.queue.length; n++) {
				const q = this.queue[n];
				const score = Math.abs(q.i - this.center) * 2 + (q.tier === 'hi' ? 0.5 : 0);
				if (score < bestScore) {
					bestScore = score;
					best = n;
				}
			}
			const job = this.queue.splice(best, 1)[0];
			this.run(job);
		}
	}

	private async run(job: Job) {
		const ctl = new AbortController();
		this.inflight.set(job.key, ctl);
		try {
			const blob = await this.fetchPage(job.tier, job.i, ctl.signal);
			if (this.dead || ctl.signal.aborted) return;
			// decode off-thread before we hand it to the DOM so scrolling never stalls on decode
			const url = URL.createObjectURL(blob);
			try {
				const img = new Image();
				img.src = url;
				await img.decode();
			} catch {
				/* the <img> will still try */
			}
			if (this.dead || ctl.signal.aborted) {
				URL.revokeObjectURL(url);
				return;
			}
			this.cache.set(job.key, url);
			this.onready(job.key, url);
		} catch (e) {
			if ((e as Error).name !== 'AbortError') console.warn('page load failed', job.key, e);
		} finally {
			this.inflight.delete(job.key);
			this.pump();
		}
	}

	private async fetchPage(tier: TierName, i: number, signal: AbortSignal): Promise<Blob> {
		const [shard, offset, length] = this.m[tier].p[i];
		const url = `${this.base}/${this.m.id}.${tier}.${shard}.pack`;
		const sk = `${tier}:${shard}`;
		const ckey = `/__pages/${this.m.id}.${this.m.rev ?? '0'}.${tier}.${i}`;

		const cached = await cacheGet(ckey);
		if (cached) return cached;

		if (this.shardBuf.has(sk)) {
			const buf = await this.shardBuf.get(sk)!;
			return new Blob([buf.slice(offset, offset + length)], { type: 'image/webp' });
		}
		const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
		if (res.status === 206) {
			const blob = new Blob([await res.arrayBuffer()], { type: 'image/webp' });
			cachePut(ckey, blob);
			return blob;
		}
		if (res.status === 200) {
			// server ignored Range: keep the whole shard once instead of re-downloading it per page
			const bufP = res.arrayBuffer();
			this.shardBuf.set(sk, bufP);
			const buf = await bufP;
			const blob = new Blob([buf.slice(offset, offset + length)], { type: 'image/webp' });
			cachePut(ckey, blob);
			return blob;
		}
		throw new Error(`pack ${res.status}`);
	}

	dispose() {
		this.dead = true;
		for (const c of this.inflight.values()) c.abort();
		for (const u of this.cache.values()) URL.revokeObjectURL(u);
		this.cache.clear();
		this.shardBuf.clear();
		this.queue = [];
	}
}
