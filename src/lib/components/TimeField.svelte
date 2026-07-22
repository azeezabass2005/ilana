<script lang="ts">
	import { clickOutside } from '$lib/actions';

	let {
		value = $bindable(),
		optional = true,
		placeholder = 'Add time',
		onchange
	}: {
		value: string; // "HH:MM" or ""
		optional?: boolean;
		placeholder?: string;
		onchange?: (v: string) => void;
	} = $props();

	let open = $state(false);
	let hourCol = $state<HTMLElement | null>(null);
	let minCol = $state<HTMLElement | null>(null);

	const HOURS = Array.from({ length: 24 }, (_, i) => i);
	const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

	const pad = (n: number) => String(n).padStart(2, '0');
	const curH = $derived(value ? Number(value.split(':')[0]) : null);
	const curM = $derived(value ? Number(value.split(':')[1]) : null);

	function commit(h: number, m: number) {
		value = `${pad(h)}:${pad(m)}`;
		onchange?.(value);
	}
	function setH(h: number) {
		commit(h, curM ?? 0);
	}
	function setM(m: number) {
		commit(curH ?? new Date().getHours(), m);
	}
	function clear() {
		value = '';
		onchange?.('');
		open = false;
	}

	// bring the selected values into view when the panel opens
	$effect(() => {
		if (!open) return;
		for (const col of [hourCol, minCol]) {
			const sel = col?.querySelector('[aria-pressed="true"]') as HTMLElement | null;
			if (sel && col) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.clientHeight / 2;
		}
	});
</script>

<div class="tf" use:clickOutside={() => (open = false)}>
	<button type="button" class="trigger" class:empty={!value} aria-expanded={open} aria-haspopup="dialog" onclick={() => (open = !open)}>
		<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
			<circle cx="10" cy="10" r="7.5" />
			<path d="M10 5.8V10l2.8 1.8" />
		</svg>
		<span class="figure">{value || placeholder}</span>
	</button>

	{#if open}
		<div class="pop" role="dialog" aria-label="Choose a time">
			<div class="cols">
				<div class="col" bind:this={hourCol} role="group" aria-label="Hour">
					{#each HOURS as h (h)}
						<button type="button" class="opt figure" aria-pressed={h === curH} onclick={() => setH(h)}>{pad(h)}</button>
					{/each}
				</div>
				<span class="colon figure">:</span>
				<div class="col" bind:this={minCol} role="group" aria-label="Minutes">
					{#each MINUTES as m (m)}
						<button type="button" class="opt figure" aria-pressed={m === curM} onclick={() => setM(m)}>{pad(m)}</button>
					{/each}
				</div>
			</div>
			<div class="foot">
				{#if optional && value}
					<button type="button" class="linklike" onclick={clear}>clear</button>
				{:else}<span></span>{/if}
				<button type="button" class="donebtn" onclick={() => (open = false)}>Done</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.tf {
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
	.trigger.empty span {
		color: var(--ink-300);
	}
	.pop {
		position: absolute;
		z-index: 60;
		top: calc(100% + 6px);
		left: 0;
		background: var(--paper);
		border: 1px solid var(--surface-400);
		border-radius: var(--radius);
		box-shadow: var(--shadow-pop);
		padding: 10px;
		width: 172px;
		animation: pop-in 0.14s ease;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.cols {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.col {
		flex: 1;
		max-height: 168px;
		overflow-y: auto;
		display: grid;
		gap: 2px;
		scrollbar-width: thin;
	}
	.colon {
		color: var(--ink-300);
		font-size: 0.9rem;
	}
	.opt {
		padding: 7px 0;
		border-radius: 7px;
		font-size: 0.8rem;
		text-align: center;
		transition: background 0.12s ease;
	}
	.opt:hover {
		background: var(--surface-200);
	}
	.opt[aria-pressed='true'] {
		background: var(--ink-950);
		color: var(--surface-100);
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 8px;
	}
	.linklike {
		font-family: var(--mono);
		font-size: 0.7rem;
		text-decoration: underline;
		color: var(--ink-500);
	}
	.donebtn {
		font-size: 0.78rem;
		font-weight: 600;
		padding: 6px 14px;
		border-radius: 8px;
		background: var(--surface-200);
		transition: background 0.12s ease;
	}
	.donebtn:hover {
		background: var(--surface-400);
	}
</style>
