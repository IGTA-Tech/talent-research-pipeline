// ============================================================
// Google Sheets Writer — Write doc links back to spreadsheet
// ============================================================

import { google } from "googleapis";
import { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_CONFIGS } from "../config.js";

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

/**
 * Get authenticated Google Sheets client
 */
function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const email = GOOGLE_SERVICE_ACCOUNT_EMAIL();
  const key = GOOGLE_PRIVATE_KEY();

  if (!email || !key) {
    throw new Error(
      "Google Sheets write-back requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY env vars. " +
        "Set these up or use manual CSV export instead."
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

/**
 * Update a specific cell range in the Google Sheet.
 * Used to write back doc URLs and status to candidate rows.
 */
export async function updateSheetRow(
  sheetSource: "list1" | "list2" | "list3",
  rowIndex: number, // 1-based row index in data (add 1 for header)
  updates: Record<string, string> // { columnHeader: value }
): Promise<void> {
  try {
    const sheets = getSheetsClient();
    const config = SHEET_CONFIGS[sheetSource];

    // Row in sheet is rowIndex + 1 (for header row) + 1 (sheets are 1-indexed)
    const sheetRow = rowIndex + 1;

    // We'll append data to new columns at the end of the sheet
    // First, get current headers to find or create our columns
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: config.id,
      range: "1:1", // Header row
    });

    const headers = headerResponse.data.values?.[0] || [];

    // For each update, find or create the column
    for (const [columnName, value] of Object.entries(updates)) {
      let colIndex = headers.findIndex(
        (h: string) => h.toLowerCase().trim() === columnName.toLowerCase().trim()
      );

      if (colIndex === -1) {
        // Column doesn't exist — add it
        colIndex = headers.length;
        headers.push(columnName);

        // Write the new header
        const headerCell = columnToLetter(colIndex) + "1";
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.id,
          range: headerCell,
          valueInputOption: "RAW",
          requestBody: { values: [[columnName]] },
        });
      }

      // Write the value
      const cell = columnToLetter(colIndex) + sheetRow;
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.id,
        range: cell,
        valueInputOption: "RAW",
        requestBody: { values: [[value]] },
      });
    }

    console.log(`[Sheets Writer] Updated row ${sheetRow} in ${config.name}`);
  } catch (error: any) {
    console.error(`[Sheets Writer] Failed to update row:`, error.message);
    // Don't throw — sheet write failure shouldn't stop the pipeline
  }
}

/**
 * Convert column index (0-based) to column letter (A, B, ..., Z, AA, AB, ...)
 */
function columnToLetter(colIndex: number): string {
  let letter = "";
  let num = colIndex;
  while (num >= 0) {
    letter = String.fromCharCode((num % 26) + 65) + letter;
    num = Math.floor(num / 26) - 1;
  }
  return letter;
}

/**
 * Batch update multiple rows — more efficient than individual updates
 */
export async function batchUpdateSheet(
  sheetSource: "list1" | "list2" | "list3",
  updates: Array<{ rowIndex: number; data: Record<string, string> }>
): Promise<void> {
  for (const update of updates) {
    await updateSheetRow(sheetSource, update.rowIndex, update.data);
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }
}
