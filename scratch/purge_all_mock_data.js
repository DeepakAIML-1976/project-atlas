import { createRequire } from 'node:module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const pg = require('./node_modules/.pnpm/pg@8.23.0/node_modules/pg');

const envContent = fs.readFileSync('.env', 'utf8');
const line = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='));
const rawUrl = line ? line.replace('DATABASE_URL=', '').replace(/^["']|["']$/g, '').trim() : '';

const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^:\/\?]+)(?::(\d+))?\/(.+)$/);
if (!match) {
  console.error('Regex match failed for DATABASE_URL');
  process.exit(1);
}

const [, , user, pass, host, portStr, dbAndParams] = match;
const dbName = dbAndParams.split('?')[0];

const client = new pg.Client({
  host,
  port: portStr ? parseInt(portStr, 10) : 5432,
  user: decodeURIComponent(user),
  password: decodeURIComponent(pass),
  database: dbName,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected to PostgreSQL Supabase!');

// Truncate all non-system records tables
const tablesToClean = [
  'atlas_live_meetings',
  'atlas_meeting_triggers',
  'atlas_email_drafts',
  'atlas_decisions',
  'atlas_meeting_contributions',
  'atlas_sources',
  'atlas_meetings',
  'atlas_actions',
  'atlas_knowledge_links',
  'atlas_socratic_interviews',
  'atlas_benchmark_results',
  'atlas_activity',
];

for (const table of tablesToClean) {
  try {
    await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
    console.log(`Successfully purged table: ${table}`);
  } catch (err) {
    console.warn(`Could not truncate ${table}:`, err.message);
  }
}

await client.end();
console.log('ALL MOCK/TEST DATA SUCCESSFULLY PURGED FROM DATABASE!');
