export type Kind = 'ultimate' | 'notes' | 'slides';
export type Doc = {
	id: string;
	title: string;
	kind: Kind;
	unit: number | null;
	pages: number;
	ar: number;
	/** an original PDF is available to download */
	orig?: boolean;
	bytes: number;
};
export type Subject = { slug: string; name: string; sub: string; color: string; docs: Doc[] };
export type Library = { generated: string; subjects: Subject[] };

let cached: Promise<Library> | null = null;

export function loadLibrary(f: typeof fetch = fetch): Promise<Library> {
	cached ??= f('/lib/library.json').then((r) => {
		if (!r.ok) {
			cached = null;
			throw new Error('library.json missing: run `npm run library`');
		}
		return r.json();
	});
	return cached;
}

/** Stable pseudo-random in [0,1) from a string, so each folder keeps the same tilt on every visit. */
export function seeded(s: string, salt = 0) {
	let h = 2166136261 ^ salt;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return ((h >>> 0) % 10000) / 10000;
}

/** Exam-style seat number, e.g. "B-4821", derived from a name. */
export function seatFor(name: string) {
	const n = name.trim().toLowerCase() || 'candidate';
	const letter = String.fromCharCode(65 + Math.floor(seeded(n, 1) * 8));
	const num = 1000 + Math.floor(seeded(n, 2) * 8999);
	return `${letter}-${num}`;
}
