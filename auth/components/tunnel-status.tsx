import type { FC } from 'hono/jsx';

interface TunnelStatusProps {
  url: string | null;
}

export const TunnelStatus: FC<TunnelStatusProps> = ({ url }) => {
  const isConnected = !!url;

  return (
    <div
      class={`mb-6 flex items-center gap-4 rounded-md p-4 ${
        isConnected
          ? 'border border-green-500 bg-green-100 text-green-700'
          : 'border border-amber-500 bg-amber-100 text-amber-700'
      }`}
    >
      <div>
        <strong>Tunnel Status:</strong>{' '}
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      {isConnected && (
        <div class="flex-1">
          <span>Public URL: </span>
          <span class="break-all rounded bg-black/10 px-2 py-1 font-mono text-sm">
            {url}
          </span>
        </div>
      )}
    </div>
  );
};
