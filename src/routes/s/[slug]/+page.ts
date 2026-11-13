import { error } from '@sveltejs/kit';
import { loadLibrary } from '#lib/library.js';

export const load = async ({ params, fetch }) => {
	const lib = await loadLibrary(fetch);
	const subject = lib.subjects.find((s) => s.slug === params.slug);
	if (!subject) error(404, 'No such folder');
	return { subject };
};
