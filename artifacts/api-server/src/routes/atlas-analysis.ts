import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasActivityTable, atlasSourcesTable } from "@workspace/db";
import { AnalyzeAtlasSourceParams, AnalyzeAtlasSourceBody, AnalyzeAtlasSourceResponse } from "@workspace/api-zod";
import { workspaceContext } from "../lib/atlas";
import { privateFile } from "../lib/atlasStorage";
import { suggestProfileFields } from "../lib/atlasAI";

const router: IRouter = Router();

router.post("/atlas/sources/:sourceId/analyze", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const params = AnalyzeAtlasSourceParams.safeParse(req.params);
  const body = AnalyzeAtlasSourceBody.safeParse(req.body);
  if (!params.success || !body.success || body.data.confirmAnalysis !== true) {
    res.status(400).json({ error: "Confirm analysis of this authorized source" });
    return;
  }
  const [source] = await db.select().from(atlasSourcesTable).where(and(
    eq(atlasSourcesTable.id, params.data.sourceId),
    eq(atlasSourcesTable.workspaceId, context.workspaceId),
    eq(atlasSourcesTable.creatorId, context.userId),
  )).limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  if (!source.permissionConfirmed || !source.profileAnalysisConsent) {
    res.status(403).json({ error: "This source has not been authorized for profile analysis" });
    return;
  }
  let sourceText = source.content ?? "";
  if (source.objectPath) {
    if (!["text/plain", "text/markdown"].includes(source.contentType ?? "")) {
      await db.update(atlasSourcesTable).set({ analysisStatus: "unsupported_format", analysisSuggestions: [] })
        .where(eq(atlasSourcesTable.id, source.id));
      res.json(AnalyzeAtlasSourceResponse.parse({ sourceId: source.id, suggestions: [] }));
      return;
    }
    try {
      const [buffer] = await privateFile(source.objectPath).download();
      sourceText = buffer.toString("utf8");
    } catch {
      res.status(422).json({ error: "Uploaded file could not be read" });
      return;
    }
  }
  if (!sourceText.trim()) {
    res.status(422).json({ error: "The source has no readable text to analyze" });
    return;
  }
  try {
    const suggestions = await suggestProfileFields(sourceText);
    await db.update(atlasSourcesTable).set({ analysisStatus: "suggestions_ready", analysisSuggestions: suggestions })
      .where(and(eq(atlasSourcesTable.id, source.id), eq(atlasSourcesTable.workspaceId, context.workspaceId)));
    await db.insert(atlasActivityTable).values({
      workspaceId: context.workspaceId, userId: context.userId,
      action: "analyzed with consent", recordType: "source", recordId: source.id,
    });
    res.json(AnalyzeAtlasSourceResponse.parse({ sourceId: source.id, suggestions }));
  } catch (error) {
    req.log.error({ err: error }, "Profile analysis failed");
    await db.update(atlasSourcesTable).set({ analysisStatus: "failed", analysisSuggestions: [] })
      .where(eq(atlasSourcesTable.id, source.id));
    res.status(502).json({ error: "Profile analysis failed; no suggestions were applied" });
  }
});

export default router;