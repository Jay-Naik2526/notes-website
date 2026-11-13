import { loadLibrary } from '#lib/library.js';

export const load = async ({ fetch }) => ({ library: await loadLibrary(fetch) });
