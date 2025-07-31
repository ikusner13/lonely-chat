import type { FC } from 'hono/jsx';
import type { TokenData } from '@/shared/token.service';
import { formatScopes, getTokenInfo } from '../lib/tokens';

interface TokenCardProps {
  type: 'channel' | 'bot' | 'moderator';
  name: string;
  token: TokenData;
}

export const TokenCard: FC<TokenCardProps> = ({ type, name, token }) => {
  const info = getTokenInfo(token);
  let typeEmoji: string;
  let typeLabel: string;

  if (type === 'channel') {
    typeEmoji = '📡';
    typeLabel = 'Channel';
  } else if (type === 'moderator') {
    typeEmoji = '🛡️';
    typeLabel = 'Moderator Bot';
  } else {
    typeEmoji = '🤖';
    typeLabel = 'Regular Bot';
  }

  return (
    <div class="rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div class="mb-4 flex items-start justify-between">
        <h3 class="font-semibold text-xl">
          {typeEmoji} {name}
        </h3>
        <span
          class={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium text-sm ${
            info.isExpired
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          <span
            class={`h-2 w-2 rounded-full ${
              info.isExpired ? 'bg-red-500' : 'bg-green-500'
            }`}
          />
          {info.isExpired ? 'Expired' : 'Active'}
        </span>
      </div>

      <div class="flex flex-col gap-3">
        <div>
          <span class="font-semibold text-gray-500 text-sm">Type:</span>
          <span class="ml-1 break-all font-mono text-sm">{typeLabel}</span>
        </div>

        {token.channelName && (
          <div>
            <span class="font-semibold text-gray-500 text-sm">Username:</span>
            <span class="ml-1 break-all font-mono text-sm">
              {token.channelName}
            </span>
          </div>
        )}

        <div>
          <span class="font-semibold text-gray-500 text-sm">Expires:</span>
          <span class="ml-1 break-all font-mono text-sm">
            {info.timeUntilExpiry}
          </span>
        </div>

        <div>
          <span class="font-semibold text-gray-500 text-sm">Scopes:</span>
          <span class="ml-1 break-all font-mono text-sm">
            {formatScopes(token.scope)}
          </span>
        </div>
      </div>

      <div class="mt-4 flex gap-3">
        {info.isExpired && (
          <a
            class="rounded-md bg-purple-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-purple-700"
            href={
              type === 'channel' ? '/auth/channel' : `/auth/${type}/${name}`
            }
          >
            Refresh Token
          </a>
        )}
        <button
          class="rounded-md bg-red-500 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-red-600"
          onclick={`
            if (confirm('Delete ${type} token for ${name || 'channel'}?')) {
              const url = ${type === 'channel' ? `'/api/tokens/channel'` : `'/api/tokens/${type}/${name}'`};
                
              fetch(url, { method: 'DELETE' })
                .then(response => {
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    response.text().then(text => {
                      console.error('Delete failed:', text);
                      alert('Failed to delete token: ' + text);
                    });
                  }
                })
                .catch(error => {
                  console.error('Error deleting token:', error);
                  alert('Failed to delete token: ' + error.message);
                });
            }
          `}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
};
