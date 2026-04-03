<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';

	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/chat', label: 'Chat Viewer' },
		{ href: '/bots', label: 'Bot Manager' },
		{ href: '/scenarios', label: 'Scenarios' },
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<div class="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
	<nav class="border-b border-zinc-800 bg-zinc-900">
		<div class="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4">
			<a href="/" class="mr-6 text-sm font-bold tracking-wide text-zinc-100">
				lonely-chat
			</a>

			{#each navItems as { href, label } (href)}
				<a
					{href}
					class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {isActive(href)
						? 'bg-zinc-800 text-white'
						: 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}"
				>
					{label}
				</a>
			{/each}
		</div>
	</nav>

	<main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>
