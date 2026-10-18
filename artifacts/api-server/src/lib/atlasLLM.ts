import fs from "fs";
import path from "path";
import OpenAI from "openai";

export interface LLMConfig {
  isConfigured: boolean;
  provider: "deepseek" | "openai" | "custom" | "none";
  model: string;
  client: OpenAI | null;
}

/**
 * Reads an environment variable from process.env, or directly from .env on disk
 * so changes in .env are picked up immediately without requiring a process restart.
 */
function getEnvValue(key: string): string | undefined {
  if (process.env[key] && process.env[key]?.trim()) {
    return process.env[key]?.trim();
  }
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(new RegExp(`^${key}=([^\\r\\n]+)`, "m"));
        if (match && match[1]) {
          const val = match[1].trim().replace(/^["']|["']$/g, "");
          if (val) return val;
        }
      } catch {}
    }
  }
  return undefined;
}

/**
 * Returns the active LLM configuration.
 * Prioritizes DeepSeek if DEEPSEEK_API_KEY is configured,
 * otherwise falls back to OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_API_KEY.
 */
export function getLLMConfig(): LLMConfig {
  const deepseekKey = getEnvValue("DEEPSEEK_API_KEY");
  if (deepseekKey && deepseekKey.trim()) {
    const baseURL = (getEnvValue("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").trim();
    const model = (getEnvValue("DEEPSEEK_MODEL") || "deepseek-chat").trim();
    return {
      isConfigured: true,
      provider: "deepseek",
      model,
      client: new OpenAI({
        apiKey: deepseekKey.trim(),
        baseURL,
      }),
    };
  }

  const openaiKey = getEnvValue("OPENAI_API_KEY") || getEnvValue("AI_INTEGRATIONS_OPENAI_API_KEY");
  if (openaiKey && openaiKey.trim()) {
    const baseURL = (getEnvValue("OPENAI_BASE_URL") || getEnvValue("AI_INTEGRATIONS_OPENAI_BASE_URL") || "https://api.openai.com/v1").trim();
    const model = (getEnvValue("OPENAI_MODEL") || (baseURL.includes("deepseek") ? "deepseek-chat" : "gpt-4o-mini")).trim();
    return {
      isConfigured: true,
      provider: baseURL.includes("deepseek") ? "deepseek" : "openai",
      model,
      client: new OpenAI({
        apiKey: openaiKey.trim(),
        baseURL,
      }),
    };
  }

  return {
    isConfigured: false,
    provider: "none",
    model: "none",
    client: null,
  };
}
