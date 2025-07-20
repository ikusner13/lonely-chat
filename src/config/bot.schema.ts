import { z } from 'zod';

// AI model schema with literal values
export const AIModelSchema = z
  .enum([
    'moonshotai/kimi-k2:free',
    'meta-llama/llama-3.1-70b-instruct:free',
    'google/gemini-1.5-flash',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
  ])
  .describe('Available AI models from OpenRouter')
  .meta({
    id: 'AIModel',
    title: 'AI Model',
    examples: ['moonshotai/kimi-k2:free', 'openai/gpt-4o-mini'],
  });

export type AIModel = z.infer<typeof AIModelSchema>;

// Bot name schema
export const BotNameSchema = z
  .enum(['stickyman1776'])
  .describe('Unique identifier for a bot instance')
  .meta({
    id: 'BotName',
    title: 'Bot Name',
    examples: ['stickyman1776'],
  });

export type BotName = z.infer<typeof BotNameSchema>;

// Response chance schema with constraints
export const ResponseChanceSchema = z
  .object({
    question: z
      .number()
      .min(0)
      .max(1)
      .describe('Probability (0-1) of responding to questions'),
    greeting: z
      .number()
      .min(0)
      .max(1)
      .describe('Probability (0-1) of responding to greetings'),
    general: z
      .number()
      .min(0)
      .max(1)
      .describe('Probability (0-1) of responding to general messages'),
  })
  .describe('Response probability configuration for different message types')
  .meta({
    id: 'ResponseChance',
    title: 'Response Chances',
    examples: [{ question: 0.8, greeting: 0.9, general: 0.3 }],
  });

export type ResponseChance = z.infer<typeof ResponseChanceSchema>;

// Bot personality schema
export const BotPersonalitySchema = z
  .object({
    name: z.string().min(1).describe('Display name for the bot'),
    model: AIModelSchema,
    systemPrompt: z
      .string()
      .min(1)
      .describe(
        "System prompt that defines the bot's personality and behavior"
      ),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .default(0.7)
      .describe(
        'Controls randomness in responses (0=deterministic, 2=very random)'
      ),
    maxTokens: z
      .int()
      .positive()
      .max(4000)
      .default(150)
      .describe('Maximum number of tokens in bot responses'),
    interests: z
      .array(z.string())
      .optional()
      .describe('Topics the bot is interested in for conversation targeting'),
    responseChance: ResponseChanceSchema.optional(),
  })
  .describe('Complete configuration for a bot personality')
  .meta({
    id: 'BotPersonality',
    title: 'Bot Personality',
    examples: [
      {
        name: 'Stickyman1776',
        model: 'moonshotai/kimi-k2:free',
        systemPrompt: 'You are a friendly bot!',
        temperature: 0.8,
        maxTokens: 100,
      },
    ],
  });

export type BotPersonality = z.infer<typeof BotPersonalitySchema>;

// Bot configuration schema - ensures all bot names have configs
export const BotConfigSchema = z
  .record(BotNameSchema, BotPersonalitySchema)
  .describe(
    'Complete bot configuration mapping bot names to their personalities'
  )
  .meta({
    id: 'BotConfig',
    title: 'Bot Configuration',
    examples: [
      {
        stickyman1776: {
          name: 'Stickyman1776',
          model: 'moonshotai/kimi-k2:free',
          systemPrompt: 'You are a friendly bot!',
          temperature: 0.8,
          maxTokens: 100,
        },
      },
    ],
  });

export type BotConfig = z.infer<typeof BotConfigSchema>;

// Runtime validation helper
export const validateBotConfig = (config: unknown): BotConfig => {
  return BotConfigSchema.parse(config);
};

// Safe bot personality getter with validation
export const getBotPersonality = (name: string): BotPersonality => {
  const parsed = BotNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new Error(
      `Invalid bot name: ${name}. Valid names: ${BotNameSchema.options.join(', ')}`
    );
  }

  // This will be used after loading config
  const config = getBotConfig();
  return config[parsed.data];
};

// Config loader (to be implemented)
let cachedConfig: BotConfig | null = null;

export const getBotConfig = (): BotConfig => {
  if (!cachedConfig) {
    throw new Error(
      'Bot configuration not loaded. Call loadBotConfig() first.'
    );
  }
  return cachedConfig;
};

export const loadBotConfig = (config: unknown): void => {
  cachedConfig = validateBotConfig(config);
};

// Export all bot names for iteration
export const ALL_BOT_NAMES = BotNameSchema.options;

// Helper to get schema metadata
export const getSchemaMetadata = <T extends z.ZodType>(schema: T) => {
  return schema.meta();
};

// Generate JSON Schema using Zod's built-in function
export const generateJsonSchema = () => {
  return z.toJSONSchema(BotConfigSchema);
};

// Example of generating JSON Schema with metadata
export const generateJsonSchemaWithMetadata = () => {
  return z.toJSONSchema(BotConfigSchema, {
    metadata: z.globalRegistry,
  });
};
