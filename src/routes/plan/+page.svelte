<script lang="ts">
	import { liveQuery } from 'dexie';
	import { dateStr, addDays, dayBounds, fmtDay, fmtMinutes } from '$lib/time';
	import {
		liveActivities,
		livePlannedBlocks,
		livePlannedBlocksRange,
		liveSessionsBetween,
		createPlannedBlock,
		updatePlannedBlock,
		softDeletePlannedBlock,
		indexById
	} from '$lib/repo';
	import { dayStats } from '$lib/derive';
	import ActivityPicker from '$lib/components/ActivityPicker.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import TimeField from '$lib/components/TimeField.svelte';
	import Stepper from '$lib/components/Stepper.svelte';

	let date = $state(dateStr());
	const today = dateStr();
	const tomorrow = addDays(today, 1);

	const activities = liveQuery(() => liveActivities());
	const blocks = $derived.by(() => {
		const d = date;
		return liveQuery(() => livePlannedBlocks(d));
	});

	// evidence beside the plan: the last 7 finished days
	const histFrom = addDays(today, -7);
	const histTo = addDays(today, -1);
	const histBlocks = liveQuery(() => livePlannedBlocksRange(histFrom, histTo));
	const histSessions = liveQuery(() => {
		const [start] = dayBounds(histFrom);
		const [, end] = dayBounds(histTo);
		return liveSessionsBetween(start, end);
	});

	const byId = $derived(indexById($activities ?? []));
	const totalPlanned = $derived(($blocks ?? []).reduce((sum, b) => sum + b.planned_minutes, 0));
	const sortedBlocks = $derived(
		[...($blocks ?? [])].sort((a, b) =>
			(a.start_time ?? '99') < (b.start_time ?? '99') ? -1 : a.sort_index - b.sort_index
		)
	);

	const history = $derived.by(() => {
		const allBlocks = $histBlocks ?? [];
		const allSessions = $histSessions ?? [];
		const days: { date: string; planned: number; onPlan: number; adherence: number | null }[] = [];
		for (let i = 7; i >= 1; i--) {
			const d = addDays(today, -i);
			const dayBlocks = allBlocks.filter((b) => b.plan_date === d);
			const [start, end] = dayBounds(d);
			const sessions = allSessions.filter((s) => s.started_at >= start && s.started_at < end);
			const stats = dayStats(dayBlocks, sessions, byId);
			days.push({
				date: d,
				planned: stats.plannedMinutes,
				onPlan: stats.loggedOnPlanMinutes,
				adherence: stats.adherence
			});
		}
		return days;
	});

	// add-block form
	let newActivity = $state<string | null>(null);
	let newMinutes = $state(60);
	let newTime = $state('');
	let newLabel = $state('');
	let newQty = $state<number | null>(null);
	let newUnit = $state('');

	// prefill unit from the activity's default
	$effect(() => {
		const a = newActivity ? byId.get(newActivity) : null;
		if (a?.default_unit && !newUnit) newUnit = a.default_unit;
	});

	async function addBlock() {
		if (!newActivity || newMinutes <= 0) return;
		await createPlannedBlock({
			activity_id: newActivity,
			plan_date: date,
			planned_minutes: newMinutes,
			label: newLabel,
			start_time: newTime || null,
			planned_qty: newQty,
			planned_unit: newQty ? newUnit.trim() || null : null
		});
		newMinutes = 60;
		newTime = '';
		newLabel = '';
		newQty = null;
		newUnit = '';
	}

	function title(id: string) {
		return byId.get(id)?.title ?? '(deleted)';
	}
</script>

