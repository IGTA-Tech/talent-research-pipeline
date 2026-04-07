// ============================================================
// Column Mapping — Normalize different sheet formats
// ============================================================

import type { CandidateRow } from "../types.js";

export interface ColumnMap {
  name: number | null;
  firstName: number | null;
  lastName: number | null;
  email: number | null;
  linkedInUrl: number | null;
  profession: number | null;
  field: number | null;
  industry: number | null;
  phone: number | null;
  country: number | null;
  score: number | null;
  researchStatus: number | null;
  profileDocUrl: number | null;
  evidenceDocUrl: number | null;
}

/**
 * Build a column index map from headers.
 * Uses fuzzy matching to handle variations in column names.
 */
export function getColumnMap(
  sheetSource: "list1" | "list2" | "list3",
  headers: string[]
): ColumnMap {
  // Build header lookup (index by lowercase header name)
  const findCol = (...names: string[]): number | null => {
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        h.includes(name.toLowerCase())
      );
      if (idx !== -1) return idx;
    }
    return null;
  };

  return {
    name: findCol("full name", "name", "candidate name", "beneficiary"),
    firstName: findCol("first name", "first_name", "firstname"),
    lastName: findCol("last name", "last_name", "lastname"),
    email: findCol("email", "e-mail", "email address"),
    linkedInUrl: findCol("linkedin", "linked in", "linkedin url", "profile url", "link"),
    profession: findCol("profession", "title", "job title", "role", "occupation", "position"),
    field: findCol("field", "specialty", "specialization", "area"),
    industry: findCol("industry", "sector", "domain"),
    phone: findCol("phone", "telephone", "mobile"),
    country: findCol("country", "nationality", "location", "origin"),
    score: findCol("score", "evaluation", "rating", "percentage", "result"),
    researchStatus: findCol("research status", "research_status", "status"),
    profileDocUrl: findCol("profile doc url", "profile_doc_url", "profile doc"),
    evidenceDocUrl: findCol("evidence doc url", "evidence_doc_url", "evidence doc"),
  };
}

/**
 * Normalize a spreadsheet row into a CandidateRow.
 * Returns null if the row lacks minimum required data (name).
 */
export function normalizeRow(
  row: string[],
  headers: string[],
  columnMap: ColumnMap,
  sheetSource: "list1" | "list2" | "list3",
  rowIndex: number
): CandidateRow | null {
  const get = (idx: number | null): string => {
    if (idx === null || idx >= row.length) return "";
    return (row[idx] || "").trim();
  };

  // Get name — try full name first, then first + last
  let name = get(columnMap.name);
  if (!name) {
    const first = get(columnMap.firstName);
    const last = get(columnMap.lastName);
    name = [first, last].filter(Boolean).join(" ");
  }

  if (!name) return null; // Name is required

  // Get email — handle multiple emails separated by / or , or ;
  const rawEmail = get(columnMap.email);
  const validEmail = extractFirstEmail(rawEmail);

  // Get LinkedIn URL — handle JSON arrays, multiple URLs, etc.
  let linkedInUrl = get(columnMap.linkedInUrl);
  linkedInUrl = extractLinkedInUrl(linkedInUrl);

  // Get score (for list3 filtering)
  const scoreStr = get(columnMap.score);
  let existingScore: number | undefined;
  if (scoreStr) {
    const parsed = parseFloat(scoreStr.replace("%", "").replace("/100", ""));
    if (!isNaN(parsed)) existingScore = parsed;
  }

  // For list3, skip candidates with score <= 35%
  if (sheetSource === "list3" && existingScore !== undefined && existingScore <= 35) {
    return null;
  }

  return {
    sheetSource,
    rowIndex,
    name,
    email: validEmail,
    linkedInUrl: linkedInUrl || undefined,
    profession: get(columnMap.profession) || undefined,
    field: get(columnMap.field) || undefined,
    industry: get(columnMap.industry) || undefined,
    phone: get(columnMap.phone) || undefined,
    country: get(columnMap.country) || undefined,
    existingScore,
    researchStatus: get(columnMap.researchStatus) || undefined,
    profileDocUrl: get(columnMap.profileDocUrl) || undefined,
    evidenceDocUrl: get(columnMap.evidenceDocUrl) || undefined,
  } as CandidateRow;
}

/**
 * Extract a clean LinkedIn URL from messy cell data.
 * Handles: JSON arrays, comma-separated URLs, bare URLs, etc.
 */
function extractLinkedInUrl(raw: string): string {
  if (!raw) return "";

  // Try to parse as JSON array (e.g. ["url1","url2"])
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const linkedin = parsed.find((u: string) => typeof u === "string" && u.includes("linkedin.com"));
      if (linkedin) return linkedin.trim();
      // Return first URL if no LinkedIn found
      return parsed[0]?.trim() || "";
    }
  } catch {
    // Not JSON — continue
  }

  // Try to find LinkedIn URL in the text
  const linkedinMatch = raw.match(/https?:\/\/[^\s,"'\]]*linkedin\.com[^\s,"'\]]*/i);
  if (linkedinMatch) return linkedinMatch[0].trim();

  // Try to find any URL
  const urlMatch = raw.match(/https?:\/\/[^\s,"'\]]+/);
  if (urlMatch) return urlMatch[0].trim();

  // If it looks like a LinkedIn path without protocol
  if (raw.includes("linkedin.com")) return `https://${raw.trim()}`;

  return "";
}

/**
 * Extract the first valid email from messy cell data.
 * Handles: "email1/email2", "email1, email2", "email1; email2"
 */
function extractFirstEmail(raw: string): string | undefined {
  if (!raw) return undefined;

  // Split on common separators
  const parts = raw.split(/[\/,;|]+/);

  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed.includes("@") && trimmed.includes(".")) {
      return trimmed;
    }
  }

  return undefined;
}
