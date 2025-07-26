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
        <h2 class="mb-4 font-semibold text-2xl text-gray-700">Channel Token</h2>
        {tokens.channel ? (
          <TokenCard name="Channel" token={tokens.channel} type="channel" />
        ) : (
          <div class="mb-6 rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div class="py-12 text-center text-gray-500">
              <h3 class="mb-2 text-gray-600 text-xl">No Channel Token</h3>
              <p>Generate a channel token to enable stream event monitoring.</p>
              <div class="mt-4 flex justify-center gap-3">
                <a
                  class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
                  href="/auth/channel"
                >
                  Generate Channel Token
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      <section class="mb-12">
        <h2 class="mb-4 font-semibold text-2xl text-gray-700">Bot Tokens</h2>
        {hasBots ? (
          <div class="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-6">
            {botEntries.map(([name, token]) => (
              <TokenCard
                key={name}
                name={name}
                token={token}
                type={
                  token.scope.some((s: string) => s.includes('moderator'))
                    ? 'moderator'
                    : 'bot'
                }
              />
            ))}
          </div>
        ) : (
          <div class="mb-6 rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div class="py-12 text-center text-gray-500">
              <h3 class="mb-2 text-gray-600 text-xl">No Bot Tokens</h3>
              <p>Generate tokens for your bots to enable chat functionality.</p>
            </div>
          </div>
        )}

        <div class="mt-6 flex gap-3">
          <form action="/auth/bot/new" class="inline-block" method="get">
            <input
              class="mr-2 rounded-md border border-gray-300 px-3 py-3"
              name="name"
              placeholder="Bot name"
              required
              type="text"
            />
            <button
              class="rounded-md bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700"
              type="submit"
            >
              Add Regular Bot
            </button>
          </form>

          <form action="/auth/moderator/new" class="inline-block" method="get">
            <input
              class="mr-2 rounded-md border border-gray-300 px-3 py-3"
              name="name"
              placeholder="Moderator bot name"
              required
              type="text"
            />
            <button
              class="rounded-md bg-gray-500 px-6 py-3 font-medium text-white transition-colors hover:bg-gray-600"
              type="submit"
            >
              Add Moderator Bot
            </button>
          </form>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="mb-4 font-semibold text-2xl text-gray-700">Quick Actions</h2>
        <div class="rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
          <h3 class="mb-2 font-semibold text-lg">OAuth Configuration</h3>
          <p class="mb-4">
            Ensure your Twitch app is configured with this redirect URI:
          </p>
          <div class="break-all rounded bg-gray-100 px-2 py-1 font-mono text-sm">
            {tunnelUrl ? `${tunnelUrl}/callback` : 'Tunnel not connected'}
          </div>
          {tunnelUrl && (
            <button
              class="mt-4 rounded-md bg-purple-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-purple-700"
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
