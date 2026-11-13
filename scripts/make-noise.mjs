// One-off: generates the 256px film-grain tile used by the paper/desk textures.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { randomFillSync } from 'node:crypto';

const size = 256;
const buf = Buffer.alloc(size * size * 4);
randomFillSync(buf);
for (let i = 0; i < size * size; i++) {
	const v = buf[i * 4]; // luminance noise
	buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v;
	buf[i * 4 + 3] = 255;
}
const out = fileURLToPath(new URL('../static/noise.png', import.meta.url));
await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toFile(out);
console.log('wrote', out);
