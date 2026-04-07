// ============================================================
// Identity Verification — Cross-check LinkedIn with sheet name
// ============================================================

import { fetchUrl } from "./url-fetcher.js";
import { callAI, safeJsonParse } from "./ai-client.js";

export interface VerificationResult {
  match: boolean;
  linkedInName: string | null;
  headline: string | null;
  reason: string;
}

/**
 * Verify LinkedIn profile matches the expected candidate.
 *
 * Strategy:
 * 1. Try to fetch LinkedIn page and use AI to compare names
 * 2. If LinkedIn blocks scraping (common), allow through —
 *    the research phases use the LinkedIn URL directly and will
 *    find the correct person's info from it
 *
 * We no longer block on slug-based matching because:
 * - LinkedIn slugs are often abbreviated (fpadovani, lucastfa)
 * - Slug matching caused too many false rejections
 * - The research phases already anchor on the LinkedIn URL
 */
export async function verifyLinkedInIdentity(
  linkedInUrl: string,
  expectedName: string
): Promise<VerificationResult> {
  try {
    // Try to fetch the LinkedIn page
    const fetched = await fetchUrl(linkedInUrl);

    if (!fetched.success || fetched.content.length < 100) {
      // LinkedIn blocked scraping — allow through
      // The research phases will use the LinkedIn URL directly
      console.log(`[Identity] LinkedIn blocked scraping for ${expectedName}, allowing through — research phases will use LinkedIn URL`);
      return {
        match: true,
        linkedInName: null,
        headline: null,
        reason: "LinkedIn blocked scraping — research phases will verify via URL",
      };
    }

    // We got content — use AI to verify the name
    const prompt = `I need to verify if a LinkedIn profile belongs to a specific person.

EXPECTED NAME (from spreadsheet): "${expectedName}"

LINKEDIN PAGE CONTENT:
Title: ${fetched.title}
Content (first 2000 chars): ${fetched.content.substring(0, 2000)}

TASK: Extract the person's name from the LinkedIn page and determine if it matches the expected name.

Consider these as MATCHES:
- "John Smith" matches "John A. Smith" (middle name/initial differences)
- "John Smith" matches "John Smith, PhD" (suffixes)
- "Mohammad Ali" matches "Muhammad Ali" (common name variations)
- "Bob Smith" matches "Robert Smith" (common nicknames)
- First + last name match is sufficient even if middle differs
- Partial names: "Swapnil" matches "Swapnil Manish"

Consider these as NON-MATCHES:
- Completely different first AND last names
- Different person entirely

When in doubt, match. It's better to research and verify later than to skip a valid candidate.

OUTPUT JSON:
{
  "linkedInName": "name found on the LinkedIn page",
  "headline": "professional headline if found",
  "match": true/false,
  "reason": "brief explanation"
}`;

    const result = safeJsonParse<{
      linkedInName?: string;
      headline?: string;
      match?: boolean;
      reason?: string;
    }>(
      await callAI(prompt, { maxTokens: 512, temperature: 0 }),
      {}
    );

    return {
      match: result.match ?? true, // Default to true if AI can't determine
      linkedInName: result.linkedInName || null,
      headline: result.headline || null,
      reason: result.reason || "AI verification",
    };
  } catch (error: any) {
    // On any error, allow through
    console.warn(`[Identity] Verification error for ${expectedName}: ${error.message} — allowing through`);
    return {
      match: true,
      linkedInName: null,
      headline: null,
      reason: `Verification error — allowing through: ${error.message}`,
    };
  }
}
