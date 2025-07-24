import { ModeratorBotService } from './services/moderator-bot.service';
import { TokenService } from './services/token.service';

async function main() {
  // Load tokens
  const tokenService = new TokenService();
  const modBotToken = tokenService.getBotToken('moderator');

  if (!modBotToken) {
    console.error('No moderator bot token found. Run: bun run generate-moderator-token moderator');
    process.exit(1);
  }

  // Create moderator bot
  const modBot = new ModeratorBotService(
    process.env.TWITCH_CLIENT_ID!,
    process.env.TWITCH_CLIENT_SECRET!,
    process.env.TWITCH_CHANNEL_NAME!,
    modBotToken
  );

  // Set up token refresh
  modBot.setTokenRefreshCallback(async (userId, newTokenData) => {
    console.log('Moderator bot token refreshed');
    tokenService.saveBotToken('moderator', {
      ...modBotToken,
      accessToken: newTokenData.accessToken,
      refreshToken: newTokenData.refreshToken!,
      expiresIn: newTokenData.expiresIn ?? 0,
      obtainmentTimestamp: newTokenData.obtainmentTimestamp,
    });
  });

  // Initialize and connect
  await modBot.initialize();
  await modBot.connect();
  await modBot.join(process.env.TWITCH_CHANNEL_NAME!);

  // Example: Set up custom moderation rules
  modBot.getChatClient().onMessage(async (channel, user, text, msg) => {
    // Skip if it's a mod or broadcaster
    if (msg.userInfo.isMod || msg.userInfo.isBroadcaster) return;

    // Example rules:
    
    // 1. Excessive caps (more than 70% caps in messages over 10 chars)
    if (text.length > 10) {
      const capsCount = (text.match(/[A-Z]/g) || []).length;
      const capsRatio = capsCount / text.length;
      
      if (capsRatio > 0.7) {
        await modBot.deleteMessage(msg.id);
        await modBot.say(`@${user} Please avoid excessive caps`);
        await modBot.timeout(msg.userInfo.userId, 30, 'Excessive caps');
        return;
      }
    }

    // 2. Spam detection (same message repeated)
    // You'd need to implement a message history tracker here

    // 3. Banned words
    const bannedWords = ['badword1', 'badword2']; // Configure as needed
    const lowerText = text.toLowerCase();
    
    for (const word of bannedWords) {
      if (lowerText.includes(word)) {
        await modBot.deleteMessage(msg.id);
        await modBot.timeout(msg.userInfo.userId, 300, `Banned word: ${word}`);
        await modBot.say(`@${user} That language is not allowed here`);
        return;
      }
    }
  });

  console.log('🔨 Moderator bot is running!');
}

main().catch(console.error);