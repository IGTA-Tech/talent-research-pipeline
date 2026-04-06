// ============================================================
// Claude URL Research — Deep evidence discovery with O-1 criteria
// Adapted from mega-visa-generation-paid/app/api/research/generate-urls/route.ts
// ============================================================

import { callAI } from "./ai-client.js";
import type { CandidateInfo, DiscoveredSource, EvidenceCategory } from "../types.js";

// ─── Visa Knowledge Base — O-1A Evidence Categories ───
export const O1A_EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  {
    name: "Awards and Prizes",
    description: "Nationally or internationally recognized awards for excellence",
    searchTerms: ["award winner", "prize recipient", "hall of fame", "champion", "best of", "top"],
  },
  {
    name: "Membership in Associations",
    description: "Membership in associations that require outstanding achievements",
    searchTerms: ["fellow", "member", "association", "elected", "inducted", "board member"],
  },
  {
    name: "Published Material About You",
    description: "Published material in professional or major trade publications about the person",
    searchTerms: ["profile", "interview", "feature article", "article about", "spotlight", "Q&A"],
  },
  {
    name: "Judging or Review",
    description: "Participation as a judge of the work of others in the field",
    searchTerms: ["judge", "peer reviewer", "panelist", "evaluator", "jury", "editorial board"],
  },
  {
    name: "Original Contributions",
    description: "Original scientific, scholarly, athletic, or business-related contributions of major significance",
    searchTerms: ["innovation", "patent", "breakthrough", "pioneered", "developed", "created", "invented"],
  },
  {
    name: "Scholarly Articles",
    description: "Authorship of scholarly articles in professional publications or major media",
    searchTerms: ["author", "published", "journal article", "research paper", "citation", "peer-reviewed"],
  },
  {
    name: "Critical Employment",
    description: "Critical or essential capacity for organizations with distinguished reputation",
    searchTerms: ["executive", "director", "founder", "chief", "lead", "VP", "president", "head of"],
  },
  {
    name: "High Remuneration",
    description: "High salary or remuneration in relation to others in the field",
    searchTerms: ["salary", "compensation", "contract value", "earnings", "revenue", "funding raised"],
  },
];

/**
 * Conduct deep URL research using Claude with O-1 criteria context
 */
export async function conductUrlResearch(
  candidate: CandidateInfo,
  existingUrls: string[] = []
): Promise<{
  urls: string[];
  categorizedUrls: Record<string, { description: string; urls: Array<{ url: string; evidenceValue: string }> }>;
  stats: { totalGenerated: number; validUrls: number; duplicatesRemoved: number };
}> {
  const existingUrlsList = existingUrls.length > 0
    ? existingUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")
    : "None yet";

  const evidenceCategories = O1A_EVIDENCE_CATEGORIES.map((cat) => `- ${cat.name}: ${cat.description}`).join("\n");

  const prompt = `You are an expert talent researcher. Find 20-30 high-quality URLs to document a professional's extraordinary achievements for O-1A visa evidence purposes.

## CANDIDATE INFORMATION:
**Name:** ${candidate.fullName}
**Profession:** ${candidate.profession}
**Field:** ${candidate.field || "Not specified"}
**LinkedIn:** ${candidate.linkedInUrl || "Not provided"}
**Background:** ${candidate.background || "Not available"}

## O-1A EVIDENCE CATEGORIES (need 3 of 8):
${evidenceCategories}

## EXISTING URLs (DO NOT DUPLICATE):
${existingUrlsList}

## YOUR RESEARCH MISSION:

1. **IDENTIFY GAPS** in the existing URLs — which evidence categories need more support
2. **FIND 20-30 NEW URLs** from authoritative sources:
   - Official organizational websites
   - Major media coverage (NYT, Forbes, BBC, Bloomberg, etc.)
   - Professional databases (Google Scholar, USPTO, Crunchbase)
   - Awards and recognition pages
   - Conference programs and keynote announcements
   - Patent databases and publications
   - University and institutional profiles
3. **PRIORITIZE** Tier 1-2 sources that FEATURE the candidate (not just mention)

## OUTPUT FORMAT:
For each URL, use EXACTLY this structure:

### EVIDENCE CATEGORY: [Category Name]
Supporting Criteria: [Which O-1 criterion]
Priority: [HIGH/MEDIUM/LOW]

1. **URL:** https://example.com/article
   **Evidence Value:** What this URL proves about the candidate

IMPORTANT: Provide 20-30 URLs total. DO NOT duplicate existing URLs. Only include publicly accessible URLs.`;

  try {
    console.log(`[URL Research] Starting for ${candidate.fullName}`);

    const responseText = await callAI(prompt, {
      maxTokens: 16000,
      temperature: 0.7, // Higher temp for creative research
    });

    // Extract URLs from response
    const extractedUrls = extractUrlsFromResponse(responseText);

    // Filter out duplicates from existing URLs
    const existingSet = new Set(existingUrls.map((u) => u.toLowerCase()));
    const newUrls = extractedUrls.filter((item) => !existingSet.has(item.url.toLowerCase()));

    // Categorize URLs
    const categorizedUrls = categorizeUrls(newUrls);

    console.log(`[URL Research] Found ${newUrls.length} new URLs for ${candidate.fullName}`);

    return {
      urls: newUrls.map((u) => u.url),
      categorizedUrls,
      stats: {
        totalGenerated: extractedUrls.length,
        validUrls: newUrls.length,
        duplicatesRemoved: extractedUrls.length - newUrls.length,
      },
    };
  } catch (error: any) {
    console.error("[URL Research] Error:", error.message);
    return {
      urls: [],
      categorizedUrls: {},
      stats: { totalGenerated: 0, validUrls: 0, duplicatesRemoved: 0 },
    };
  }
}

