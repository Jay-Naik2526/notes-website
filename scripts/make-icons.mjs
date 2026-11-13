// One-off: renders the favicon artwork into the PNG sizes needed to install the site as an app.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(root + 'src/lib/assets/favicon.svg');
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
	await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(root + 'static/' + name);
	console.log('wrote static/' + name);
}
