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

    console.log("PCOS Database tables ensured successfully!");
  } catch (err) {
    console.warn("Table auto-creation notice:", err);
  }
}
