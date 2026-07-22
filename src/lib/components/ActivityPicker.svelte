<script lang="ts">
	import type { Activity } from '$lib/db';
	import { buildTree, indexById, ancestors } from '$lib/repo';
	import { clickOutside } from '$lib/actions';

	let {
		activities,
		value = $bindable(),
		placeholder = 'Choose an activity'
	}: { activities: Activity[]; value: string | null; placeholder?: string } = $props();

	let open = $state(false);

	// flatten the tree depth-first so the list reads as an outline
	const flat = $derived.by(() => {
		const byParent = buildTree(activities.filter((a) => a.status === 'active'));
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

	const byId = $derived(indexById(activities));
	const selected = $derived(value ? byId.get(value) : null);
	const selectedPath = $derived(
		selected ? ancestors(byId, selected.id).map((a) => a.title).join(' / ') : ''
	);

	function pick(id: string) {
		value = id;
		open = false;
	}
</script>

<div class="ap" use:clickOutside={() => (open = false)}>
	<button type="button" class="trigger" aria-expanded={open} aria-haspopup="listbox" onclick={() => (open = !open)}>
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
		<div class="pop" role="listbox" aria-label={placeholder}>
			{#each flat as { activity, depth, leaf } (activity.id)}
				<button
					type="button"
					class="opt"
					class:parent={!leaf}
					role="option"
					aria-selected={activity.id === value}
					style:padding-left={`${14 + depth * 18}px`}
					onclick={() => pick(activity.id)}
				>
					{#if depth > 0}<span class="twig" aria-hidden="true"></span>{/if}
					<span>{activity.title}</span>
					{#if activity.id === value}
						<svg class="check" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<path d="M3 8.5 6.5 12 13 4.5" />
						</svg>
					{/if}
				</button>
			{:else}
				<p class="none">No activities yet — create one under <strong>Manage</strong>.</p>
			{/each}
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
		background: #fff;
		border: 1px solid var(--surface-400);
		border-radius: var(--radius-sm);
		padding: 12px 15px;
		text-align: left;
		min-height: 52px;
		transition: border-color 0.12s ease;
	}
	.trigger:hover,
	.trigger[aria-expanded='true'] {
		border-color: var(--ink-500);
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
		padding: 6px;
		max-height: 264px;
		overflow-y: auto;
		animation: pop-in 0.14s ease;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.opt {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		padding: 12px 15px;
		border-radius: 8px;
		font-size: 0.9rem;
		transition: background 0.12s ease;
	}
	.opt.parent {
		font-weight: 600;
	}
	.opt:hover {
		background: var(--surface-200);
	}
	.opt[aria-selected='true'] {
		background: var(--ink-950);
		color: var(--surface-100);
	}
	.twig {
		position: absolute;
		left: calc(var(--twig-x, 0px));
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
		padding: 14px 12px;
		font-size: 0.85rem;
		color: var(--ink-500);
	}
</style>
