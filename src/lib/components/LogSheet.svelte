<script lang="ts">
	import { liveQuery } from 'dexie';
	import { logSheet } from '$lib/ui.svelte';
	import { dateStr, dayBounds, fmtClock, fmtSeconds } from '$lib/time';
	import {
		liveActivities,
		livePlannedBlocks,
		logSession,
		lastLoggedActivityId,
		knownUnits,
		indexById
	} from '$lib/repo';
	import { findBlockFor } from '$lib/derive';
	import ActivityPicker from './ActivityPicker.svelte';
	import DatePicker from './DatePicker.svelte';
	import TimeField from './TimeField.svelte';
	import Stepper from './Stepper.svelte';

	const activities = liveQuery(() => liveActivities());

	let activityId = $state<string | null>(null);
	let durationMin = $state(30);
	let endedJustNow = $state(true);
	let sessionDate = $state(dateStr());
	let startTime = $state('');
	let note = $state('');
	let qty = $state<number | null>(null);
	let unit = $state('');
	let asUnplanned = $state(false);
	let chosenBlockId = $state<string | null>(null);
	let units = $state<string[]>([]);
	let saving = $state(false);
	let noteDirty = $state(false);

	const quick = [15, 25, 45, 60, 90];
	const fromTimer = $derived(logSheet.prefill.fromTimer ?? null);

	// (re)prime the form each time the sheet opens
	$effect(() => {
		if (!logSheet.open) return;
		const p = logSheet.prefill;
		endedJustNow = !p.fromTimer;
		sessionDate = dateStr(p.fromTimer ? new Date(p.fromTimer.startedAt) : new Date());
		startTime = p.fromTimer ? fmtClock(p.fromTimer.startedAt) : '';
		durationMin = p.fromTimer ? Math.max(1, Math.round(p.fromTimer.durationSeconds / 60)) : 30;
		note = '';
		noteDirty = false;
		qty = null;
		unit = '';
		asUnplanned = false;
		chosenBlockId = p.blockId ?? null;
		if (p.activityId) {
			activityId = p.activityId;
		} else {
			lastLoggedActivityId().then((id) => {
				if (!activityId) activityId = id;
			});
		}
		knownUnits().then((u) => (units = u));
	});

	const byId = $derived(indexById($activities ?? []));

	// prefill the unit from the activity's default when the field is empty
	$effect(() => {
		const a = activityId ? byId.get(activityId) : null;
		if (a?.default_unit && !unit) unit = a.default_unit;
	});

	const dayBlocks = $derived.by(() => {
		const d = sessionDate;
		return liveQuery(() => livePlannedBlocks(d));
	});
	// Same rule the reports use, so the sheet can't promise something the day
	// then counts differently — including time on a sub-activity rolling up
	// into a block planned on its parent.
	const candidateBlock = $derived(
		activityId ? findBlockFor($dayBlocks ?? [], activityId, byId) : null
	);
	const linkedBlockId = $derived(asUnplanned ? null : (chosenBlockId ?? candidateBlock?.id ?? null));
	const linkedBlock = $derived(($dayBlocks ?? []).find((b) => b.id === linkedBlockId) ?? null);

	// A block's label is what you meant to do, so it becomes the session's note
	// unless you've written your own — reality inherits the intent's wording.
	$effect(() => {
		const label = linkedBlock?.label;
		if (label && !noteDirty) note = label;
	});

	function startedAtMs(): number {
		if (endedJustNow) return Date.now() - durationMin * 60_000;
		const [h, m] = (startTime || '00:00').split(':').map(Number);
		const [y, mo, d] = sessionDate.split('-').map(Number);
		return new Date(y, mo - 1, d, h, m).getTime();
	}

	async function save() {
		if (!activityId || durationMin <= 0 || saving) return;
		saving = true;
		try {
			await logSession({
				activity_id: activityId,
				started_at: startedAtMs(),
				duration_seconds: durationMin * 60,
				planned_block_id: linkedBlockId,
				unplanned: asUnplanned,
				note,
				measures: qty && unit.trim() ? [{ unit, quantity: qty }] : []
			});
			logSheet.hide();
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') logSheet.hide();
	}
</script>

<svelte:window onkeydown={logSheet.open ? onKeydown : undefined} />

{#if logSheet.open}
	<div class="overlay" onclick={() => logSheet.hide()} aria-hidden="true"></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Log a session">
		<div class="grab" aria-hidden="true"></div>

		{#if fromTimer}
			<p class="eyebrow">Timer finished · started {fmtClock(fromTimer.startedAt)} · ran {fmtSeconds(fromTimer.durationSeconds)}</p>
		{:else}
			<p class="eyebrow">Log a session</p>
		{/if}

		<label class="field">
			<span>Activity</span>
			<ActivityPicker activities={$activities ?? []} bind:value={activityId} />
		</label>

		<div class="field">
			<span>Duration</span>
			<div class="chips">
				{#each quick as q (q)}
					<button
						type="button"
						class="chip"
						aria-pressed={durationMin === q}
						onclick={() => (durationMin = q)}>{q}m</button
					>
				{/each}
				<Stepper compact bind:value={durationMin} min={1} max={960} step={5} suffix="min" label="Duration" />
			</div>
		</div>

		{#if !fromTimer}
			<div class="when">
				<button type="button" class="chip" aria-pressed={endedJustNow} onclick={() => (endedJustNow = true)}>
					Ended just now
				</button>
				<button
					type="button"
					class="chip"
					aria-pressed={!endedJustNow}
					onclick={() => {
						endedJustNow = false;
						if (!startTime) startTime = fmtClock(Date.now() - durationMin * 60_000);
					}}
				>
					Earlier
				</button>
			</div>
			{#if !endedJustNow}
				<div class="row2">
					<div class="field">
						<span>Date</span>
						<DatePicker bind:value={sessionDate} max={dateStr()} />
					</div>
					<div class="field">
						<span>Started</span>
						<TimeField bind:value={startTime} optional={false} placeholder="—:—" />
					</div>
				</div>
			{/if}
		{/if}

		{#if candidateBlock}
			<div class="planline">
				{#if !asUnplanned}
					<span class="mono"
						>Counts toward the plan{#if linkedBlock?.label}: <strong>{linkedBlock.label}</strong>{/if}</span
					>
					<button type="button" class="linklike" onclick={() => (asUnplanned = true)}>log as unplanned</button>
				{:else}
					<span class="mono muted">Logged as unplanned</span>
					<button type="button" class="linklike" onclick={() => (asUnplanned = false)}>count toward plan</button>
				{/if}
			</div>
		{/if}

		<details class="more">
			<summary class="eyebrow">Note &amp; measure</summary>
			<label class="field">
				<span>Note</span>
				<input type="text" bind:value={note} oninput={() => (noteDirty = true)} placeholder="What happened?" />
			</label>
			<div class="row2">
				<label class="field"><span>Quantity</span><input type="number" step="any" min="0" bind:value={qty} /></label>
				<label class="field">
					<span>Unit</span>
					<input type="text" bind:value={unit} placeholder="pages, problems…" />
				</label>
			</div>
			{#if units.length > 0}
				<div class="unitchips">
					{#each units.slice(0, 5) as u (u)}
						<button type="button" class="chip" aria-pressed={unit === u} onclick={() => (unit = u)}>{u}</button>
					{/each}
				</div>
			{/if}
		</details>

		<div class="actions">
			<button type="button" class="btn btn-ghost" onclick={() => logSheet.hide()}>Cancel</button>
			<button type="button" class="btn btn-primary" disabled={!activityId || durationMin <= 0} onclick={save}>
				Save session
			</button>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(25, 24, 36, 0.5);
		z-index: 90;
		animation: fade-in 0.18s ease;
	}
	.sheet {
		position: fixed;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(100%, 560px);
		background: var(--paper);
		border-radius: 18px 18px 0 0;
		border: 1px solid var(--surface-400);
		border-bottom: none;
		padding: 12px 22px calc(24px + env(safe-area-inset-bottom));
		z-index: 100;
		max-height: 88dvh;
		overflow-y: auto;
		animation: rise 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes rise {
		from {
			transform: translate(-50%, 24px);
			opacity: 0;
		}
	}
	.grab {
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--surface-400);
		margin: 4px auto 14px;
	}
	.eyebrow {
		margin-bottom: 12px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.when {
		display: flex;
		gap: 8px;
		margin-bottom: 14px;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.planline {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		background: var(--surface-200);
		border-radius: var(--radius-sm);
		padding: 9px 12px;
		margin-bottom: 14px;
		font-size: 0.8rem;
	}
	.linklike {
		font-family: var(--mono);
		font-size: 0.72rem;
		text-decoration: underline;
		color: var(--ink-500);
	}
	.unitchips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}
	.more {
		margin-bottom: 16px;
	}
	.more summary {
		cursor: pointer;
		padding: 6px 0 12px;
		list-style: none;
	}
	.more summary::before {
		content: '+ ';
		color: var(--accent-600);
	}
	.more[open] summary::before {
		content: '− ';
	}
	.actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.actions .btn-primary {
		flex: 1;
	}
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
