import { Hono } from "hono";

export const createApp = (): Hono => {
  const app = new Hono();

  app.get("/health", (context) =>
    context.json({
      status: "ok",
    }),
  );

  app.get("/", (context) =>
    context.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lonely Chat</title>
  </head>
  <body>
    <main>
      <h1>Lonely Chat</h1>
      <p>Placeholder dashboard for stream chat simulation.</p>
      <section>
        <h2>Session</h2>
        <p>Status: idle</p>
      </section>
    </main>
  </body>
</html>`),
  );

  return app;
};

export const app = createApp();
