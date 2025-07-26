import { TokenStoreService } from '../src/services/token-store.service';

// Read existing tokens.json
const tokensFile = Bun.file('./tokens.json');
if (!await tokensFile.exists()) {
  console.error('❌ tokens.json not found');
  process.exit(1);
}

const tokensData = await tokensFile.json();
console.log('📖 Read tokens.json successfully');

// Initialize database
const tokenStore = new TokenStoreService('./tokens.db');
console.log('🗄️  Initialized SQLite database');

// Migrate channel token
if (tokensData.channel) {
  tokenStore.saveToken(
    'channel',
    tokensData.channel.accessToken,
    tokensData.channel.refreshToken,
    'channel',
    tokensData.channel.accessTokenExpiresAt ? new Date(tokensData.channel.accessTokenExpiresAt) : undefined,
    tokensData.channel.userId
  );
  console.log('✅ Migrated channel token');
}

// Migrate bot tokens
for (const [botName, tokenData] of Object.entries(tokensData.bots || {})) {
  const data = tokenData as any;
  const isModerator = botName === 'neckbearddiscordmod' ? 'moderator' : 'bot';
  
  tokenStore.saveToken(
    botName,
    data.accessToken,
    data.refreshToken,
    isModerator,
    data.accessTokenExpiresAt ? new Date(data.accessTokenExpiresAt) : undefined,
    data.userId
  );
  console.log(`✅ Migrated ${isModerator} token for ${botName}${data.userId ? ' (with userId)' : ''}`);
}

// Close database
tokenStore.close();
console.log('\n🎉 Migration complete! tokens.db created successfully');