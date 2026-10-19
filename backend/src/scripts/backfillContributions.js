require('dotenv').config();

const db = require('../config/database');
const { backfillContributions } = require('../services/contributionBackfill');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const dryRun = process.env.DRY_RUN !== '0';
  const result = await backfillContributions({ runner: db, dryRun });
  process.stdout.write(JSON.stringify({ ...result, dry_run: dryRun }, null, 2) + '\n');
}

main()
  .catch((err) => {
    process.stderr.write(`[backfill-contributions] ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_err) {
      // noop
    }
  });