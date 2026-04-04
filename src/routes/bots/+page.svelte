<script lang="ts">
	import {
		getBotManagerData,
		createBot,
		updateBot,
		saveBotToken,
		previewBot,
		sendKickTestMessage,
		sendTwitchTestMessage
	} from '$lib/remote/bots.remote';
	import type {
		BotAuthStatusRecord,
		BotEditorFormErrors,
		KickTestMessageFormInput,
		BotRecord,
		BotTokenFormInput,
		BotTokenRecord,
		TwitchTestMessageFormInput
	} from '$lib/remote/bots.remote';
	import {
		getBotAuthStatusBadgeClass,
		getBotAuthStatusDetail,
		getBotAuthStatusLabel
	} from '../../bots/bot-auth-status-ui';

	interface BotFormState {
		name: string;
		displayName: string;
		platform: string;
		model: string;
		personality: string;
		description: string;
		systemPrompt: string;
		talkativeness: string;
		temperature: string;
		maxTokens: string;
		responseLengthMin: string;
		responseLengthMax: string;
		exampleMessages: string;
		fallbackModels: string;
		vocabularyRules: string;
		firstMessage: string;
		postHistoryPrompt: string;
		enabled: boolean;
	}

	interface SaveBotResult {
		ok: boolean;
		errors: BotEditorFormErrors;
	}

	interface PreviewResult {
		prompt: string;
		response: string | undefined;
		model: string | undefined;
		error: string | undefined;
	}

	interface SaveBotTokenResult {
		ok: boolean;
		errors: {
			accessToken?: string;
			expiresAt?: string;
			refreshToken?: string;
			scopes?: string;
		};
	}

	interface SendTwitchTestMessageResult {
		ok: boolean;
		errors: {
			channel?: string;
			general?: string;
			text?: string;
		};
	}

	interface SendKickTestMessageResult {
		ok: boolean;
		errors: {
			general?: string;
			text?: string;
		};
	}

	const emptyFormState = (): BotFormState => ({
		name: '',
		displayName: '',
		platform: 'twitch',
		model: '',
		personality: '',
		description: '',
		systemPrompt: '',
		talkativeness: '50',
		temperature: '0.7',
		maxTokens: '160',
		responseLengthMin: '3',
		responseLengthMax: '10',
		exampleMessages: '',
		fallbackModels: '',
		vocabularyRules: '',
		firstMessage: '',
		postHistoryPrompt: '',
		enabled: true,
	});

	const formStateFromBot = (bot: BotRecord): BotFormState => ({
		name: bot.name,
		displayName: bot.displayName,
		platform: bot.platform,
		model: bot.model,
		personality: bot.personality,
		description: bot.description,
		systemPrompt: bot.systemPrompt ?? '',
		talkativeness: String(bot.talkativeness),
		temperature: String(bot.temperature),
		maxTokens: String(bot.maxTokens),
		responseLengthMin: String(bot.responseLength.min),
		responseLengthMax: String(bot.responseLength.max),
		exampleMessages: bot.exampleMessages.join('\n'),
		fallbackModels: bot.fallbackModels.join('\n'),
		vocabularyRules: bot.vocabularyRules.join('\n'),
		firstMessage: bot.firstMessage ?? '',
		postHistoryPrompt: bot.postHistoryPrompt ?? '',
		enabled: bot.enabled,
	});

	const tokenFormStateFromToken = (token: BotTokenRecord | null): BotTokenFormInput => ({
		accessToken: token?.accessToken ?? '',
		expiresAt: token?.expiresAt ?? '',
		refreshToken: token?.refreshToken ?? '',
		scopes: token?.scopes.join('\n') ?? '',
	});

	const emptyTwitchTestMessageForm = (): TwitchTestMessageFormInput => ({
		channel: '',
		text: 'lonely chat tracer bullet online',
	});

	const emptyKickTestMessageForm = (): KickTestMessageFormInput => ({
		text: 'lonely chat kick tracer bullet online',
	});

	let expandedBotId: string | null = $state(null);
	let showCreateForm = $state(false);

	// --- Create form state ---
	let createForm = $state(emptyFormState());
	let createErrors: BotEditorFormErrors = $state({});
	let createSaving = $state(false);
	let createSuccess = $state(false);

	const handleCreate = async () => {
		createSaving = true;
		createSuccess = false;
		try {
			const result = (await createBot(createForm)) as SaveBotResult;
			createErrors = result.errors;
			if (result.ok) {
				createSuccess = true;
				createForm = emptyFormState();
			}
		} finally {
			createSaving = false;
		}
	};

	// --- Edit form state (per bot) ---
	const editForms: Record<string, BotFormState> = $state({});
	const editErrors: Record<string, BotEditorFormErrors> = $state({});
	const editSaving: Record<string, boolean> = $state({});
	const editSuccess: Record<string, boolean> = $state({});
	const tokenForms: Record<string, BotTokenFormInput> = $state({});
	const tokenErrors: Record<
		string,
		{
			accessToken?: string;
			expiresAt?: string;
			refreshToken?: string;
			scopes?: string;
		}
	> = $state({});
	const tokenSaving: Record<string, boolean> = $state({});
	const tokenSuccess: Record<string, boolean> = $state({});
	const twitchTestMessageForms: Record<string, TwitchTestMessageFormInput> = $state({});
	const twitchTestMessageErrors: Record<
		string,
		{
			channel?: string;
			general?: string;
			text?: string;
		}
	> = $state({});
	const twitchTestMessageSaving: Record<string, boolean> = $state({});
	const twitchTestMessageSuccess: Record<string, boolean> = $state({});
	const kickTestMessageForms: Record<string, KickTestMessageFormInput> = $state({});
	const kickTestMessageErrors: Record<
		string,
		{
			general?: string;
			text?: string;
		}
	> = $state({});
	const kickTestMessageSaving: Record<string, boolean> = $state({});
	const kickTestMessageSuccess: Record<string, boolean> = $state({});

	const initEditForm = (bot: BotRecord) => {
		if (editForms[bot.id]) {
			return;
		}
		editForms[bot.id] = formStateFromBot(bot);
	};

	const initTokenForm = (botId: string, token: BotTokenRecord | null) => {
		if (tokenForms[botId]) {
			return;
		}

		tokenForms[botId] = tokenFormStateFromToken(token);
	};

	const initTwitchTestMessageForm = (botId: string) => {
		if (twitchTestMessageForms[botId]) {
			return;
		}

		twitchTestMessageForms[botId] = emptyTwitchTestMessageForm();
	};

	const initKickTestMessageForm = (botId: string) => {
		if (kickTestMessageForms[botId]) {
			return;
		}

		kickTestMessageForms[botId] = emptyKickTestMessageForm();
	};

	const handleUpdate = async (botId: string) => {
		const form = editForms[botId];
		if (!form) {
			return;
		}
		editSaving[botId] = true;
		editSuccess[botId] = false;
		try {
			const result = (await updateBot({ botId, values: form })) as SaveBotResult;
			editErrors[botId] = result.errors;
			if (result.ok) {
				editSuccess[botId] = true;
			}
		} finally {
			editSaving[botId] = false;
		}
	};

	const handleTokenSave = async (botId: string) => {
		const form = tokenForms[botId];
		if (!form) {
			return;
		}

		tokenSaving[botId] = true;
		tokenSuccess[botId] = false;
		try {
			const result = (await saveBotToken({ botId, values: form })) as SaveBotTokenResult;
			tokenErrors[botId] = result.errors;
			if (result.ok) {
				tokenSuccess[botId] = true;
			}
		} finally {
			tokenSaving[botId] = false;
		}
	};

	const handleTwitchTestMessage = async (botId: string) => {
		const form = twitchTestMessageForms[botId];
		if (!form) {
			return;
		}

		twitchTestMessageSaving[botId] = true;
		twitchTestMessageSuccess[botId] = false;
		try {
			const result = (await sendTwitchTestMessage({
				botId,
				values: form,
			})) as SendTwitchTestMessageResult;
			twitchTestMessageErrors[botId] = result.errors;
			if (result.ok) {
				twitchTestMessageSuccess[botId] = true;
			}
		} finally {
			twitchTestMessageSaving[botId] = false;
		}
	};

	const handleKickTestMessage = async (botId: string) => {
		const form = kickTestMessageForms[botId];
		if (!form) {
			return;
		}

		kickTestMessageSaving[botId] = true;
		kickTestMessageSuccess[botId] = false;
		try {
			const result = (await sendKickTestMessage({
				botId,
				values: form,
			})) as SendKickTestMessageResult;
			kickTestMessageErrors[botId] = result.errors;
			if (result.ok) {
				kickTestMessageSuccess[botId] = true;
			}
		} finally {
			kickTestMessageSaving[botId] = false;
		}
	};

	// --- Preview state ---
	const previewPrompts: Record<string, string> = $state({});
	const previewResults: Record<
		string,
		{ response: string | undefined; model: string | undefined; error: string | undefined }
	> = $state({});
	const previewLoading: Record<string, boolean> = $state({});

	const handlePreview = async (botId: string) => {
		const prompt = previewPrompts[botId];
		if (!prompt?.trim()) {
			return;
		}
		previewLoading[botId] = true;
		try {
			const result = (await previewBot({ botId, prompt })) as PreviewResult;
			previewResults[botId] = {
				response: result.response,
				model: result.model,
				error: result.error,
			};
		} finally {
			previewLoading[botId] = false;
		}
	};

	const toggleBot = (botId: string) => {
		expandedBotId = expandedBotId === botId ? null : botId;
	};

	const toggleCreateForm = () => {
		showCreateForm = !showCreateForm;
		createSuccess = false;
	};
