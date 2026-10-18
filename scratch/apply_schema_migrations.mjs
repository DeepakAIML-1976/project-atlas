import fs from 'fs';
import path from 'path';

function getEnv() {
  const envText = fs.readFileSync(path.resolve('.env'), 'utf8');
  const env = {};
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim();
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = getEnv();
const pgModule = await import('../lib/db/node_modules/pg/lib/index.js');
const { Client } = pgModule.default;

async function main() {
  console.log('Connecting to PostgreSQL database...');
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  console.log('Applying column migrations to atlas_twins...');
  await client.query(`
    ALTER TABLE atlas_twins ADD COLUMN IF NOT EXISTS owner_email text;
  `);

  console.log('Applying column migrations to atlas_knowledge_units...');
  await client.query(`
    ALTER TABLE atlas_knowledge_units ADD COLUMN IF NOT EXISTS is_global boolean DEFAULT false;
    ALTER TABLE atlas_knowledge_units ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'heuristic';
    ALTER TABLE atlas_knowledge_units ADD COLUMN IF NOT EXISTS source_draft_id text;
    CREATE INDEX IF NOT EXISTS atlas_knowledge_units_global_idx ON atlas_knowledge_units (is_global);
  `);

  console.log('Creating atlas_twin_preferences table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_twin_preferences (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
      owner_email text NOT NULL,
      ingestion_keywords jsonb NOT NULL DEFAULT '["Alky Reactor", "Alky Flare", "5884", "5333"]'::jsonb,
      allowed_sender_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
      excluded_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
      offline_courtesy_message text NOT NULL DEFAULT 'I am Deepak''s AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.',
      offline_courtesy_mode text NOT NULL DEFAULT 'dms_and_mentions',
      signature text NOT NULL DEFAULT 'Deepak''s AI Representative',
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT atlas_twin_preferences_ws_owner_unique UNIQUE (workspace_id, owner_email)
    );
    CREATE INDEX IF NOT EXISTS atlas_twin_preferences_owner_idx ON atlas_twin_preferences (owner_email);
  `);

  console.log('Creating atlas_chat_drafts table...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_chat_drafts (
      id text PRIMARY KEY,
      workspace_id text NOT NULL REFERENCES atlas_workspaces(id) ON DELETE CASCADE,
      chat_id text NOT NULL,
      message_id text NOT NULL,
      sender_name text NOT NULL,
      sender_email text,
      incoming_message text NOT NULL,
      twin_draft_response text NOT NULL,
      reasoning text,
      confidence double precision,
      is_llm_fallback boolean NOT NULL DEFAULT false,
      owner_presence_at_arrival text NOT NULL DEFAULT 'offline',
      courtesy_notice_sent boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'pending_authorization',
      authorized_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS atlas_chat_drafts_workspace_idx ON atlas_chat_drafts (workspace_id);
    CREATE INDEX IF NOT EXISTS atlas_chat_drafts_chat_idx ON atlas_chat_drafts (chat_id);
  `);

  console.log('Updating standard heuristics to is_global = true...');
  await client.query(`
    UPDATE atlas_knowledge_units SET is_global = true WHERE is_global IS NOT TRUE;
  `);

  console.log('Updating primary twin owner_email and display_name...');
  await client.query(`
    UPDATE atlas_twins 
    SET owner_email = 'deepak.paranjape@kentplc.com',
        display_name = 'Deepak''s AI Representative'
    WHERE owner_email IS NULL OR display_name != 'Deepak''s AI Representative';
  `);

  // Initialize Deepak's default preferences if missing
  const wsRes = await client.query(`SELECT id FROM atlas_workspaces LIMIT 1`);
  if (wsRes.rows.length > 0) {
    const wsId = wsRes.rows[0].id;
    const prefCheck = await client.query(`SELECT id FROM atlas_twin_preferences WHERE owner_email = 'deepak.paranjape@kentplc.com'`);
    if (prefCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO atlas_twin_preferences (
          id, workspace_id, owner_email, ingestion_keywords, allowed_sender_emails, excluded_domains,
          offline_courtesy_message, offline_courtesy_mode, signature
        ) VALUES (
          gen_random_uuid()::text,
          $1,
          'deepak.paranjape@kentplc.com',
          '["Alky Reactor", "Alky Flare", "5884", "5333"]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          'I am Deepak''s AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.',
          'dms_and_mentions',
          'Deepak''s AI Representative'
        )
      `, [wsId]);
      console.log('Default preferences initialized for deepak.paranjape@kentplc.com');
    }
  }

  console.log('Verifying tables and columns:');
  const prefCount = (await client.query('SELECT count(*) FROM atlas_twin_preferences')).rows[0].count;
  const chatDraftCount = (await client.query('SELECT count(*) FROM atlas_chat_drafts')).rows[0].count;
  const globalKuCount = (await client.query('SELECT count(*) FROM atlas_knowledge_units WHERE is_global = true')).rows[0].count;
  const twins = (await client.query('SELECT id, owner_email, display_name FROM atlas_twins')).rows;
  
  console.log({
    preferencesCount: prefCount,
    chatDraftsCount: chatDraftCount,
    globalKnowledgeUnitsCount: globalKuCount,
    twins: twins
  });

  await client.end();
  console.log('Migration completed successfully!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
