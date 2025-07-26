import type { FC } from 'hono/jsx';

interface TunnelStatusProps {
  url: string | null;
}

export const TunnelStatus: FC<TunnelStatusProps> = ({ url }) => {
  const isConnected = !!url;

  return (
    <div
      class={`mb-6 rounded-md p-4 ${
        isConnected
          ? 'border border-green-500 bg-green-100 text-green-700'
          : 'border border-amber-500 bg-amber-100 text-amber-700'
      }`}
    >
      <div class="mb-2 flex items-center gap-4">
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
      {isConnected && (
        <div class="mt-2 text-sm">
          <strong>Note:</strong> If prompted for a tunnel password, visit{' '}
          <a
            class="font-mono underline"
            href="https://loca.lt/mytunnelpassword"
            rel="noopener"
            target="_blank"
          >
            https://loca.lt/mytunnelpassword
          </a>{' '}
          on this computer to get it. OAuth callbacks should work automatically.
        </div>
      )}
    </div>
  );
};
