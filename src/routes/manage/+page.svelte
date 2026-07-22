<script lang="ts">
	import { liveQuery } from 'dexie';
	import type { Activity } from '$lib/db';
	import {
		liveActivities,
		liveGoals,
		liveTags,
		createActivity,
		updateActivity,
		softDeleteActivity,
		createGoal,
		updateGoal,
		softDeleteGoal,
		tagActivity,
		untagActivity,
		buildTree
	} from '$lib/repo';

	import { browser } from '$app/environment';

	const activities = liveQuery(() => liveActivities());
	const goals = liveQuery(() => liveGoals());
	const tags = liveQuery(() => liveTags());

	// Finished work piles up here forever otherwise — that's what makes this
	// page long over a term, more than nesting does.
	let showDone = $state(false);
	const visible = $derived(($activities ?? []).filter((a) => showDone || a.status === 'active'));
	const doneCount = $derived(($activities ?? []).filter((a) => a.status !== 'active').length);

	const byParent = $derived(buildTree(visible));

	// Collapsed by default: you come here to change one thing, not to read
	// the whole tree. Expanded state persists so it doesn't reset every visit.
	const EXPANDED_KEY = 'ilana.manage.expanded';
	let expanded = $state<Set<string>>(new Set(loadExpanded()));

	function loadExpanded(): string[] {
		if (!browser) return [];
		try {
			return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[];
		} catch {
			return [];
		}
	}

	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
		if (browser) localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
	}
	const tagsByActivity = $derived.by(() => {
		const map = new Map<string, Set<string>>();
		for (const t of $tags ?? []) {
			const set = map.get(t.activity_id) ?? new Set<string>();
			set.add(t.goal_id);
			map.set(t.activity_id, set);
		}
		return map;
	});

	const GOAL_COLORS = ['#5B5BD6', '#C6402C', '#D97706', '#0E7490', '#B4508C', '#3E7A5E', '#64748B', '#8C5E3C'];

	// ----- goals -----
	let newGoalTitle = $state('');
	let newGoalColor = $state(GOAL_COLORS[0]);
	let editingGoalId = $state<string | null>(null);

	async function addGoal() {
		if (!newGoalTitle.trim()) return;
		await createGoal({ title: newGoalTitle, color: newGoalColor });
		newGoalTitle = '';
	}

	// ----- activities -----
	let addingUnder = $state<string | 'root' | null>(null);
	let newTitle = $state('');
	let newUnit = $state('');
	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let editUnit = $state('');

	async function addActivity(parent: string | null) {
		if (!newTitle.trim()) return;
		await createActivity({ title: newTitle, parent_id: parent, default_unit: newUnit || null });
		newTitle = '';
		newUnit = '';
		addingUnder = null;
	}

	function startEdit(a: Activity) {
		editingId = a.id;
		editTitle = a.title;
		editUnit = a.default_unit ?? '';
	}

	async function saveEdit(id: string) {
		if (!editTitle.trim()) return;
		await updateActivity(id, { title: editTitle.trim(), default_unit: editUnit.trim() || null });
		editingId = null;
	}

	async function toggleTag(activityId: string, goalId: string) {
		if (tagsByActivity.get(activityId)?.has(goalId)) await untagActivity(activityId, goalId);
		else await tagActivity(activityId, goalId);
	}

	async function removeActivity(a: Activity) {
		const kids = byParent.get(a.id)?.length ?? 0;
		const msg = kids > 0 ? `Delete “${a.title}” and hide its ${kids} sub-activities?` : `Delete “${a.title}”? Its history stays.`;
		if (confirm(msg)) await softDeleteActivity(a.id);
	}
</script>

