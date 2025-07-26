import { existsSync } from 'fs';
import { SQLiteTokenStore } from '../src/services/sqlite-token-store';

async function migrate() {
  console.log('Starting token migration to SQLite...');

  const tokenStore = new SQLiteTokenStore();

  // Check for old tokens.json
  if (existsSync('./tokens.json')) {
    console.log('Found tokens.json, migrating...');
    const oldTokens = await Bun.file('./tokens.json').json();

    for (const [name, token] of Object.entries(oldTokens)) {
      console.log(`Migrating token for: ${name}`);
      tokenStore.saveToken(name, token as any);
    }

    console.log('Migration from tokens.json complete!');
  }

  // Show current status
  const allTokens = tokenStore.getAllTokens();
  console.log('\nCurrent tokens in database:');
  for (const { name } of allTokens) {
    console.log(`  - ${name}`);
  }

  tokenStore.close();
  console.log('\nMigration complete!');
}

migrate().catch(console.error);
