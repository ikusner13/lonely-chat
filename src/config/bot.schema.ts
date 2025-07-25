import { z } from 'zod';
import { createLogger } from '@/utils/logger';

export const AI_MODELS = [
  'moonshotai/kimi-k2:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'mistralai/mistral-nemo:free',
  'moonshotai/kimi-k2',
] as const;

export const BOTS = [
  'stickyman1776',
  'geneJacqueman',
  'neckbearddiscordmod',
] as const;

export const AIModelSchema = z
  .enum(AI_MODELS, {
    error:
      'Invalid model. Must be one of: moonshotai/kimi-k2:free, deepseek/deepseek-chat-v3-0324:free, mistralai/mistral-nemo:free',
  })
  .describe('Available AI models from OpenRouter')
  .meta({
    id: 'AIModel',
    title: 'AI Model',
    examples: [
      'moonshotai/kimi-k2:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'mistralai/mistral-nemo:free',
    ],
  });
export type AIModel = z.infer<typeof AIModelSchema>;

export const BotNameSchema = z
  .enum(BOTS, {
    error:
      'Invalid bot name. Currently supported: stickyman1776, geneJacqueman, neckbearddiscordmod',
  })
  .describe('Unique identifier for a bot instance')
  .meta({
    id: 'BotName',
    title: 'Bot Name',
    examples: ['stickyman1776', 'geneJacqueman', 'neckbearddiscordmod'],
  });
export type BotName = z.infer<typeof BotNameSchema>;

export const BotPersonalitySchema = z
  .object({
    name: z
      .string({
        error: 'Bot name must be a string',
      })
      .min(1, { error: 'Bot name cannot be empty' })
      .describe('Display name for the bot'),
    model: AIModelSchema,
    fallbackModels: z
      .array(AIModelSchema)
      .optional()
      .describe(
        'Ordered list of fallback models to try if primary model fails'
      ),
    systemPrompt: z
      .string({
        error: 'System prompt must be a string',
      })
      .min(1, { error: 'System prompt cannot be empty' })
      .describe(
        "System prompt that defines the bot's personality and behavior"
      ),
    temperature: z
      .number({
        error: 'Temperature must be a number',
      })
      .min(0, { error: 'Temperature must be at least 0 (deterministic)' })
      .max(2, { error: 'Temperature must be at most 2 (very random)' })
      .default(0.7)
      .describe(
        'Controls randomness in responses (0=deterministic, 2=very random)'
      ),
    maxTokens: z
      .int({
        error: 'Max tokens must be an integer',
      })
      .positive({ error: 'Max tokens must be positive' })
      .max(4000, { error: 'Max tokens cannot exceed 4000' })
      .default(150)
      .describe('Maximum number of tokens in bot responses'),
  })
  .refine(
    (data) => {
      // Ensure fallback models don't include the primary model
      if (data.fallbackModels) {
        return !data.fallbackModels.includes(data.model);
      }
      return true;
    },
    {
      message: 'Fallback models cannot include the primary model',
      path: ['fallbackModels'],
    }
  )
  .refine(
    (data) => {
      // Ensure no duplicate fallback models
      if (data.fallbackModels) {
        const uniqueModels = new Set(data.fallbackModels);
        return uniqueModels.size === data.fallbackModels.length;
      }
      return true;
    },
    {
      message: 'Fallback models must be unique',
      path: ['fallbackModels'],
    }
  )
  .describe('Complete configuration for a bot personality')
  .meta({
    id: 'BotPersonality',
    title: 'Bot Personality',
    examples: [
      {
        name: 'Stickyman1776',
        model: 'moonshotai/kimi-k2:free',
        fallbackModels: [
          'mistralai/mistral-nemo:free',
          'deepseek/deepseek-chat-v3-0324:free',
        ],
        systemPrompt: 'You are a friendly bot!',
        temperature: 0.8,
        maxTokens: 100,
      },
    ],
  });
export type BotPersonality = z.infer<typeof BotPersonalitySchema>;

export const BotConfigSchema = z
  .record(BotNameSchema, BotPersonalitySchema, {
    error: 'Bot configuration must be an object',
  })
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
          fallbackModels: ['deepseek/deepseek-chat-v3-0324:free'],
          systemPrompt: 'You are a friendly bot!',
          temperature: 0.8,
          maxTokens: 100,
        },
      },
    ],
  });
export type BotConfig = z.infer<typeof BotConfigSchema>;

export interface FormattedError {
  success: false;
  error: {
    formatted: ReturnType<typeof z.treeifyError>;
    flattened: ReturnType<typeof z.flattenError>;
    pretty: ReturnType<typeof z.prettifyError>;
  };
}

export interface FormattedSuccess<T> {
  success: true;
  data: T;
}

export type ValidationResult<T> = FormattedSuccess<T> | FormattedError;

export const validateBotConfig = (config: unknown): BotConfig => {
  return BotConfigSchema.parse(config);
};

export const safeValidateBotConfig = (
  config: unknown
): ValidationResult<BotConfig> => {
  const result = BotConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: {
      formatted: z.treeifyError(result.error),
      flattened: z.flattenError(result.error),
      pretty: z.prettifyError(result.error),
    },
  };
};

export const getBotPersonality = (name: string): BotPersonality => {
  const parsed = BotNameSchema.safeParse(name);
  if (!parsed.success) {
    const pretty = z.prettifyError(parsed.error);
    throw new Error(`Invalid bot name: ${name}\n${pretty}`);
  }

  const config = getBotConfig();
  return config[parsed.data];
};

let cachedConfig: BotConfig | null = null;
const logger = createLogger('BotConfig');

export const getBotConfig = (): BotConfig => {
  if (!cachedConfig) {
    throw new Error(
      'Bot configuration not loaded. Call loadBotConfig() first.'
    );
  }
  return cachedConfig;
};

export const loadBotConfig = (config: unknown): void => {
  const result = safeValidateBotConfig(config);

  if (!result.success) {
    logger.error('Bot configuration validation failed:');
    logger.error(result.error.pretty);
    throw new Error(`Invalid bot configuration:\n${result.error.pretty}`);
  }

  cachedConfig = result.data;
};

export const getSchemaMetadata = <T extends z.ZodType>(schema: T) => {
  return schema.meta();
};

export const generateJsonSchema = () => {
  return z.toJSONSchema(BotConfigSchema);
};

export const generateJsonSchemaWithMetadata = () => {
  return z.toJSONSchema(BotConfigSchema, {
    metadata: z.globalRegistry,
  });
};
