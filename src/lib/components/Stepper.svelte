<script lang="ts">
	let {
		value = $bindable(),
		min = 0,
		max = 9999,
		step = 5,
		suffix = '',
		label = '',
		compact = false,
		onchange
	}: {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		suffix?: string;
		label?: string;
		compact?: boolean;
		onchange?: (v: number) => void;
	} = $props();

	function set(v: number) {
		const next = Math.min(max, Math.max(min, Math.round(v)));
		value = next;
		onchange?.(next);
	}

	function commitInput(e: Event) {
		const raw = Number((e.currentTarget as HTMLInputElement).value);
		set(Number.isFinite(raw) && raw > 0 ? raw : min);
	}
</script>

<div class="stepper" class:compact>
	<button type="button" class="sbtn" onclick={() => set(value - step)} aria-label={`Decrease ${label || suffix}`}>−</button>
	<div class="mid">
		<input
			class="sval figure"
			type="number"
			inputmode="numeric"
			value={value}
			{min}
			{max}
			onchange={commitInput}
			aria-label={label || suffix || 'Value'}
		/>
		{#if suffix}<span class="suffix mono">{suffix}</span>{/if}
	</div>
	<button type="button" class="sbtn" onclick={() => set(value + step)} aria-label={`Increase ${label || suffix}`}>+</button>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: stretch;
		background: #fff;
		border: 1px solid var(--surface-400);
		border-radius: var(--radius-sm);
		overflow: hidden;
		height: 50px;
	}
	.compact {
		height: 42px;
	}
	.sbtn {
		width: 44px;
		font-size: 1.05rem;
		color: var(--ink-500);
		display: grid;
		place-items: center;
		transition: background 0.12s ease;
	}
	.compact .sbtn {
		width: 38px;
	}
	.sbtn:hover {
		background: var(--surface-100);
		color: var(--ink-950);
	}
	.mid {
		display: flex;
		align-items: baseline;
		align-self: center;
		gap: 4px;
		padding: 0 2px;
	}
	.sval {
		width: 3.2ch;
		border: none;
		background: none;
		text-align: center;
		font-size: 0.95rem;
		font-weight: 500;
		padding: 0;
	}
	.compact .sval {
		font-size: 0.85rem;
	}
	.sval:focus-visible {
		outline: none;
	}
	.suffix {
		font-size: 0.68rem;
		color: var(--ink-500);
	}
</style>
