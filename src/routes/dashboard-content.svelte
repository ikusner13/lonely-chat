<script lang="ts">
	import type {
		BotRuntimeSignal,
		BotRuntimeStatus,
		SessionAlert
	} from '../sessions/Services/session-service';
	import type { SessionRecord } from '../sessions/session-record';

	interface Props {
		activeAlerts: readonly SessionAlert[];
		activeSession: SessionRecord | null;
		botRuntimeSignals: readonly BotRuntimeSignal[];
		botRuntimeStatuses: readonly BotRuntimeStatus[];
		mostRecentSession: SessionRecord | null;
		onStart: () => Promise<void>;
		onStop: () => Promise<void>;
		starting: boolean;
		stopping: boolean;
	}

	const props: Props = $props();

	const badgeClassForState = (state: BotRuntimeStatus['state']): string => {
		switch (state) {
			case 'online': {
				return 'bg-green-500/10 text-green-400 ring-green-500/20';
			}
			case 'degraded': {
				return 'bg-amber-500/10 text-amber-300 ring-amber-500/20';
			}
			case 'offline': {
				return 'bg-red-500/10 text-red-300 ring-red-500/20';
			}
			default: {
				return 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/20';
			}
		}
	};

	const labelForState = (state: BotRuntimeStatus['state']): string => {
		switch (state) {
			case 'online': {
				return 'Online';
			}
			case 'degraded': {
				return 'Degraded';
			}
			case 'offline': {
				return 'Offline';
			}
			default: {
				return 'Unknown';
			}
		}
	};

	const labelForSignalType = (type: BotRuntimeSignal['type']): string => {
		switch (type) {
			case 'auth_failure': {
				return 'Auth Failure';
			}
			case 'ai_failure': {
				return 'AI Failure';
			}
			case 'degraded': {
				return 'Degraded';
			}
			case 'offline': {
				return 'Offline';
			}
			case 'reconnect_attempt': {
				return 'Reconnect Attempt';
			}
			case 'recovered': {
				return 'Recovered';
			}
			default: {
				return 'Signal';
			}
		}
	};
</script>

{#if props.activeSession}
	{#if props.activeAlerts.length > 0}
		<div class="mb-4 flex flex-col gap-2">
			{#each props.activeAlerts as alert (alert.metric)}
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
					<span>{alert.metric} alert: {alert.thresholdPercent}% of {alert.limitValue} reached</span>
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
				onclick={props.onStop}
				disabled={props.stopping}
				class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
			>
				{props.stopping ? 'Stopping...' : 'Stop Session'}
			</button>
		</div>

		<div class="mt-4 flex items-center gap-4 text-sm text-zinc-400">
			<span>Platform: <span class="text-zinc-200">{props.activeSession.platform}</span></span>
			<span>Channel: <span class="text-zinc-200">{props.activeSession.channel}</span></span>
		</div>

		<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
				<p class="text-xs text-zinc-500">Total messages</p>
				<p class="mt-1 text-lg font-semibold text-zinc-100">{props.activeSession.totalMessages}</p>
			</div>
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
				<p class="text-xs text-zinc-500">Total tokens</p>
				<p class="mt-1 text-lg font-semibold text-zinc-100">
					{props.activeSession.totalTokensUsed.toLocaleString()}
				</p>
			</div>
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
				<p class="text-xs text-zinc-500">Total cost</p>
				<p class="mt-1 text-lg font-semibold text-zinc-100">
					${props.activeSession.totalCostUsd.toFixed(4)}
				</p>
			</div>
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
				<p class="text-xs text-zinc-500">Time limit</p>
				<p class="mt-1 text-lg font-semibold text-zinc-100">
					{props.activeSession.timeLimitSeconds !== null
						? `${props.activeSession.timeLimitSeconds}s`
						: 'none'}
				</p>
			</div>
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-3">
				<p class="text-xs text-zinc-500">Cost limit</p>
				<p class="mt-1 text-lg font-semibold text-zinc-100">
					{props.activeSession.costLimitUsd !== null
						? `$${props.activeSession.costLimitUsd.toFixed(4)}`
						: 'none'}
				</p>
			</div>
		</div>

		<div class="mt-6 grid gap-4 lg:grid-cols-2">
			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-4">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold text-zinc-100">Active Bots</h3>
					<span class="text-xs text-zinc-500">{props.botRuntimeStatuses.length} tracked</span>
				</div>

				{#if props.botRuntimeStatuses.length === 0}
					<p class="mt-3 text-sm text-zinc-500">No active bot health signals yet.</p>
				{:else}
					<div class="mt-3 flex flex-col gap-3">
						{#each props.botRuntimeStatuses as status (status.botId)}
							<div class="rounded-md border border-zinc-800 bg-zinc-900 p-3">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-medium text-zinc-100">{status.displayName}</p>
										<p class="text-xs text-zinc-500">{status.botName} on {status.platform}</p>
									</div>
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset {badgeClassForState(status.state)}"
									>
										{labelForState(status.state)}
									</span>
								</div>
								<p class="mt-2 text-sm text-zinc-300">{status.detail}</p>
								{#if status.consecutiveAiFailures > 0}
									<p class="mt-1 text-xs text-zinc-500">
										Consecutive AI failures: {status.consecutiveAiFailures}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="rounded-md border border-zinc-800 bg-zinc-950 p-4">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold text-zinc-100">Recovery Signals</h3>
					<span class="text-xs text-zinc-500">{props.botRuntimeSignals.length} recent</span>
				</div>

				{#if props.botRuntimeSignals.length === 0}
					<p class="mt-3 text-sm text-zinc-500">No recent bot failures or recoveries.</p>
				{:else}
					<div class="mt-3 flex flex-col gap-3">
						{#each props.botRuntimeSignals as signal (`${signal.botId}-${signal.createdAt}-${signal.type}`)}
							<div class="rounded-md border border-zinc-800 bg-zinc-900 p-3">
								<div class="flex items-center justify-between gap-3">
									<p class="text-sm font-medium text-zinc-100">{signal.botName}</p>
									<span class="text-xs uppercase tracking-wide text-zinc-500">
										{labelForSignalType(signal.type)}
									</span>
								</div>
								<p class="mt-2 text-sm text-zinc-300">{signal.message}</p>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{:else if props.mostRecentSession && props.mostRecentSession.endedAt !== null}
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
				onclick={props.onStart}
				disabled={props.starting}
				class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
			>
				{props.starting ? 'Starting...' : 'Start Session'}
			</button>
		</div>

		<div class="mt-4 text-sm text-zinc-400">
			<p>
				Last session: <span class="text-zinc-200">{props.mostRecentSession.platform}</span> /
				<span class="text-zinc-200">{props.mostRecentSession.channel}</span>
			</p>
			<p class="mt-1">
				End reason:
				<span class="text-zinc-200">{props.mostRecentSession.endReason ?? 'unknown'}</span>
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
				onclick={props.onStart}
				disabled={props.starting}
				class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
			>
				{props.starting ? 'Starting...' : 'Start Session'}
			</button>
		</div>

		<p class="mt-4 text-sm text-zinc-500">No previous sessions.</p>
	</div>
{/if}
