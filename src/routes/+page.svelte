<script lang="ts">
	import { liveQuery } from 'dexie';
	import { dateStr, addDays, dayBounds, fmtDay, fmtMinutes, fmtClock, fmtTimer } from '$lib/time';
	import { liveActivities, livePlannedBlocks, liveSessionsBetween, indexById, ancestors } from '$lib/repo';
	import { dayStats } from '$lib/derive';
	import { timer } from '$lib/timer.svelte';
	import { logSheet } from '$lib/ui.svelte';
	import DeltaBar from '$lib/components/DeltaBar.svelte';
	import ActivityPicker from '$lib/components/ActivityPicker.svelte';

	const WAKING_MINUTES = 16 * 60;

	let date = $state(dateStr());
	const isToday = $derived(date === dateStr());

	const activities = liveQuery(() => liveActivities());
	// capture the reactive date synchronously so the query re-creates when it changes
	const blocks = $derived.by(() => {
		const d = date;
		return liveQuery(() => livePlannedBlocks(d));
	});
	const sessions = $derived.by(() => {
		const [start, end] = dayBounds(date);
		return liveQuery(() => liveSessionsBetween(start, end));
	});

	const byId = $derived(indexById($activities ?? []));
	const stats = $derived(dayStats($blocks ?? [], $sessions ?? [], byId));
	const unaccounted = $derived(Math.max(0, WAKING_MINUTES - stats.loggedMinutes));

	function title(activityId: string): string {
		return byId.get(activityId)?.title ?? '(deleted)';
	}
	function path(activityId: string): string {
		return ancestors(byId, activityId)
			.map((a) => a.title)
			.join(' / ');
	}

	// starting the live timer needs an activity first
	let pickingTimer = $state(false);
	let timerActivity = $state<string | null>(null);

	function startTimer() {
		if (!timerActivity) return;
		timer.start(timerActivity);
		pickingTimer = false;
	}
	function stopTimer() {
		const result = timer.stop();
		if (!result) return;
		logSheet.show({
			activityId: result.activityId,
			fromTimer: { startedAt: result.startedAt, durationSeconds: result.durationSeconds }
		});
	}
</script>

