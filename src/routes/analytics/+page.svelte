<script lang="ts">
	import { getAnalyticsPageData } from '$lib/remote/analytics.remote';
	import AnalyticsContent from './analytics-content.svelte';
</script>

<svelte:head>
	<title>Analytics - Lonely Chat</title>
</svelte:head>

<h1 class="text-2xl font-bold text-zinc-100">Analytics</h1>
<p class="mt-1 text-sm text-zinc-400">Session history and per-bot totals from persisted chat data.</p>

<section class="mt-6 flex flex-col gap-6">
	<svelte:boundary>
		{#snippet pending()}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
				Loading analytics...
			</div>
		{/snippet}

		{@const data = await getAnalyticsPageData()}

		<AnalyticsContent
			botSummaries={data.botSummaries}
			overview={data.overview}
			sessionHistory={data.sessionHistory}
		/>
	</svelte:boundary>
</section>
