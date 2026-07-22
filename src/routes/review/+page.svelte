<script lang="ts">
	import { liveQuery } from 'dexie';
	import { dateStr, addDays, dayBounds, fmtMinutes } from '$lib/time';
	import {
		liveActivities,
		liveGoals,
		liveTags,
		livePlannedBlocksRange,
		liveSessionsBetween,
		liveMeasuresFor,
		indexById,
		effectiveGoals
	} from '$lib/repo';
	import { dayStats } from '$lib/derive';

	type Range = 'day' | 'week' | 'month' | 'all';
	let range = $state<Range>('week');

	const today = dateStr();
	const bounds = $derived.by((): [string, string] => {
		if (range === 'day') return [today, today];
		if (range === 'week') return [addDays(today, -6), today];
		if (range === 'month') return [addDays(today, -29), today];
		return ['1970-01-01', today];
	});

	const activities = liveQuery(() => liveActivities());
	const goals = liveQuery(() => liveGoals());
	const tags = liveQuery(() => liveTags());

	const blocks = $derived.by(() => {
		const [from, to] = bounds;
		return liveQuery(() => livePlannedBlocksRange(from, to));
	});
	const sessions = $derived.by(() => {
		const [from, to] = bounds;
		const [start] = dayBounds(from);
		const [, end] = dayBounds(to);
		return liveQuery(() => liveSessionsBetween(start, end));
	});
	const measures = $derived.by(() => {
		const ids = ($sessions ?? []).map((s) => s.id);
		return liveQuery(() => liveMeasuresFor(ids));
	});

	const byId = $derived(indexById($activities ?? []));
	const stats = $derived(dayStats($blocks ?? [], $sessions ?? []));

	// minutes per goal — a goal is a tag, so shares can overlap and need not sum to 100
	const perGoal = $derived.by(() => {
		const allTags = $tags ?? [];
		const totals = new Map<string, number>();
		let untagged = 0;
		for (const s of $sessions ?? []) {
			const gs = effectiveGoals(byId, allTags, s.activity_id);
			const min = s.duration_seconds / 60;
			if (gs.size === 0) untagged += min;
			for (const g of gs) totals.set(g, (totals.get(g) ?? 0) + min);
		}
		const rows = ($goals ?? [])
			.map((g) => ({ goal: g, minutes: totals.get(g.id) ?? 0 }))
			.filter((r) => r.minutes > 0)
			.sort((a, b) => b.minutes - a.minutes);
		return { rows, untagged };
	});

	// minutes per top-level activity subtree
	const perRoot = $derived.by(() => {
		const totals = new Map<string, number>();
		for (const s of $sessions ?? []) {
			let cur = byId.get(s.activity_id);
			while (cur && cur.parent_id) cur = byId.get(cur.parent_id);
			if (!cur) continue;
			totals.set(cur.id, (totals.get(cur.id) ?? 0) + s.duration_seconds / 60);
		}
		return [...totals.entries()]
			.map(([id, minutes]) => ({ title: byId.get(id)?.title ?? '(deleted)', minutes }))
			.sort((a, b) => b.minutes - a.minutes);
	});

	// unit totals per activity: pages read, problems solved…
	const unitTotals = $derived.by(() => {
		const sessById = new Map(($sessions ?? []).map((s) => [s.id, s]));
		const totals = new Map<string, number>();
		for (const m of $measures ?? []) {
			const s = sessById.get(m.session_id);
			if (!s) continue;
			const key = `${byId.get(s.activity_id)?.title ?? '(deleted)'}\u0000${m.unit}`;
			totals.set(key, (totals.get(key) ?? 0) + m.quantity);
		}
		return [...totals.entries()]
			.map(([key, qty]) => {
				const [activity, unit] = key.split('\u0000');
				return { activity, unit, qty };
			})
			.sort((a, b) => b.qty - a.qty);
	});

	const labels: Record<Range, string> = {
		day: 'Today',
		week: 'Last 7 days',
		month: 'Last 30 days',
		all: 'All time'
	};
