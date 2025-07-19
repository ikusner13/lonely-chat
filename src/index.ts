import { Hono } from "hono";
import { Twitch } from "arctic";
import { writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

// Initialize Arctic Twitch provider
const twitch = new Twitch(
  process.env.TWITCH_CLIENT_ID!,
  process.env.TWITCH_CLIENT_SECRET!,
  process.env.TWITCH_REDIRECT_URI ||
    "https://0wvvnjxz-8080.use.devtunnels.ms/callback"
);

const app = new Hono();

// Token storage path
const TOKEN_FILE = "./tokens.json";

// Helper function to save tokens
async function saveTokens(tokens: any) {
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// Helper function to load tokens
async function loadTokens() {
  if (existsSync(TOKEN_FILE)) {
    const data = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  }
  return null;
}

// Login route to initiate OAuth flow
app.get("/login", async (c) => {
  const state = crypto.randomUUID();
  const scopes = ["chat:read", "chat:edit"]; // Add scopes your bot needs
  const url = twitch.createAuthorizationURL(state, scopes);

  // In production, store state in session
  return c.redirect(url.toString());
});

// Callback endpoint for Twitch OAuth
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  // const state = c.req.query("state"); // TODO: Validate state in production

  if (!code) {
    return c.text("Error: No authorization code received", 400);
  }

  try {
    // Exchange code for tokens
    const tokens = await twitch.validateAuthorizationCode(code);

    console.log(tokens);

    // Save tokens to JSON file
    const tokenData = {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString(),
      savedAt: new Date().toISOString(),
      // @ts-ignore scope is there
      scope: tokens.data.scope as string[],
    };

    await saveTokens(tokenData);

    return c.text("Successfully authenticated! Tokens saved to tokens.json");
  } catch (error) {
    console.error("OAuth error:", error);
    return c.text("Error during authentication", 500);
  }
});

// Root endpoint
app.get("/", (c) => {
  return c.html(`
    <html>
      <body>
        <h1>Twitch Bot OAuth</h1>
        <a href="/login">Login with Twitch</a>
      </body>
    </html>
  `);
});

export default {
  port: 8080,
  fetch: app.fetch,
};
