import type { Library } from './library.js';

export type Hit = {
	id: string;
	title: string;
	subject: string;
	slug: string;
	color: string;
	/** zero-based page index */
	page: number;
	snippet: string;
	score: number;
};

type Entry = { id: string; title: string; subject: string; slug: string; color: string; pages: string[]; low: string[] };

let index: Promise<Entry[]> | null = null;

/** lower-case and fold curly quotes / odd spaces so "Banker's" matches "Banker’s" */
const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[\u2018\u2019\u02bc]/g, "'")
		.replace(/[\u201c\u201d]/g, '"')
		.replace(/[\u2010-\u2015]/g, '-')
		.replace(/\u00a0/g, ' ');

/** Loads every document's extracted text once (a few MB total) and keeps it in memory. */
export function ensureIndex(lib: Library, f: typeof fetch = fetch): Promise<Entry[]> {
	index ??= Promise.all(
		lib.subjects.flatMap((s) =>
			s.docs.map(async (d): Promise<Entry> => {
				let pages: string[] = [];
				try {
					const r = await f(`/lib/text/${d.id}.json`);
					if (r.ok) pages = await r.json();
				} catch {
					/* a missing text layer just means that file is not searchable */
				}
				return {
					id: d.id,
					title: d.title,
					subject: s.name,
					slug: s.slug,
					color: s.color,
					pages: pages.map((p) => p.replace(/\s+/g, ' ')),
					low: pages.map((p) => norm(p.replace(/\s+/g, ' ')))
				};
			})
		)
	);
	return index;
}

export function search(entries: Entry[], query: string, limit = 40): Hit[] {
	const words = norm(query).split(/\s+/).filter((w) => w.length > 0);
	if (!words.length) return [];
	const hits: Hit[] = [];

	for (const e of entries) {
		const titleLow = norm(e.title);
		const titleMatch = words.every((w) => titleLow.includes(w) || norm(e.subject).includes(w));
		if (titleMatch)
			hits.push({ id: e.id, title: e.title, subject: e.subject, slug: e.slug, color: e.color, page: 0, snippet: 'Open from the first page', score: 1000 });

		for (let i = 0; i < e.low.length; i++) {
			const t = e.low[i];
			let score = 0;
			let first = -1;
			let ok = true;
			for (const w of words) {
				const at = t.indexOf(w);
				if (at < 0) {
					ok = false;
					break;
				}
				if (first < 0 || at < first) first = at;
				// more occurrences = stronger page; an exact whole-word match beats a substring
				let c = 0;
				for (let p = at; p >= 0 && c < 8; p = t.indexOf(w, p + w.length)) c++;
				score += c + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t) ? 3 : 0);
			}
			if (!ok) continue;
			const s = Math.max(0, first - 50);
			const raw = e.pages[i].slice(s, s + 150);
			hits.push({
				id: e.id,
				title: e.title,
				subject: e.subject,
				slug: e.slug,
				color: e.color,
				page: i,
				snippet: (s > 0 ? '…' : '') + raw + (s + 150 < e.pages[i].length ? '…' : ''),
				score
			});
		}
	}
	return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
