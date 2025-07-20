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
    OPENROUTER_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    console.error('❌ Invalid environment variables:', issues);
    throw new Error('Invalid environment variables');
  },
});
