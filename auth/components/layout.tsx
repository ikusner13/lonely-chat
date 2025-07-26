import type { Child, FC } from 'hono/jsx';

interface LayoutProps {
  title?: string;
  children?: Child | Child[];
}

export const Layout: FC<LayoutProps> = ({
  title = 'Twitch Auth',
  children,
}) => {
  return (
    <html lang="en">
      {/* biome-ignore lint/style/noHeadElement: This is a Hono app, not Next.js */}
      <head>
        <meta charSet="UTF-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <title>{title}</title>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4" />
      </head>
      <body class="bg-gray-100 text-gray-800">
        <div class="mb-8 bg-purple-600 py-4 text-white shadow-md">
          <div class="max-w-6xl mx-auto px-8">
            <h1 class="font-bold text-3xl">🎮 {title}</h1>
          </div>
        </div>
        <div class="max-w-6xl mx-auto px-8">{children}</div>
      </body>
    </html>
  );
};
