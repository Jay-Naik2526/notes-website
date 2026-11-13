<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import gsap from 'gsap';
	import { app } from '#lib/state.svelte.js';
	import { seatFor, loadLibrary } from '#lib/library.js';
	import { TEE_DATE } from '#lib/config.js';
	import * as sfx from '#lib/sfx.js';

	let folders = $state<number | null>(null);
	let busy = false;
	let card: HTMLElement;
	let nameEl: HTMLInputElement;
	let scrib: SVGPathElement;
	let fill: SVGCircleElement;
	let stampEl: HTMLElement;

	const seat = $derived(seatFor(app.name));
	const ticketNo = $derived(String(Math.abs([...seat].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1000000).padStart(6, '0'));

	// countdown to the first paper
	let now = $state(Date.now());
	const target = TEE_DATE ? new Date(TEE_DATE).getTime() : null;
	const left = $derived.by(() => {
		if (!target) return null;
		const ms = Math.max(0, target - now);
		return { d: Math.floor(ms / 864e5), h: Math.floor((ms % 864e5) / 36e5) };
	});

	onMount(() => {
		loadLibrary().then((l) => (folders = l.subjects.length)).catch(() => (folders = null));
		const tick = setInterval(() => (now = Date.now()), 30000);

		const len = scrib.getTotalLength();
		scrib.style.strokeDasharray = String(len);
		scrib.style.strokeDashoffset = String(len);

		if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
			// First arrival: the ticket is dealt onto the desk. Rare moment, so it earns the motion.
			gsap.from(card, { y: -90, rotate: -5, opacity: 0, duration: 0.62, ease: 'power3.out' });
			gsap.from('[data-row]', { opacity: 0, y: 8, duration: 0.4, stagger: 0.05, delay: 0.3, ease: 'power2.out' });
		}
		return () => clearInterval(tick);
	});

	function enter() {
		if (busy) return;
		if (!app.name.trim()) {
			nameEl.focus();
			gsap.fromTo(nameEl, { x: -6 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.2, 0.25)' });
			return;
		}
		busy = true;
		app.save();
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			goto('/desk');
			return;
		}
		const tl = gsap.timeline({ onComplete: () => goto('/desk') });
		tl.call(() => app.sound && sfx.scribble())
			.to(scrib, { strokeDashoffset: 0, duration: 0.34, ease: 'none' })
			.to(fill, { opacity: 1, duration: 0.08 }, '-=0.05')
			// the stamp accelerates into the paper (ease-in = a hit), then the card takes the impact
			.fromTo(stampEl, { scale: 2.4, rotate: -17, opacity: 0 }, { scale: 1, rotate: -9, opacity: 1, duration: 0.15, ease: 'power3.in' })
			.call(() => app.sound && sfx.stamp())
			.to(card, { x: 3, y: 2, duration: 0.04, yoyo: true, repeat: 5, ease: 'none' })
			.to(card, { x: 0, y: 0, duration: 0.05 })
			.to({}, { duration: 0.42 });
	}

	function toggleSound() {
		app.sound = !app.sound;
		app.save();
		if (app.sound) sfx.scribble();
	}
</script>