<div class="stack">
	<div class="datebar">
		<button class="navbtn" onclick={() => (date = addDays(date, -1))} aria-label="Previous day">‹</button>
		<div class="datelabel">
			<strong>{isToday ? 'Today' : fmtDay(date)}</strong>
			{#if !isToday}<button class="linklike" onclick={() => (date = dateStr())}>back to today</button>{/if}
		</div>
		<button class="navbtn" onclick={() => (date = addDays(date, 1))} disabled={isToday} aria-label="Next day">›</button>
	</div>

	<section class="card card--ink">
		<p class="eyebrow">The day's ledger</p>
		<DeltaBar planned={stats.plannedMinutes} logged={stats.loggedMinutes} />
		<div class="ledgerfoot figure">
			<span>
				on plan {fmtMinutes(stats.loggedOnPlanMinutes)}{#if stats.adherence !== null}&nbsp;· {Math.round(stats.adherence * 100)}%{/if}
			</span>
			<span class="muted">unaccounted {fmtMinutes(unaccounted)} of {fmtMinutes(WAKING_MINUTES)} waking</span>
		</div>
	</section>

	{#if timer.running}
		<section class="card timercard">
			<div>
				<p class="eyebrow">Timer running</p>
				<strong>{timer.activityId ? title(timer.activityId) : ''}</strong>
			</div>
			<div class="timerside">
				<span class="figure elapsed">{fmtTimer(timer.elapsedSeconds)}</span>
				<div class="timerbtns">
					<button class="btn btn-primary" onclick={stopTimer}>Stop &amp; log</button>
					<button class="linklike" onclick={() => timer.discard()}>discard</button>
				</div>
			</div>
		</section>
	{:else if pickingTimer}
		<section class="card">
			<p class="eyebrow">Start a timer</p>
			<div class="pickrow">
				<ActivityPicker activities={$activities ?? []} bind:value={timerActivity} />
				<button class="btn btn-ink" disabled={!timerActivity} onclick={startTimer}>Start</button>
				<button class="linklike" onclick={() => (pickingTimer = false)}>cancel</button>
			</div>
		</section>
	{/if}

	<section>
		<h2 class="eyebrow">Planned</h2>
		{#if stats.blocks.length === 0}
			<div class="card empty">
				<p class="muted">Nothing planned for this day.</p>
				<a class="btn btn-ghost" href="/plan">Build the plan</a>
			</div>
		{:else}
			<div class="card ledger">
				{#each stats.blocks as b (b.block.id)}
					<div class="blockrow">
						<div class="blocktop">
							<div class="blockname">
								{#if path(b.block.activity_id)}<span class="eyebrow">{path(b.block.activity_id)}</span>{/if}
								<strong>{title(b.block.activity_id)}</strong>
								{#if b.block.label}<span class="blocklabel">{b.block.label}</span>{/if}
								{#if b.block.start_time}<span class="mono muted">{b.block.start_time}</span>{/if}
								{#if b.block.planned_qty}
									<span class="mono muted">→ {b.block.planned_qty} {b.block.planned_unit}</span>
								{/if}
							</div>
							<button
								class="btn btn-ghost logbtn"
								onclick={() => logSheet.show({ activityId: b.block.activity_id, blockId: b.block.id })}
								>Log</button
							>
						</div>
						{#if b.touched}
							<DeltaBar compact planned={b.block.planned_minutes} logged={b.actualMinutes} />
						{:else}
							<div class="figures figure">
								<span class="muted">not started</span>
								<span>{fmtMinutes(b.block.planned_minutes)} planned</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	{#if stats.unplanned.length > 0}
		<section>
			<h2 class="eyebrow">Off the plan</h2>
			<div class="card ledger">
				{#each stats.unplanned as s (s.id)}
					<div class="ledger-row">
						<div>
							<strong>{title(s.activity_id)}</strong>
							{#if s.note}<span class="muted note"> — {s.note}</span>{/if}
						</div>
						<span class="figure"
							><span class="muted">{fmtClock(s.started_at)}</span> · {fmtMinutes(s.duration_seconds / 60)}</span
						>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

{#if isToday}
	<div class="dock">
		{#if !timer.running}
			<button class="btn btn-ink" onclick={() => (pickingTimer = true)}>Start timer</button>
		{/if}
		<button class="btn btn-primary dock-log" onclick={() => logSheet.show()}>Log time</button>
	</div>
{/if}

<style>
	.datebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.datelabel {
		display: flex;
		align-items: baseline;
		gap: 12px;
		font-size: 1.25rem;
		letter-spacing: -0.01em;
	}
	.navbtn {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 1px solid var(--surface-400);
		font-size: 1.2rem;
		line-height: 1;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.navbtn:hover:not(:disabled) {
		background: var(--surface-100);
		border-color: var(--ink-500);
	}
	.navbtn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.linklike {
		font-family: var(--mono);
		font-size: 0.72rem;
		text-decoration: underline;
		color: var(--ink-500);
	}
	.ledgerfoot {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 16px;
		font-size: 0.76rem;
		margin-top: 10px;
	}
	.timercard {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.elapsed {
		font-size: 1.7rem;
		font-weight: 500;
	}
	.timerside {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.timerbtns {
		display: grid;
		gap: 4px;
		justify-items: center;
	}
	.pickrow {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.pickrow :global(select) {
		flex: 1;
		min-width: 180px;
		width: auto;
	}
	h2.eyebrow {
		margin-bottom: 8px;
	}
	.empty {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.blockrow {
		padding: 16px 0;
		display: grid;
		gap: 8px;
	}
	.blocktop {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.blockname {
		display: grid;
		gap: 1px;
	}
	.blockname .eyebrow {
		font-size: 0.6rem;
	}
	.blocklabel {
		font-size: 0.85rem;
		color: var(--accent-600);
	}
	.logbtn {
		padding: 10px 18px;
		font-size: 0.8rem;
	}
	.figures {
		display: flex;
		justify-content: space-between;
		font-size: 0.78rem;
	}
	.note {
		font-size: 0.85rem;
	}
	.dock {
		position: fixed;
		bottom: calc(70px + env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		width: min(100% - 32px, calc(var(--maxw) - 32px));
		display: flex;
		gap: 10px;
		z-index: 40;
	}
	.dock .btn {
		box-shadow: 0 6px 18px rgba(25, 24, 36, 0.22);
		border-radius: 999px;
	}
	.dock-log {
		flex: 1;
		padding: 15px 20px;
		font-size: 1.02rem;
	}
</style>
