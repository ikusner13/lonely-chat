import type { TokenData } from '@/services/token.service';
import { TokenManager } from '@/services/token.service';
import { createLogger } from '@/utils/logger';
import { env } from '../env';

const logger = createLogger('TokenUtils');
const tokenManager = new TokenManager({
  clientId: env.TWITCH_CLIENT_ID,
  clientSecret: env.TWITCH_CLIENT_SECRET,
  dbPath: env.TOKEN_DB_PATH,
});

export interface TokenInfo {
  exists: boolean;
  expiresAt?: Date;
  isExpired?: boolean;
  timeUntilExpiry?: string;
  scopes?: string[];
  username?: string;
  userId?: string;
}

// Get token info with expiry status
export function getTokenInfo(token?: TokenData): TokenInfo {
  if (!token) {
    return { exists: false };
  }

  const expiresAt = new Date(token.accessTokenExpiresAt);
  const now = new Date();
  const isExpired = expiresAt < now;

  // Calculate time until expiry
  let timeUntilExpiry = 'Expired';
  if (!isExpired) {
    const diff = expiresAt.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      timeUntilExpiry = `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      timeUntilExpiry = `${hours}h ${minutes}m`;
    } else {
      timeUntilExpiry = `${minutes} minutes`;
    }
  }

  return {
    exists: true,
    expiresAt,
    isExpired,
    timeUntilExpiry,
    scopes: token.scope,
    username: token.channelName || token.userId,
  };
}

// Get all token infos
export async function getAllTokenInfos(): Promise<{
  channel?: TokenInfo;
  bots: Record<string, TokenInfo>;
}> {
  try {
    const storage = await tokenManager.loadTokens();

    return {
      channel: getTokenInfo(storage.channel),
      bots: Object.entries(storage.bots || {}).reduce(
        (acc, [name, token]) => {
          acc[name] = getTokenInfo(token);
          return acc;
        },
        {} as Record<string, TokenInfo>
      ),
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to load token infos');
    return { bots: {} };
  }
}

// Format scopes for display
export function formatScopes(scopes: string[]): string {
  if (!scopes || scopes.length === 0) {
    return 'None (public access only)';
  }

  return scopes
    .map((scope) => scope.replace(/_/g, ' ').replace(/:/g, ': '))
    .join(', ');
}

// Get scope type
export function getScopeType(
  scopes: string[]
): 'channel' | 'bot' | 'moderator' {
  if (scopes.some((s) => s.includes('moderator'))) {
    return 'moderator';
  }
  if (scopes.includes('chat:read') || scopes.includes('chat:edit')) {
    return 'bot';
  }
  return 'channel';
}
