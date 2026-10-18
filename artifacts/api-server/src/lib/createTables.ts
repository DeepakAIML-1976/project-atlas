import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function ensurePCOSTablesExist() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_socratic_interviews" (
        "id" text PRIMARY KEY,
        "workspace_id" text NOT NULL REFERENCES "atlas_workspaces"("id") ON DELETE CASCADE,
        "interviewer_question" text NOT NULL,
        "sme_answer" text,
        "extracted_knowledge_unit_id" text,
        "status" text NOT NULL DEFAULT 'pending',
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_benchmark_results" (
        "id" text PRIMARY KEY,
        "workspace_id" text NOT NULL REFERENCES "atlas_workspaces"("id") ON DELETE CASCADE,
        "scenario_id" text NOT NULL,
        "scenario_title" text NOT NULL,
        "category" text NOT NULL,
        "sme_expected_decision" text NOT NULL,
        "twin_decision" text NOT NULL,
        "alignment_score" double precision NOT NULL DEFAULT 0.0,
        "provenance_accuracy" double precision NOT NULL DEFAULT 1.0,
        "reasoning_summary" text,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_linked_accounts" (
        "id" text PRIMARY KEY,
        "workspace_id" text NOT NULL REFERENCES "atlas_workspaces"("id") ON DELETE CASCADE,
        "account_type" text NOT NULL,
        "account_email" text NOT NULL,
        "display_name" text,
        "access_token" text,
        "refresh_token" text,
        "tenant_id" text,
        "client_id" text,
        "client_secret" text,
        "sync_enabled" boolean NOT NULL DEFAULT true,
        "last_synced_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `);

    // Ensure owner_email on atlas_twins
    await db.execute(sql`
      ALTER TABLE "atlas_twins" ADD COLUMN IF NOT EXISTS "owner_email" text;
    `);

    // Ensure is_global, unit_type, source_draft_id on atlas_knowledge_units
    await db.execute(sql`
      ALTER TABLE "atlas_knowledge_units" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT false;
      ALTER TABLE "atlas_knowledge_units" ADD COLUMN IF NOT EXISTS "unit_type" text DEFAULT 'heuristic';
      ALTER TABLE "atlas_knowledge_units" ADD COLUMN IF NOT EXISTS "source_draft_id" text;
      CREATE INDEX IF NOT EXISTS "atlas_knowledge_units_global_idx" ON "atlas_knowledge_units" ("is_global");
    `);

    // Ensure atlas_twin_preferences table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_twin_preferences" (
        "id" text PRIMARY KEY,
        "workspace_id" text NOT NULL REFERENCES "atlas_workspaces"("id") ON DELETE CASCADE,
        "owner_email" text NOT NULL,
        "ingestion_keywords" jsonb NOT NULL DEFAULT '["Alky Reactor", "Alky Flare", "5884", "5333"]'::jsonb,
        "allowed_sender_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "excluded_domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "offline_courtesy_message" text NOT NULL DEFAULT 'I am Deepak''s AI Representative, my twin is currently offline, I will make sure your message is replied once he is online.',
        "offline_courtesy_mode" text NOT NULL DEFAULT 'dms_and_mentions',
        "signature" text NOT NULL DEFAULT 'Deepak''s AI Representative',
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "atlas_twin_preferences_ws_owner_unique" UNIQUE ("workspace_id", "owner_email")
      );
      CREATE INDEX IF NOT EXISTS "atlas_twin_preferences_owner_idx" ON "atlas_twin_preferences" ("owner_email");
    `);

    // Ensure atlas_chat_drafts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_chat_drafts" (
        "id" text PRIMARY KEY,
        "workspace_id" text NOT NULL REFERENCES "atlas_workspaces"("id") ON DELETE CASCADE,
        "chat_id" text NOT NULL,
        "message_id" text NOT NULL,
        "sender_name" text NOT NULL,
        "sender_email" text,
        "incoming_message" text NOT NULL,
        "twin_draft_response" text NOT NULL,
        "reasoning" text,
        "confidence" double precision,
        "is_llm_fallback" boolean NOT NULL DEFAULT false,
        "owner_presence_at_arrival" text NOT NULL DEFAULT 'offline',
        "courtesy_notice_sent" boolean NOT NULL DEFAULT false,
        "status" text NOT NULL DEFAULT 'pending_authorization',
        "authorized_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "atlas_chat_drafts_workspace_idx" ON "atlas_chat_drafts" ("workspace_id");
      CREATE INDEX IF NOT EXISTS "atlas_chat_drafts_chat_idx" ON "atlas_chat_drafts" ("chat_id");
    `);

    // Make standard 103 heuristics global so they serve as common engineering brain across all engineers
    await db.execute(sql`
      UPDATE "atlas_knowledge_units" SET "is_global" = true WHERE "is_global" IS NOT TRUE;
    `);

    // Ensure atlas_users table exists for database-driven authentication & consent audit
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "atlas_users" (
        "id" text PRIMARY KEY,
        "email" text NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "display_name" text NOT NULL,
        "role" text NOT NULL DEFAULT 'engineer',
        "encrypted_email_password" text,
        "consent_given" boolean NOT NULL DEFAULT false,
        "consent_given_at" timestamp with time zone,
        "last_login_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "atlas_users_email_idx" ON "atlas_users" ("email");
    `);

    // Seed default SME engineer credentials if not yet present
    const { hashPassword } = await import("./authCrypto");
    const defaultPassword = process.env.DEFAULT_SME_PASSWORD || "KentPiping#2026!";
    const defaultHash = hashPassword(defaultPassword);

    await db.execute(sql`
      INSERT INTO "atlas_users" ("id", "email", "password_hash", "display_name", "role", "consent_given", "consent_given_at")
      VALUES
        ('user_deepak_sme', 'deepak.paranjape@kentplc.com', ${defaultHash}, 'Deepak Paranjape', 'Lead Piping Engineer & Project 5884 SME', true, now()),
        ('user_sunil_hiremath', 'sunil.hiremath@kentplc.com', ${defaultHash}, 'Sunil Hiremath', 'Senior Piping Engineer', true, now())
      ON CONFLICT ("email") DO NOTHING;
    `);

    console.log("PCOS Database tables, atlas_users, and schema migrations ensured successfully!");
  } catch (err) {
    console.warn("Table auto-creation notice:", err);
  }
}
