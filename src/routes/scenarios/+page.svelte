<script lang="ts">
	import {
		getScenarioPageData,
		createScenario,
		updateScenario,
		deleteScenario,
		runScenario,
	} from '$lib/remote/scenarios.remote';
	import type {
		BotRecord,
		ScenarioRecord,
		ScenarioEditorFormErrors,
		ScenarioEditorFormInput,
	} from '$lib/remote/scenarios.remote';

	interface ScenarioFormState {
		name: string;
		description: string;
		topic: string;
		triggerType: string;
		triggerDelaySeconds: string;
		triggerEventType: string;
		durationSeconds: string;
		enabled: boolean;
		participants: string[];
		steps: string;
	}

	interface SaveScenarioResult {
		ok: boolean;
		errors: ScenarioEditorFormErrors;
	}

	const emptyFormState = (): ScenarioFormState => ({
		name: '',
		description: '',
		topic: '',
		triggerType: 'manual',
		triggerDelaySeconds: '',
		triggerEventType: '',
		durationSeconds: '',
		enabled: true,
		participants: [],
		steps: '',
	});

	const formStateFromScenario = (scenario: ScenarioRecord): ScenarioFormState => ({
		name: scenario.name,
		description: scenario.description,
		topic: scenario.topic,
		triggerType: scenario.triggerType,
		triggerDelaySeconds:
			scenario.triggerConfig.delaySeconds === null
				? ''
				: String(scenario.triggerConfig.delaySeconds),
		triggerEventType: scenario.triggerConfig.eventType ?? '',
		durationSeconds: scenario.durationSeconds === null ? '' : String(scenario.durationSeconds),
		enabled: scenario.enabled,
		participants: [...scenario.participants],
		steps:
			scenario.steps.length === 0
				? ''
				: JSON.stringify(
						scenario.steps.map((step) => ({
							action: step.action,
							botId: step.botId,
							content: step.content,
							delayAfter: step.delayAfter,
						})),
						null,
						2,
					),
	});

	const formToInput = (form: ScenarioFormState): ScenarioEditorFormInput => ({
		name: form.name,
		description: form.description,
		topic: form.topic,
		triggerType: form.triggerType,
		triggerDelaySeconds: form.triggerDelaySeconds,
		triggerEventType: form.triggerEventType,
		durationSeconds: form.durationSeconds,
		enabled: form.enabled,
		participants: form.participants,
		steps: form.steps,
	});

	let expandedScenarioId: string | null = $state(null);
	let showCreateForm = $state(false);

	// --- Create form state ---
	let createForm = $state(emptyFormState());
	let createErrors: ScenarioEditorFormErrors = $state({});
	let createSaving = $state(false);
	let createSuccess = $state(false);

	const handleCreate = async () => {
		createSaving = true;
		createSuccess = false;
		try {
			const result = (await createScenario(formToInput(createForm))) as SaveScenarioResult;
			createErrors = result.errors;
			if (result.ok) {
				createSuccess = true;
				createForm = emptyFormState();
			}
		} finally {
			createSaving = false;
		}
	};

	// --- Edit form state (per scenario) ---
	const editForms: Record<string, ScenarioFormState> = $state({});
	const editErrors: Record<string, ScenarioEditorFormErrors> = $state({});
	const editSaving: Record<string, boolean> = $state({});
	const editSuccess: Record<string, boolean> = $state({});

	const initEditForm = (scenario: ScenarioRecord) => {
		if (editForms[scenario.id]) {
			return;
		}
		editForms[scenario.id] = formStateFromScenario(scenario);
	};

	const handleUpdate = async (scenarioId: string) => {
		const form = editForms[scenarioId];
		if (!form) {
			return;
		}
		editSaving[scenarioId] = true;
		editSuccess[scenarioId] = false;
		try {
			const result = (await updateScenario({
				scenarioId,
				values: formToInput(form),
			})) as SaveScenarioResult;
			editErrors[scenarioId] = result.errors;
			if (result.ok) {
				editSuccess[scenarioId] = true;
			}
		} finally {
			editSaving[scenarioId] = false;
		}
	};

	// --- Delete state ---
	const deleting: Record<string, boolean> = $state({});

	const handleDelete = async (scenarioId: string) => {
		// eslint-disable-next-line no-alert -- intentional delete confirmation
		if (!confirm('Delete this scenario? This cannot be undone.')) {
			return;
		}
		deleting[scenarioId] = true;
		try {
			await deleteScenario(scenarioId);
			if (expandedScenarioId === scenarioId) {
				expandedScenarioId = null;
			}
		} finally {
			deleting[scenarioId] = false;
		}
	};

	// --- Run state ---
	const running: Record<string, boolean> = $state({});

	const handleRun = async (scenarioId: string) => {
		running[scenarioId] = true;
		try {
			await runScenario(scenarioId);
		} finally {
			running[scenarioId] = false;
		}
	};

	const toggleScenario = (scenarioId: string) => {
		expandedScenarioId = expandedScenarioId === scenarioId ? null : scenarioId;
	};

	const toggleCreateForm = () => {
		showCreateForm = !showCreateForm;
		createSuccess = false;
	};

	const toggleParticipant = (participants: string[], botId: string): string[] => {
		const idx = participants.indexOf(botId);
		if (idx === -1) {
			return [...participants, botId];
		}
		return participants.filter((id) => id !== botId);
	};

	const triggerTypeLabel = (type: string): string => {
		switch (type) {
			case 'manual': {
				return 'Manual';
			}
			case 'timed': {
				return 'Timed';
			}
			case 'on_event': {
				return 'On Event';
			}
			default: {
				return type;
			}
		}
	};
