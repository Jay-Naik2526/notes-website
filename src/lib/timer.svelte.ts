import { app } from './state.svelte.js';
import * as sfx from './sfx.js';

/** Chai-break timer: a focus session, then an automatic break. State survives page reloads. */
class Pomodoro {
	now = $state(Date.now());
	left = $derived(app.timer ? Math.max(0, app.timer.endsAt - this.now) : 0);
	fraction = $derived(app.timer ? 1 - this.left / app.timer.total : 0);
	clock = $derived.by(() => {
		const s = Math.ceil(this.left / 1000);
		return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	});

	start(min: number) {
		app.timer = { phase: 'focus', endsAt: Date.now() + min * 60000, total: min * 60000, focusMin: min };
		this.now = Date.now();
		app.save();
	}
	stop() {
		app.timer = null;
		app.save();
	}
	/** called by the global component when the clock runs out */
	advance() {
		const t = app.timer;
		if (!t) return;
		if (app.sound) sfx.bell();
		if (t.phase === 'focus') {
			const b = t.focusMin >= 50 ? 10 : 5;
			app.timer = { phase: 'break', endsAt: Date.now() + b * 60000, total: b * 60000, focusMin: t.focusMin };
		} else {
			app.timer = null;
		}
		this.now = Date.now();
		app.save();
	}
}

export const pomo = new Pomodoro();
