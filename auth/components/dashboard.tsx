import type { FC } from 'hono/jsx';
import type { TokenStorage } from '@/services/token.service';
import { TokenCard } from './token-card';
import { TunnelStatus } from './tunnel-status';

interface DashboardProps {
  tokens: TokenStorage;
  tunnelUrl: string | null;
}

export const Dashboard: FC<DashboardProps> = ({ tokens, tunnelUrl }) => {
  const botEntries = Object.entries(tokens.bots || {});
  const hasBots = botEntries.length > 0;

  return (
    <>
      <TunnelStatus url={tunnelUrl} />

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-gray-700">Channel Token</h2>
        {tokens.channel ? (
          <TokenCard name="Channel" token={tokens.channel} type="channel" />
        ) : (
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow mb-6">
            <div class="text-center py-12 text-gray-500">
              <h3 class="text-xl mb-2 text-gray-600">No Channel Token</h3>
              <p>Generate a channel token to enable stream event monitoring.</p>
              <div class="flex gap-3 mt-4 justify-center">
                <a class="inline-block px-6 py-3 bg-purple-600 text-white no-underline rounded-md font-medium transition-colors hover:bg-purple-700" href="/auth/channel">
                  Generate Channel Token
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-gray-700">Bot Tokens</h2>
        {hasBots ? (
          <div class="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {botEntries.map(([name, token]) => (
              <TokenCard
                key={name}
                name={name}
                token={token}
                type={
                  token.scope.some((s) => s.includes('moderator'))
                    ? 'moderator'
                    : 'bot'
                }
              />
            ))}
          </div>
        ) : (
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow mb-6">
            <div class="text-center py-12 text-gray-500">
              <h3 class="text-xl mb-2 text-gray-600">No Bot Tokens</h3>
              <p>Generate tokens for your bots to enable chat functionality.</p>
            </div>
          </div>
        )}

        <div class="flex gap-3 mt-6">
          <form action="/auth/bot/new" method="get" class="inline-block">
            <input
              name="name"
              placeholder="Bot name"
              required
              class="px-3 py-3 border border-gray-300 rounded-md mr-2"
              type="text"
            />
            <button class="px-6 py-3 bg-purple-600 text-white rounded-md font-medium transition-colors hover:bg-purple-700" type="submit">
              Add Regular Bot
            </button>
          </form>

          <form
            action="/auth/moderator/new"
            method="get"
            class="inline-block"
          >
            <input
              name="name"
              placeholder="Moderator bot name"
              required
              class="px-3 py-3 border border-gray-300 rounded-md mr-2"
              type="text"
            />
            <button class="px-6 py-3 bg-gray-500 text-white rounded-md font-medium transition-colors hover:bg-gray-600" type="submit">
              Add Moderator Bot
            </button>
          </form>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-gray-700">Quick Actions</h2>
        <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 class="text-lg font-semibold mb-2">OAuth Configuration</h3>
          <p class="mb-4">
            Ensure your Twitch app is configured with this redirect URI:
          </p>
          <div class="font-mono bg-gray-100 px-2 py-1 rounded text-sm break-all">
            {tunnelUrl ? `${tunnelUrl}/callback` : 'Tunnel not connected'}
          </div>
          {tunnelUrl && (
            <button
              class="px-4 py-2 bg-purple-600 text-white rounded-md font-medium transition-colors hover:bg-purple-700 text-sm mt-4"
              onclick={`navigator.clipboard.writeText('${tunnelUrl}/callback')`}
              type="button"
            >
              Copy Redirect URI
            </button>
          )}
        </div>
      </section>
    </>
  );
};
