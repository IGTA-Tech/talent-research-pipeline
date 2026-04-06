// ============================================================
// O-1 Evidence Mapping Generator — Maps evidence to 8 criteria
// ============================================================

import { callAI, safeJsonParse } from "../research/ai-client.js";
import type { ResearchResult, GeneratedDocument, EvidenceMapping } from "../types.js";

/**
 * Generate an O-1 Evidence Mapping document that maps all discovered
 * evidence to the 8 O-1 visa criteria.
 */
export async function generateEvidenceMapping(
  research: ResearchResult
): Promise<{ document: GeneratedDocument; mappings: EvidenceMapping[] }> {
  const { candidateName, profileAnalysis, discoveredSources, fetchedContent, structuredProfile } = research;

  // Build evidence summary
  const evidenceSummary = discoveredSources
    .map((s) => `- [Tier ${s.tier}] ${s.url} — ${s.keyContent} [Criteria: ${s.criteria.join(", ")}]`)
    .join("\n");

  const achievementsList = [
    ...(structuredProfile.achievements || []),
    ...(structuredProfile.awards || []),
    ...(structuredProfile.publications || []),
    ...(structuredProfile.mediaMetions || []),
    ...(structuredProfile.memberships || []),
  ].join("\n- ");

  // First: get structured mappings as JSON
  const mappingPrompt = `Analyze the following evidence for ${candidateName} and map it to the 8 O-1A visa criteria.

CANDIDATE: ${candidateName} — ${structuredProfile.professionalHeadline || profileAnalysis.title}
FIELD: ${profileAnalysis.domain}

DISCOVERED EVIDENCE:
${evidenceSummary}

ACHIEVEMENTS & FACTS:
- ${achievementsList || "None extracted"}

MAP TO THESE 8 O-1A CRITERIA:
1. Awards: Nationally or internationally recognized prizes/awards for excellence
2. Memberships: Membership in associations requiring outstanding achievements
3. Published Material: Published material in professional/major publications ABOUT the person
4. Judging: Participation as judge/reviewer of others' work
5. Original Contributions: Original contributions of major significance to the field
6. Scholarly Articles: Authorship of scholarly articles in professional publications
7. Critical Role: Employment in a critical/essential capacity at distinguished organizations
8. High Salary: High salary or remuneration compared to others in the field

OUTPUT JSON:
{
  "mappings": [
    {
      "criterion": "awards",
      "evidenceFound": [
        {
          "description": "Specific evidence description",
          "sourceUrl": "https://...",
          "sourceTier": 1,
          "confidence": "high"
        }
      ],
      "strength": "strong/moderate/weak/none"
    }
  ],
  "criteriaMetCount": number,
  "overallAssessment": "brief assessment of O-1 readiness",
  "strongestCriteria": ["criterion1", "criterion2"],
  "gaps": ["areas where more evidence is needed"]
}

Map ALL evidence found. Be thorough. Rate each criterion's strength based on the quality and quantity of evidence.`;

  const mappingResponse = await callAI(mappingPrompt, {
    maxTokens: 8192,
    temperature: 0.1,
  });

  const mappingResult = safeJsonParse<{
    mappings?: EvidenceMapping[];
    criteriaMetCount?: number;
    overallAssessment?: string;
    strongestCriteria?: string[];
    gaps?: string[];
  }>(mappingResponse, {});

  const mappings: EvidenceMapping[] = Array.isArray(mappingResult.mappings)
    ? mappingResult.mappings
    : [];

  // Second: generate the readable document
  const docPrompt = `Generate an O-1 Evidence Mapping document for ${candidateName} in Markdown format.

CANDIDATE: ${candidateName} — ${structuredProfile.professionalHeadline || profileAnalysis.title}
FIELD: ${profileAnalysis.domain}
TOTAL SOURCES: ${discoveredSources.length} (Tier 1: ${research.tier1Count}, Tier 2: ${research.tier2Count}, Tier 3: ${research.tier3Count})

EVIDENCE MAPPINGS:
${JSON.stringify(mappings, null, 2)}

OVERALL ASSESSMENT: ${mappingResult.overallAssessment || "Pending review"}
STRONGEST CRITERIA: ${mappingResult.strongestCriteria?.join(", ") || "Unknown"}
GAPS: ${mappingResult.gaps?.join(", ") || "None identified"}

---

Generate a professional document with these sections:

# ${candidateName} — O-1A Evidence Mapping

## Overview
(Brief summary: How many criteria have evidence? Overall O-1 readiness?)

## Criteria Coverage Summary
(Table or list showing each criterion with strength rating: Strong/Moderate/Weak/None)

## Detailed Evidence by Criterion

### 1. Awards & Prizes
(List all evidence found, with source URLs and tier classification)
**Strength: [Strong/Moderate/Weak/None]**

### 2. Membership in Associations
...

### 3. Published Material About the Candidate
...

### 4. Judging / Peer Review
...

### 5. Original Contributions
...

### 6. Scholarly Articles
...

### 7. Critical Role at Distinguished Organizations
...

### 8. High Salary / Remuneration
...

## Overall Assessment
(2-3 paragraphs: O-1 readiness, strongest areas, gaps to fill, recommendations)

## All Sources Referenced
(Complete list of all URLs organized by tier)

---

FORMATTING:
- Use proper Markdown with headers and bullet points
- Include specific source URLs for each piece of evidence
- Mark evidence confidence (high/medium/low) where applicable
- Be factual — only report what is actually found, not assumed
- 3-5 pages of content`;

  const markdownContent = await callAI(docPrompt, {
    maxTokens: 12288,
    temperature: 0.3,
  });

  return {
    document: {
      type: "evidence_mapping",
      title: `${candidateName} - O-1 Evidence Mapping`,
      markdownContent,
    },
    mappings,
  };
}
