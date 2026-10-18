import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load env
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

const WORKSPACE_ID = '1a39970a-abf0-48c3-8b89-08b669e80bbe';
const CREATOR_ID = 'user_deepak_sme';

async function main() {
  console.log('Connecting to PostgreSQL database...');
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  console.log('Reading extracted emails JSON...');
  const rawData = fs.readFileSync('scratch/extracted_kent_emails.json', 'utf8').replace(/^\uFEFF/, '');
  const emails = JSON.parse(rawData);
  console.log(`Loaded ${emails.length} extracted emails.`);

  // Load existing drafts and sources to prevent duplicate insertion
  console.log('Checking existing database records for deduplication...');
  const existingDraftsRes = await client.query(
    'SELECT subject, sender FROM atlas_email_drafts WHERE workspace_id = $1',
    [WORKSPACE_ID]
  );
  const existingDraftSet = new Set(
    existingDraftsRes.rows.map((r) => `${(r.sender || '').toLowerCase()}|||${(r.subject || '').trim().toLowerCase()}`)
  );

  const existingSourcesRes = await client.query(
    'SELECT title FROM atlas_sources WHERE workspace_id = $1 AND kind = $2',
    [WORKSPACE_ID, 'email']
  );
  const existingSourceSet = new Set(
    existingSourcesRes.rows.map((r) => (r.title || '').trim().toLowerCase())
  );

  console.log(`Existing drafts in DB: ${existingDraftSet.size}, Existing email sources in DB: ${existingSourceSet.size}`);

  let insertedSources = 0;
  let insertedDrafts = 0;
  let skippedDuplicates = 0;

  const statsByFolder = { Inbox: 0, 'Sent Items': 0 };
  const statsByKw = { '5333': 0, '5884': 0, 'Alky Reactor': 0, 'Alky Flare': 0 };

  for (const item of emails) {
    const folder = item.folder || 'Inbox';
    const subject = (item.subject || 'No Subject').trim();
    const senderName = (item.senderName || 'Deepak Paranjape').trim();
    const senderEmail = (item.senderEmail || 'Deepak.Paranjape@kentplc.com').trim();
    const sender = `${senderName} <${senderEmail}>`;
    const to = item.to || '';
    const cc = item.cc || '';
    const dateStr = item.date || new Date().toISOString();
    const matchedKws = item.matchedKws || [];
    const body = (item.body || '').trim();

    // Check duplicate
    const draftKey = `${sender.toLowerCase()}|||${subject.toLowerCase()}`;
    const sourceTitle = `[${folder}] [${matchedKws.join(', ')}] ${subject}`;
    const sourceKey = sourceTitle.toLowerCase();

    // Track keywords and folders
    statsByFolder[folder] = (statsByFolder[folder] || 0) + 1;
    for (const kw of matchedKws) {
      statsByKw[kw] = (statsByKw[kw] || 0) + 1;
    }

    let itemSourceDate = new Date();
    try {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        itemSourceDate = parsedDate;
      }
    } catch (_) {}

    // Ingest into atlas_sources (Knowledge Bank)
    if (!existingSourceSet.has(sourceKey)) {
      const sourceId = crypto.randomUUID();
      const content = [
        `Folder: ${folder}`,
        `From: ${sender}`,
        `To: ${to}`,
        `Cc: ${cc}`,
        `Date: ${dateStr}`,
        `Project References: ${matchedKws.join(', ')}`,
        `Subject: ${subject}`,
        '--- Email Body ---',
        body.slice(0, 40000),
      ].join('\n');

      await client.query(
        `INSERT INTO atlas_sources (
          id, workspace_id, creator_id, title, kind, content, content_type,
          source_date, permission_confirmed, profile_analysis_consent,
          analysis_status, analysis_suggestions, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          sourceId,
          WORKSPACE_ID,
          CREATOR_ID,
          sourceTitle.slice(0, 500),
          'email',
          content,
          'text/plain',
          itemSourceDate,
          true,
          true,
          'analyzed',
          JSON.stringify([]),
        ]
      );
      existingSourceSet.add(sourceKey);
      insertedSources++;
    }

    // Ingest into atlas_email_drafts (Email Database & Persona Grounding)
    if (!existingDraftSet.has(draftKey)) {
      const draftId = crypto.randomUUID();
      const isSent = folder === 'Sent Items';
      const draftResponse = isSent
        ? body.slice(0, 20000)
        : `[Kent PLC Inbox Project Email - Reference: ${matchedKws.join(', ')}]`;
      const reasoning = isSent
        ? `Authentic SME writing style & technical response from Deepak Paranjape (Kent PLC Sent Items - ${matchedKws.join(', ')})`
        : `Incoming Kent PLC project correspondence (Keywords: ${matchedKws.join(', ')})`;

      await client.query(
        `INSERT INTO atlas_email_drafts (
          id, workspace_id, sender, subject, incoming_body,
          twin_draft_response, reasoning, confidence, status, authorized_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          draftId,
          WORKSPACE_ID,
          sender.slice(0, 500),
          subject.slice(0, 500),
          body.slice(0, 40000),
          draftResponse,
          reasoning,
          isSent ? 1.0 : 0.95,
          'authorized',
          isSent ? itemSourceDate : null,
          itemSourceDate,
        ]
      );
      existingDraftSet.add(draftKey);
      insertedDrafts++;
    } else {
      skippedDuplicates++;
    }

    if ((insertedSources + insertedDrafts) % 100 === 0 && (insertedSources + insertedDrafts) > 0) {
      console.log(`Progress: Ingested ${insertedSources} sources and ${insertedDrafts} drafts so far...`);
    }
  }

  console.log('\n--- Ingestion Complete ---');
  console.log(`Total Emails Processed: ${emails.length}`);
  console.log(`Sources Ingested: ${insertedSources}`);
  console.log(`Drafts Ingested: ${insertedDrafts}`);
  console.log(`Skipped Duplicates: ${skippedDuplicates}`);
  console.log('Stats by Folder:', statsByFolder);
  console.log('Stats by Keyword:', statsByKw);

  const finalDraftsCount = (await client.query('SELECT count(*) FROM atlas_email_drafts WHERE workspace_id = $1', [WORKSPACE_ID])).rows[0].count;
  const finalSourcesCount = (await client.query('SELECT count(*) FROM atlas_sources WHERE workspace_id = $1', [WORKSPACE_ID])).rows[0].count;
  console.log(`\nFinal Database Counts in Workspace:`);
  console.log(`- atlas_email_drafts: ${finalDraftsCount}`);
  console.log(`- atlas_sources: ${finalSourcesCount}`);

  await client.end();
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
