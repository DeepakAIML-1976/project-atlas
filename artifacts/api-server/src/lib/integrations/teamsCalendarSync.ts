import { db, atlasLinkedAccountsTable, atlasLiveMeetingsTable, atlasEmailDraftsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchLiveTeamsMeetings, fetchLiveOutlookEmails, getMSGraphConfig, type MSGraphConfig } from "./msGraph";
import { fetchLiveZoomMeetings } from "./zoom";

export async function syncAllLinkedAccounts(workspaceId: string, userId: string) {
  const linkedAccounts = await db
    .select()
    .from(atlasLinkedAccountsTable)
    .where(
      and(
        eq(atlasLinkedAccountsTable.workspaceId, workspaceId),
        eq(atlasLinkedAccountsTable.syncEnabled, true)
      )
    );

  const results: Array<{
    accountId: string;
    accountType: string;
    accountEmail: string;
    success: boolean;
    syncedMeetingsCount: number;
    syncedEmailsCount: number;
    error?: string;
  }> = [];

  for (const acc of linkedAccounts) {
    let meetingsSynced = 0;
    let emailsSynced = 0;
    let syncError: string | undefined;

    try {
      const customConfig: MSGraphConfig = {
        accessToken: acc.accessToken || undefined,
        clientId: acc.clientId || undefined,
        clientSecret: acc.clientSecret || undefined,
        tenantId: acc.tenantId || undefined,
      };

      if (acc.accountType.startsWith("teams") || acc.accountType.startsWith("outlook")) {
        const teamsRes = await fetchLiveTeamsMeetings(workspaceId, userId, customConfig);
        if (teamsRes.success && "count" in teamsRes && typeof teamsRes.count === "number") {
          meetingsSynced += teamsRes.count;
        }

        const emailRes = await fetchLiveOutlookEmails(workspaceId, userId, customConfig);
        if (emailRes.success && "count" in emailRes && typeof emailRes.count === "number") {
          emailsSynced += emailRes.count;
        }

        if (!teamsRes.success && teamsRes.error) {
          syncError = teamsRes.error;
        }
      } else if (acc.accountType === "zoom") {
        const zoomRes = await fetchLiveZoomMeetings(workspaceId, userId);
        if (zoomRes.success && "count" in zoomRes && typeof zoomRes.count === "number") {
          meetingsSynced += zoomRes.count;
        } else if (zoomRes.error) {
          syncError = zoomRes.error;
        }
      }

      await db
        .update(atlasLinkedAccountsTable)
        .set({ lastSyncedAt: new Date() })
        .where(eq(atlasLinkedAccountsTable.id, acc.id));

      results.push({
        accountId: acc.id,
        accountType: acc.accountType,
        accountEmail: acc.accountEmail,
        success: !syncError,
        syncedMeetingsCount: meetingsSynced,
        syncedEmailsCount: emailsSynced,
        error: syncError,
      });
    } catch (err: any) {
      results.push({
        accountId: acc.id,
        accountType: acc.accountType,
        accountEmail: acc.accountEmail,
        success: false,
        syncedMeetingsCount: 0,
        syncedEmailsCount: 0,
        error: err?.message || "Account sync failed",
      });
    }
  }

  return {
    totalAccounts: linkedAccounts.length,
    results,
    syncedAt: new Date().toISOString(),
  };
}
