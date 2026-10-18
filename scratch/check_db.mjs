import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query("SELECT id, workspace_id, sender, subject, status FROM atlas_email_drafts ORDER BY created_at DESC LIMIT 10;");
console.log(`Found ${res.rows.length} email drafts in database:`);
res.rows.forEach(r => console.log(`[${r.status}] (ws: ${r.workspace_id}) From: ${r.sender} | Subject: ${r.subject}`));
await client.end();
