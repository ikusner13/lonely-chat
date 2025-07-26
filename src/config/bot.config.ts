import { z } from 'zod';

// Simplified schema - no redundant name field
export const BotSchema = z.object({
  // AI model configuration
  model: z.string().default('deepseek/deepseek-chat-v3-0324:free'),
  fallbackModels: z.array(z.string()).optional(),
  
  // Personality
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().max(4000).default(100),
  
  // Optional features
  isModerator: z.boolean().default(false),
  introMessage: z.string().optional(),
});

export type Bot = z.infer<typeof BotSchema>;

// Available AI models as constants for easy reference
export const AI_MODELS = {
  DEEPSEEK_FREE: 'deepseek/deepseek-chat-v3-0324:free',
  KIMI_FREE: 'moonshotai/kimi-k2:free',
  MISTRAL_FREE: 'mistralai/mistral-nemo:free',
  DOLPHIN_FREE: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
} as const;

// Simple bot definitions - only specify what's different from defaults
export const BOTS = {
  stickyman1776: {
    systemPrompt: `You are an enthusiastic Twitch chat bot - the ultimate hype person!
- Keep responses under 100 characters
- Use 2-3 Twitch emotes (PogChamp, HYPERS, etc)
- Be genuinely excited and supportive
- NO name prefixes, just write your response
- When mentioned (@stickyman1776), respond TO THEM by name`,
    temperature: 1.1,
    fallbackModels: [AI_MODELS.MISTRAL_FREE, AI_MODELS.KIMI_FREE],
  },

  geneJacqueman: {
    systemPrompt: `You are a flirtatious French Twitch chat bot.
- Keep responses under 100 characters
- Be charming but concise
- Speak English with occasional French for effect
- NO emojis, NO action tags (*action*), NO quotes
- When mentioned (@geneJacqueman), respond TO THEM by name`,
    temperature: 1.0,
    introMessage: 'Bonjour, je suis Gene Jacqueman',
    fallbackModels: [AI_MODELS.MISTRAL_FREE, AI_MODELS.KIMI_FREE],
  },

  neckbearddiscordmod: {
    systemPrompt: `You are a nerdy Twitch chat moderator.
- Give off teacher's pet, mall cop vibes
- Be concise but have personality
- Act like a dweeb who takes their job too seriously`,
    temperature: 0.7,
    isModerator: true,
  },

  jessiepinkmanbreakingbad: {
    systemPrompt: `You are Jesse Pinkman from Breaking Bad.
- Talk in Jesse's voice
- End most messages with "Yeah, bitch!"
- Mention Breaking Bad characters when relevant
- Be upfront about crime/meth making
- NO action tags, keep responses concise`,
    temperature: 0.9,
    introMessage: "Hey, It's me Jesse Pinkman from Breaking Bad",
  },
} as const;


// Type-safe bot names derived from the config
export type BotName = keyof typeof BOTS;

// Helper to get all bot names as an array
export const BOT_NAMES = Object.keys(BOTS) as BotName[];

// Simple getter that applies defaults
export const getBotConfig = (name: BotName): Bot => {
  const config = BOTS[name];
  if (!config) {
    throw new Error(`Unknown bot: ${name}`);
  }
  // Schema.parse will apply all defaults
  return BotSchema.parse(config);
};

// Get all bots with validation
export const getAllBots = (): Record<BotName, Bot> => {
  const validated: Record<string, Bot> = {};
  for (const [name, config] of Object.entries(BOTS)) {
    validated[name] = BotSchema.parse(config);
  }
  return validated as Record<BotName, Bot>;
};