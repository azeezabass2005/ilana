<script lang="ts">
	import { dateStr, parseDate, fmtDay } from '$lib/time';
	import { clickOutside } from '$lib/actions';

	let {
		value = $bindable(),
		min = null,
		max = null,
		onchange
	}: {
		value: string;
		min?: string | null;
		max?: string | null;
		onchange?: (v: string) => void;
	} = $props();

	let open = $state(false);
	let view = $state({ y: 0, m: 0 });

	const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

	function toggle() {
		if (!open) {
			const d = value ? parseDate(value) : new Date();
			view = { y: d.getFullYear(), m: d.getMonth() };
		}
		open = !open;
	}

	function shiftMonth(n: number) {
		const d = new Date(view.y, view.m + n, 1);
		view = { y: d.getFullYear(), m: d.getMonth() };
	}

	const monthLabel = $derived(
		new Date(view.y, view.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
	);

	// weeks start Monday; leading nulls pad the first row
	const cells = $derived.by(() => {
		const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
		const days = new Date(view.y, view.m + 1, 0).getDate();
		return [
			...Array.from({ length: lead }, () => null),
			...Array.from({ length: days }, (_, i) => i + 1)
		];
	});

	function ds(day: number) {
		return dateStr(new Date(view.y, view.m, day));
	}
	function blocked(day: number) {
		const s = ds(day);
		return (min !== null && s < min) || (max !== null && s > max);
	}
	function pick(day: number) {
		if (blocked(day)) return;
		value = ds(day);
		onchange?.(value);
		open = false;
	}

	const today = dateStr();
</script>

<div class="dp" use:clickOutside={() => (open = false)}>
	<button type="button" class="trigger" aria-expanded={open} aria-haspopup="dialog" onclick={toggle}>
		<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
			<rect x="2.5" y="4" width="15" height="13" rx="2.5" />
			<path d="M2.5 8h15M6.5 2v3.5M13.5 2v3.5" />
		</svg>
		<span class="figure">{value ? fmtDay(value) : 'Pick a date'}</span>
	</button>

	{#if open}
		<div class="pop" role="dialog" aria-label="Choose a date">
			<div class="head">
				<button type="button" class="mnav" onclick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
				<span class="mlabel">{monthLabel}</span>
				<button type="button" class="mnav" onclick={() => shiftMonth(1)} aria-label="Next month">›</button>
			</div>
			<div class="grid wk">
				{#each WEEKDAYS as w (w)}<span class="mono wd">{w}</span>{/each}
			</div>
			<div class="grid">
				{#each cells as day, i (i)}
					{#if day === null}
						<span></span>
					{:else}
						<button
							type="button"
							class="day figure"
							class:selected={ds(day) === value}
							class:today={ds(day) === today}
							disabled={blocked(day)}
							onclick={() => pick(day)}
						>
							{day}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.dp {
		position: relative;
		display: inline-block;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #fff;
		border: 1px solid var(--surface-400);
		border-radius: var(--radius-sm);
		padding: 13px 16px;
		min-height: 50px;
		font-size: 0.85rem;
		transition: border-color 0.12s ease;
	}
	.trigger:hover,
	.trigger[aria-expanded='true'] {
		border-color: var(--ink-500);
	}
	.trigger svg {
		color: var(--ink-500);
	}
	.pop {
		position: absolute;
		z-index: 60;
		top: calc(100% + 6px);
		right: 0;
		background: var(--paper);
		border: 1px solid var(--surface-400);
		border-radius: var(--radius);
		box-shadow: var(--shadow-pop);
		padding: 12px;
		width: 268px;
		animation: pop-in 0.14s ease;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}
	.mlabel {
		font-weight: 600;
		font-size: 0.88rem;
	}
	.mnav {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		color: var(--ink-500);
		transition: background 0.12s ease;
	}
	.mnav:hover {
		background: var(--surface-200);
		color: var(--ink-950);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.wk {
		margin-bottom: 2px;
	}
	.wd {
		text-align: center;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--ink-300);
		padding: 4px 0;
	}
	.day {
		aspect-ratio: 1;
		border-radius: 8px;
		font-size: 0.78rem;
		display: grid;
		place-items: center;
		position: relative;
		transition: background 0.12s ease;
	}
	.day:hover:not(:disabled) {
		background: var(--surface-200);
	}
	.day.today::after {
		content: '';
		position: absolute;
		bottom: 4px;
		width: 4px;
		height: 4px;
		border-radius: 2px;
		background: var(--accent-600);
	}
	.day.selected {
		background: var(--ink-950);
		color: var(--surface-100);
	}
	.day.selected.today::after {
		background: var(--accent-300);
	}
	.day:disabled {
		color: var(--surface-400);
		cursor: default;
	}
</style>
