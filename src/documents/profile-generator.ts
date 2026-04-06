// ============================================================
// Talent Profile Summary Generator — 5-8 page comprehensive PDF
// ============================================================

import { callAI } from "../research/ai-client.js";
import type { ResearchResult, GeneratedDocument } from "../types.js";

/**
 * Generate a comprehensive Talent Profile Summary document.
 * This becomes the primary document attached to the talent's profile in O1DMatch.
 */
export async function generateProfileSummary(
  research: ResearchResult
): Promise<GeneratedDocument> {
  const { candidateName, profileAnalysis, discoveredSources, fetchedContent, structuredProfile } = research;

  // Build source evidence text from fetched content
  const topContent = fetchedContent
    .filter((f) => f.success && f.content.length > 100)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 20)
    .map((f) => `[${f.domain}] ${f.title}: ${f.content.substring(0, 1500)}`)
    .join("\n\n");

  // Build source list
  const sourceList = discoveredSources
    .map((s) => `- [Tier ${s.tier}] ${s.sourceName}: ${s.url} — ${s.keyContent}`)
    .join("\n");

  const prompt = `Generate a comprehensive TALENT PROFILE SUMMARY document for ${candidateName}.

This document will be attached to their professional profile visible to employers. It must be thorough, professional, and evidence-based.

## EXTRACTED PROFILE DATA:
- Headline: ${structuredProfile.professionalHeadline || "Not available"}
- Current Role: ${structuredProfile.currentJobTitle || "Not available"} at ${structuredProfile.currentEmployer || "Unknown"}
- Industry: ${structuredProfile.industry || profileAnalysis.domain}
- Experience: ${structuredProfile.yearsExperience || "Unknown"} years
- Education: ${structuredProfile.education || "Unknown"} — ${structuredProfile.university || "Unknown"} (${structuredProfile.fieldOfStudy || ""})
- Skills: ${structuredProfile.skills?.join(", ") || "Not available"}
- Location: ${[structuredProfile.city, structuredProfile.state, structuredProfile.country].filter(Boolean).join(", ") || "Not available"}

## ACHIEVEMENTS:
${structuredProfile.achievements?.map((a) => `- ${a}`).join("\n") || "None extracted"}

## AWARDS & RECOGNITION:
${structuredProfile.awards?.map((a) => `- ${a}`).join("\n") || "None extracted"}

## PUBLICATIONS:
${structuredProfile.publications?.map((p) => `- ${p}`).join("\n") || "None extracted"}

## MEDIA COVERAGE:
${structuredProfile.mediaMetions?.map((m) => `- ${m}`).join("\n") || "None extracted"}

## MEMBERSHIPS:
${structuredProfile.memberships?.map((m) => `- ${m}`).join("\n") || "None extracted"}

## RESEARCH CONTEXT:
Profile Analysis: ${profileAnalysis.levelDescriptor} ${profileAnalysis.role} in ${profileAnalysis.domain}
Total Sources Found: ${discoveredSources.length} (Tier 1: ${research.tier1Count}, Tier 2: ${research.tier2Count}, Tier 3: ${research.tier3Count})

## SOURCE CONTENT:
${topContent}

---

## GENERATE THE DOCUMENT:

Create a professional, comprehensive talent profile document in Markdown format with these sections:

# ${candidateName} — Professional Profile

## Executive Summary
(2-3 paragraphs: Who is this person? What makes them extraordinary? Why should an employer be interested?)

## Professional Background
(Detailed career trajectory, current role, significant positions held)

## Key Achievements & Impact
(Numbered list of most impressive accomplishments with specific details, metrics, and dates where available)

## Awards & Recognition
(All awards, honors, fellowships, rankings with dates and granting organizations)

## Publications & Research
(Publications, conference papers, patents — with titles, venues, dates, citation counts if known)

## Media Coverage & Press
(Articles, interviews, profiles about this person — with publication name, date, and brief description)

## Professional Memberships & Leadership
(Associations, boards, committees, advisory roles)

## Skills & Expertise
(Technical and domain-specific competencies)

## Education & Academic Credentials
(Degrees, institutions, notable academic achievements)

## Source References
(List all sources used, organized by tier)

---

WRITING GUIDELINES:
1. Be factual and evidence-based — cite sources where possible
2. Use professional, compelling language suitable for employer review
3. Include specific numbers, dates, and metrics whenever available
4. Highlight what makes this person EXTRAORDINARY in their field
5. Write 5-8 pages of content (2000-4000 words)
6. Use proper Markdown formatting with headers, bullet points, and emphasis
7. Do NOT fabricate or assume information — only use what is in the provided data`;

  const markdownContent = await callAI(prompt, {
    maxTokens: 16384,
    temperature: 0.3,
  });

  return {
    type: "profile_summary",
    title: `${candidateName} - Professional Profile Summary`,
    markdownContent,
  };
}
