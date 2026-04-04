<script lang="ts">
	import { getDashboardState, startSession, stopSession } from '$lib/remote/dashboard.remote';
	import DashboardContent from './dashboard-content.svelte';

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

		<DashboardContent
			activeAlerts={data.activeAlerts}
			activeSession={data.activeSession}
			botRuntimeSignals={data.botRuntimeSignals}
			botRuntimeStatuses={data.botRuntimeStatuses}
			mostRecentSession={data.mostRecentSession}
			onStart={handleStart}
			onStop={handleStop}
			{starting}
			{stopping}
		/>
	</svelte:boundary>
</section>
