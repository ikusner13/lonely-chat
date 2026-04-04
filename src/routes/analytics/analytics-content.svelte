<script lang="ts">
	import type {
		AnalyticsBotSummary,
		AnalyticsOverview,
		SessionRecord,
	} from '$lib/remote/analytics.remote';

	const {
		botSummaries,
		overview,
		sessionHistory,
	}: {
		botSummaries: readonly AnalyticsBotSummary[];
		overview: AnalyticsOverview;
		sessionHistory: readonly SessionRecord[];
	} = $props();

	const formatCurrency = (value: number): string => `$${value.toFixed(4)}`;

	const formatDateTime = (iso: string | null): string => {
		if (iso === null) {
			return 'In progress';
		}

		return iso.replace('T', ' ').slice(0, 16);
	};

	const formatDuration = (session: SessionRecord): string => {
		const endTimestamp = session.endedAt ?? session.startedAt;
		const durationMs = Math.max(0, Date.parse(endTimestamp) - Date.parse(session.startedAt));
		const durationMinutes = Math.floor(durationMs / 60_000);
		const durationSeconds = Math.floor((durationMs % 60_000) / 1000);

		return `${durationMinutes}m ${durationSeconds}s`;
	};

	const overviewCards = (summary: AnalyticsOverview) => [
		{
			label: 'Total sessions',
			value: summary.totalSessions.toLocaleString(),
		},
		{
			label: 'Total messages',
			value: summary.totalMessages.toLocaleString(),
		},
		{
			label: 'Total tokens',
			value: summary.totalTokensUsed.toLocaleString(),
		},
		{
			label: 'Total cost',
			value: formatCurrency(summary.totalCostUsd),
		},
	];

	const botSubtitle = (bot: AnalyticsBotSummary): string =>
		`${bot.platform} bot · ${bot.sessionCount} session${bot.sessionCount === 1 ? '' : 's'}`;
</script>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#each overviewCards(overview) as card (card.label)}
		<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
			<p class="text-xs uppercase tracking-wide text-zinc-500">{card.label}</p>
			<p class="mt-2 text-2xl font-semibold text-zinc-100">{card.value}</p>
		</div>
	{/each}
</div>

<div class="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
	<section class="rounded-lg border border-zinc-800 bg-zinc-900">
		<div class="border-b border-zinc-800 px-4 py-3">
			<h2 class="text-lg font-semibold text-zinc-100">Session Log</h2>
			<p class="mt-1 text-sm text-zinc-500">Recent sessions with message, token, and cost totals.</p>
		</div>

		{#if sessionHistory.length === 0}
			<p class="px-4 py-8 text-sm text-zinc-500">No session history yet.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-zinc-800 text-left text-sm">
					<thead class="bg-zinc-950/70 text-xs uppercase tracking-wide text-zinc-500">
						<tr>
							<th class="px-4 py-3 font-medium">Started</th>
							<th class="px-4 py-3 font-medium">Platform</th>
							<th class="px-4 py-3 font-medium">Channel</th>
							<th class="px-4 py-3 font-medium">Duration</th>
							<th class="px-4 py-3 font-medium">Messages</th>
							<th class="px-4 py-3 font-medium">Tokens</th>
							<th class="px-4 py-3 font-medium">Cost</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800/70">
						{#each sessionHistory as session (session.id)}
							<tr class="align-top">
								<td class="px-4 py-3 text-zinc-200">{formatDateTime(session.startedAt)}</td>
								<td class="px-4 py-3 text-zinc-300">{session.platform}</td>
								<td class="px-4 py-3 text-zinc-300">{session.channel}</td>
								<td class="px-4 py-3 text-zinc-300">{formatDuration(session)}</td>
								<td class="px-4 py-3 text-zinc-300">{session.totalMessages.toLocaleString()}</td>
								<td class="px-4 py-3 text-zinc-300">{session.totalTokensUsed.toLocaleString()}</td>
								<td class="px-4 py-3 text-zinc-100">{formatCurrency(session.totalCostUsd)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="rounded-lg border border-zinc-800 bg-zinc-900">
		<div class="border-b border-zinc-800 px-4 py-3">
			<h2 class="text-lg font-semibold text-zinc-100">Per-Bot Totals</h2>
			<p class="mt-1 text-sm text-zinc-500">Persisted outgoing message counts for each bot.</p>
		</div>

		{#if botSummaries.length === 0}
			<p class="px-4 py-8 text-sm text-zinc-500">No bot message totals yet.</p>
		{:else}
			<ul class="divide-y divide-zinc-800/70">
				{#each botSummaries as bot (bot.botId)}
					<li class="flex items-start justify-between gap-4 px-4 py-4">
						<div>
							<p class="font-medium text-zinc-100">{bot.displayName}</p>
							<p class="text-sm text-zinc-500">{bot.botName}</p>
							<p class="mt-1 text-xs uppercase tracking-wide text-zinc-600">
								{botSubtitle(bot)}
							</p>
						</div>
						<div class="text-right">
							<p class="text-xl font-semibold text-zinc-100">{bot.messageCount}</p>
							<p class="text-xs uppercase tracking-wide text-zinc-500">messages sent</p>
							<p class="mt-1 text-sm text-zinc-400">{bot.totalTokensUsed.toLocaleString()} tokens</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