</script>

<svelte:head>
	<title>Scenario Manager - Lonely Chat</title>
</svelte:head>

<h1 class="text-2xl font-bold text-zinc-100">Scenario Manager</h1>
<p class="mt-1 text-sm text-zinc-400">Create and manage scripted chat scenarios.</p>

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

{#snippet numberInput(label: string, value: string, onInput: (v: string) => void, error?: string, hint?: string)}
	<label class="block">
		<span class="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
		{#if hint}
			<span class="mb-1 block text-xs text-zinc-500">{hint}</span>
		{/if}
		<input
			type="number"
			{value}
			oninput={(e) => onInput(e.currentTarget.value)}
			class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
		/>
		{@render fieldError(error)}
	</label>
{/snippet}

{#snippet participantCheckboxes(bots: readonly BotRecord[], participants: string[], onChange: (updated: string[]) => void, error?: string)}
	<fieldset>
		<legend class="mb-1 block text-xs font-medium text-zinc-400">Participants</legend>
		<div class="flex flex-wrap gap-3">
			{#each bots as bot (bot.id)}
				<label class="flex items-center gap-1.5">
					<input
						type="checkbox"
						checked={participants.includes(bot.id)}
						onchange={() => onChange(toggleParticipant(participants, bot.id))}
						class="rounded border-zinc-700 bg-zinc-950 accent-zinc-400"
					/>
					<span class="text-sm text-zinc-300">{bot.name}</span>
				</label>
			{/each}
		</div>
		{@render fieldError(error)}
	</fieldset>
{/snippet}

{#snippet scenarioForm(
	form: ScenarioFormState,
	errors: ScenarioEditorFormErrors,
	bots: readonly BotRecord[],
	saving: boolean,
	success: boolean,
	onSave: () => void,
)}
	<div class="grid gap-4 sm:grid-cols-2">
		{@render textInput('Name', form.name, (v) => (form.name = v), errors.name)}
		{@render textInput('Topic', form.topic, (v) => (form.topic = v), errors.topic)}
	</div>

	{@render textareaInput('Description', form.description, (v) => (form.description = v), 3, errors.description)}

	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="mb-1 block text-xs font-medium text-zinc-400">Trigger Type</span>
			<select
				value={form.triggerType}
				onchange={(e) => (form.triggerType = e.currentTarget.value)}
				class="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
			>
				<option value="manual">Manual</option>
				<option value="timed">Timed</option>
				<option value="on_event">On Event</option>
			</select>
			{@render fieldError(errors.triggerType)}
		</label>

		{#if form.triggerType === 'timed'}
			{@render numberInput('Trigger Delay (seconds)', form.triggerDelaySeconds, (v) => (form.triggerDelaySeconds = v), errors.triggerDelaySeconds)}
		{:else if form.triggerType === 'on_event'}
			{@render textInput('Event Type', form.triggerEventType, (v) => (form.triggerEventType = v), errors.triggerEventType)}
		{/if}
	</div>

	<div class="mt-4">
		{@render numberInput('Duration (seconds)', form.durationSeconds, (v) => (form.durationSeconds = v), errors.durationSeconds, 'Optional. Leave empty for unlimited.')}
	</div>

	<div class="mt-4">
		{@render participantCheckboxes(bots, form.participants, (updated) => (form.participants = updated), errors.participants)}
	</div>

	<div class="mt-4">
		{@render textareaInput('Steps (JSON)', form.steps, (v) => (form.steps = v), 6, errors.steps, 'Array of { action, botId, content, delayAfter }. Leave empty for no steps.')}
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

<!-- Create New Scenario -->
<section class="mt-6">
	<button
		onclick={toggleCreateForm}
		class="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:bg-zinc-800/70"
	>
		<span class="text-sm font-medium text-zinc-100">Create New Scenario</span>
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
			<svelte:boundary>
				{#snippet pending()}
					<p class="text-sm text-zinc-400">Loading bots...</p>
				{/snippet}

				{@const data = await getScenarioPageData()}
				{@render scenarioForm(createForm, createErrors, data.bots, createSaving, createSuccess, handleCreate)}
			</svelte:boundary>
		</div>
	{/if}
</section>

<!-- Scenario List -->
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
					<span class="text-sm">Loading scenarios...</span>
				</div>
			</div>
		{/snippet}

		{@const data = await getScenarioPageData()}

		{#each data.scenarios as scenario (scenario.id)}
			{@const expanded = expandedScenarioId === scenario.id}
			{(initEditForm(scenario), '')}

			<div class="mb-3 rounded-lg border border-zinc-800 bg-zinc-900">
				<button
					onclick={() => toggleScenario(scenario.id)}
					class="flex w-full items-center justify-between px-4 py-3 text-left"
				>
					<div class="flex items-center gap-3">
						<span class="text-sm font-medium text-zinc-100">{scenario.name}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {scenario.triggerType === 'manual'
								? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 ring-inset'
								: scenario.triggerType === 'timed'
									? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 ring-inset'
									: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20 ring-inset'}"
						>
							{triggerTypeLabel(scenario.triggerType)}
						</span>
						<span class="text-xs text-zinc-500">{scenario.participants.length} participant{scenario.participants.length === 1 ? '' : 's'}</span>
						<span
							class="rounded-full px-2 py-0.5 text-xs font-medium {scenario.enabled
								? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20 ring-inset'
								: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20 ring-inset'}"
						>
							{scenario.enabled ? 'Enabled' : 'Disabled'}
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

				{#if expanded && editForms[scenario.id]}
					{@const editForm = editForms[scenario.id]!}
					<div class="border-t border-zinc-800 px-4 py-4">
						<p class="mb-3 text-xs text-zinc-500">{scenario.description}</p>

						{@render scenarioForm(
							editForm,
							editErrors[scenario.id] ?? {},
							data.bots,
							editSaving[scenario.id] ?? false,
							editSuccess[scenario.id] ?? false,
							() => handleUpdate(scenario.id),
						)}

						<div class="mt-4 flex items-center gap-3 border-t border-zinc-800 pt-4">
							<button
								onclick={() => handleDelete(scenario.id)}
								disabled={deleting[scenario.id]}
								class="rounded-md bg-red-500/10 px-4 py-1.5 text-sm font-medium text-red-400 ring-1 ring-red-500/20 ring-inset transition-colors hover:bg-red-500/20 disabled:opacity-50"
							>
								{deleting[scenario.id] ? 'Deleting...' : 'Delete'}
							</button>

							{#if data.activeSession}
								<button
									onclick={() => handleRun(scenario.id)}
									disabled={running[scenario.id]}
									class="rounded-md bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-400 ring-1 ring-green-500/20 ring-inset transition-colors hover:bg-green-500/20 disabled:opacity-50"
								>
									{running[scenario.id] ? 'Running...' : 'Run Now'}
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
				<p class="text-sm text-zinc-500">No scenarios configured yet. Create one above.</p>
			</div>
		{/each}
	</svelte:boundary>
</section>
