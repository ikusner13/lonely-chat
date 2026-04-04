<script lang="ts">
	import { getDashboardState, startSession, stopSession } from '$lib/remote/dashboard.remote';

	let starting = $state(false);
	let stopping = $state(false);

	const handleStart = async () => {
		starting = true;
		try {
			await startSession();
		} finally {
			starting = false;
		}
	};

	const handleStop = async () => {
		stopping = true;
		try {
			await stopSession();
		} finally {
			stopping = false;
		}
	};
</script>

<svelte:head>
	<title>Dashboard - Lonely Chat</title>
</svelte:head>

<h1 class="text-2xl font-bold text-zinc-100">Dashboard</h1>
<p class="mt-1 text-sm text-zinc-400">Manage stream chat sessions.</p>

<section class="mt-6">
	<svelte:boundary>
		{#snippet pending()}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<div class="flex items-center gap-3 text-zinc-400">
					<svg
						class="h-5 w-5 animate-spin"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						></path>
					</svg>
					<span class="text-sm">Loading session data...</span>
				</div>
			</div>
		{/snippet}

		{@const data = await getDashboardState()}

		{#if data.activeSession}
			{@const session = data.activeSession}

			{#if data.activeAlerts.length > 0}
				<div class="mb-4 flex flex-col gap-2">
					{#each data.activeAlerts as alert (alert.metric)}
						<div
							class="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300"
						>
							<svg
								class="h-4 w-4 shrink-0"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
									clip-rule="evenodd"
								/>
							</svg>
							<span>
								{alert.metric} alert: {alert.thresholdPercent}% of {alert.limitValue} reached
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<h2 class="text-lg font-semibold text-zinc-100">Session</h2>
						<span
							class="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400 ring-1 ring-green-500/20 ring-inset"
						>
							Active
						</span>
					</div>
					<button
						onclick={handleStop}
						disabled={stopping}
						class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
					>
						{stopping ? 'Stopping...' : 'Stop Session'}
					</button>
				</div>

				<div class="mt-4 flex items-center gap-4 text-sm text-zinc-400">
					<span>Platform: <span class="text-zinc-200">{session.platform}</span></span>
					<span>Channel: <span class="text-zinc-200">{session.channel}</span></span>
				</div>

				<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
						<p class="text-xs text-zinc-500">Total messages</p>
						<p class="mt-1 text-lg font-semibold text-zinc-100">
							{session.totalMessages}
						</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
						<p class="text-xs text-zinc-500">Total tokens</p>
						<p class="mt-1 text-lg font-semibold text-zinc-100">
							{session.totalTokensUsed.toLocaleString()}
						</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
						<p class="text-xs text-zinc-500">Total cost</p>
						<p class="mt-1 text-lg font-semibold text-zinc-100">
							${session.totalCostUsd.toFixed(4)}
						</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
						<p class="text-xs text-zinc-500">Time limit</p>
						<p class="mt-1 text-lg font-semibold text-zinc-100">
							{session.timeLimitSeconds !== null ? `${session.timeLimitSeconds}s` : 'none'}
						</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
						<p class="text-xs text-zinc-500">Cost limit</p>
						<p class="mt-1 text-lg font-semibold text-zinc-100">
							{session.costLimitUsd !== null ? `$${session.costLimitUsd.toFixed(4)}` : 'none'}
						</p>
					</div>
				</div>
			</div>
		{:else if data.mostRecentSession && data.mostRecentSession.endedAt !== null}
			{@const recent = data.mostRecentSession}

			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<h2 class="text-lg font-semibold text-zinc-100">Session</h2>
						<span
							class="inline-flex items-center rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-400 ring-1 ring-zinc-500/20 ring-inset"
						>
							Idle
						</span>
					</div>
					<button
						onclick={handleStart}
						disabled={starting}
						class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
					>
						{starting ? 'Starting...' : 'Start Session'}
					</button>
				</div>

				<div class="mt-4 text-sm text-zinc-400">
					<p>
						Last session: <span class="text-zinc-200">{recent.platform}</span> /
						<span class="text-zinc-200">{recent.channel}</span>
					</p>
					<p class="mt-1">
						End reason: <span class="text-zinc-200">{recent.endReason ?? 'unknown'}</span>
					</p>
				</div>
			</div>
		{:else}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<h2 class="text-lg font-semibold text-zinc-100">Session</h2>
						<span
							class="inline-flex items-center rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-400 ring-1 ring-zinc-500/20 ring-inset"
						>
							Idle
						</span>
					</div>
					<button
						onclick={handleStart}
						disabled={starting}
						class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
					>
						{starting ? 'Starting...' : 'Start Session'}
					</button>
				</div>

				<p class="mt-4 text-sm text-zinc-500">No previous sessions.</p>
			</div>
		{/if}
	</svelte:boundary>
</section>
