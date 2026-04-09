// ============================================================
// Talent Profile Summary Generator — Comprehensive PDF
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

  // Build source evidence text from fetched content — use more content per source
  const topContent = fetchedContent
    .filter((f) => f.success && f.content.length > 100)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 25)
    .map((f) => `[${f.domain}] ${f.title}:\n${f.content.substring(0, 2500)}`)
    .join("\n\n---\n\n");

  // Build source list
  const sourceList = discoveredSources
    .map((s) => `- [Tier ${s.tier}] ${s.sourceName}: ${s.url} — ${s.keyContent}`)
    .join("\n");

  const systemPrompt = `You are a professional talent profiler creating comprehensive, detailed documents for employer review. Your documents must be THOROUGH and LONG — minimum 3000 words. Every section must have substantial content with specific details, metrics, dates, and citations. Never write brief or generic content. Expand on every point with context and significance.`;

  const prompt = `Generate a COMPREHENSIVE and DETAILED Talent Profile Summary for ${candidateName}.

CRITICAL: This document MUST be at least 3000-4000 words. Each section must have multiple detailed paragraphs. Do NOT write brief summaries — expand every point thoroughly.

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
Primary Criteria: ${profileAnalysis.primaryCriteria?.join(", ") || "Not determined"}
Research Strategy: ${profileAnalysis.researchStrategy || "Comprehensive"}

## ALL DISCOVERED SOURCES:
${sourceList}

## SOURCE CONTENT (from fetched web pages):
${topContent}

---

## DOCUMENT STRUCTURE — WRITE ALL SECTIONS IN FULL DETAIL:

# ${candidateName} — Professional Profile

## Executive Summary
Write 3-4 detailed paragraphs covering:
- Who this person is and their professional identity
- What makes them extraordinary and distinguished in their field
- Their most significant achievements and impact
- Why an employer should be interested in this candidate
- Their career trajectory and current standing

## Professional Background & Career Trajectory
Write 3-4 paragraphs covering:
- Complete career history with dates, companies, and roles
- Progression from early career to current position
- Key transitions and growth milestones
- Industry context for their roles and organizations
- What distinguishes them from peers at similar career stages

## Key Achievements & Impact
Create a detailed numbered list (8-15 items) with:
- Specific achievement description with metrics and dates
- Context for why this achievement is significant
- Impact and outcomes (revenue, users, citations, rankings, etc.)
- Organizations involved and their prestige

## Awards, Honors & Recognition
For each award/honor, write 2-3 sentences covering:
- Award name, year, granting organization
- Selection criteria and competitiveness
- Significance within the field

## Publications, Research & Intellectual Contributions
For each publication, include:
- Full title, journal/venue, year
- Citation count or impact metrics if available
- Brief description of the contribution
- Co-authors and their significance

## Media Coverage & Press
For each media mention, include:
- Publication name (with tier: Major Media, Trade, etc.)
- Article title and date
- Brief description of the coverage
- Why this coverage matters

## Professional Memberships & Leadership Roles
For each membership/role:
- Organization name and its prestige
- Role or membership level
- Selection criteria (what it takes to be admitted)
- Duration of membership

## Technical Skills & Domain Expertise
Organize skills into categories:
- Core technical skills
- Domain-specific expertise
- Leadership and soft skills
- Tools and technologies

## Education & Academic Credentials
For each degree/credential:
- Institution name and its ranking/prestige
- Degree and field of study
- Year of completion
- Notable academic achievements

## Source References
List all sources organized by tier:
### Tier 1 (Major Media & Authoritative Sources)
### Tier 2 (Trade Publications & Industry Sources)
### Tier 3 (Online & Supplementary Sources)

---

CRITICAL WRITING RULES:
1. MINIMUM 3000 words — do NOT write less
2. Be factual and evidence-based — cite sources with URLs where possible
3. Use professional, compelling language suitable for employer review
4. Include specific numbers, dates, metrics, and quantifiable achievements
5. Highlight what makes this person EXTRAORDINARY in their field
6. Every section must have substantial content — no one-liner sections
7. If a section has limited data, write about the context and significance of what IS available
8. Do NOT fabricate information — but DO elaborate on verified facts
9. Use proper Markdown formatting: headers, bullet points, bold for emphasis, numbered lists`;

  const markdownContent = await callAI(prompt, {
    systemPrompt,
    maxTokens: 16384,
    temperature: 0.4,
    quality: "quality",
  });

  return {
    type: "profile_summary",
    title: `${candidateName} - Professional Profile Summary`,
    markdownContent,
  };
}
