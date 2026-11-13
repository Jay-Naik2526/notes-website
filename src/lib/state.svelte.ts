import type { Mark } from './marks.js';

const KEY = 'tee-hall:v1';

export type Timer = { phase: 'focus' | 'break'; endsAt: number; total: number; focusMin: number };

type Saved = {
	name: string;
	sound: boolean;
	night: boolean;
	tea: number;
	/** doc id -> furthest page index reached */
	furthest: Record<string, number>;
	/** doc id -> last page shown, for "resume where you left" */
	last: Record<string, number>;
	/** doc id -> dog-eared page indexes */
	ears: Record<string, number[]>;
	/** doc id -> highlights and sticky notes */
	marks: Record<string, Mark[]>;
	timer: Timer | null;
};

const blank = (): Saved => ({ name: '', sound: false, night: false, tea: 0, furthest: {}, last: {}, ears: {}, marks: {}, timer: null });

function read(): Saved {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...blank(), ...JSON.parse(raw) };
	} catch {
		/* private mode etc: run without persistence */
	}
	return blank();
}

class AppState {
	name = $state('');
	sound = $state(false);
	/** 3 AM reading mode: dark pages */
	night = $state(false);
	/** tea stains on the desk (easter egg) */
	tea = $state(0);
	furthest = $state<Record<string, number>>({});
	last = $state<Record<string, number>>({});
	ears = $state<Record<string, number[]>>({});
	marks = $state<Record<string, Mark[]>>({});
	timer = $state<Timer | null>(null);
	/** slug of the folder taking part in the shared-element view transition */
	vt = $state('');
	searchOpen = $state(false);
	/** the browser's "install app" prompt, once it offers one */
	install = $state<{ prompt: () => Promise<void> } | null>(null);
	/** konami easter egg: the lamp turns red for a moment */
	alarm = $state(false);
	private timeout: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		if (typeof localStorage === 'undefined') return;
		const s = read();
		this.name = s.name;
		this.sound = s.sound;
		this.night = s.night;
		this.tea = s.tea;
		this.furthest = s.furthest;
		this.last = s.last;
		this.ears = s.ears;
		this.marks = s.marks;
		this.timer = s.timer;
	}

	save() {
		clearTimeout(this.timeout);
		this.timeout = setTimeout(() => {
			try {
				localStorage.setItem(
					KEY,
					JSON.stringify({
						name: this.name,
						sound: this.sound,
						night: this.night,
						tea: this.tea,
						furthest: this.furthest,
						last: this.last,
						ears: this.ears,
						marks: this.marks,
						timer: this.timer
					} satisfies Saved)
				);
			} catch {
				/* ignore */
			}
		}, 300);
	}

	/** 0 = untouched, 1 = started, 2 = finished (reached the last ~8% of the pages) */
	status(id: string, pages: number): 0 | 1 | 2 {
		const f = this.furthest[id];
		if (f === undefined) return 0;
		return f >= Math.floor((pages - 1) * 0.92) ? 2 : 1;
	}

	visit(id: string, page: number) {
		this.last[id] = page;
		if (page > (this.furthest[id] ?? -1)) this.furthest[id] = page;
		this.save();
	}

	hasEar(id: string, page: number) {
		return this.ears[id]?.includes(page) ?? false;
	}
	toggleEar(id: string, page: number) {
		const cur = this.ears[id] ?? [];
		this.ears[id] = cur.includes(page) ? cur.filter((p) => p !== page) : [...cur, page].sort((a, b) => a - b);
		this.save();
	}

	marksOn(id: string, page: number) {
		return (this.marks[id] ?? []).filter((m) => m.p === page);
	}
	addMark(id: string, m: Mark) {
		this.marks[id] = [...(this.marks[id] ?? []), m];
		this.save();
	}
	removeMark(id: string, markId: string) {
		this.marks[id] = (this.marks[id] ?? []).filter((m) => m.id !== markId);
		this.save();
	}
	setNote(id: string, markId: string, text: string) {
		this.marks[id] = (this.marks[id] ?? []).map((m) => (m.id === markId && m.k === 'n' ? { ...m, t: text } : m));
		this.save();
	}
}

export const app = new AppState();
