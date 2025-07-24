import { tool } from 'ai';
import z from 'zod';

export const timeoutTool = tool({
  name: 'timeoutTool',
  description: 'Timeout a user',
  inputSchema: z.object({
    user: z.string(),
    duration: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: ({ user }) => {
    console.log(`Whitelisting user: ${user}`);
    return { success: true };
  },
});
