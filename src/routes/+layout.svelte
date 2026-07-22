<script lang="ts">
	import '@fontsource-variable/instrument-sans';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import LogSheet from '$lib/components/LogSheet.svelte';

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Today' },
		{ href: '/plan', label: 'Plan' },
		{ href: '/review', label: 'Review' },
		{ href: '/manage', label: 'Manage' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Ilana</title>
</svelte:head>

<header class="top">
	<div class="wrap top-inner">
		<a href="/" class="wordmark" aria-label="Ilana, home">
			<svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
				<rect width="64" height="64" rx="14" fill="var(--ink-950)" />
				<rect x="14" y="18" width="36" height="4" rx="2" fill="var(--surface-100)" />
				<rect x="14" y="30" width="24" height="4" rx="2" fill="var(--accent-300)" />
				<rect x="14" y="42" width="30" height="4" rx="2" fill="var(--surface-100)" />
			</svg>
			ilana
		</a>
		<span class="eyebrow">time ledger</span>
	</div>
</header>

<main class="wrap">
	{@render children()}
</main>

{#snippet tabIcon(label: string)}
	<svg viewBox="0 0 20 20" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
		{#if label === 'Today'}
			<rect x="2.5" y="3.5" width="15" height="14" rx="3" />
			<path d="M2.5 7.5h15" />
			<circle cx="10" cy="12.5" r="1.6" fill="currentColor" stroke="none" />
		{:else if label === 'Plan'}
			<path d="M4 4.5h12M4 10h7M4 15.5h5" />
			<path d="M14.5 12v6M11.5 15h6" />
		{:else if label === 'Review'}
			<path d="M4 16.5V9M10 16.5v-11M16 16.5v-6" />
		{:else}
			<path d="M3 6h14M3 14h14" />
			<circle cx="7.5" cy="6" r="2" fill="currentColor" stroke="none" />
			<circle cx="12.5" cy="14" r="2" fill="currentColor" stroke="none" />
		{/if}
	</svg>
{/snippet}

<nav class="tabs" aria-label="Main">
	<div class="tabs-inner">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class="tab" aria-current={isActive(tab.href) ? 'page' : undefined}>
				{@render tabIcon(tab.label)}
				<span>{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>

<LogSheet />

<style>
	.top {
		border-bottom: 1px solid var(--surface-400);
		background: var(--paper);
	}
	.top-inner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 14px;
		padding-bottom: 14px;
	}
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-weight: 650;
		font-size: 1.15rem;
		letter-spacing: -0.02em;
		text-decoration: none;
	}
	main {
		padding-top: 26px;
		padding-bottom: calc(132px + env(safe-area-inset-bottom));
		min-height: calc(100dvh - 180px);
	}
	.tabs {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--ink-950);
		color: var(--surface-100);
		z-index: 50;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.tabs-inner {
		max-width: var(--maxw);
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	.tab {
		display: grid;
		justify-items: center;
		gap: 3px;
		padding: 11px 4px 9px;
		font-family: var(--mono);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--ink-300);
		border-top: 2px solid transparent;
		transition: color 0.15s ease;
	}
	.tab[aria-current='page'] {
		color: var(--surface-100);
		border-top-color: var(--accent-300);
	}
</style>
