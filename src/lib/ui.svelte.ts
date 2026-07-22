/** Cross-page UI state: the log sheet can be opened from anywhere. */

export interface LogPrefill {
	activityId?: string;
	blockId?: string;
	/** finishing a live timer */
	fromTimer?: { startedAt: number; durationSeconds: number };
}

const sheet = $state<{ open: boolean; prefill: LogPrefill }>({ open: false, prefill: {} });

export const logSheet = {
	get open() {
		return sheet.open;
	},
	get prefill() {
		return sheet.prefill;
	},
	show(prefill: LogPrefill = {}) {
		sheet.prefill = prefill;
		sheet.open = true;
	},
	hide() {
		sheet.open = false;
		sheet.prefill = {};
	}
};
