import { TwitchChatBot } from "./services/chatbot.service";

// Example usage of the TwitchChatBot class
async function startBot() {
  // Initialize bot with your client credentials
  const bot = new TwitchChatBot(
    process.env.TWITCH_CLIENT_ID!,
    process.env.TWITCH_CLIENT_SECRET!,
    "./tokens.json"
  );

  try {
    // Initialize the bot (loads tokens and sets up auth)
    await bot.initialize();

    // Connect to Twitch chat
    await bot.connect();

    // Join a channel (replace with your channel name)
    await bot.joinChannel("james_hamy");

    // Add custom commands
    bot.onCommand("ping", (channel, user) => {
      bot.sendMessage(channel, `@${user} Pong!`);
    });

    bot.onCommand("uptime", async (channel, user) => {
      // You could integrate with Twitch API to get actual stream uptime
      bot.sendMessage(channel, `@${user} Stream has been live for X minutes`);
    });

    bot.onCommand("socials", (channel, user) => {
      bot.sendMessage(channel, `@${user} Follow me on Twitter: @yourusername`);
    });

    console.log("Bot is running! Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Failed to start bot:", error);
  }
}

// Start the bot
startBot();
