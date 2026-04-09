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

  // Build fetched content for context
  const topContent = (research.fetchedContent || [])
    .filter((f) => f.success && f.content.length > 100)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 15)
    .map((f) => `[${f.domain}]: ${f.content.substring(0, 1500)}`)
    .join("\n\n");

  // First: get structured mappings as JSON
  const mappingPrompt = `Analyze the following evidence for ${candidateName} and map it to the 8 O-1A visa criteria.

CANDIDATE: ${candidateName} — ${structuredProfile.professionalHeadline || profileAnalysis.title}
FIELD: ${profileAnalysis.domain}

DISCOVERED EVIDENCE (${discoveredSources.length} sources):
${evidenceSummary}

ACHIEVEMENTS & FACTS:
- ${achievementsList || "None extracted"}

FETCHED SOURCE CONTENT:
${topContent}

MAP TO THESE 8 O-1A CRITERIA:
1. Awards: Nationally or internationally recognized prizes/awards for excellence
2. Memberships: Membership in associations requiring outstanding achievements
3. Published Material: Published material in professional/major publications ABOUT the person
4. Judging: Participation as judge/reviewer of others' work
5. Original Contributions: Original contributions of major significance to the field
6. Scholarly Articles: Authorship of scholarly articles in professional publications
7. Critical Role: Employment in a critical/essential capacity at distinguished organizations
8. High Salary: High salary or remuneration compared to others in the field

IMPORTANT: Only map evidence that is ACTUALLY FOUND and VERIFIED. Do not fabricate evidence or URLs. If a criterion has no evidence, mark it as "none". Be honest about what was and wasn't found.

OUTPUT JSON:
{
  "mappings": [
    {
      "criterion": "awards",
      "evidenceFound": [
        {
          "description": "Specific evidence description with details",
          "sourceUrl": "https://actual-url-from-research",
          "sourceTier": 1,
          "confidence": "high"
        }
      ],
      "strength": "strong/moderate/weak/none"
    }
  ],
  "criteriaMetCount": number,
  "overallAssessment": "detailed assessment of O-1 readiness (3-4 sentences)",
  "strongestCriteria": ["criterion1", "criterion2"],
  "gaps": ["specific areas where more evidence is needed"]
}

Map ALL evidence found. Be thorough but HONEST. Rate each criterion's strength based on VERIFIED evidence only.`;

  const mappingResponse = await callAI(mappingPrompt, {
    maxTokens: 8192,
    temperature: 0.1,
    quality: "quality",
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
  const docSystemPrompt = `You are an immigration evidence analyst creating detailed O-1 visa evidence mapping documents. Your documents must be THOROUGH — minimum 2000 words. Every criterion must have a detailed analysis even if no evidence was found (explain what would be needed). Be factual and honest about evidence quality.`;

  const docPrompt = `Generate a DETAILED O-1 Evidence Mapping document for ${candidateName} in Markdown format.

CRITICAL: This document MUST be at least 2000-3000 words. Each criterion section needs 2-3 paragraphs minimum.

CANDIDATE: ${candidateName} — ${structuredProfile.professionalHeadline || profileAnalysis.title}
FIELD: ${profileAnalysis.domain}
TOTAL SOURCES: ${discoveredSources.length} (Tier 1: ${research.tier1Count}, Tier 2: ${research.tier2Count}, Tier 3: ${research.tier3Count})

EVIDENCE MAPPINGS:
${JSON.stringify(mappings, null, 2)}

OVERALL ASSESSMENT: ${mappingResult.overallAssessment || "Pending review"}
STRONGEST CRITERIA: ${mappingResult.strongestCriteria?.join(", ") || "Unknown"}
GAPS: ${mappingResult.gaps?.join(", ") || "None identified"}
CRITERIA MET: ${mappingResult.criteriaMetCount || 0} of 8 (need 3 for O-1A)

---

## DOCUMENT STRUCTURE — WRITE ALL SECTIONS IN FULL DETAIL:

# ${candidateName} — O-1A Visa Evidence Mapping

## Executive Overview
Write 2-3 paragraphs:
- Summary of O-1 readiness (how many criteria met out of 8, need 3)
- Strongest evidence areas
- Key gaps and recommendations
- Overall assessment with honest confidence level

## Criteria Coverage Summary
Create a clear table/list:
| Criterion | Strength | Evidence Count | Key Evidence |
For all 8 criteria.

## Detailed Evidence Analysis by Criterion

### 1. Awards & Prizes (Nationally/Internationally Recognized)
Write 2-3 paragraphs:
- List all evidence found with source URLs
- Assess the prestige and recognition level of each award
- USCIS standard: Must be nationally or internationally recognized
- If no evidence: explain what type of awards would strengthen this criterion
**Strength Rating: [Strong/Moderate/Weak/None]**

### 2. Membership in Selective Associations
Write 2-3 paragraphs with same detail level...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 3. Published Material About the Candidate
Write 2-3 paragraphs — focus on tier of publications, whether articles are ABOUT the person...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 4. Judging / Peer Review Activity
Write 2-3 paragraphs...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 5. Original Contributions of Major Significance
Write 2-3 paragraphs — patents, innovations, methods, products with impact...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 6. Scholarly Articles & Publications
Write 2-3 paragraphs — publication count, venues, citations, h-index...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 7. Critical/Essential Role at Distinguished Organizations
Write 2-3 paragraphs — role seniority, organization prestige, why role is critical...
**Strength Rating: [Strong/Moderate/Weak/None]**

### 8. High Salary / Remuneration
Write 2-3 paragraphs — compensation evidence relative to field peers...
**Strength Rating: [Strong/Moderate/Weak/None]**

## Overall O-1A Readiness Assessment
Write 3-4 paragraphs:
- Definitive assessment: Ready / Needs More Evidence / Unlikely
- Strongest areas with specific evidence cited
- Specific gaps that need to be filled
- Actionable recommendations for strengthening the case
- Comparison to typical successful O-1A petitions in this field

## Evidence Quality Assessment
- How many Tier 1 vs Tier 2 vs Tier 3 sources
- Reliability of the evidence found
- Areas where evidence needs independent verification

## All Sources Referenced
### Tier 1 (Major Media & Authoritative)
### Tier 2 (Trade & Industry)
### Tier 3 (Online & Supplementary)

---

CRITICAL WRITING RULES:
1. MINIMUM 2000 words — every section must be substantial
2. Be HONEST about evidence quality — don't inflate weak evidence
3. Include specific source URLs for every piece of evidence cited
4. Each criterion section needs 2-3 paragraphs even if evidence is weak/none
5. For weak criteria, explain what evidence WOULD be needed
6. Use proper Markdown: headers, bold, bullet points, tables
7. Do NOT fabricate evidence — only reference what was actually found`;

  const markdownContent = await callAI(docPrompt, {
    systemPrompt: docSystemPrompt,
    maxTokens: 16384,
    temperature: 0.4,
    quality: "quality",
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
