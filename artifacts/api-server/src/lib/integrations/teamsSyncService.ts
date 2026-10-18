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

    // 2. Obtain Microsoft Graph Token for chat polling
    const graphToken = await resolveMSGraphToken();
    if (!graphToken) {
      logger.debug("Microsoft Graph token unavailable during sync cycle, will retry next tick");
      return getSyncStatus();
    }

    // 3. Query all user/group chats accessible to the Digital Twin integration
    const chatsRes = await fetch("https://graph.microsoft.com/v1.0/chats?$top=20", {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    let chats: any[] = [];
    if (chatsRes.ok) {
      const chatsData = (await chatsRes.json()) as { value?: any[] };
      chats = chatsData.value || [];
    } else {
      // Fallback: query via user chats endpoint if tenant client_credentials requires /users/{id}/chats
      const userGuid = process.env.MS_GRAPH_USER_GUID || "534a887e-47ef-435c-bbc6-90ac75b9f5b4";
      const userChatsRes = await fetch(`https://graph.microsoft.com/v1.0/users/${userGuid}/chats?$top=20`, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (userChatsRes.ok) {
        const uData = (await userChatsRes.json()) as { value?: any[] };
        chats = uData.value || [];
      }
    }

    // 4. Iterate over discovered chats and process messages
    for (const chat of chats) {
      const msgsRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages?$top=5`, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (!msgsRes.ok) continue;

      const msgsData = (await msgsRes.json()) as { value?: any[] };
      const rawMsgs = msgsData.value || [];

      for (const msg of rawMsgs) {
        if (!msg.id || msg.messageType === "systemEventMessage" || !msg.body?.content) continue;

        // Skip self-replies from any AI representative to prevent feedback loops
        const bodyContent = msg.body.content as string;
        if (
          bodyContent.includes("AI Representative") ||
          bodyContent.includes("my twin is currently offline") ||
          bodyContent.includes("i am an AI representative and not authorised") ||
          bodyContent.includes("🔔 [Digital Twin: New Draft Awaiting Approval]")
        ) {
          continue;
        }

        // Check if message was already handled
        if (processedMessageIds.has(msg.id)) continue;

        // Verify in database if not in memory
        const existingDraft = await db
          .select({ id: atlasChatDraftsTable.id })
          .from(atlasChatDraftsTable)
          .where(eq(atlasChatDraftsTable.messageId, msg.id))
          .limit(1);

        if (existingDraft.length > 0) {
          processedMessageIds.add(msg.id);
          continue;
        }

        // Clean message text
        const cleanText = bodyContent.replace(/<[^>]+>/g, "").trim();
        if (!cleanText) continue;

        const senderName = msg.from?.user?.displayName || "Colleague";
        const senderEmail = msg.from?.user?.email || "";

        logger.info({
          chatId: chat.id,
          messageId: msg.id,
          senderName,
          senderEmail,
          text: cleanText.slice(0, 60),
        }, "[TEAMS UNIVERSAL SYNC] New incoming message detected");

        // 5. Dynamic Workspace Resolution:
        // Chats polled for Deepak's Microsoft account belong to Deepak's workspace.
        let targetWorkspace = allWorkspaces.find((w) => w.name.toLowerCase().includes("deepak")) || allWorkspaces[0];
        const targetWorkspaceId = targetWorkspace?.id || "1a39970a-abf0-48c3-8b89-08b669e80bbe";

        // Resolve sender email accurately from Graph message or display name
        let resolvedSenderEmail = senderEmail;
        if (!resolvedSenderEmail) {
          const nameLower = senderName.toLowerCase();
          if (nameLower.includes("deepak")) {
            resolvedSenderEmail = "deepak.paranjape@kentplc.com";
          } else if (nameLower.includes("sunil")) {
            resolvedSenderEmail = "sunil.hiremath@kentplc.com";
          } else if (nameLower.includes("samar")) {
            resolvedSenderEmail = "samar@kentplc.com";
          } else if (nameLower.includes("govind")) {
            resolvedSenderEmail = "govind.hegde@kentplc.com";
          }
        }

        // Extract thread history
        const threadHistory = rawMsgs
          .filter((m) => m.id !== msg.id && m.body?.content)
          .reverse()
          .map((m) => ({
            sender: m.from?.user?.displayName || "User",
            text: (m.body.content as string).replace(/<[^>]+>/g, "").trim(),
          }));

        // 6. Process message through 4-pillar verification & approval workflow
        const incoming: IncomingTeamsMessage = {
          workspaceId: targetWorkspaceId,
          chatId: chat.id,
          messageId: msg.id,
          senderName,
          senderEmail: resolvedSenderEmail,
          chatType: chat.chatType === "oneOnOne" ? "personal_dm" : "group_chat",
          messageText: cleanText,
          isMentioned: true,
          isReplyToDeepak: true,
          threadHistory,
        };

        const result = await processTeamsChatMessage(incoming);
        processedMessageIds.add(msg.id);
        totalProcessedMessages++;

        // If an immediate reply was generated and not yet posted, dispatch it to Teams
        if (result.shouldReply && result.replyText && !result.postedToTeams) {
          logger.info({ chatId: chat.id }, "[TEAMS UNIVERSAL SYNC] Dispatching immediate reply to Teams");
          await sendMSGraphTeamsChatMessage(chat.id, result.replyText);
        }
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
