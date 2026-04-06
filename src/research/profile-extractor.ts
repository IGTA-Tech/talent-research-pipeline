// ============================================================
// Profile Extractor — Extract structured talent data from research
// Adapted from mega-visa-generation-paid/app/lib/smart-autofill.ts
// ============================================================

import { callAI, safeJsonParse } from "./ai-client.js";
import type { ExtractedProfile, FetchedUrlData, DiscoveredSource } from "../types.js";

/**
 * Extract a structured professional profile from research data.
 * This is critical — the extracted data becomes the talent profile in O1DMatch.
 */
export async function extractProfile(
  candidateName: string,
  profession: string,
  fetchedContent: FetchedUrlData[],
  discoveredSources: DiscoveredSource[]
): Promise<ExtractedProfile> {
  // Build context from fetched content (top sources by content length)
  const sortedContent = fetchedContent
    .filter((f) => f.success && f.content.length > 50)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 15); // Top 15 sources

  const contentSummary = sortedContent
    .map((f) => `--- SOURCE: ${f.url} (${f.domain}) ---\nTitle: ${f.title}\n${f.content.substring(0, 2000)}`)
    .join("\n\n");

  // Build source summary
  const sourceSummary = discoveredSources
    .map((s) => `- ${s.sourceName}: ${s.keyContent} [${s.criteria.join(", ")}]`)
    .join("\n");

  const prompt = `You are extracting a structured professional profile from research data about ${candidateName} (${profession}).

RESEARCH DATA — FETCHED CONTENT:
${contentSummary}

DISCOVERED SOURCES SUMMARY:
${sourceSummary}

TASK: Extract ALL available information to build a comprehensive professional profile.

OUTPUT JSON (set null for anything NOT clearly found — NEVER guess):
{
  "professionalHeadline": "A compelling 1-line professional headline (e.g. 'Award-winning AI Researcher & Stanford Professor')",
  "currentJobTitle": "Current job title or most recent role",
  "currentEmployer": "Current employer/organization or most recent",
  "industry": "Primary industry (Technology, Healthcare, Finance, Sports, Arts, etc.)",
  "yearsExperience": number or null,
  "skills": ["skill1", "skill2", ...] (extract 5-15 key skills),
  "education": "Highest education level (PhD, Masters, Bachelors, etc.)",
  "university": "University/institution name",
  "fieldOfStudy": "Field of study/major",
  "nationality": "Country of origin if mentioned",
  "city": "Current city if mentioned",
  "state": "Current state/region if mentioned",
  "country": "Current country if mentioned",
  "background": "2-3 paragraph professional background narrative — comprehensive, factual, suitable for a talent profile page. Include career trajectory, key roles, and significance in their field.",
  "achievements": ["Achievement 1 with specific details", "Achievement 2", ...] (ALL notable achievements found),
  "awards": ["Award name - year - granting org", ...] (ALL awards/honors found),
  "publications": ["Publication title - journal/venue - year", ...] (ALL publications found),
  "mediaMetions": ["Publication name - article title - date", ...] (ALL media coverage found),
  "memberships": ["Organization name - role/type", ...] (ALL memberships found),
  "patents": number of patents found or null,
  "publicationsCount": total number of publications or null,
  "hIndex": h-index if found or null,
  "citationsCount": total citations if found or null,
  "confidence": "high/medium/low" based on how much data was found
}

IMPORTANT RULES:
1. Be THOROUGH — extract every detail you can find. This data populates a real talent profile.
2. The "background" narrative should be 2-3 paragraphs, professional, and compelling.
3. The "professionalHeadline" should be attention-grabbing but factual.
4. For skills, extract both technical and domain-specific skills.
5. List ALL achievements, awards, publications, and media mentions found — don't truncate.
6. If you find conflicting information, note the most authoritative source.
7. Set confidence to "high" only if you found substantial data from multiple sources.`;

  try {
    const response = await callAI(prompt, {
      maxTokens: 8192,
      temperature: 0.1, // Low temp for factual extraction
    });

    const result = safeJsonParse<Partial<ExtractedProfile>>(response, {});

    return {
      professionalHeadline: result.professionalHeadline || undefined,
      currentJobTitle: result.currentJobTitle || undefined,
      currentEmployer: result.currentEmployer || undefined,
      industry: result.industry || undefined,
      yearsExperience: result.yearsExperience || undefined,
      skills: Array.isArray(result.skills) ? result.skills : [],
      education: result.education || undefined,
      university: result.university || undefined,
      fieldOfStudy: result.fieldOfStudy || undefined,
      nationality: result.nationality || undefined,
      city: result.city || undefined,
      state: result.state || undefined,
      country: result.country || undefined,
      background: result.background || undefined,
      achievements: Array.isArray(result.achievements) ? result.achievements : [],
      awards: Array.isArray(result.awards) ? result.awards : [],
      publications: Array.isArray(result.publications) ? result.publications : [],
      mediaMetions: Array.isArray(result.mediaMetions) ? result.mediaMetions : [],
      memberships: Array.isArray(result.memberships) ? result.memberships : [],
      patents: result.patents || undefined,
      publicationsCount: result.publicationsCount || undefined,
      hIndex: result.hIndex || undefined,
      citationsCount: result.citationsCount || undefined,
      confidence: result.confidence || "low",
    };
  } catch (error: any) {
    console.error("[Profile Extractor] Error:", error.message);
    return { confidence: "low" };
  }
}
