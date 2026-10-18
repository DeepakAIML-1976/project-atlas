import crypto from "node:crypto";

export const pkceStore = new Map<string, { verifier: string; createdAt: number }>();

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  pkceStore.set(state, { verifier, createdAt: Date.now() });

  // Clean old entries (> 30 mins)
  const now = Date.now();
  for (const [s, data] of pkceStore.entries()) {
    if (now - data.createdAt > 30 * 60 * 1000) {
      pkceStore.delete(s);
    }
  }

  return { verifier, challenge, state };
}

export function getPkceVerifier(state: string): string | undefined {
  const entry = pkceStore.get(state);
  if (entry) {
    pkceStore.delete(state);
    return entry.verifier;
  }
  return undefined;
}
