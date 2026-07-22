<script lang="ts">
	import { fmtDelta, fmtMinutes } from '$lib/time';

	let {
		planned,
		logged,
		showFigures = true,
		compact = false
	}: { planned: number; logged: number; showFigures?: boolean; compact?: boolean } = $props();

	// The ledger rule: planned time is the hollow track, logged time is solid
	// ink. Work past the plan spills over in brass. Deficit prints in red ink.
	const scale = $derived(Math.max(planned, logged, 1));
	const plannedPct = $derived((planned / scale) * 100);
	const loggedPct = $derived((Math.min(logged, planned) / scale) * 100);
	const overPct = $derived((Math.max(0, logged - planned) / scale) * 100);
	const delta = $derived(logged - planned);
</script>

<div class="deltabar" class:compact>
	<div
		class="track"
		role="img"
		aria-label={`Logged ${fmtMinutes(logged)} of ${fmtMinutes(planned)} planned`}
	>
		<div class="planned" style:width={`${plannedPct}%`}></div>
		<div class="logged" style:width={`${loggedPct}%`}></div>
		{#if overPct > 0}
			<div class="over" style:left={`${loggedPct}%`} style:width={`${overPct}%`}></div>
		{/if}
	</div>
	{#if showFigures}
		<div class="figures figure">
			<span>{fmtMinutes(logged)} <span class="of">of {fmtMinutes(planned)}</span></span>
			<span class:redink={delta < 0} class="delta">{fmtDelta(delta)}</span>
		</div>
	{/if}
</div>

<style>
	.deltabar {
		display: grid;
		gap: 6px;
	}
	.track {
		position: relative;
		height: 12px;
	}
	.compact .track {
		height: 8px;
	}
	.planned {
		position: absolute;
		inset: 0 auto 0 0;
		border: 1.5px solid currentColor;
		opacity: 0.45;
		border-radius: 3px;
	}
	.logged {
		position: absolute;
		inset: 0 auto 0 0;
		background: currentColor;
		border-radius: 3px;
	}
	.over {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent-300);
		border-radius: 0 3px 3px 0;
	}
	.figures {
		display: flex;
		justify-content: space-between;
		font-size: 0.82rem;
	}
	.compact .figures {
		font-size: 0.74rem;
	}
	.of {
		opacity: 0.6;
	}
	.delta {
		font-weight: 500;
	}
</style>
