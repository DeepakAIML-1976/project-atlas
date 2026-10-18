import pg from '../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js';
const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://postgres:Ripeace1976%23@db.fiqjwkaoowcfqbenqnxa.supabase.co:5432/postgres' });
await client.connect();
const res = await client.query("SELECT id, incoming_message, twin_draft_response, status FROM atlas_chat_drafts WHERE id = '52692f53-5adf-4565-9117-c57c414d9730'");
console.log('Incoming:', res.rows[0]?.incoming_message);
console.log('Status:', res.rows[0]?.status);
console.log('Twin Response:\n', res.rows[0]?.twin_draft_response);
await client.end();
