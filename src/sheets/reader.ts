// ============================================================
// Google Sheets CSV Reader — Fetch and parse candidate data
// ============================================================

import axios from "axios";
import { SHEET_CONFIGS } from "../config.js";
import type { CandidateRow, SheetConfig } from "../types.js";
import { getColumnMap, normalizeRow } from "./column-maps.js";

/**
 * Parse CSV/TSV text handling quoted fields and auto-detecting delimiter
 */
function parseCSV(text: string): string[][] {
  const firstLine = text.split("\n")[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f !== "")) rows.push(currentRow);
        currentRow = [];
        currentField = "";
        if (char === "\r") i++;
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f !== "")) rows.push(currentRow);
  }

  return rows;
}

/**
 * Fetch candidate data from a Google Sheet
 */
export async function fetchSheetData(
  sheetSource: "list1" | "list2" | "list3"
): Promise<CandidateRow[]> {
  const config = SHEET_CONFIGS[sheetSource];
  if (!config) throw new Error(`Unknown sheet source: ${sheetSource}`);

  const csvUrl = `https://docs.google.com/spreadsheets/d/${config.id}/export?format=csv&gid=${config.gid}`;

  console.log(`[Sheets] Fetching ${config.name} from Google Sheets...`);

  let csvText: string;
  try {
    const response = await axios.get(csvUrl, { timeout: 30000 });
    csvText = response.data;
    console.log(`[Sheets] Successfully fetched ${config.name}`);
  } catch (error: any) {
    throw new Error(`Failed to fetch sheet ${config.name}: ${error.message}. Make sure the sheet is publicly accessible.`);
  }

  const allRows = parseCSV(csvText);
  if (allRows.length < 2) {
    console.warn(`[Sheets] Sheet ${config.name} appears empty or has only headers`);
    return [];
  }

  const headers = allRows[0].map((h) => h.toLowerCase().trim());
  const dataRows = allRows.slice(1);
  const columnMap = getColumnMap(sheetSource, headers);

  console.log(`[Sheets] Headers: ${headers.slice(0, 8).join(" | ")}...`);
  console.log(`[Sheets] Total data rows: ${dataRows.length}`);

  const candidates: CandidateRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      const candidate = normalizeRow(row, headers, columnMap, sheetSource, i + 1);
      if (candidate) candidates.push(candidate);
    } catch (error: any) {
      console.warn(`[Sheets] Row ${i + 1} parse error:`, error.message);
    }
  }

  console.log(`[Sheets] Parsed ${candidates.length} valid candidates from ${config.name}`);
  return candidates;
}

/**
 * Fetch candidates from all sheets
 */
export async function fetchAllSheets(): Promise<CandidateRow[]> {
  const allCandidates: CandidateRow[] = [];

  for (const source of ["list3", "list1", "list2"] as const) {
    try {
      const candidates = await fetchSheetData(source);
      allCandidates.push(...candidates);
    } catch (error: any) {
      console.error(`[Sheets] Failed to fetch ${source}:`, error.message);
    }
  }

  // Deduplicate by email
  const seen = new Set<string>();
  const deduped = allCandidates.filter((c) => {
    if (!c.email) return true; // Keep candidates without email (can't dedup)
    const key = c.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Sheets] Total: ${allCandidates.length} rows, ${deduped.length} after dedup`);
  return deduped;
}