<main>
	<section class="ticket" bind:this={card} aria-label="Hall ticket">
		<div class="main">
			<header data-row>
				<div class="uni">TERM END EXAMINATION</div>
				<h1>HALL&nbsp;TICKET</h1>
				<div class="no">No. {ticketNo}</div>
			</header>

			<div class="fields">
				<label class="f wide" data-row>
					<span class="k">CANDIDATE</span>
					<input
						bind:this={nameEl}
						bind:value={app.name}
						oninput={() => app.save()}
						onkeydown={(e) => e.key === 'Enter' && enter()}
						placeholder="write your name"
						maxlength="28"
						autocomplete="given-name"
						autocapitalize="words"
						spellcheck="false"
						enterkeyhint="go"
					/>
				</label>
				<div class="f" data-row>
					<span class="k">SEAT NO.</span>
					<span class="v">{seat}</span>
				</div>
				<div class="f" data-row>
					<span class="k">VENUE</span>
					<span class="v">THE DESK{folders ? ` · ${folders} FOLDERS` : ''}</span>
				</div>
				<div class="f wide" data-row>
					<span class="k">REPORTING IN</span>
					{#if left}
						<span class="v big"><b>{left.d}</b> DAYS <b>{left.h}</b> HRS</span>
					{:else}
						<span class="v hand">date not announced (yet)</span>
					{/if}
				</div>
			</div>

			<ol class="rules" data-row>
				<li>Notes are provided. Nerves are not.</li>
				<li>Chai is permitted. Whispering is not.</li>
				<li>Fill the bubble below to take your seat.</li>
			</ol>
			<p class="margin" aria-hidden="true">no cheating (it's just revising)</p>
		</div>

		<div class="tear" aria-hidden="true"></div>

		<div class="stub" data-row>
			<button class="omr" onclick={enter} aria-label="Fill the bubble to enter the hall">
				<svg viewBox="0 0 44 44" width="54" height="54" aria-hidden="true">
					<circle bind:this={fill} cx="22" cy="22" r="15" class="fill" />
					<circle cx="22" cy="22" r="15" class="ring" />
					<path bind:this={scrib} class="scrib" d="M11 14 L33 12 L11 20 L33 18 L11 26 L33 24 L11 32 L33 30" />
				</svg>
				<span class="lbl">FILL TO TAKE YOUR SEAT</span>
			</button>
			<button class="snd" onclick={toggleSound} aria-pressed={app.sound}>SOUND ▸ {app.sound ? 'ON' : 'OFF'}</button>
		</div>

		<div class="stamp" bind:this={stampEl} aria-hidden="true">ADMITTED</div>
	</section>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		padding: max(24px, env(safe-area-inset-top)) 16px max(32px, env(safe-area-inset-bottom));
	}

	.ticket {
		position: relative;
		width: min(100%, 540px);
		color: var(--ink);
		background:
			linear-gradient(rgb(255 255 255 / 0.18), transparent 40%),
			var(--paper);
		border-radius: 6px;
		transform: rotate(-1.4deg);
		box-shadow:
			0 1px 0 rgb(255 255 255 / 0.5) inset,
			0 28px 60px rgb(0 0 0 / 0.55),
			0 6px 14px rgb(0 0 0 / 0.4);
		font-family: var(--type);
	}
	/* ruled paper grain */
	.ticket::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: url('/noise.png');
		opacity: 0.06;
		mix-blend-mode: multiply;
		pointer-events: none;
	}

	.main {
		padding: 22px 24px 8px;
	}
	header {
		position: relative;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 10px;
	}
	.uni {
		font-size: 12px;
		letter-spacing: 0.32em;
		color: var(--pencil);
	}
	h1 {
		margin: 2px 0 0;
		font-family: var(--type);
		font-weight: 400;
		font-size: clamp(34px, 9vw, 48px);
		line-height: 1;
		letter-spacing: 0.04em;
	}
	.no {
		position: absolute;
		right: 0;
		top: 2px;
		font-family: var(--mono);
		font-size: 11px;
		color: var(--pencil);
	}

	.fields {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 14px 18px;
		padding: 16px 0 6px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.f.wide {
		grid-column: 1 / -1;
	}
	.k {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.22em;
		color: var(--pencil);
	}
	.v {
		font-size: 19px;
		letter-spacing: 0.03em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.v.big {
		font-size: 22px;
	}
	.v.big b {
		font-weight: 400;
		color: var(--stamp);
		font-size: 30px;
	}
	.v.hand {
		font-family: var(--hand);
		font-size: 24px;
		line-height: 1;
		color: var(--stamp);
	}

	input {
		width: 100%;
		border: 0;
		border-bottom: 1.5px dashed var(--pencil);
		background: transparent;
		padding: 0 0 2px;
		font-family: var(--hand);
		font-size: 34px;
		line-height: 1.05;
		color: #1d2f6f; /* ballpoint blue */
		outline-offset: 6px;
	}
	input::placeholder {
		color: #1d2f6f;
		opacity: 0.35;
	}

	.rules {
		margin: 12px 0 0;
		padding-left: 20px;
		font-size: 13.5px;
		line-height: 1.55;
	}
	.margin {
		margin: 4px 0 0;
		text-align: right;
		font-family: var(--hand);
		font-size: 22px;
		line-height: 1;
		color: var(--stamp);
		transform: rotate(-2deg);
	}

	/* perforation with the two punched notches */
	.tear {
		position: relative;
		margin-top: 14px;
		border-top: 2px dashed rgb(0 0 0 / 0.35);
	}
	.tear::before,
	.tear::after {
		content: '';
		position: absolute;
		top: -13px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--desk-2);
		box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.5);
	}
	.tear::before {
		left: -12px;
	}
	.tear::after {
		right: -12px;
	}

	.stub {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 20px 16px 24px;
	}
	.omr {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 8px 4px 0;
		background: none;
		border: 0;
		cursor: pointer;
		text-align: left;
		font-family: var(--type);
		font-size: 14px;
		letter-spacing: 0.1em;
		color: var(--ink);
		touch-action: manipulation;
	}
	.omr svg {
		flex: none;
		overflow: visible;
	}
	.ring {
		fill: none;
		stroke: var(--omr);
		stroke-width: 2.5;
	}
	.fill {
		fill: var(--toner);
		opacity: 0;
	}
	.scrib {
		fill: none;
		stroke: var(--toner);
		stroke-width: 5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	@media (hover: hover) {
		.omr:hover .ring {
			stroke-width: 3.5;
		}
	}
	.omr:active svg {
		transform: scale(0.94);
	}
	.snd {
		background: none;
		border: 0;
		cursor: pointer;
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.18em;
		color: var(--pencil);
		padding: 10px 0 10px 6px;
		white-space: nowrap;
	}

	.stamp {
		position: absolute;
		right: 22px;
		top: 78px;
		padding: 2px 12px 0;
		border: 4px double var(--stamp);
		border-radius: 4px;
		color: var(--stamp);
		font-family: var(--type);
		font-size: clamp(30px, 8vw, 42px);
		letter-spacing: 0.08em;
		opacity: 0;
		transform: rotate(-9deg);
		mix-blend-mode: multiply;
		pointer-events: none;
	}

	@media (max-width: 420px) {
		.main {
			padding: 18px 18px 6px;
		}
		.stub {
			padding: 12px 14px 14px 18px;
		}
		.lbl {
			font-size: 12px;
		}
		.v {
			font-size: 17px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ticket {
			transform: none;
		}
	}
</style>
