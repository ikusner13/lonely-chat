<script lang="ts">
	import { getChatViewerState } from '$lib/remote/sessions.remote';
	import { startSession, stopSession } from '$lib/remote/dashboard.remote';

	interface ChatMessage {
		id: string;
		sessionId: string;
		username: string;
		isBot: boolean;
		content: string;
		sentAt: string;
		modelUsed: string | null;
		tokensUsed: number | null;
		botId: string | null;
		platform: string;
	}

	let starting = $state(false);
	let stopping = $state(false);
	let messages: ChatMessage[] = $state([]); // eslint-disable-line prefer-const -- $state requires let
	let chatContainer: HTMLDivElement | undefined = $state(); // eslint-disable-line prefer-const -- $state requires let

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

	const formatTime = (iso: string): string => {
		const date = new Date(iso);
		return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	};

	const senderColor = (isBot: boolean): string =>
		isBot
			? 'text-blue-400 bg-blue-500/10 ring-blue-500/20'
			: 'text-green-400 bg-green-500/10 ring-green-500/20';

	const connectSSE = (activeSessionId: string | null) => {
		if (!activeSessionId) {return;}

		const source = new EventSource('/api/chat/stream');

		source.addEventListener('message', (event) => {
			try {
				const msg: ChatMessage = JSON.parse(event.data);
				messages.push(msg);
			} catch {
				// ignore malformed SSE data
			}
		});

		source.addEventListener('error', () => {
			source.close();
		});

		return () => {
			source.close();
		};
	};

	// Auto-scroll when messages change
	$effect(() => {
		void messages.length;
		if (chatContainer) {
			chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
		}
	});
</script>

<svelte:head>
	<title>Chat Viewer - Lonely Chat</title>
</svelte:head>

<h1 class="text-2xl font-bold text-zinc-100">Chat Viewer</h1>
<p class="mt-1 text-sm text-zinc-400">Live chat session viewer.</p>

<section class="mt-6 flex flex-col gap-4">
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
					<span class="text-sm">Loading chat data...</span>
				</div>
			</div>
		{/snippet}

		{@const data = await getChatViewerState()}

		<!-- Initialize messages from server data -->
		{(messages = data.messages.length > 0 && messages.length === 0 ? [...data.messages] as ChatMessage[] : messages, '')}

		<!-- SSE effect: connect when active session exists -->
		{(() => {
			$effect(() => {
				const cleanup = connectSSE(data.activeSession?.id ?? null);
				return cleanup;
			});
			return '';
		})()}

		<!-- Header: session status + controls -->
		<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<h2 class="text-lg font-semibold text-zinc-100">Session</h2>
					{#if data.activeSession}
						<span
							class="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400 ring-1 ring-green-500/20 ring-inset"
						>
							Active
						</span>
						<span class="text-sm text-zinc-400">
							{data.activeSession.platform} / {data.activeSession.channel}
						</span>
					{:else}
						<span
							class="inline-flex items-center rounded-full bg-zinc-500/10 px-2.5 py-0.5 text-xs font-medium text-zinc-400 ring-1 ring-zinc-500/20 ring-inset"
						>
							Idle
						</span>
						{#if data.selectedSession}
							<span class="text-sm text-zinc-500">
								{data.selectedSession.platform} / {data.selectedSession.channel}
							</span>
						{/if}
					{/if}
				</div>

				<div>
					{#if data.activeSession}
						<button
							onclick={handleStop}
							disabled={stopping}
							class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
						>
							{stopping ? 'Stopping...' : 'Stop Session'}
						</button>
					{:else}
						<button
							onclick={handleStart}
							disabled={starting}
							class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
						>
							{starting ? 'Starting...' : 'Start Session'}
						</button>
					{/if}
				</div>
			</div>

			{#if data.activeSession}
				<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
						<p class="text-xs text-zinc-500">Messages</p>
						<p class="mt-0.5 text-sm font-semibold text-zinc-100">{data.activeSession.totalMessages}</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
						<p class="text-xs text-zinc-500">Tokens</p>
						<p class="mt-0.5 text-sm font-semibold text-zinc-100">{data.activeSession.totalTokensUsed.toLocaleString()}</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
						<p class="text-xs text-zinc-500">Cost</p>
						<p class="mt-0.5 text-sm font-semibold text-zinc-100">${data.activeSession.totalCostUsd.toFixed(4)}</p>
					</div>
					<div class="rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
						<p class="text-xs text-zinc-500">Status</p>
						<p class="mt-0.5 text-sm font-semibold text-zinc-100">{data.activeSession.status}</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Chat messages area -->
		{#if !data.selectedSession}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
				<p class="text-sm text-zinc-500">No sessions yet. Start a session to begin chatting.</p>
			</div>
		{:else}
			<div
				bind:this={chatContainer}
				class="flex max-h-[600px] min-h-[400px] flex-col gap-0 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900"
			>
				{#if messages.length === 0}
					<div class="flex flex-1 items-center justify-center p-12">
						<p class="text-sm text-zinc-500">No messages in this session.</p>
					</div>
				{:else}
					{#each messages as msg (msg.id)}
						<div class="border-b border-zinc-800/50 px-4 py-3 last:border-b-0">
							<div class="flex items-baseline gap-2">
								<span
									class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset {senderColor(msg.isBot)}"
								>
									{msg.username}
								</span>
								<span class="text-xs text-zinc-600">{formatTime(msg.sentAt)}</span>
								{#if msg.modelUsed}
									<span class="text-xs text-zinc-700">{msg.modelUsed}</span>
								{/if}
							</div>
							<p class="mt-1 text-sm text-zinc-200">{msg.content}</p>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</svelte:boundary>
</section>
