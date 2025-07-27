import { Twitch } from 'arctic';
import { createLogger } from '@/utils/logger';
import { env } from '../env';

const logger = createLogger('OAuth');

// Scope definitions
export const SCOPES = {
  channel: [] as string[], // No special scopes needed for EventSub stream events
  bot: ['chat:read', 'chat:edit'],
  moderator: [
    'chat:read',
    'chat:edit',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'moderator:read:chatters',
  ],
};

// Initialize Arctic Twitch provider
export const twitch = new Twitch(
  env.TWITCH_CLIENT_ID,
  env.TWITCH_CLIENT_SECRET,
  env.TWITCH_REDIRECT_URI || 'http://localhost:8080/callback'
);

// Generate authorization URL
export function generateAuthUrl(
  type: 'channel' | 'bot' | 'moderator',
  botName?: string
): string {
  const state = botName ? `${type}:${botName}` : type;
  const scopes = SCOPES[type];

  const url = twitch.createAuthorizationURL(state, scopes);

  logger.info(
    {
      type,
      botName,
      scopes: scopes.length > 0 ? scopes : 'none (public events only)',
      url: url.toString(),
    },
    'Generated auth URL'
  );

  return url.toString();
}

// Exchange code for tokens
export async function exchangeCodeForTokens(code: string) {
  try {
    const tokens = await twitch.validateAuthorizationCode(code);

    return {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString(),
      // @ts-expect-error scope is there
      scope: (tokens.data.scope as string[]) || [],
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to exchange code for tokens');
    throw error;
  }
}

// Get user info from access token
export async function getUserInfo(accessToken: string) {
  try {
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': env.TWITCH_CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ id: string; login: string; display_name: string }>;
    };
    const user = data.data[0];

    if (!user) {
      throw new Error('No user found');
    }

    return {
      userId: user.id,
      username: user.login,
      displayName: user.display_name,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get user info');
    throw error;
  }
}
