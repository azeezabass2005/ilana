/** All dates are local time, formatted as YYYY-MM-DD strings (spec §9). */

export function dateStr(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function addDays(date: string, n: number): string {
	const d = parseDate(date);
	d.setDate(d.getDate() + n);
	return dateStr(d);
}

export function parseDate(date: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Local-midnight bounds of a YYYY-MM-DD day, as epoch ms. */
export function dayBounds(date: string): [number, number] {
	const start = parseDate(date).getTime();
	const end = parseDate(addDays(date, 1)).getTime();
	return [start, end];
}

/** 95 → "1h 35m", 45 → "45m", 0 → "0m" */
export function fmtMinutes(min: number): string {
	const m = Math.round(min);
	if (Math.abs(m) < 60) return `${m}m`;
	const h = Math.trunc(m / 60);
	const rest = Math.abs(m % 60);
	return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function fmtSeconds(sec: number): string {
	return fmtMinutes(sec / 60);
}

/** Signed delta: +25m / −1h 10m / ±0m */
export function fmtDelta(min: number): string {
	const m = Math.round(min);
	if (m === 0) return '±0m';
	return (m > 0 ? '+' : '−') + fmtMinutes(Math.abs(m));
}

export function fmtClock(ms: number): string {
	const d = new Date(ms);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "2026-07-21" → "Mon 21 Jul" */
export function fmtDay(date: string): string {
	return parseDate(date).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
}

export function fmtTimer(totalSec: number): string {
	const s = Math.max(0, Math.floor(totalSec));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(sec).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
