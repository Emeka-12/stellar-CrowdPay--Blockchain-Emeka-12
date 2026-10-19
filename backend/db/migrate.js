require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query(
      'SELECT filename FROM schema_migrations'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // alphabetical = chronological with date prefix

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] Already applied: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        // 42P07 = duplicate_table, 42701 = duplicate_column, 42P06 = duplicate_schema
        if (['42P07', '42701', '42P06', '42710'].includes(err.code) || err.message.includes('already exists')) {
          console.log(`[migrate] Schema objects for ${file} already exist; recording as applied.`);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        } else {
          throw err;
        }
      }
    }

    console.log(`[migrate] Done. ${count} migration(s) applied.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
