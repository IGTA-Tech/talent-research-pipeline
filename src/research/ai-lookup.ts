// ============================================================
// AI Beneficiary Lookup — Claude-powered initial URL discovery
// Adapted from mega-visa-generation-paid/app/lib/ai-beneficiary-lookup.ts
// ============================================================

import { callAI, safeJsonParse } from "./ai-client.js";
import type { DiscoveredSource } from "../types.js";

export interface LookupResult {
  sources: Array<{
    url: string;
    title: string;
    source: string;
    confidence: "high" | "medium" | "low";
    description: string;
    category: string;
  }>;
  searchStrategy: string;
  totalFound: number;
  verificationData?: {
    likelyCorrectPerson: boolean;
    confidence: "high" | "medium" | "low";
    keyIdentifiers: string[];
    summary: string;
  };
}

/**
 * AI-powered lookup using Claude to discover initial URLs for a candidate.
 * Uses a liberal search strategy to maximize discovery.
 */
export async function lookupCandidate(
  name: string,
  profession: string,
  linkedInUrl?: string
): Promise<LookupResult> {
  const linkedInContext = linkedInUrl
    ? `\nLinkedIn Profile: ${linkedInUrl} (use this as a starting point to verify identity)`
    : "";

  const prompt = `Find 10-15 verifiable URLs about ${name} (${profession}) for professional talent profiling.${linkedInContext}

SEARCH STRATEGY — BE LIBERAL AND THOROUGH:
1. Primary: LinkedIn profile, official websites, company/org pages, university profiles
2. Professional databases: Google Scholar, ResearchGate, ORCID, Crunchbase, GitHub, Stack Overflow
3. Major news: NYT, WSJ, Forbes, Bloomberg, TechCrunch, industry publications
4. Awards/recognition: Industry award sites, conference programs, fellowship announcements
5. Publications: Journal articles, conference papers, patents, books
6. Social/media: Verified social media, YouTube talks/interviews, podcast appearances
7. Government/official: Patent databases, SEC filings, court records (if relevant)

OUTPUT JSON:
{
  "sources": [
    {
      "url": "full URL",
      "title": "page title",
      "source": "site name",
      "confidence": "high/medium/low",
      "description": "1-2 sentence relevance description",
      "category": "profile/news/achievement/publication/media/award/membership/patent"
    }
  ],
  "searchStrategy": "brief approach description",
  "totalFound": number,
  "verificationData": {
    "likelyCorrectPerson": true/false,
    "confidence": "high/medium/low",
    "keyIdentifiers": ["key identifying details"],
    "summary": "2-3 sentence summary of who this person is"
  }
}

CONFIDENCE LEVELS:
- high (90%+): Official, verified, clearly about this person
- medium (70-90%): Likely about this person based on name + profession match
- low (50-70%): Possible match, needs verification

IMPORTANT: Include sources even at 60-70% confidence. Be liberal in search.
We want maximum coverage — we can filter later.`;

  try {
    console.log(`[AI Lookup] Starting for: ${name} (${profession})`);

    const response = await callAI(prompt, {
      maxTokens: 4096,
      temperature: 0.2,
    });

    const result = safeJsonParse<Partial<LookupResult>>(response, {});

    const sources = Array.isArray(result.sources)
      ? result.sources.filter((s) => s.url && s.url.startsWith("http"))
      : [];

    console.log(`[AI Lookup] Found ${sources.length} sources for ${name}`);

    return {
      sources,
      searchStrategy: result.searchStrategy || "Comprehensive multi-source search",
      totalFound: sources.length,
      verificationData: result.verificationData,
    };
  } catch (error: any) {
    console.error(`[AI Lookup] Failed for ${name}:`, error.message);
    return {
      sources: [],
      searchStrategy: "Lookup failed",
      totalFound: 0,
    };
  }
}

/**
 * Convert lookup sources to DiscoveredSource format
 */
export function lookupToDiscoveredSources(result: LookupResult): DiscoveredSource[] {
  return result.sources.map((s) => ({
    url: s.url,
    title: s.title,
    sourceName: s.source,
    tier: s.confidence === "high" ? 1 : s.confidence === "medium" ? 2 : 3,
    criteria: categorizeByO1(s.category, s.description),
    keyContent: s.description,
    evidenceType: s.category || "general",
  }));
}

function categorizeByO1(category: string, description: string): string[] {
  const text = `${category} ${description}`.toLowerCase();
  const criteria: string[] = [];

  if (text.includes("award") || text.includes("prize") || text.includes("honor")) criteria.push("Awards");
  if (text.includes("member") || text.includes("fellow") || text.includes("association")) criteria.push("Membership");
  if (text.includes("news") || text.includes("media") || text.includes("profile") || text.includes("interview")) criteria.push("Published Material");
  if (text.includes("judge") || text.includes("review") || text.includes("panel")) criteria.push("Judging");
  if (text.includes("patent") || text.includes("innovation") || text.includes("contribution")) criteria.push("Original Contributions");
  if (text.includes("publication") || text.includes("journal") || text.includes("paper") || text.includes("author")) criteria.push("Scholarly Articles");
  if (text.includes("executive") || text.includes("director") || text.includes("founder") || text.includes("lead")) criteria.push("Critical Role");
  if (text.includes("salary") || text.includes("compensation") || text.includes("earning")) criteria.push("High Salary");

  return criteria.length > 0 ? criteria : ["General"];
}

/**
 * Deduplicate sources by URL
 */
export function deduplicateSources(sources: DiscoveredSource[]): DiscoveredSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const normalized = s.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
