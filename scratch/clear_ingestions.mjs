import pg from 'file:///C:/Users/dpeng/Documents/Digital-Twin-Suite/node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js';
import fs from 'fs';
import path from 'path';

function getDbUrl() {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf8');
    const match = text.match(/^DATABASE_URL=(.+)/m);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env.DATABASE_URL;
}

const connectionString = getDbUrl();
if (!connectionString) {
  console.error('No DATABASE_URL found');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function clearAll() {
  console.log('Connecting to PostgreSQL database...');
  const client = await pool.connect();
  try {
    console.log('Clearing atlas_email_drafts...');
    const r1 = await client.query('DELETE FROM atlas_email_drafts');
    console.log(`Deleted ${r1.rowCount} rows from atlas_email_drafts`);

    console.log('Clearing atlas_meeting_triggers...');
    const r2 = await client.query('DELETE FROM atlas_meeting_triggers');
    console.log(`Deleted ${r2.rowCount} rows from atlas_meeting_triggers`);

    console.log('Clearing atlas_meeting_contributions...');
    const r3 = await client.query('DELETE FROM atlas_meeting_contributions');
    console.log(`Deleted ${r3.rowCount} rows from atlas_meeting_contributions`);

    console.log('Clearing atlas_live_meetings...');
    const r4 = await client.query('DELETE FROM atlas_live_meetings');
    console.log(`Deleted ${r4.rowCount} rows from atlas_live_meetings`);

    console.log('Clearing atlas_meetings...');
    const r5 = await client.query('DELETE FROM atlas_meetings');
    console.log(`Deleted ${r5.rowCount} rows from atlas_meetings`);

    console.log('Clearing email and meeting records from atlas_activity...');
    const r6 = await client.query("DELETE FROM atlas_activity WHERE record_type IN ('email_draft', 'meeting', 'live_meeting')");
    console.log(`Deleted ${r6.rowCount} rows from atlas_activity`);

    console.log('\n--- SUCCESS ---');
    console.log('All email ingestions and Teams meeting ingestions have been completely cleared.');
    console.log('Database is fresh and ready for clean testing.');
  } finally {
    client.release();
    await pool.end();
  }
}

clearAll().catch(err => {
  console.error('Failed to clear database:', err);
  process.exit(1);
});
