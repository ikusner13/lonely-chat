import app from './app';

const server = Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
  fetch: app.fetch,
});

console.log(`Server running at http://localhost:${server.port}`);