// ─── Extract URLs from Claude's structured response ───
function extractUrlsFromResponse(
  responseText: string
): Array<{ url: string; evidenceValue: string; category: string }> {
  const results: Array<{ url: string; evidenceValue: string; category: string }> = [];

  const sections = responseText.split(/###\s+EVIDENCE CATEGORY:/i);

  for (const section of sections) {
    if (!section.trim()) continue;

    const categoryMatch = section.match(/^([^\n]+)/);
    const category = categoryMatch ? categoryMatch[1].trim() : "General";

    const urlPattern = /\*\*URL:\*\*\s*(https?:\/\/[^\s\n]+)/gi;
    const evidencePattern = /\*\*Evidence Value:\*\*\s*([^\n]+)/gi;

    const urls: string[] = [];
    const evidenceValues: string[] = [];

    let match;
    while ((match = urlPattern.exec(section)) !== null) {
      urls.push(match[1].trim().replace(/[.,;)\]]+$/, ""));
    }
    while ((match = evidencePattern.exec(section)) !== null) {
      evidenceValues.push(match[1].trim());
    }

    urls.forEach((url, i) => {
      results.push({ url, evidenceValue: evidenceValues[i] || "Supporting evidence", category });
    });
  }

  // Also try to extract any bare URLs not in the structured format
  const bareUrlRegex = /(?:^|\s)(https?:\/\/[^\s\n\])"'<>]+)/gm;
  let bareMatch;
  const existingUrls = new Set(results.map((r) => r.url.toLowerCase()));
  while ((bareMatch = bareUrlRegex.exec(responseText)) !== null) {
    const url = bareMatch[1].trim().replace(/[.,;)\]]+$/, "");
    if (!existingUrls.has(url.toLowerCase())) {
      existingUrls.add(url.toLowerCase());
      results.push({ url, evidenceValue: "Discovered via research", category: "General" });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return results.filter((item) => {
    const normalized = item.url.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

// ─── Categorize URLs by evidence type ───
function categorizeUrls(
  urls: Array<{ url: string; evidenceValue: string; category: string }>
): Record<string, { description: string; urls: Array<{ url: string; evidenceValue: string }> }> {
  const categorized: Record<string, { description: string; urls: Array<{ url: string; evidenceValue: string }> }> = {};

  O1A_EVIDENCE_CATEGORIES.forEach((cat) => {
    categorized[cat.name] = { description: cat.description, urls: [] };
  });
  categorized["Other Evidence"] = { description: "Additional supporting evidence", urls: [] };

  urls.forEach((item) => {
    const matchingCategory = O1A_EVIDENCE_CATEGORIES.find(
      (cat) =>
        item.category.toLowerCase().includes(cat.name.toLowerCase()) ||
        cat.name.toLowerCase().includes(item.category.toLowerCase().split(" ")[0])
    );

    const categoryName = matchingCategory ? matchingCategory.name : "Other Evidence";
    categorized[categoryName].urls.push({ url: item.url, evidenceValue: item.evidenceValue });
  });

  // Remove empty categories
  for (const key of Object.keys(categorized)) {
    if (categorized[key].urls.length === 0) delete categorized[key];
  }

  return categorized;
}

/**
 * Convert URL research results to DiscoveredSource format
 */
export function urlResearchToSources(
  categorizedUrls: Record<string, { description: string; urls: Array<{ url: string; evidenceValue: string }> }>
): DiscoveredSource[] {
  const sources: DiscoveredSource[] = [];

  for (const [category, data] of Object.entries(categorizedUrls)) {
    for (const urlItem of data.urls) {
      sources.push({
        url: urlItem.url,
        title: urlItem.evidenceValue.substring(0, 100),
        sourceName: new URL(urlItem.url).hostname,
        tier: 2, // Will be reclassified later
        criteria: [category],
        keyContent: urlItem.evidenceValue,
        evidenceType: category,
      });
    }
  }

  return sources;
}