<div class="stack">
	<section>
		<h2 class="eyebrow">Goals</h2>
		<p class="muted intro">The few things everything else is serving. A goal is a tag — one activity can serve two.</p>
		<div class="card ledger">
			{#each $goals ?? [] as g (g.id)}
				<div class="grow">
					<div class="ledger-row">
						<span class="goalname" class:inactive={!g.is_active}>
							<span class="dot" style:background={g.color}></span>{g.title}
						</span>
						<span class="rowbtns">
							<button class="linklike" onclick={() => (editingGoalId = editingGoalId === g.id ? null : g.id)}>
								{editingGoalId === g.id ? 'close' : 'edit'}
							</button>
						</span>
					</div>
					{#if editingGoalId === g.id}
						<div class="editbox">
							<label class="field">
								<span>Title</span>
								<input type="text" value={g.title} onchange={(e) => updateGoal(g.id, { title: e.currentTarget.value })} />
							</label>
							<div class="colorrow">
								{#each GOAL_COLORS as c (c)}
									<button
										class="colorchip"
										style:background={c}
										aria-pressed={g.color === c}
										aria-label={`Colour ${c}`}
										onclick={() => updateGoal(g.id, { color: c })}
									></button>
								{/each}
							</div>
							<div class="editactions">
								<button class="linklike" onclick={() => updateGoal(g.id, { is_active: g.is_active ? 0 : 1 })}>
									{g.is_active ? 'pause goal' : 'reactivate'}
								</button>
								<button class="linklike btn-danger" onclick={() => confirm(`Delete “${g.title}”?`) && softDeleteGoal(g.id)}>
									delete
								</button>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<p class="muted pad">No goals yet — add 3 to 6, not 30.</p>
			{/each}
		</div>
		<div class="card addcard">
			<label class="field"><span>New goal</span><input type="text" bind:value={newGoalTitle} placeholder="e.g. Graduate well" /></label>
			<div class="colorrow">
				{#each GOAL_COLORS as c (c)}
					<button
						class="colorchip"
						style:background={c}
						aria-pressed={newGoalColor === c}
						aria-label={`Colour ${c}`}
						onclick={() => (newGoalColor = c)}
					></button>
				{/each}
			</div>
			<button class="btn btn-ink" disabled={!newGoalTitle.trim()} onclick={addGoal}>Add goal</button>
		</div>
	</section>

	<section>
		<h2 class="eyebrow">Activities</h2>
		<p class="muted intro">One tree. A project, a task, and a subtask are the same thing at different depths.</p>

		{#snippet node(a: Activity, depth: number)}
			{@const kids = byParent.get(a.id) ?? []}
			{@const isOpen = expanded.has(a.id)}
			<div class="act" style:margin-left={`${depth * 18}px`}>
				<div class="actrow">
					<div class="actname" class:dimmed={a.status !== 'active'}>
						{#if kids.length > 0}
							<button
								class="twisty"
								aria-expanded={isOpen}
								onclick={() => toggleExpand(a.id)}
								aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${a.title}`}
							>
								<svg class:open={isOpen} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
									<path d="M6 3.5 10.5 8 6 12.5" />
								</svg>
							</button>
						{:else}
							<span class="twisty-spacer" aria-hidden="true"></span>
						{/if}
						<strong>{a.title}</strong>
						{#if kids.length > 0 && !isOpen}<span class="mono kidcount">{kids.length}</span>{/if}
						{#if a.status !== 'active'}<span class="mono muted">· {a.status}</span>{/if}
						{#if a.default_unit}<span class="mono muted">· {a.default_unit}</span>{/if}
						{#each [...(tagsByActivity.get(a.id) ?? [])] as gid (gid)}
							{@const g = ($goals ?? []).find((x) => x.id === gid)}
							{#if g}<span class="dot small" style:background={g.color} title={g.title}></span>{/if}
						{/each}
					</div>
					<span class="rowbtns">
						<button class="linklike" onclick={() => (addingUnder = addingUnder === a.id ? null : a.id)}>+ sub</button>
						<button class="linklike" onclick={() => (editingId === a.id ? (editingId = null) : startEdit(a))}>
							{editingId === a.id ? 'close' : 'edit'}
						</button>
					</span>
				</div>

				{#if editingId === a.id}
					<div class="editbox">
						<div class="row2">
							<label class="field"><span>Title</span><input type="text" bind:value={editTitle} /></label>
							<label class="field"><span>Default unit</span><input type="text" bind:value={editUnit} placeholder="pages…" /></label>
						</div>
						{#if ($goals ?? []).length > 0}
							<div class="field">
								<span>Serves goals</span>
								<div class="tagrow">
									{#each $goals ?? [] as g (g.id)}
										<button
											class="chip"
											aria-pressed={tagsByActivity.get(a.id)?.has(g.id) ?? false}
											onclick={() => toggleTag(a.id, g.id)}
										>
											<span class="dot small" style:background={g.color}></span>{g.title}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						<div class="editactions">
							<button class="btn btn-ink small" onclick={() => saveEdit(a.id)}>Save</button>
							{#if a.status === 'active'}
								<button class="linklike" onclick={() => updateActivity(a.id, { status: 'done' })}>mark done</button>
								<button class="linklike" onclick={() => updateActivity(a.id, { status: 'archived' })}>archive</button>
							{:else}
								<button class="linklike" onclick={() => updateActivity(a.id, { status: 'active' })}>reactivate</button>
							{/if}
							<button class="linklike btn-danger" onclick={() => removeActivity(a)}>delete</button>
						</div>
					</div>
				{/if}

				{#if addingUnder === a.id}
					<div class="editbox">
						<div class="row2">
							<label class="field"><span>Sub-activity of “{a.title}”</span><input type="text" bind:value={newTitle} /></label>
							<label class="field"><span>Default unit</span><input type="text" bind:value={newUnit} placeholder="optional" /></label>
						</div>
						<button class="btn btn-ink small" disabled={!newTitle.trim()} onclick={() => addActivity(a.id)}>Add</button>
					</div>
				{/if}

				{#if isOpen}
					{#each kids as child (child.id)}
						{@render node(child, depth + 1)}
					{/each}
				{/if}
			</div>
		{/snippet}

		<div class="card tree">
			{#each byParent.get(null) ?? [] as root (root.id)}
				{@render node(root, 0)}
			{:else}
				<p class="muted pad">
					{#if doneCount > 0}
						Nothing active. {doneCount} finished {doneCount === 1 ? 'activity is' : 'activities are'} hidden.
					{:else}
						No activities yet. Everything you plan or log hangs off this tree.
					{/if}
				</p>
			{/each}
		</div>

		{#if doneCount > 0}
			<button class="linklike showdone" onclick={() => (showDone = !showDone)}>
				{showDone ? 'hide' : 'show'} {doneCount} completed &amp; archived
			</button>
		{/if}

		<div class="card addcard">
			{#if addingUnder === 'root'}
				<div class="row2">
					<label class="field"><span>New top-level activity</span><input type="text" bind:value={newTitle} placeholder="e.g. CSC 306" /></label>
					<label class="field"><span>Default unit</span><input type="text" bind:value={newUnit} placeholder="optional" /></label>
				</div>
				<div class="editactions">
					<button class="btn btn-ink" disabled={!newTitle.trim()} onclick={() => addActivity(null)}>Add activity</button>
					<button class="linklike" onclick={() => (addingUnder = null)}>cancel</button>
				</div>
			{:else}
				<button class="btn btn-ghost btn-block" onclick={() => { addingUnder = 'root'; newTitle = ''; newUnit = ''; }}>
					+ New top-level activity
				</button>
			{/if}
		</div>
	</section>
</div>

<style>
	h2.eyebrow {
		margin-bottom: 4px;
	}
	.intro {
		font-size: 0.88rem;
		margin-bottom: 10px;
		max-width: 46ch;
	}
	.pad {
		padding: 8px 0;
	}
	.goalname {
		display: inline-flex;
		align-items: center;
		gap: 9px;
	}
	.goalname.inactive {
		color: var(--ink-300);
	}
	.dot {
		width: 11px;
		height: 11px;
		border-radius: 3px;
		display: inline-block;
		flex-shrink: 0;
	}
	.dot.small {
		width: 8px;
		height: 8px;
	}
	.rowbtns {
		display: inline-flex;
		gap: 12px;
	}
	.linklike {
		font-family: var(--mono);
		font-size: 0.72rem;
		text-decoration: underline;
		color: var(--ink-500);
	}
	.linklike.btn-danger {
		color: var(--redink);
	}
	.editbox {
		background: var(--surface-200);
		border-radius: var(--radius-sm);
		padding: 16px;
		margin: 6px 0 12px;
	}
	.colorrow {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.colorchip {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		border: 2px solid transparent;
	}
	.colorchip[aria-pressed='true'] {
		border-color: var(--ink-950);
		box-shadow: inset 0 0 0 2px var(--paper);
	}
	.editactions {
		display: flex;
		gap: 14px;
		align-items: center;
		flex-wrap: wrap;
	}
	.addcard {
		margin-top: 10px;
	}
	.tree {
		display: grid;
		gap: 2px;
	}
	.act {
		border-left: 1px solid var(--surface-400);
		padding-left: 10px;
	}
	.tree > .act {
		border-left: none;
		padding-left: 0;
	}
	.actrow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		padding: 10px 0;
	}
	.actname {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}
	.twisty {
		width: 26px;
		height: 26px;
		margin-left: -5px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		color: var(--ink-500);
		transition: background 0.12s ease;
	}
	.twisty:hover {
		background: var(--surface-200);
		color: var(--ink-950);
	}
	.twisty svg {
		transition: transform 0.15s ease;
	}
	.twisty svg.open {
		transform: rotate(90deg);
	}
	.twisty-spacer {
		width: 21px;
	}
	.kidcount {
		font-size: 0.66rem;
		color: var(--ink-500);
		background: var(--surface-200);
		border-radius: 99px;
		padding: 2px 8px;
	}
	.showdone {
		margin-top: 10px;
		justify-self: start;
	}
	.actname.dimmed strong {
		color: var(--ink-300);
		font-weight: 500;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.tagrow {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tagrow .chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.btn.small {
		padding: 8px 16px;
		font-size: 0.85rem;
	}
</style>
