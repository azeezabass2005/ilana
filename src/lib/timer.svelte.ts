/**
 * Live timer for work happening now. Survives reloads via localStorage —
 * only the start instant is stored, elapsed time is always derived.
 */
import { browser } from '$app/environment';

const KEY = 'ilana.timer';

interface TimerState {
	activityId: string | null;
	startedAt: number | null;
}

function load(): TimerState {
	if (!browser) return { activityId: null, startedAt: null };
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return JSON.parse(raw) as TimerState;
	} catch {
		// corrupted state is not worth crashing the app over
	}
	return { activityId: null, startedAt: null };
}

const state = $state<TimerState>(load());
let nowMs = $state(Date.now());

if (browser) {
	setInterval(() => (nowMs = Date.now()), 1000);
}

function persist() {
	if (browser) localStorage.setItem(KEY, JSON.stringify({ activityId: state.activityId, startedAt: state.startedAt }));
}

export const timer = {
	get running() {
		return state.startedAt !== null;
	},
	get activityId() {
		return state.activityId;
	},
	get startedAt() {
		return state.startedAt;
	},
	get elapsedSeconds() {
		return state.startedAt === null ? 0 : Math.max(0, (nowMs - state.startedAt) / 1000);
	},
	start(activityId: string) {
		state.activityId = activityId;
		state.startedAt = Date.now();
		persist();
	},
	/** returns what to log; caller decides whether to save */
	stop(): { activityId: string; startedAt: number; durationSeconds: number } | null {
		if (state.startedAt === null || state.activityId === null) return null;
		const out = {
			activityId: state.activityId,
			startedAt: state.startedAt,
			durationSeconds: (Date.now() - state.startedAt) / 1000
		};
		state.activityId = null;
		state.startedAt = null;
		persist();
		return out;
	},
	discard() {
		state.activityId = null;
		state.startedAt = null;
		persist();
	}
};
