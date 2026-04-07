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
 * Fetch a LinkedIn profile page and verify the name matches.
 * Uses AI to fuzzy-match names (handles middle names, abbreviations, etc.)
 */
export async function verifyLinkedInIdentity(
  linkedInUrl: string,
  expectedName: string
): Promise<VerificationResult> {
  try {
    // Fetch the LinkedIn page content
    const fetched = await fetchUrl(linkedInUrl);

    if (!fetched.success || fetched.content.length < 50) {
      // LinkedIn blocks scraping — fall back to AI verification using the URL slug
      return verifyFromUrlSlug(linkedInUrl, expectedName);
    }

    // Use AI to extract the name from the page and compare
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

Consider these as NON-MATCHES:
- Completely different first names (not nicknames)
- Different last names
- Different person entirely

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
    console.warn(`[Identity] Verification failed, defaulting to URL slug check: ${error.message}`);
    return verifyFromUrlSlug(linkedInUrl, expectedName);
  }
}

/**
 * Fallback: verify identity from the LinkedIn URL slug.
 * E.g., linkedin.com/in/john-smith-123 → "john smith"
 */
function verifyFromUrlSlug(
  linkedInUrl: string,
  expectedName: string
): VerificationResult {
  try {
    const url = new URL(linkedInUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // LinkedIn URLs: /in/john-smith-123abc or /in/johnsmith
    const slug = pathParts[pathParts.length - 1] || "";

    // Remove trailing numbers/IDs (e.g., john-smith-123abc → john-smith)
    const cleanSlug = slug.replace(/-[a-f0-9]{4,}$/, "").replace(/-\d+$/, "");

    // Convert slug to name parts: john-smith → ["john", "smith"]
    const slugParts = cleanSlug
      .toLowerCase()
      .split(/[-_]/)
      .filter((p) => p.length > 1);

    // Compare with expected name
    const expectedParts = expectedName
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((p) => p.length > 1);

    // Check if first name and last name appear in the slug
    const firstName = expectedParts[0];
    const lastName = expectedParts[expectedParts.length - 1];

    const firstMatch = slugParts.some((p) => p.includes(firstName) || firstName.includes(p));
    const lastMatch = slugParts.some((p) => p.includes(lastName) || lastName.includes(p));

    const match = firstMatch && lastMatch;

    return {
      match,
      linkedInName: slugParts.join(" "),
      headline: null,
      reason: match
        ? `URL slug "${cleanSlug}" matches expected name "${expectedName}"`
        : `URL slug "${cleanSlug}" does not match expected name "${expectedName}" (first: ${firstMatch}, last: ${lastMatch})`,
    };
  } catch {
    // If all else fails, allow it through with a warning
    return {
      match: true,
      linkedInName: null,
      headline: null,
      reason: "Could not verify — allowing through",
    };
  }
}
