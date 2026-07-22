<script lang="ts">
	import { liveQuery } from 'dexie';
	import type { Activity } from '$lib/db';
	import { buildTree, indexById, ancestors, recentActivityIds } from '$lib/repo';
	import { clickOutside } from '$lib/actions';

	let {
		activities,
		value = $bindable(),
		placeholder = 'Choose an activity'
	}: { activities: Activity[]; value: string | null; placeholder?: string } = $props();

	type Row = { kind: 'recent' | 'tree' | 'result'; activity: Activity; depth: number; leaf: boolean };

	let open = $state(false);
	let query = $state('');
	let highlight = $state(0);
	let searchEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLElement | null>(null);

	const recents = liveQuery(() => recentActivityIds(5));

	const byId = $derived(indexById(activities));
	const active = $derived(activities.filter((a) => a.status === 'active'));

	const pathOf = (id: string) =>
		ancestors(byId, id)
			.map((a) => a.title)
			.join(' / ');

	// flatten the tree depth-first so the list reads as an outline
	const flat = $derived.by(() => {
		const byParent = buildTree(active);
		const out: { activity: Activity; depth: number; leaf: boolean }[] = [];
		const walk = (parent: string | null, depth: number) => {
			for (const a of byParent.get(parent) ?? []) {
				const kids = byParent.get(a.id) ?? [];
				out.push({ activity: a, depth, leaf: kids.length === 0 });
				walk(a.id, depth + 1);
			}
		};
		walk(null, 0);
		return out;
	});

	// every term must appear in "parent path + title", so "csc read" finds
	// "CSC 306 / Reading" without needing the exact wording
	const terms = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
	const results = $derived.by(() => {
		if (terms.length === 0) return [];
		return active.filter((a) => {
			const hay = `${pathOf(a.id)} ${a.title}`.toLowerCase();
			return terms.every((t) => hay.includes(t));
		});
	});

	const recentRows = $derived.by(() => {
		const ids = ($recents ?? []) as string[];
		return ids.map((id) => byId.get(id)).filter((a): a is Activity => !!a && a.status === 'active');
	});

	// one flat list backs both rendering and keyboard nav, so indices line up
	const rows = $derived.by((): Row[] => {
		if (terms.length > 0) {
			return results.map((a) => ({ kind: 'result' as const, activity: a, depth: 0, leaf: true }));
		}
		return [
			...recentRows.map((a) => ({ kind: 'recent' as const, activity: a, depth: 0, leaf: true })),
			...flat.map((f) => ({ kind: 'tree' as const, activity: f.activity, depth: f.depth, leaf: f.leaf }))
		];
	});

	const selected = $derived(value ? byId.get(value) : null);
	const selectedPath = $derived(selected ? pathOf(selected.id) : '');

	function toggle() {
		open = !open;
		if (open) {
			query = '';
			highlight = 0;
		}
	}

	function pick(id: string) {
		value = id;
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlight = Math.min(highlight + 1, rows.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = Math.max(highlight - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const row = rows[highlight];
			if (row) pick(row.activity.id);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	// reset the cursor whenever the result set changes under it
	$effect(() => {
		terms;
		highlight = 0;
	});

	// Focus search on desktop only — on a phone it would pop the keyboard over
	// the recents, which is the exact thing that should need no typing.
	$effect(() => {
		if (open && searchEl && window.matchMedia('(pointer: fine)').matches) searchEl.focus();
	});

	$effect(() => {
		if (!open) return;
		const el = listEl?.querySelector(`[data-idx="${highlight}"]`) as HTMLElement | null;
		el?.scrollIntoView({ block: 'nearest' });
	});

	const sectionLabel = (kind: Row['kind']) =>
		kind === 'recent' ? 'Recent' : kind === 'result' ? 'Matches' : 'All activities';
</script>

<div class="ap" use:clickOutside={() => (open = false)}>
	<button type="button" class="trigger" aria-expanded={open} aria-haspopup="listbox" onclick={toggle}>
		{#if selected}
			<span class="sel">
				{#if selectedPath}<span class="path mono">{selectedPath}</span>{/if}
				<span class="name">{selected.title}</span>
			</span>
		{:else}
			<span class="name empty">{placeholder}</span>
		{/if}
		<svg class="chev" class:up={open} viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
			<path d="M4 6.5 8 10.5 12 6.5" />
		</svg>
	</button>

	{#if open}
		<div class="pop">
			<div class="searchbar">
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
					<circle cx="7" cy="7" r="4.5" />
					<path d="M10.5 10.5 14 14" />
				</svg>
				<input
					bind:this={searchEl}
					bind:value={query}
					type="text"
					placeholder="Search activities"
					aria-label="Search activities"
					onkeydown={onKeydown}
				/>
				{#if query}
					<button type="button" class="clear" onclick={() => (query = '')} aria-label="Clear search">✕</button>
				{/if}
			</div>

			<div class="list" bind:this={listEl} role="listbox" aria-label={placeholder} tabindex="-1">
				{#each rows as row, i (row.kind + row.activity.id)}
					{#if i === 0 || rows[i - 1].kind !== row.kind}
						<p class="sect">{sectionLabel(row.kind)}</p>
					{/if}
					<button
						type="button"
						class="opt"
						class:parent={row.kind === 'tree' && !row.leaf}
						class:cursor={i === highlight}
						data-idx={i}
						role="option"
						aria-selected={row.activity.id === value}
						style:padding-left={`${15 + row.depth * 18}px`}
						onclick={() => pick(row.activity.id)}
						onmouseenter={() => (highlight = i)}
					>
						{#if row.kind === 'tree' && row.depth > 0}<span class="twig" aria-hidden="true"></span>{/if}
						<span class="optname">
							{#if row.kind !== 'tree' && pathOf(row.activity.id)}
								<span class="path mono">{pathOf(row.activity.id)}</span>
							{/if}
							<span>{row.activity.title}</span>
						</span>
						{#if row.activity.id === value}
							<svg class="check" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path d="M3 8.5 6.5 12 13 4.5" />
							</svg>
						{/if}
					</button>
				{:else}
					<p class="none">
						{#if terms.length > 0}
							Nothing matches “{query}”.
						{:else}
							No activities yet — create one under <strong>Manage</strong>.
						{/if}
					</p>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.ap {
		position: relative;
		width: 100%;
	}
	.trigger {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		background: var(--surface-100);
		border: 1px solid var(--surface-400);
		border-radius: var(--radius-sm);
		padding: 12px 15px;
		text-align: left;
		min-height: 52px;
		transition: border-color 0.12s ease;
	}
	.trigger:hover,
	.trigger[aria-expanded='true'] {
		border-color: var(--ink-300);
	}
	.sel {
		display: grid;
		gap: 0;
		line-height: 1.25;
	}
	.path {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-300);
	}
	.name {
		font-weight: 500;
		font-size: 0.95rem;
	}
	.name.empty {
		color: var(--ink-300);
		font-weight: 400;
	}
	.chev {
		color: var(--ink-500);
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}
	.chev.up {
		transform: rotate(180deg);
	}
	.pop {
		position: absolute;
		z-index: 60;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		background: var(--paper);
		border: 1px solid var(--surface-400);
		border-radius: var(--radius);
		box-shadow: var(--shadow-pop);
		padding: 8px;
		animation: pop-in 0.14s ease;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.searchbar {
		display: flex;
		align-items: center;
		gap: 9px;
		background: var(--surface-100);
		border: 1px solid var(--surface-400);
		border-radius: var(--radius-sm);
		padding: 0 12px;
		margin-bottom: 6px;
	}
	.searchbar svg {
		color: var(--ink-300);
		flex-shrink: 0;
	}
	.searchbar input {
		border: none;
		background: none;
		padding: 12px 0;
		width: 100%;
		min-height: 0;
		font-size: 0.9rem;
	}
	.searchbar input:hover {
		border: none;
	}
	.searchbar input:focus-visible {
		outline: none;
		box-shadow: none;
		border: none;
	}
	.clear {
		color: var(--ink-300);
		font-size: 0.8rem;
		padding: 4px;
	}
	.clear:hover {
		color: var(--ink-950);
	}
	.list {
		max-height: 300px;
		overflow-y: auto;
	}
	.sect {
		font-family: var(--mono);
		font-size: 0.6rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-300);
		padding: 10px 12px 5px;
	}
	.opt {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		padding: 12px 15px;
		border-radius: 9px;
		font-size: 0.9rem;
	}
	.opt.parent {
		font-weight: 600;
	}
	.opt.cursor {
		background: var(--surface-200);
	}
	.opt[aria-selected='true'] {
		background: var(--ink-950);
		color: var(--surface-100);
	}
	.optname {
		display: grid;
		gap: 0;
		line-height: 1.25;
	}
	.opt[aria-selected='true'] .path {
		color: var(--ink-300);
	}
	.twig {
		position: absolute;
		width: 8px;
		height: 8px;
		border-left: 1.5px solid var(--surface-400);
		border-bottom: 1.5px solid var(--surface-400);
		border-radius: 0 0 0 3px;
		margin-left: -14px;
		margin-top: -6px;
	}
	.check {
		margin-left: auto;
		color: var(--accent-300);
		flex-shrink: 0;
	}
	.none {
		padding: 16px 14px;
		font-size: 0.88rem;
		color: var(--ink-500);
	}
</style>
