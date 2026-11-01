import {
  db,
  atlasWorkspacesTable,
  atlasLinkedAccountsTable,
  atlasTwinPreferencesTable,
  atlasChatDraftsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { processTeamsChatMessage, IncomingTeamsMessage } from "./teamsChatBot.js";
import { sendMSGraphTeamsChatMessage, resolveMSGraphToken, getMSGraphConfig } from "./msGraph.js";
import { logger } from "../logger.js";
import fs from "node:fs";
import path from "node:path";

// In-memory set of processed message IDs to minimize DB roundtrips on high-frequency polling
const processedMessageIds = new Set<string>();

export interface SyncStatusResult {
  lastSyncTime: string;
  activeWorkspacesCount: number;
  linkedAccountsCount: number;
  processedCount: number;
  workspaces: Array<{
    id: string;
    name: string;
    ownerEmail?: string;
    ownerIsOnline: boolean;
    linkedAccounts: Array<{ email: string; type: string }>;
  }>;
}

let lastSyncTimestamp = new Date().toISOString();
let totalProcessedMessages = 0;
let isSyncRunning = false;

/**
 * Universal Multi-Workspace Account & Teams Sync Service
 * 
 * Works dynamically across any workspace (Deepak Paranjape, Sunil Hiremath, or future project workspaces).
 */
export async function runTeamsSyncCycle(): Promise<SyncStatusResult> {
  if (isSyncRunning) {
    logger.debug("Teams sync cycle already running, skipping overlapping tick");
    return getSyncStatus();
  }

  isSyncRunning = true;
  try {
    // 1. Fetch all active workspaces
    const allWorkspaces = await db.select().from(atlasWorkspacesTable);
    const allPrefs = await db.select().from(atlasTwinPreferencesTable);
    const allLinkedAccounts = await db.select().from(atlasLinkedAccountsTable);

    // Build lookup maps
    const prefsByWs = new Map(allPrefs.map((p) => [p.workspaceId, p]));
    const accountsByWs = new Map<string, typeof allLinkedAccounts>();

    for (const acc of allLinkedAccounts) {
      const list = accountsByWs.get(acc.workspaceId) || [];
      list.push(acc);
      accountsByWs.set(acc.workspaceId, list);
    }

    // Desktop Teams Application Sync (when running on workstation)
    if (process.platform === "win32") {
      const { syncFromDesktopTeamsApp, checkSystemTasks } = await import("./desktopTeamsParser.js");
      const tasks = checkSystemTasks();
      if (tasks.teams) {
        let targetWorkspace = allWorkspaces.find((w) => w.name.toLowerCase().includes("deepak")) || allWorkspaces[0];
        const targetWorkspaceId = targetWorkspace?.id || "1a39970a-abf0-48c3-8b89-08b669e80bbe";
        const newCount = await syncFromDesktopTeamsApp(targetWorkspaceId);
        totalProcessedMessages += newCount;
      }
    }

    lastSyncTimestamp = new Date().toISOString();
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[TEAMS UNIVERSAL SYNC] Sync tick exception");
  } finally {
    isSyncRunning = false;
  }

  return getSyncStatus();
}

/**
 * Returns current status of multi-workspace Teams synchronization
 */
export async function getSyncStatus(): Promise<SyncStatusResult> {
  const allWorkspaces = await db.select().from(atlasWorkspacesTable);
  const allPrefs = await db.select().from(atlasTwinPreferencesTable);
  const allLinkedAccounts = await db.select().from(atlasLinkedAccountsTable);

  const prefsByWs = new Map(allPrefs.map((p) => [p.workspaceId, p]));
  const accountsByWs = new Map<string, typeof allLinkedAccounts>();

  for (const acc of allLinkedAccounts) {
    const list = accountsByWs.get(acc.workspaceId) || [];
    list.push(acc);
    accountsByWs.set(acc.workspaceId, list);
  }

  return {
    lastSyncTime: lastSyncTimestamp,
    activeWorkspacesCount: allWorkspaces.length,
    linkedAccountsCount: allLinkedAccounts.length,
    processedCount: totalProcessedMessages,
    workspaces: allWorkspaces.map((w) => {
      const pref = prefsByWs.get(w.id);
      const accs = accountsByWs.get(w.id) || [];
      return {
        id: w.id,
        name: w.name,
        ownerEmail: pref?.ownerEmail,
        ownerIsOnline: Boolean(pref?.ownerIsOnline),
        linkedAccounts: accs.map((a) => ({ email: a.accountEmail, type: a.accountType })),
      };
    }),
  };
}

let syncDaemonTimer: NodeJS.Timeout | null = null;

/**
 * Starts continuous background polling for all workspaces
 */
export function startTeamsSyncDaemon(intervalMs = 4000) {
  if (syncDaemonTimer) return;
  logger.info({ intervalMs }, "[TEAMS UNIVERSAL SYNC] Starting background multi-workspace sync daemon");

  // Run initial cycle after brief delay to let tables initialize
  setTimeout(() => {
    runTeamsSyncCycle().catch((e) => logger.warn({ err: e?.message }, "Initial teams sync cycle notice"));
  }, 2000);

  syncDaemonTimer = setInterval(() => {
    runTeamsSyncCycle().catch((e) => logger.warn({ err: e?.message }, "Teams sync cycle tick notice"));
  }, intervalMs);
}

/**
 * Stops continuous background polling
 */
export function stopTeamsSyncDaemon() {
  if (syncDaemonTimer) {
    clearInterval(syncDaemonTimer);
    syncDaemonTimer = null;
    logger.info("[TEAMS UNIVERSAL SYNC] Background sync daemon stopped");
  }
}
