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

interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string;
  channelName?: string;
}

interface TokenStorage {
  channel?: TokenData;
  bots: Record<string, TokenData>;
}

// Helper function to load tokens
async function loadTokens(): Promise<TokenStorage> {
  if (existsSync(TOKEN_FILE)) {
    const data = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  }
  return { bots: {} };
}

// Helper function to save tokens
async function saveTokens(storage: TokenStorage) {
  await writeFile(TOKEN_FILE, JSON.stringify(storage, null, 2));
}

// Login route to initiate OAuth flow
app.get("/login", async (c) => {
  const state = crypto.randomUUID();

  // Minimal scopes needed for EventSub WebSocket
  // No special scopes are required for stream.online/offline events
  const scopes: string[] = [];

  const url = twitch.createAuthorizationURL(state, scopes);

  console.log(`\nGenerating channel tokens for EventSub WebSocket`);
  console.log(`Requested scopes: ${scopes.length > 0 ? scopes.join(", ") : "none (public events only)"}`);
  console.log("\nOpening browser for authentication...");

  return c.redirect(url.toString());
});

// Callback endpoint for Twitch OAuth
app.get("/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.text("Error: No authorization code received", 400);
  }

  try {
    // Exchange code for tokens
    const tokens = await twitch.validateAuthorizationCode(code);

    // Load existing tokens
    const storage = await loadTokens();

    // Prepare token data
    const tokenData: TokenData = {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString(),
      savedAt: new Date().toISOString(),
      // @ts-ignore scope is there
      scope: tokens.data.scope as string[] || [],
    };

    // Get channel info from environment
    tokenData.userId = process.env.TWITCH_CHANNEL_ID!;
    tokenData.channelName = process.env.TWITCH_CHANNEL_NAME!;

    // Save channel tokens
    storage.channel = tokenData;

    await saveTokens(storage);

    const successMessage = "Channel tokens saved successfully!";

    console.log(`\n✅ ${successMessage}`);
    console.log("Tokens saved to tokens.json");
    console.log("\n✅ Channel user ID and name loaded from .env file");

    // Return success page
    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>✅ Authentication Successful!</h1>
          <p>${successMessage}</p>
          <p>Channel tokens have been saved for EventSub WebSocket.</p>
          <p>You can close this window and return to the terminal.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error:", error);
    return c.text("Error during authentication", 500);
  }
});

// Root endpoint
app.get("/", (c) => {
  return c.html(`
    <html>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>Twitch Channel OAuth for EventSub</h1>
        <p>This will generate user tokens for your channel to use with EventSub WebSocket.</p>
        <p>Click the button below to authenticate with Twitch.</p>
        <a href="/login" style="
          display: inline-block;
          padding: 10px 20px;
          background: #9146ff;
          color: white;
          text-decoration: none;
          border-radius: 4px;
        ">Login with Twitch</a>
      </body>
    </html>
  `);
});

// Start server
console.log(`Starting OAuth server on http://localhost:8080`);
console.log(`Navigate to http://localhost:8080 to begin authentication`);
console.log(`\nMake sure TWITCH_CHANNEL_ID and TWITCH_CHANNEL_NAME are set in your .env file!`);

export default {
  port: 8080,
  fetch: app.fetch,
};