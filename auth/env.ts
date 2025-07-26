import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    TWITCH_CLIENT_ID: z.string().min(1),
    TWITCH_CLIENT_SECRET: z.string().min(1),
    TWITCH_REDIRECT_URI: z
      .url()
      .optional()
      .default('https://lonelybot.loca.lt/callback'),
    LOCALTUNNEL_SUBDOMAIN: z
      .string()
      .min(1)
      .describe('Stable subdomain for localtunnel (e.g., my-twitch-auth)')
      .optional(),
    PORT: z.string().default('8080'),
    TOKEN_DB_PATH: z.string().default('./tokens.db'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    console.error('❌ Invalid environment variables:', issues);
    throw new Error('Invalid environment variables');
  },
});
