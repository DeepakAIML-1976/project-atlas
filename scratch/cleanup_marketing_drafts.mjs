import pg from "file:///C:/Users/dpeng/Documents/Digital-Twin-Suite/lib/db/node_modules/pg/lib/index.js";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query("DELETE FROM atlas_email_drafts WHERE sender ILIKE '%goindigo%' OR sender ILIKE '%astm%' OR sender ILIKE '%pipingtech%';");
console.log(`Cleaned up marketing drafts: ${res.rowCount} rows deleted.`);
const remaining = await client.query("SELECT id, sender, subject, status FROM atlas_email_drafts ORDER BY created_at DESC;");
console.log(`Remaining legitimate work drafts: ${remaining.rows.length}`);
remaining.rows.forEach(r => console.log(`[${r.status}] ${r.sender} | ${r.subject}`));
await client.end();
