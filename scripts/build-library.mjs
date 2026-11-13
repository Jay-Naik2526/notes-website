#!/usr/bin/env node
/**
 * Platen build pipeline.
 * Turns a folder of PDFs / PPTs / DOCs into pre-rendered, range-fetchable page packs.
 *
 *   node scripts/build-library.mjs [--src DIR] [--only "A,B"] [--skip "X,Y"] [--force]
 *
 * Output (static/lib):
 *   library.json            index of subjects and documents
 *   docs/<id>.json          per-document manifest (aspect ratios, blur previews, pack offsets)
 *   packs/<id>.<tier>.<n>.pack   concatenated WebP pages, split into <=20 MB shards
 *   text/<id>.json          per-page plain text (for search)
 */
import { readdir, stat, mkdir, writeFile, readFile, rm, mkdtemp, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { deriveOutline } from './derive-outline.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
	const i = args.indexOf(`--${n}`);
	return i >= 0 ? args[i + 1] : d;
};
const SRC = opt('src', join(os.homedir(), 'Downloads', '09 TEE', 'Ultimate Notes'));
const OUT = join(ROOT, 'static', 'lib');
const CACHE = join(ROOT, '.cache');
const ONLY = opt('only', '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const SKIP = opt('skip', '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const FORCE = flag('force');
const CONCURRENCY = Number(opt('jobs', Math.max(2, Math.min(4, os.cpus().length - 2))));

const MD_W = 1000; // normal reading width (px)
const HI_W = 2000; // zoom tier
const SHARD = 20 * 1024 * 1024; // Cloudflare Pages max file is 25 MB
const OFFICE = new Set(['.pptx', '.ppt', '.docx', '.doc']);
const EXCLUDED = new Set(
	(await readFile(join(ROOT, 'scripts', 'exclude.txt'), 'utf8').catch(() => ''))
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'))
);
const subjectsCfg = JSON.parse(await readFile(join(ROOT, 'scripts', 'subjects.json'), 'utf8'));

// ---------- helpers ----------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const short = (s) => createHash('sha1').update(s).digest('hex').slice(0, 6);
const byNum = (a, b) => Number(a.match(/(\d+)\.png$/)[1]) - Number(b.match(/(\d+)\.png$/)[1]);

function cleanTitle(file) {
	let t = basename(file, extname(file));
	t = t.replace(/\.pptx?$/i, '');
	t = t.replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
	t = t.replace(/\s+[A-Za-z0-9]{10}$/, ''); // random 10-char suffix on PYQ downloads
	return t.trim();
}

function classify(rel, ext) {
	const r = rel.toLowerCase();
	if (ext === '.pptx' || ext === '.ppt') return 'slides';
	if (/ultimate|exam_notes|exam notes/.test(r)) return 'ultimate';
	return 'notes';
}

async function walk(dir) {
	const out = [];
	for (const e of await readdir(dir, { withFileTypes: true })) {
		if (e.name.startsWith('.') || e.name.startsWith('~$')) continue; // dotfiles and Office lock files
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...(await walk(p)));
		else out.push(p);
	}
	return out;
}

async function pool(items, n, fn) {
	let i = 0;
	const workers = Array.from({ length: n }, async () => {
		while (i < items.length) {
			const idx = i++;
			await fn(items[idx], idx);
		}
	});
	await Promise.all(workers);
}

