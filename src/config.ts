// ============================================================
// Configuration and Environment Variables
// ============================================================

import type { SheetConfig } from "./types.js";

/** Get required env var or throw */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Get optional env var with default */
function optionalEnv(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

// ─── AI API Keys ───
export const ANTHROPIC_API_KEY = () => requireEnv("ANTHROPIC_API_KEY");
export const OPENAI_API_KEY = () => optionalEnv("OPENAI_API_KEY");
export const PERPLEXITY_API_KEY = () => requireEnv("PERPLEXITY_API_KEY");

// ─── Supabase (O1DMatch) ───
export const SUPABASE_URL = () => requireEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ─── Google Sheets ───
export const GOOGLE_SERVICE_ACCOUNT_EMAIL = () => optionalEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
export const GOOGLE_PRIVATE_KEY = () => optionalEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

// ─── Import Auth ───
export const IMPORT_SECRET_KEY = () => optionalEnv("IMPORT_SECRET_KEY", "o1dmatch-import-2026");

// ─── Perplexity API ───
export const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

// ─── Sheet Configurations ───
export const SHEET_CONFIGS: Record<string, SheetConfig> = {
  list1: {
    id: "1Y_jOxKf39ZYDcQ0Wg7ZtBYJBKBuaZnk1sNc1m_PgDTM",
    gid: "0",
    name: "Toptal Trial Task Sheet",
    source: "list1",
  },
  list2: {
    id: "1XFAwzcHSh6U-h7PZrveU1bAC6ugMRY1K54VPO5acqPM",
    gid: "184083041",
    name: "Second Toptal List",
    source: "list2",
  },
  list3: {
    id: "1j1I2Y9XxOyN4Z-IrF57fHuKmQE-Ey0mDxRQa1xU0TTU",
    gid: "727908956",
    name: "AI Visa Evaluation Candidates",
    source: "list3",
  },
};

// ─── Rate Limiting ───
export const RATE_LIMITS = {
  perplexity: { requestsPerMinute: 30, delayMs: 2000 },
  claude: { requestsPerMinute: 40, delayMs: 1500 },
  archiveOrg: { requestsPerMinute: 12, delayMs: 5000 },
  urlFetch: { concurrency: 5, delayMs: 500 },
  sheetsWrite: { requestsPerMinute: 20, delayMs: 3000 },
};

// ─── Pipeline Settings ───
export const PIPELINE = {
  maxUrlsToFetch: 40,
  maxUrlsToArchive: 15,
  maxContentLength: 10000,
  candidateConcurrency: 5,
  batchSize: 50,
};
