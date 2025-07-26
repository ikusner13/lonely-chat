import { Database } from 'bun:sqlite';

const dbPath = process.env.TOKEN_DB_PATH || './data/tokens.db';

// Export tokens to JSON (backup)
export async function exportTokens() {
  const db = new Database(dbPath);
  const tokens = db.query('SELECT * FROM tokens').all();

  await Bun.write('./tokens-backup.json', JSON.stringify(tokens, null, 2));
  console.log(`Exported ${tokens.length} tokens to tokens-backup.json`);

  db.close();
}

// View token status
export function viewTokens() {
  const db = new Database(dbPath);
  const tokens = db
    .query('SELECT name, updated_at FROM tokens ORDER BY name')
    .all();

  console.table(tokens);

  db.close();
}

// Run if called directly
async function main() {
  const command = Bun.argv[2];

  switch (command) {
    case 'export':
      await exportTokens();
      break;
    case 'view':
      await viewTokens();
      break;
    default:
      console.log('Usage: bun run scripts/db-utils.ts [export|view]');
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