</script>

<svelte:head>
	<title>Bot Manager - Lonely Chat</title>
</svelte:head>

<h1 class="text-2xl font-bold text-zinc-100">Bot Manager</h1>
<p class="mt-1 text-sm text-zinc-400">Create and configure chat bots.</p>

{#snippet fieldError(error: string | undefined)}
	{#if error}
		<p class="mt-1 text-xs text-red-400">{error}</p>
	{/if}
{/snippet}

{#snippet tokenMetadataSection(
	botId: string,
	auth: BotAuthStatusRecord,
	form: BotTokenFormInput,
	errors: {
		accessToken?: string;
		expiresAt?: string;
		refreshToken?: string;
		scopes?: string;
	},
	saving: boolean,
	success: boolean,
)}
	<div class="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h4 class="text-xs font-medium text-zinc-400">Credential Metadata</h4>
				<p class="mt-1 text-xs text-zinc-500">{getBotAuthStatusDetail(auth)}</p>
			</div>
			<span
				class="rounded-full px-2 py-0.5 text-xs font-medium {getBotAuthStatusBadgeClass(auth)}"
			>
				{getBotAuthStatusLabel(auth)}
			</span>
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			{@render textInput('Access Token', form.accessToken, (v) => (form.accessToken = v), errors.accessToken)}
			{@render textInput('Refresh Token', form.refreshToken, (v) => (form.refreshToken = v), errors.refreshToken)}
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			{@render textInput('Expires At', form.expiresAt, (v) => (form.expiresAt = v), errors.expiresAt)}
			{@render textareaInput('Scopes', form.scopes, (v) => (form.scopes = v), 3, errors.scopes, 'One scope per line.')}
		</div>

		<div class="mt-4 flex items-center gap-3">
			<button
				onclick={() => handleTokenSave(botId)}
				disabled={saving}
				class="rounded-md bg-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-600 disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save Credentials'}
			</button>
			{#if success}
				<span class="text-sm text-green-400">Credential metadata saved.</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet twitchTracerSection(
	botId: string,
	form: TwitchTestMessageFormInput,
	errors: {
		channel?: string;
		general?: string;
		text?: string;
	},
	saving: boolean,
	success: boolean,
)}
	<div class="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h4 class="text-xs font-medium text-zinc-400">Twitch Tracer Bullet</h4>
				<p class="mt-1 text-xs text-zinc-500">
					Authorize this bot, then send one live test message through the production Twitch chat
					client.
				</p>
			</div>
			<a
				href={`/auth/twitch/start?botId=${botId}`}
				class="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-900"
			>
				Authorize on Twitch
			</a>
		</div>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			{@render textInput('Channel', form.channel, (v) => (form.channel = v), errors.channel)}
			{@render textInput('Test Message', form.text, (v) => (form.text = v), errors.text)}
		</div>

		{#if errors.general}
			<p class="mt-3 text-sm text-red-400">{errors.general}</p>
		{/if}

		<div class="mt-4 flex items-center gap-3">
			<button
				onclick={() => handleTwitchTestMessage(botId)}
				disabled={saving}
				class="rounded-md bg-violet-200 px-4 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-violet-100 disabled:opacity-50"
			>
				{saving ? 'Sending...' : 'Send Test Message'}
			</button>
			{#if success}
				<span class="text-sm text-green-400">Test message sent.</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet kickTracerSection(
	botId: string,
	form: KickTestMessageFormInput,
	errors: {
		general?: string;
		text?: string;
	},
	saving: boolean,
	success: boolean,
)}
	<div class="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h4 class="text-xs font-medium text-zinc-400">Kick Tracer Bullet</h4>
				<p class="mt-1 text-xs text-zinc-500">
					Authorize this bot with Kick OAuth 2.1, then post one live test message through the
					production Kick chat endpoint.
				</p>
			</div>
			<a
				href={`/auth/kick/start?botId=${botId}`}
				class="rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-900"
			>
				Authorize on Kick
			</a>
		</div>

		<div class="mt-4">
			{@render textInput('Test Message', form.text, (v) => (form.text = v), errors.text)}
		</div>

		{#if errors.general}
			<p class="mt-3 text-sm text-red-400">{errors.general}</p>
		{/if}

		<div class="mt-4 flex items-center gap-3">
			<button
				onclick={() => handleKickTestMessage(botId)}
				disabled={saving}
				class="rounded-md bg-green-300 px-4 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-green-200 disabled:opacity-50"
			>
				{saving ? 'Sending...' : 'Send Test Message'}
			</button>
			{#if success}
				<span class="text-sm text-green-400">Test message sent.</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet textInput(label: string, value: string, onInput: (v: string) => void, error?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
		<input
			type="text"
			{value}
			oninput={(e) => onInput(e.currentTarget.value)}
			class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
		/>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet textareaInput(label: string, value: string, onInput: (v: string) => void, rows: number, error?: string, hint?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
		{#if hint}
			<span class="mb-1 block text-xs text-zinc-500">{hint}</span>
		{/if}
		<textarea
			{value}
			{rows}
			oninput={(e) => onInput(e.currentTarget.value)}
			class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
		></textarea>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet numberInput(label: string, value: string, onInput: (v: string) => void, error?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
		<input
			type="number"
			{value}
			oninput={(e) => onInput(e.currentTarget.value)}
			class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
		/>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet rangeInput(label: string, value: string, onInput: (v: string) => void, min: number, max: number, step: number, error?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">{label}: {value}</span>
		<input
			type="range"
			{value}
			{min}
			{max}
			{step}
			oninput={(e) => onInput(e.currentTarget.value)}
			class="w-full accent-zinc-400"
		/>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet platformSelect(value: string, onInput: (v: string) => void, error?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">Platform</span>
		<select
			{value}
			onchange={(e) => onInput(e.currentTarget.value)}
			class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
		>
			<option value="twitch">Twitch</option>
			<option value="kick">Kick</option>
		</select>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet botForm(
	form: BotFormState,
	errors: BotEditorFormErrors,
	saving: boolean,
	success: boolean,
	onSave: () => void,
)}
	<div class="grid gap-4 sm:grid-cols-2">
		{@render textInput('Name', form.name, (v) => (form.name = v), errors.name)}
		{@render textInput('Display Name', form.displayName, (v) => (form.displayName = v), errors.displayName)}
		{@render platformSelect(form.platform, (v) => (form.platform = v), errors.platform)}
		{@render textInput('Model', form.model, (v) => (form.model = v), errors.model)}
	</div>

	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		{@render textareaInput('Personality', form.personality, (v) => (form.personality = v), 3, errors.personality)}
		{@render textareaInput('Description', form.description, (v) => (form.description = v), 3, errors.description)}
	</div>

	{@render textareaInput('System Prompt', form.systemPrompt, (v) => (form.systemPrompt = v), 4, undefined, 'Optional. Custom system prompt override.')}

	<div class="mt-4 grid gap-4 sm:grid-cols-3">
		{@render rangeInput('Talkativeness', form.talkativeness, (v) => (form.talkativeness = v), 0, 100, 1, errors.talkativeness)}
		{@render rangeInput('Temperature', form.temperature, (v) => (form.temperature = v), 0, 2, 0.1, errors.temperature)}
		{@render numberInput('Max Tokens', form.maxTokens, (v) => (form.maxTokens = v), errors.maxTokens)}
	</div>

	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		{@render numberInput('Response Length Min', form.responseLengthMin, (v) => (form.responseLengthMin = v), errors.responseLengthMin)}
		{@render numberInput('Response Length Max', form.responseLengthMax, (v) => (form.responseLengthMax = v), errors.responseLengthMax)}
	</div>

	{@render textareaInput('Example Messages', form.exampleMessages, (v) => (form.exampleMessages = v), 5, errors.exampleMessages, 'One per line. 3-5 required.')}
	{@render textareaInput('Fallback Models', form.fallbackModels, (v) => (form.fallbackModels = v), 3, undefined, 'One per line. Optional.')}
	{@render textareaInput('Vocabulary Rules', form.vocabularyRules, (v) => (form.vocabularyRules = v), 3, undefined, 'One per line. Optional.')}

	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		{@render textInput('First Message', form.firstMessage, (v) => (form.firstMessage = v))}
		{@render textareaInput('Post-History Prompt', form.postHistoryPrompt, (v) => (form.postHistoryPrompt = v), 2, undefined, 'Optional.')}
	</div>

	<label class="mt-4 flex items-center gap-2">
		<input
			type="checkbox"
			checked={form.enabled}
			onchange={(e) => (form.enabled = e.currentTarget.checked)}
			class="rounded border-zinc-700 bg-zinc-950 accent-zinc-400"
		/>
		<span class="text-sm text-zinc-300">Enabled</span>
	</label>

	<div class="mt-4 flex items-center gap-3">
		<button
			onclick={onSave}
			disabled={saving}
			class="rounded-md bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
		>
			{saving ? 'Saving...' : 'Save'}
		</button>
		{#if success}
			<span class="text-sm text-green-400">Saved successfully.</span>
		{/if}
	</div>
{/snippet}

{#snippet previewSection(botId: string)}
	<div class="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-4">
		<h4 class="mb-2 text-xs font-medium text-zinc-400">Preview</h4>
		<div class="flex gap-2">
			<input
				type="text"
				placeholder="Enter a prompt..."
				value={previewPrompts[botId] ?? ''}
				oninput={(e) => (previewPrompts[botId] = e.currentTarget.value)}
				onkeydown={(e) => {
					if (e.key === 'Enter') handlePreview(botId);
				}}
				class="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
			/>
			<button
				onclick={() => handlePreview(botId)}
				disabled={previewLoading[botId]}
				class="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-600 disabled:opacity-50"
			>
				{previewLoading[botId] ? 'Generating...' : 'Preview'}
			</button>
		</div>
		{#if previewResults[botId]}
			{@const pr = previewResults[botId]}
			<div class="mt-3">
				{#if pr.error}
					<p class="text-sm text-red-400">{pr.error}</p>
				{:else}
					{#if pr.model}
						<p class="mb-1 text-xs text-zinc-500">Model: {pr.model}</p>
					{/if}
					{#if pr.response}
						<p class="whitespace-pre-wrap text-sm text-zinc-200">{pr.response}</p>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<!-- Create New Bot -->
<section class="mt-6">
	<button
		onclick={toggleCreateForm}
		class="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:bg-zinc-800/70"
	>
		<span class="text-sm font-medium text-zinc-100">Create New Bot</span>
		<svg
			class="h-4 w-4 text-zinc-400 transition-transform {showCreateForm ? 'rotate-180' : ''}"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
		>
			<path
				fill-rule="evenodd"
				d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	{#if showCreateForm}
		<div class="mt-2 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
			{@render botForm(createForm, createErrors, createSaving, createSuccess, handleCreate)}
		</div>
	{/if}
</section>

<!-- Bot List -->
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
					<span class="text-sm">Loading bots...</span>
				</div>
			</div>
		{/snippet}

		{#each await getBotManagerData() as item (item.bot.id)}
			{@const bot = item.bot}
			{@const expanded = expandedBotId === bot.id}
			{(initEditForm(bot), '')}
			{(initTokenForm(bot.id, item.token), '')}
			{(initTwitchTestMessageForm(bot.id), '')}
			{(initKickTestMessageForm(bot.id), '')}

			<div id={`bot-${bot.id}`} class="mb-3 rounded-lg border border-zinc-800 bg-zinc-900">
				<button
					onclick={() => toggleBot(bot.id)}
					class="flex w-full items-center justify-between px-4 py-3 text-left"
				>
					<div class="flex items-center gap-3">
						<span class="text-sm font-medium text-zinc-100">{bot.name}</span>
						<span class="text-xs text-zinc-500">{bot.displayName}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {bot.platform === 'twitch'
								? 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20 ring-inset'
								: 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20 ring-inset'}"
						>
							{bot.platform}
						</span>
						<span class="text-xs text-zinc-500">{bot.model}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {bot.enabled
								? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20 ring-inset'
								: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20 ring-inset'}"
						>
							{bot.enabled ? 'Enabled' : 'Disabled'}
						</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {getBotAuthStatusBadgeClass(item.auth)}"
						>
							Auth: {getBotAuthStatusLabel(item.auth)}
						</span>
					</div>
					<svg
						class="h-4 w-4 text-zinc-400 transition-transform {expanded ? 'rotate-180' : ''}"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				{#if expanded && editForms[bot.id]}
					{@const editForm = editForms[bot.id]!}
					<div class="border-t border-zinc-800 px-4 py-4">
						{@render botForm(
							editForm,
							editErrors[bot.id] ?? {},
							editSaving[bot.id] ?? false,
							editSuccess[bot.id] ?? false,
							() => handleUpdate(bot.id),
						)}
						{@render tokenMetadataSection(
							bot.id,
							item.auth,
							tokenForms[bot.id]!,
							tokenErrors[bot.id] ?? {},
							tokenSaving[bot.id] ?? false,
							tokenSuccess[bot.id] ?? false,
						)}
						{#if bot.platform === 'twitch'}
							{@render twitchTracerSection(
								bot.id,
								twitchTestMessageForms[bot.id]!,
								twitchTestMessageErrors[bot.id] ?? {},
								twitchTestMessageSaving[bot.id] ?? false,
								twitchTestMessageSuccess[bot.id] ?? false,
							)}
						{:else if bot.platform === 'kick'}
							{@render kickTracerSection(
								bot.id,
								kickTestMessageForms[bot.id]!,
								kickTestMessageErrors[bot.id] ?? {},
								kickTestMessageSaving[bot.id] ?? false,
								kickTestMessageSuccess[bot.id] ?? false,
							)}
						{/if}
						{@render previewSection(bot.id)}
					</div>
				{/if}
			</div>
		{:else}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<p class="text-sm text-zinc-500">No bots configured yet. Create one above.</p>
			</div>
		{/each}
	</svelte:boundary>
</section>
