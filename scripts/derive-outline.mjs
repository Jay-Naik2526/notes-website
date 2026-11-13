/**
 * Builds a contents list from a document's extracted page text, for PDFs that have no bookmarks.
 * Looks for "Chapter 4 — …" / "Unit 2: …" style headings (level 0) and "4.3 Some Heading" (level 1),
 * skipping table-of-contents pages and running headers/footers (each title is kept once, at its first page).
 */
export function deriveOutline(pages) {
	const out = [];
	const seen = new Set();
	const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

	pages.forEach((text, p) => {
		const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
		// A page that lists many headings followed by page numbers is a table of contents: skip it.
		const tocish = lines.filter((l) => /\s\d{1,3}$/.test(l) && /^(\d+\.\d+|chapter|unit)\b/i.test(l)).length;
		if (tocish >= 4) return;

		for (const line of lines) {
			if (line.length > 90) continue;
			// running headers/footers, table rows, emoji status columns and TOC lines are not headings
			if (/made by|page \d+ of \d+|\bslide\b/i.test(line)) continue;
			if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(line)) continue;
			if (/\s\d{1,3}$/.test(line)) continue;
			if ((line.match(/\d+/g) || []).length > 3) continue;
			let level = -1;
			let title = '';
			let m;
			if ((m = line.match(/^(Chapter|Unit|Module)\s+(\d+)\b\s*[—–:.\-·|]*\s*(.*)$/i))) {
				level = 0;
				title = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}${m[3] ? ' · ' + m[3] : ''}`;
			} else if ((m = line.match(/^(\d{1,2}\.\d{1,2})\s+([A-Z][^.!?]{2,70})$/)) && !/\s\d{1,3}$/.test(line)) {
				level = 1;
				title = `${m[1]} ${m[2]}`;
			}
			if (level < 0) continue;
			const tail = title.split('·')[1]?.trim() ?? title.replace(/^\d+\.\d+\s*/, '');
			if (!/[A-Za-z]{3}/.test(tail) || /^[^A-Za-z]*\)/.test(tail) || (tail.match(/\(/g) || []).length !== (tail.match(/\)/g) || []).length) continue;
			const k = key(title);
			if (!k || seen.has(k)) continue;
			// the same chapter shows up again in running headers with extra words: match on its "Unit N" prefix
			const prefix = level === 0 ? key(title.split('·')[0]) : null;
			if (prefix && seen.has('p:' + prefix)) continue;
			seen.add(k);
			if (prefix) seen.add('p:' + prefix);
			out.push({ t: title, p, l: level });
		}
	});
	return out;
}
