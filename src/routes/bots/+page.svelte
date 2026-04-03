<script lang="ts">
	import { getBots, createBot, updateBot, previewBot } from '$lib/remote/bots.remote';
	import type { BotRecord, BotEditorFormErrors } from '$lib/remote/bots.remote';

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

	const initEditForm = (bot: BotRecord) => {
		if (editForms[bot.id]) {
			return;
		}
		editForms[bot.id] = formStateFromBot(bot);
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

		{#each await getBots() as bot (bot.id)}
			{@const expanded = expandedBotId === bot.id}
			{(initEditForm(bot), '')}

			<div class="mb-3 rounded-lg border border-zinc-800 bg-zinc-900">
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
