import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production']).default('development'),
    TOKEN_DB_PATH: z.string().default('./tokens.db'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (issues) => {
    // biome-ignore lint/suspicious/noConsole: fine here
    console.error('❌ Invalid environment variables:', issues);
    throw new Error('Invalid environment variables');
  },
});
