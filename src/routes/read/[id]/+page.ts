import { error } from '@sveltejs/kit';
import { loadLibrary } from '#lib/library.js';
import { loadManifest } from '#lib/platen/pack.js';

export const load = async ({ params, fetch }) => {
	const [manifest, lib] = await Promise.all([loadManifest(params.id, fetch).catch(() => null), loadLibrary(fetch)]);
	if (!manifest) error(404, 'That document is not on the desk');
	for (const subject of lib.subjects) {
		const doc = subject.docs.find((d) => d.id === params.id);
		if (doc) return { manifest, doc, subject };
	}
	error(404, 'That document is not on the desk');
};
