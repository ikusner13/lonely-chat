import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    TWITCH_CLIENT_ID: z.string().min(1),
    TWITCH_CLIENT_SECRET: z.string().min(1),
    TWITCH_CHANNEL_ID: z.string().min(1),
    TWITCH_CHANNEL_NAME: z.string().min(1),
    TWITCH_REDIRECT_URI: z
      .url()
      .optional()
      .default('https://0wvvnjxz-8080.use.devtunnels.ms/callback'),
    LOCALTUNNEL_SUBDOMAIN: z
      .string()
      .min(1)
      .describe('Stable subdomain for localtunnel (e.g., my-twitch-auth)'),
    OPENROUTER_KEY: z.string().min(1),
    DISABLE_EVENTSUB: z
      .string()
      // transform to boolean using preferred coercion logic
      .transform((s) => s !== 'false' && s !== '0')
      .optional()
      .default(false),
    NODE_ENV: z.enum(['development', 'production']).default('development'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    console.error('❌ Invalid environment variables:', issues);
    throw new Error('Invalid environment variables');
  },
});