</script>

<div class="stack">
	<div class="ranges" role="group" aria-label="Report range">
		{#each Object.entries(labels) as [key, label] (key)}
			<button class="chip" aria-pressed={range === key} onclick={() => (range = key as Range)}>{label}</button>
		{/each}
	</div>

	<section class="card card--ink">
		<p class="eyebrow">{labels[range]}</p>
		<div class="grid4">
			<div>
				<span class="figure big">{fmtMinutes(stats.loggedMinutes)}</span>
				<span class="eyebrow">logged</span>
			</div>
			<div>
				<span class="figure big">{fmtMinutes(stats.plannedMinutes)}</span>
				<span class="eyebrow">planned</span>
			</div>
			<div>
				<span class="figure big">{stats.adherence === null ? '–' : `${Math.round(stats.adherence * 100)}%`}</span>
				<span class="eyebrow">adherence</span>
			</div>
			<div>
				<span class="figure big">{stats.accuracy === null ? '–' : `${Math.round(stats.accuracy * 100)}%`}</span>
				<span class="eyebrow">accuracy</span>
			</div>
		</div>
		<p class="mono fineprint">
			adherence = delivered-on-plan ÷ planned · accuracy = actual ÷ planned for blocks that were touched
		</p>
	</section>

	<section>
		<h2 class="eyebrow">By goal</h2>
		<div class="card ledger">
			{#if perGoal.rows.length === 0 && perGoal.untagged === 0}
				<p class="muted pad">No sessions in this range yet.</p>
			{:else}
				{#each perGoal.rows as { goal, minutes } (goal.id)}
					<div class="ledger-row">
						<span class="goalname"><span class="dot" style:background={goal.color}></span>{goal.title}</span>
						<span class="figure">{fmtMinutes(minutes)} <span class="muted">of {fmtMinutes(stats.loggedMinutes)}</span></span>
					</div>
				{/each}
				{#if perGoal.untagged > 0}
					<div class="ledger-row">
						<span class="goalname muted"><span class="dot hollow"></span>No goal</span>
						<span class="figure">{fmtMinutes(perGoal.untagged)} <span class="muted">of {fmtMinutes(stats.loggedMinutes)}</span></span>
					</div>
				{/if}
			{/if}
		</div>
	</section>

	<section>
		<h2 class="eyebrow">By activity</h2>
		<div class="card ledger">
			{#if perRoot.length === 0}
				<p class="muted pad">Nothing logged in this range.</p>
			{:else}
				{#each perRoot as row (row.title)}
					<div class="ledger-row">
						<span>{row.title}</span>
						<span class="figure">{fmtMinutes(row.minutes)} <span class="muted">of {fmtMinutes(stats.loggedMinutes)}</span></span>
					</div>
				{/each}
			{/if}
		</div>
	</section>

	{#if unitTotals.length > 0}
		<section>
			<h2 class="eyebrow">Counted work</h2>
			<div class="card ledger">
				{#each unitTotals as row (row.activity + row.unit)}
					<div class="ledger-row">
						<span>{row.activity}</span>
						<span class="figure">{row.qty} {row.unit}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.ranges {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.grid4 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 16px;
		margin-top: 4px;
	}
	.grid4 > div {
		display: grid;
		gap: 2px;
	}
	.big {
		font-size: 1.45rem;
		font-weight: 500;
	}
	.fineprint {
		margin-top: 14px;
		font-size: 0.62rem;
		color: var(--ink-300);
	}
	h2.eyebrow {
		margin-bottom: 8px;
	}
	.pad {
		padding: 8px 0;
	}
	.goalname {
		display: inline-flex;
		align-items: center;
		gap: 9px;
	}
	.dot {
		width: 11px;
		height: 11px;
		border-radius: 3px;
		display: inline-block;
	}
	.dot.hollow {
		border: 1.5px solid var(--surface-400);
	}
</style>
