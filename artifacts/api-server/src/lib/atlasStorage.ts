import { randomUUID } from "crypto";
import { Storage } from "@google-cloud/storage";

const sidecar = "http://127.0.0.1:1106";
const client = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecar}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateLocation() {
  const raw = process.env.PRIVATE_OBJECT_DIR;
  if (!raw) throw new Error("Private object storage is not configured");
  const [bucket, ...directory] = raw.replace(/^\/|\/$/g, "").split("/");
  if (!bucket) throw new Error("Invalid private object storage path");
  return { bucket, prefix: directory.join("/") };
}

export async function reserveUpload() {
  const { bucket, prefix } = privateLocation();
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${randomUUID()}`;
  const response = await fetch(`${sidecar}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Unable to reserve upload (${response.status})`);
  const result = await response.json() as { signed_url?: string };
  if (!result.signed_url) throw new Error("Upload service returned no URL");
  return { uploadURL: result.signed_url, objectPath: `/objects/uploads/${objectName.split("/").at(-1)}` };
}

export function privateFile(path: string) {
  if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/.test(path)) throw new Error("Invalid object path");
  const { bucket, prefix } = privateLocation();
  return client.bucket(bucket).file(`${prefix ? `${prefix}/` : ""}${path.slice("/objects/".length)}`);
}