/**
 * Optional passcode gate for Cloudflare Pages.
 * Set a PASSCODE secret to turn it on; leave it unset and the site is open.
 *
 * Page images (/lib/packs/*) are excluded in static/_routes.json so the thousands of image requests
 * never count against the free Functions quota. That means the gate keeps strangers and search engines
 * out of the site, but it is not a vault: someone who already knows a pack's exact URL can fetch it.
 */
const COOKIE = 'tee_pass';

async function sign(passcode) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('tee-hall:v1'));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

const page = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>TEE Hall</title>
<style>
html{background:#17120e;color:#1c1814}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;font-family:'Courier New',monospace;background:radial-gradient(120% 80% at 50% 0%,#2a2018,#17120e)}
form{width:min(100%,380px);background:#ece3cd;padding:22px 24px;border-radius:5px;transform:rotate(-1deg);box-shadow:0 24px 50px rgba(0,0,0,.55)}
small{letter-spacing:.24em;font-size:10px;color:#6e6458}
h1{margin:4px 0 14px;font-weight:400;font-size:34px;line-height:1}
input{width:100%;box-sizing:border-box;font:inherit;font-size:20px;padding:6px 0;border:0;border-bottom:1.5px dashed #6e6458;background:none;color:#1d2f6f;outline:none}
button{margin-top:16px;font:inherit;font-size:15px;letter-spacing:.1em;padding:10px 16px;border:0;border-radius:4px;background:#1c1814;color:#ece3cd;cursor:pointer}
p{margin:10px 0 0;color:#c8321f;min-height:1em;font-size:13px}
</style></head><body>
<form method="post" action="/_gate"><small>RESTRICTED ENTRY</small><h1>SHOW YOUR PASS</h1>
<input name="p" type="password" placeholder="passcode" autocomplete="current-password" autofocus required>
<button>ENTER</button><p>${msg}</p></form></body></html>`;

export async function onRequest({ request, env, next }) {
	if (!env.PASSCODE) return next();

	const url = new URL(request.url);
	const token = await sign(env.PASSCODE);
	const cookies = Object.fromEntries(
		(request.headers.get('Cookie') || '').split(';').map((c) => {
			const i = c.indexOf('=');
			return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
		})
	);
	if (cookies[COOKIE] && safeEqual(cookies[COOKIE], token)) return next();

	if (request.method === 'POST' && url.pathname === '/_gate') {
		const form = await request.formData();
		const given = String(form.get('p') || '');
		if (safeEqual(await sign(given), token)) {
			return new Response(null, {
				status: 303,
				headers: {
					Location: '/',
					'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
				}
			});
		}
		return new Response(page('Wrong passcode.'), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	}
	return new Response(page(), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