function findSoffice() {
	for (const p of [
		'/Applications/LibreOffice.app/Contents/MacOS/soffice',
		join(os.homedir(), 'Applications', 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'),
		'/opt/homebrew/bin/soffice',
		'/usr/local/bin/soffice'
	])
		if (existsSync(p)) return p;
	return null;
}
const SOFFICE = findSoffice();
let officeQueue = Promise.resolve(); // LibreOffice can't run two conversions on one profile

function toPdf(src, id) {
	const job = officeQueue.then(async () => {
		const dir = join(CACHE, 'pdf');
		await mkdir(dir, { recursive: true });
		const target = join(dir, `${id}.pdf`);
		const srcStat = await stat(src);
		const stamp = join(dir, `${id}.stamp`);
		if (existsSync(target) && existsSync(stamp) && (await readFile(stamp, 'utf8')) === String(srcStat.mtimeMs)) return target;
		const tmp = await mkdtemp(join(os.tmpdir(), 'platen-lo-'));
		try {
			await run(
				SOFFICE,
				['--headless', '-env:UserInstallation=' + pathToFileURL(join(CACHE, 'lo-profile')).href, '--convert-to', 'pdf', '--outdir', tmp, src],
				{ timeout: 240000 }
			);
			const produced = (await readdir(tmp)).find((f) => f.endsWith('.pdf'));
			if (!produced) throw new Error('LibreOffice produced no PDF');
			await run('cp', [join(tmp, produced), target]);
			await writeFile(stamp, String(srcStat.mtimeMs));
			return target;
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	});
	officeQueue = job.catch(() => {}); // one failed conversion must not poison the rest of the queue
	return job;
}

/** Copy the (converted) PDF next to the packs so friends can download the original. Limit 90 MB (GitHub Pages allows up to 100 MB). */
async function copyOrig(id, pdf) {
	try {
		const st = await stat(pdf);
		if (st.size > 90 * 1048576) return false;
		await mkdir(join(OUT, 'orig'), { recursive: true });
		await copyFile(pdf, join(OUT, 'orig', `${id}.pdf`));
		return true;
	} catch {
		return false;
	}
}

/** Chapter bookmarks from the PDF (needs pypdf in .cache/venv; silently skipped if missing). */
async function getOutline(pdf) {
	const py = join(CACHE, 'venv', 'bin', 'python');
	if (!existsSync(py)) return [];
	try {
		const { stdout } = await run(py, [join(ROOT, 'scripts', 'outline.py'), pdf], { maxBuffer: 1 << 24 });
		return JSON.parse(stdout);
	} catch {
		return [];
	}
}

/** Real PDF bookmarks if there are any, otherwise headings detected from the page text. */
async function buildOutline(pdf, text) {
	const marks = await getOutline(pdf);
	// Slide decks exported by LibreOffice are bookmarked "Slide 1, Slide 2…": use each slide's real title instead.
	if (marks.length && marks.every((m) => /^slide\s*\d+$/i.test(m.t))) {
		return text.map((t, p) => {
			const first = t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find((l) => /[A-Za-z]{3}/.test(l));
			return { t: first ? first.slice(0, 80) : `Slide ${p + 1}`, p, l: 0 };
		});
	}
	if (marks.length >= 3) return marks;
	const derived = deriveOutline(text);
	return derived.length >= 3 ? derived : [];
}

async function rasterize(pdf, width, dir) {
	await mkdir(dir, { recursive: true });
	await run('pdftoppm', ['-png', '-scale-to-x', String(width), '-scale-to-y', '-1', pdf, join(dir, 'p')], {
		maxBuffer: 1 << 26,
		timeout: 600000
	});
	return (await readdir(dir)).filter((f) => f.endsWith('.png')).sort(byNum).map((f) => join(dir, f));
}

async function pack(id, tier, buffers) {
	const shards = [];
	let cur = [];
	let size = 0;
	const entries = [];
	for (const buf of buffers) {
		if (size + buf.length > SHARD && cur.length) {
			shards.push(Buffer.concat(cur));
			cur = [];
			size = 0;
		}
		entries.push([shards.length, size, buf.length]);
		cur.push(buf);
		size += buf.length;
	}
	if (cur.length) shards.push(Buffer.concat(cur));
	await Promise.all(shards.map((b, i) => writeFile(join(OUT, 'packs', `${id}.${tier}.${i}.pack`), b)));
	return { shards: shards.length, p: entries, bytes: shards.reduce((a, b) => a + b.length, 0) };
}

// ---------- discover ----------
await mkdir(join(OUT, 'docs'), { recursive: true });
await mkdir(join(OUT, 'packs'), { recursive: true });
await mkdir(join(OUT, 'text'), { recursive: true });
await mkdir(CACHE, { recursive: true });

const all = await walk(SRC);
const jobs = [];
for (const file of all) {
	const ext = extname(file).toLowerCase();
	if (ext !== '.pdf' && !OFFICE.has(ext)) continue;
	const rel = relative(SRC, file);
	if (EXCLUDED.has(rel.split(sep).join('/'))) continue;
	const folder = rel.split(sep)[0];
	if (SKIP.includes(folder.toLowerCase())) continue;
	if (ONLY.length && !ONLY.includes(folder.toLowerCase())) continue;
	if (!subjectsCfg[folder]) continue;
	jobs.push({ file, rel, ext, folder, id: `${subjectsCfg[folder].slug}-${slug(cleanTitle(file)).slice(0, 40)}-${short(rel)}` });
}
console.log(`Found ${jobs.length} documents (${SOFFICE ? 'LibreOffice ready' : 'LibreOffice NOT installed: Office files will be skipped'})`);

// ---------- process ----------
const done = new Map();
let n = 0;
await pool(jobs, CONCURRENCY, async (job) => {
	const { file, rel, ext, folder, id } = job;
	const manifestPath = join(OUT, 'docs', `${id}.json`);
	const fileStat = await stat(file);
	const srcKey = `${fileStat.size}-${Math.round(fileStat.mtimeMs)}`;
	try {
		if (!FORCE && existsSync(manifestPath)) {
			const m = JSON.parse(await readFile(manifestPath, 'utf8'));
			if (m.srcKey === srcKey) {
				const cachedPdf = OFFICE.has(ext) ? join(CACHE, 'pdf', `${id}.pdf`) : file;
				const orig = await copyOrig(id, cachedPdf);
				let outlineChanged = false;
				if (m.outlineV !== 3) {
					let text = [];
					try {
						text = JSON.parse(await readFile(join(OUT, 'text', `${id}.json`), 'utf8'));
					} catch {}
					m.outline = await buildOutline(cachedPdf, text);
					m.outlineV = 3;
					outlineChanged = true;
				}
				if (outlineChanged || m.rev !== short(srcKey) || m.orig !== orig) {
					m.rev = short(srcKey);
					m.orig = orig;
					await writeFile(manifestPath, JSON.stringify(m));
				}
				done.set(id, { job, m });
				console.log(`[${++n}/${jobs.length}] cached  ${rel}`);
				return;
			}
		}
		let pdf = file;
		if (OFFICE.has(ext)) {
			if (!SOFFICE) {
				console.log(`[${++n}/${jobs.length}] skipped (needs LibreOffice) ${rel}`);
				return;
			}
			pdf = await toPdf(file, id);
		}
		const info = (await run('pdfinfo', [pdf])).stdout;
		const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
		if (!pages) throw new Error('no pages');

		const tmp = await mkdtemp(join(os.tmpdir(), 'platen-'));
		try {
			const mdFiles = await rasterize(pdf, MD_W, join(tmp, 'md'));
			const mdBufs = [];
			const lo = [];
			const ar = [];
			for (const f of mdFiles) {
				const img = sharp(f);
				const meta = await img.metadata();
				ar.push(Math.round((meta.height / meta.width) * 10000) / 10000);
				mdBufs.push(await img.webp({ quality: 74, effort: 4 }).toBuffer());
				const tiny = await sharp(f).resize(16).blur(0.6).webp({ quality: 35 }).toBuffer();
				lo.push('data:image/webp;base64,' + tiny.toString('base64'));
			}
			const mdPack = await pack(id, 'md', mdBufs);

			const hiFiles = await rasterize(pdf, HI_W, join(tmp, 'hi'));
			const hiBufs = [];
			for (const f of hiFiles) hiBufs.push(await sharp(f).webp({ quality: 76, effort: 4 }).toBuffer());
			const hiPack = await pack(id, 'hi', hiBufs);

			let text = [];
			try {
				const t = (await run('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 })).stdout;
				text = t.split('\f').slice(0, pages).map((s) => s.replace(/[ \t]+/g, ' ').trim());
			} catch {}
			await writeFile(join(OUT, 'text', `${id}.json`), JSON.stringify(text));

			const manifest = {
				id,
				v: 1,
				srcKey,
				rev: short(srcKey),
				orig: await copyOrig(id, pdf),
				outline: await buildOutline(pdf, text),
				outlineV: 3,
				pages: mdFiles.length,
				ar,
				lo,
				md: { w: MD_W, ...mdPack },
				hi: { w: HI_W, ...hiPack }
			};
			await writeFile(manifestPath, JSON.stringify(manifest));
			done.set(id, { job, m: manifest });
			const mb = ((mdPack.bytes + hiPack.bytes) / 1048576).toFixed(1);
			console.log(`[${++n}/${jobs.length}] ${String(mdFiles.length).padStart(4)}p ${mb.padStart(7)} MB  ${rel}`);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	} catch (e) {
		console.log(`[${++n}/${jobs.length}] FAILED ${rel}: ${String(e.message).split('\n')[0]}`);
	}
});

// ---------- library index ----------
const bySubject = new Map();
for (const { job, m } of done.values()) {
	const cfg = subjectsCfg[job.folder];
	if (!bySubject.has(job.folder)) bySubject.set(job.folder, { ...cfg, docs: [] });
	const unit = job.rel.match(/unit[\s_-]*(\d+)/i)?.[1];
	bySubject.get(job.folder).docs.push({
		id: job.id,
		title: cleanTitle(job.file),
		kind: classify(job.rel, job.ext),
		unit: unit ? Number(unit) : null,
		pages: m.pages,
		ar: m.ar[0],
		orig: !!m.orig,
		bytes: m.md.bytes + m.hi.bytes
	});
}
const kindOrder = { ultimate: 0, notes: 1, slides: 2, handwritten: 3, policy: 4, pyq: 5 };
const subjects = [...bySubject.values()].map((s) => ({
	...s,
	docs: s.docs.sort(
		(a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (a.unit ?? 99) - (b.unit ?? 99) || a.title.localeCompare(b.title)
	)
}));
// keep existing subjects not touched by this run (so --only runs don't erase the rest)
let prev = { subjects: [] };
try {
	prev = JSON.parse(await readFile(join(OUT, 'library.json'), 'utf8'));
} catch {}
const merged = [...subjects];
for (const p of prev.subjects) if (!merged.find((s) => s.slug === p.slug) && !SKIP.includes(p.slug)) merged.push(p);
merged.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(join(OUT, 'library.json'), JSON.stringify({ generated: new Date().toISOString(), subjects: merged }));
const totalMB = merged.reduce((a, s) => a + s.docs.reduce((x, d) => x + d.bytes, 0), 0) / 1048576;
console.log(`\nDone. ${merged.reduce((a, s) => a + s.docs.length, 0)} documents, ${totalMB.toFixed(0)} MB of page packs.`);
