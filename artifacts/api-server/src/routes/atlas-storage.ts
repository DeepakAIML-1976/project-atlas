import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, atlasSourcesTable, atlasUploadsTable } from "@workspace/db";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { workspaceContext, requireSharedWrite } from "../lib/atlas";
import { privateFile, reserveUpload } from "../lib/atlasStorage";

const router: IRouter = Router();
const MAX_SIZE = 10 * 1024 * 1024;
const allowed = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context || !requireSharedWrite(context, res)) return;
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, size, contentType } = parsed.data;
  if (size > MAX_SIZE || !allowed.has(contentType)) {
    res.status(400).json({ error: "Choose a PDF, DOCX, Markdown, or text file under 10 MB" });
    return;
  }
  const upload = await reserveUpload();
  await db.insert(atlasUploadsTable).values({
    workspaceId: context.workspaceId,
    userId: context.userId,
    objectPath: upload.objectPath,
    name: name.slice(0, 255),
    size,
    contentType,
  });
  res.json(RequestUploadUrlResponse.parse(upload));
});

router.get("/storage/objects/*objectPath", async (req, res): Promise<void> => {
  const context = await workspaceContext(req, res);
  if (!context) return;
  const raw = req.params.objectPath;
  const suffix = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${suffix}`;
  const [source] = await db
    .select({ id: atlasSourcesTable.id })
    .from(atlasSourcesTable)
    .where(and(
      eq(atlasSourcesTable.workspaceId, context.workspaceId),
      eq(atlasSourcesTable.creatorId, context.userId),
      eq(atlasSourcesTable.objectPath, objectPath),
    ))
    .limit(1);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  try {
    const file = privateFile(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", metadata.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, no-store");
    file.createReadStream().on("error", (error) => {
      req.log.error({ err: error }, "Private object stream failed");
      res.destroy();
    }).pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Private object read failed");
    res.status(404).json({ error: "Object not found" });
  }
});

export default router;