<div class="stack">
	<div class="datepick">
		<button class="chip" aria-pressed={date === today} onclick={() => (date = today)}>Today</button>
		<button class="chip" aria-pressed={date === tomorrow} onclick={() => (date = tomorrow)}>Tomorrow</button>
		<div class="pickright"><DatePicker bind:value={date} /></div>
	</div>

	<section class="card card--ink evidence">
		<p class="eyebrow">Last 7 days · plan vs delivery</p>
		<div class="strip" role="img" aria-label="Adherence for the last seven days">
			{#each history as h (h.date)}
				<div class="day">
					<div class="bars">
						{#if h.planned > 0}
							<div class="bar planned" style:height={`${Math.min(100, (h.planned / 480) * 100)}%`}></div>
						{/if}
						{#if h.onPlan > 0}
							<div class="bar onplan" style:height={`${Math.min(100, (h.onPlan / 480) * 100)}%`}></div>
						{/if}
					</div>
					<span class="figure pct" class:redink={h.adherence !== null && h.adherence < 0.5}>
						{h.adherence === null ? '–' : `${Math.round(h.adherence * 100)}`}
					</span>
					<span class="mono dow">{fmtDay(h.date).slice(0, 2)}</span>
				</div>
			{/each}
		</div>
		<p class="mono legend">hollow = planned · solid = delivered on plan · figures are %</p>
	</section>

	<section>
		<div class="planhead">
			<h2 class="eyebrow">Plan for {date === today ? 'today' : date === tomorrow ? 'tomorrow' : fmtDay(date)}</h2>
			<span class="figure total">{fmtMinutes(totalPlanned)} planned</span>
		</div>

		{#if sortedBlocks.length === 0}
			<div class="card"><p class="muted">No blocks yet. Add the first one below.</p></div>
		{:else}
			<div class="card ledger">
				{#each sortedBlocks as b (b.id)}
					<div class="blockrow">
						<div class="blocktop">
							<div class="blockmain">
								<strong>{title(b.activity_id)}</strong>
								{#if b.planned_qty}<span class="mono muted">→ {b.planned_qty} {b.planned_unit}</span>{/if}
							</div>
							<div class="blockedit">
							<Stepper
								compact
								value={b.planned_minutes}
								min={5}
								max={960}
								step={5}
								suffix="min"
								label="Planned minutes"
								onchange={(v) => updatePlannedBlock(b.id, { planned_minutes: v })}
							/>
							<TimeField
								value={b.start_time ?? ''}
								onchange={(v) => updatePlannedBlock(b.id, { start_time: v || null })}
							/>
								<button class="btn-danger remove" onclick={() => softDeletePlannedBlock(b.id)} aria-label="Remove block">✕</button>
							</div>
						</div>
						<input
							class="labelinput"
							type="text"
							value={b.label ?? ''}
							placeholder="What exactly? e.g. assignment 3"
							aria-label="What this block is for"
							onchange={(e) => updatePlannedBlock(b.id, { label: e.currentTarget.value.trim() || null })}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="card">
		<h2 class="eyebrow addhead">Add a block</h2>
		<label class="field">
			<span>Activity</span>
			<ActivityPicker activities={$activities ?? []} bind:value={newActivity} />
		</label>
		<div class="row3">
			<div class="field">
				<span>Minutes</span>
				<Stepper bind:value={newMinutes} min={5} max={960} step={5} suffix="min" label="Minutes" />
			</div>
			<div class="field">
				<span>At (optional)</span>
				<TimeField bind:value={newTime} />
			</div>
		</div>
		<label class="field">
			<span>What exactly? (optional)</span>
			<input type="text" bind:value={newLabel} placeholder="assignment 3, read ch. 7…" />
		</label>
		<div class="row3">
			<label class="field"><span>Target qty (optional)</span><input type="number" step="any" min="0" bind:value={newQty} /></label>
			<label class="field"><span>Unit</span><input type="text" bind:value={newUnit} placeholder="pages…" /></label>
		</div>
		<button class="btn btn-primary btn-block" disabled={!newActivity || newMinutes <= 0} onclick={addBlock}>
			Add to plan
		</button>
	</section>
</div>

<style>
	.datepick {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.pickright {
		margin-left: auto;
	}
	.evidence .strip {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 8px;
		margin-top: 6px;
	}
	.day {
		display: grid;
		justify-items: center;
		gap: 3px;
	}
	.bars {
		height: 64px;
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 3px;
	}
	.bar {
		width: 9px;
		border-radius: 2px 2px 0 0;
	}
	.bar.planned {
		border: 1.5px solid var(--ink-300);
	}
	.bar.onplan {
		background: var(--accent-300);
	}
	.pct {
		font-size: 0.72rem;
	}
	.pct.redink {
		color: #f0937f; /* red ink lightened for the dark card */
	}
	.dow {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-300);
	}
	.legend {
		margin-top: 12px;
		font-size: 0.62rem;
		color: var(--ink-300);
	}
	.planhead {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
	}
	.total {
		font-size: 0.82rem;
		font-weight: 500;
	}
	.blockrow {
		display: grid;
		gap: 10px;
		padding: 16px 0;
	}
	.blocktop {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.labelinput {
		min-height: 42px;
		padding: 10px 13px;
		font-size: 0.88rem;
		background: transparent;
	}
	.labelinput:not(:placeholder-shown) {
		background: var(--surface-100);
	}
	.blockmain {
		display: grid;
		gap: 1px;
		min-width: 140px;
	}
	.blockedit {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.remove {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		font-size: 0.9rem;
		transition: background 0.12s ease;
	}
	.remove:hover {
		background: var(--surface-200);
	}
	.addhead {
		margin-bottom: 12px;
	}
	.row3 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
</style>
