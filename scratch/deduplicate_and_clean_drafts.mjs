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

function cleanHtml(text) {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n")
      .trim();
  }
  return text.trim();
}

async function run() {
  const res = await pool.query(`SELECT id, sender, subject, incoming_body FROM atlas_email_drafts ORDER BY created_at DESC`);
  const allDrafts = res.rows;

  console.log(`Found ${allDrafts.length} total drafts in database.`);

  const seen = new Set();
  const toKeep = [];
  const toDelete = [];

  for (const draft of allDrafts) {
    const key = `${(draft.subject || "").trim().toLowerCase()}:::${(draft.sender || "").trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      toKeep.push(draft);
    } else {
      toDelete.push(draft.id);
    }
  }

  console.log(`Unique drafts to keep: ${toKeep.length}. Duplicates to delete: ${toDelete.length}.`);

  for (const id of toDelete) {
    await pool.query(`DELETE FROM atlas_email_drafts WHERE id = $1`, [id]);
  }

  // Now clean incoming_body for each kept draft
  for (const draft of toKeep) {
    const cleaned = cleanHtml(draft.incoming_body);
    await pool.query(`UPDATE atlas_email_drafts SET incoming_body = $1 WHERE id = $2`, [cleaned, draft.id]);
    console.log(`Updated draft [${draft.id}] "${draft.subject}" with clean text (length: ${cleaned.length})`);
    console.log(`Preview: "${cleaned.slice(0, 150)}..."\n`);
  }

  await pool.end();
  console.log("Cleanup and deduplication successfully complete!");
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
