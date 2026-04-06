// ============================================================
// Perplexity 3-Phase Deep Research Engine
// Adapted from mega-visa-generation-paid/app/lib/perplexity-research.ts
// ============================================================

import axios from "axios";
import { PERPLEXITY_API_KEY, PERPLEXITY_API_URL, RATE_LIMITS } from "../config.js";
import type { CandidateInfo, DiscoveredSource, ProfileAnalysis } from "../types.js";
import { sleep } from "./ai-client.js";

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ─── Helper: call Perplexity API ───
async function callPerplexity(
  messages: PerplexityMessage[],
  maxTokens: number = 4000
): Promise<{ content: string; tokens: { input: number; output: number } }> {
  const response = await axios.post<PerplexityResponse>(
    PERPLEXITY_API_URL,
    { model: "sonar", messages, temperature: 0.2, max_tokens: maxTokens },
    {
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY()}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  return {
    content: response.data.choices[0].message.content,
    tokens: {
      input: response.data.usage.prompt_tokens,
      output: response.data.usage.completion_tokens,
    },
  };
}

// ─── Helper: extract JSON sources from response ───
function extractSources(content: string): DiscoveredSource[] {
  try {
    // Try JSON array first
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return filterValidSources(parsed);
    }
    // Try JSON object with sources property
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const parsed = JSON.parse(objectMatch[0]);
      const sources = Array.isArray(parsed) ? parsed : parsed.sources || [];
      return filterValidSources(sources);
    }
  } catch (e) {
    console.warn("[Perplexity] JSON parse error, extracting URLs from text...");
    return extractUrlsFromText(content);
  }
  return [];
}

function filterValidSources(sources: any[]): DiscoveredSource[] {
  return sources
    .filter((s: any) => s && s.url && typeof s.url === "string" && s.url.trim().startsWith("http"))
    .map((s: any) => ({
      url: s.url.trim(),
      title: s.title || s.source_name || "Unknown",
      sourceName: s.source_name || s.sourceName || new URL(s.url).hostname,
      tier: s.tier || 3,
      criteria: Array.isArray(s.criteria) ? s.criteria : [],
      keyContent: s.key_content || s.keyContent || s.description || "",
      datePublished: s.date_published || s.datePublished,
      evidenceType: s.evidence_type || s.evidenceType || "general",
    }));
}

function extractUrlsFromText(text: string): DiscoveredSource[] {
  const urlRegex = /https?:\/\/[^\s\n\])"']+/g;
  const urls = text.match(urlRegex) || [];
  return [...new Set(urls)].map((url) => ({
    url,
    title: "Discovered via text extraction",
    sourceName: new URL(url).hostname,
    tier: 3 as const,
    criteria: [],
    keyContent: "",
    evidenceType: "general",
  }));
}

// ─── Phase 0: Profile Analysis ───
async function analyzeProfile(candidate: CandidateInfo): Promise<ProfileAnalysis> {
  const systemPrompt = `You are an expert talent researcher analyzing professional profiles.

Analyze the candidate's professional identity and determine:
1. Level descriptor (world-class, elite, accomplished, professional, emerging)
2. Domain (field/industry)
3. Role type (researcher, executive, creator, performer, etc.)
4. Specialization (niche area)
5. Primary O-1 criteria this profile naturally supports
6. Secondary criteria (possible but harder)
7. Weak criteria (unlikely for this profile)
8. Best research strategy to discover evidence

Return JSON format.`;

  const userPrompt = `Analyze this talent profile:

**Full Name:** ${candidate.fullName}
**Profession:** ${candidate.profession}
**Field:** ${candidate.field || "Not specified"}
**Country:** ${candidate.nationality || "Not specified"}
**LinkedIn:** ${candidate.linkedInUrl || "Not provided"}
**Background:** ${candidate.background || "Not available"}

Provide a complete professional analysis in JSON:
{
  "title": "professional title",
  "levelDescriptor": "level",
  "domain": "field/domain",
  "role": "role type",
  "specialization": "niche",
  "primaryCriteria": ["criterion1", "criterion2"],
  "secondaryCriteria": ["criterion3"],
  "weakCriteria": ["criterion4"],
  "researchStrategy": "strategy description",
  "evidenceThreshold": "what counts as good evidence"
}`;

  try {
    const { content } = await callPerplexity(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      2000
    );

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || candidate.profession,
        levelDescriptor: parsed.levelDescriptor || parsed.level_descriptor || "professional",
        domain: parsed.domain || candidate.field || candidate.profession,
        role: parsed.role || "professional",
        specialization: parsed.specialization || "general",
        primaryCriteria: parsed.primaryCriteria || parsed.primary_criteria || ["Awards", "Published Material", "Critical Role"],
        secondaryCriteria: parsed.secondaryCriteria || parsed.secondary_criteria || ["Membership", "Original Contributions"],
        weakCriteria: parsed.weakCriteria || parsed.weak_criteria || ["Judging", "Scholarly Articles"],
        researchStrategy: parsed.researchStrategy || parsed.research_strategy || "Comprehensive search",
        evidenceThreshold: parsed.evidenceThreshold || parsed.evidence_threshold || "Demonstrated excellence",
      };
    }
  } catch (error: any) {
    console.warn("[Perplexity] Profile analysis failed, using defaults:", error.message);
  }

  // Default analysis
  return {
    title: candidate.profession,
    levelDescriptor: "professional",
    domain: candidate.field || candidate.profession,
    role: "professional",
    specialization: "general",
    primaryCriteria: ["Awards", "Published Material", "Critical Role"],
    secondaryCriteria: ["Membership", "Original Contributions"],
    weakCriteria: ["Judging", "Scholarly Articles"],
    researchStrategy: "Comprehensive multi-source search",
    evidenceThreshold: "Demonstrated excellence with quantifiable achievements",
  };
}

// ─── Phase 1: Identity & Primary Achievement Discovery ───
async function conductPhase1(
  candidate: CandidateInfo,
  analysis: ProfileAnalysis
): Promise<DiscoveredSource[]> {
  const systemPrompt = `You are an expert talent researcher conducting identity and primary achievement discovery.

Find 8-12 high-quality sources that establish:
1. WHO the person is (identity confirmation)
2. Primary field and specialization
3. Top 1-3 signature achievements
4. Career highlights and timeline

SOURCE QUALITY FRAMEWORK:
- TIER 1 (Gold): Major media (BBC, CNN, NYT, Forbes), official organizations, peer-reviewed journals
- TIER 2 (Strong): Industry publications, regional major outlets, professional databases
- TIER 3 (Supplementary): Niche publications, personal profiles, blogs

CRITICAL:
- Use LinkedIn as a starting point but find EXTERNAL verification
- Wikipedia mining: extract external links, never cite Wikipedia text
- Focus on sources that FEATURE the person, not just mention them

Return results as a JSON array of objects with: url, title, source_name, tier, criteria, key_content, evidence_type`;

  const userPrompt = `Find 8-12 high-quality sources for:

**Name:** ${candidate.fullName}
**Title:** ${analysis.title}
**Field:** ${analysis.domain}
**LinkedIn:** ${candidate.linkedInUrl || "Not provided"}
**Primary Criteria:** ${analysis.primaryCriteria.join(", ")}

${candidate.existingUrls?.length ? `Already known URLs (do NOT duplicate):\n${candidate.existingUrls.join("\n")}` : "No existing URLs."}

Find NEW sources confirming identity and primary achievements.`;

  try {
    const { content } = await callPerplexity(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      4000
    );
    return extractSources(content);
  } catch (error: any) {
    console.error("[Phase 1] Error:", error.message);
    return [];
  }
}

// ─── Phase 2: Criterion-Specific Deep Dive ───
async function conductPhase2(
  candidate: CandidateInfo,
  analysis: ProfileAnalysis,
  phase1Sources: DiscoveredSource[]
): Promise<DiscoveredSource[]> {
  const systemPrompt = `You are an expert talent researcher conducting criterion-specific deep research.

Find 10-15 sources focused on the PRIMARY CRITERIA for this professional.

O-1 VISA EVIDENCE CATEGORIES:
- Awards & Prizes: Nationally/internationally recognized prizes for excellence
- Membership: Elite association membership requiring outstanding achievements
- Published Material: Media coverage ABOUT the person in professional/major publications
- Judging: Participation as judge/reviewer of others' work
- Original Contributions: Patents, innovations, novel methods, significant impact
- Scholarly Articles: Peer-reviewed publications, conference papers, citations
- Critical Role: Senior/essential positions at distinguished organizations
- High Salary: Top-tier compensation compared to peers in the field

INDUSTRY-SPECIFIC SEARCH STRATEGIES:
- Technology: GitHub, Stack Overflow, conference talks, patents, product launches
- Science/Academia: Google Scholar, PubMed, ResearchGate, citation metrics
- Business: Crunchbase, SEC filings, Forbes lists, industry awards
- Sports: Official rankings, competition results, governing body records
- Arts/Entertainment: IMDb, festival selections, critical reviews, box office data

Return results as a JSON array.`;

  const userPrompt = `Find 10-15 criterion-specific sources for:

**Name:** ${candidate.fullName}
**Title:** ${analysis.title}
**Field:** ${analysis.domain}
**Primary Criteria to Target:** ${analysis.primaryCriteria.join(", ")}
**Secondary Criteria:** ${analysis.secondaryCriteria.join(", ")}

Already found ${phase1Sources.length} sources. Find NEW sources supporting specific O-1 criteria.`;

  try {
    const { content } = await callPerplexity(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      5000
    );
    return extractSources(content);
  } catch (error: any) {
    console.error("[Phase 2] Error:", error.message);
    return [];
  }
}

// ─── Phase 3: Media & Recognition Research ───
async function conductPhase3(
  candidate: CandidateInfo,
  analysis: ProfileAnalysis,
  existingSources: DiscoveredSource[]
): Promise<DiscoveredSource[]> {
  const systemPrompt = `You are an expert talent researcher finding media coverage and recognition evidence.

Find 8-12 TIER 1-2 media sources featuring the person.

TIER FRAMEWORK:
- TIER 1 (Gold): BBC, ESPN, CNN, NYT, WSJ, Reuters, Forbes, Bloomberg, Nature, Science
- TIER 2 (Strong): Industry publications, regional major outlets, university press releases
- TIER 3 (Supplementary): Niche sites, blogs, smaller outlets

CRITICAL:
- Better to have 3 Tier 1 sources than 20 Tier 3 sources
- Articles must be ABOUT the person, not just mentioning them
- Include interviews, profiles, feature articles, expert commentary
- Press releases from organizations about the person count
- Conference keynote announcements, award ceremony coverage

Return results as a JSON array.`;

  const userPrompt = `Find 8-12 TIER 1-2 media sources about:

**Name:** ${candidate.fullName}
**Field:** ${analysis.domain}
**Specialization:** ${analysis.specialization}

Already found ${existingSources.length} sources. Find NEW media coverage, interviews, profiles, and recognition.`;

  try {
    const { content } = await callPerplexity(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      4000
    );
    return extractSources(content);
  } catch (error: any) {
    console.error("[Phase 3] Error:", error.message);
    return [];
  }
}

// ─── Main Research Orchestration ───
export async function conductPerplexityResearch(
  candidate: CandidateInfo,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{
  profileAnalysis: ProfileAnalysis;
  discoveredSources: DiscoveredSource[];
  totalSourcesFound: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  criteriaCoverage: string[];
  researchSummary: string;
}> {
  try {
    // Phase 0: Profile Analysis
    onProgress?.("research", 5, "Analyzing professional profile...");
    const profileAnalysis = await analyzeProfile(candidate);
    await sleep(RATE_LIMITS.perplexity.delayMs);

    // Phase 1: Identity & Primary Achievements
    onProgress?.("research", 15, "Phase 1: Discovering identity & achievements...");
    const phase1Sources = await conductPhase1(candidate, profileAnalysis);
    console.log(`[Perplexity] Phase 1: ${phase1Sources.length} sources`);
    await sleep(RATE_LIMITS.perplexity.delayMs);

    // Phase 2: Criterion-Specific Deep Dive
    onProgress?.("research", 30, "Phase 2: Finding criterion-specific evidence...");
    const phase2Sources = await conductPhase2(candidate, profileAnalysis, phase1Sources);
    console.log(`[Perplexity] Phase 2: ${phase2Sources.length} sources`);
    await sleep(RATE_LIMITS.perplexity.delayMs);

    // Phase 3: Media & Recognition
    onProgress?.("research", 45, "Phase 3: Discovering media coverage...");
    const allPrevious = [...phase1Sources, ...phase2Sources];
    const phase3Sources = await conductPhase3(candidate, profileAnalysis, allPrevious);
    console.log(`[Perplexity] Phase 3: ${phase3Sources.length} sources`);

    // Combine and deduplicate
    const allSources = [...phase1Sources, ...phase2Sources, ...phase3Sources];
    const seen = new Set<string>();
    const discoveredSources = allSources.filter((s) => {
      const normalized = s.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    const tier1Count = discoveredSources.filter((s) => s.tier === 1).length;
    const tier2Count = discoveredSources.filter((s) => s.tier === 2).length;
    const tier3Count = discoveredSources.filter((s) => s.tier === 3).length;
    const criteriaCoverage = [...new Set(discoveredSources.flatMap((s) => s.criteria))];

    const researchSummary = `Perplexity 3-phase research discovered ${discoveredSources.length} unique sources:
- Tier 1 (Gold): ${tier1Count} sources
- Tier 2 (Strong): ${tier2Count} sources
- Tier 3 (Supplementary): ${tier3Count} sources
Criteria coverage: ${criteriaCoverage.join(", ") || "None identified"}
Profile: ${profileAnalysis.levelDescriptor} ${profileAnalysis.role} in ${profileAnalysis.domain}`;

    onProgress?.("research", 50, `Discovered ${discoveredSources.length} sources across 3 phases`);

    return {
      profileAnalysis,
      discoveredSources,
      totalSourcesFound: discoveredSources.length,
      tier1Count,
      tier2Count,
      tier3Count,
      criteriaCoverage,
      researchSummary,
    };
  } catch (error: any) {
    console.error("[Perplexity] Research failed:", error.message);
    return {
      profileAnalysis: {
        title: candidate.profession,
        levelDescriptor: "professional",
        domain: candidate.field || candidate.profession,
        role: "professional",
        specialization: "general",
        primaryCriteria: [],
        secondaryCriteria: [],
        weakCriteria: [],
        researchStrategy: "Failed",
        evidenceThreshold: "",
      },
      discoveredSources: [],
      totalSourcesFound: 0,
      tier1Count: 0,
      tier2Count: 0,
      tier3Count: 0,
      criteriaCoverage: [],
      researchSummary: `Research failed: ${error.message}`,
    };
  }
}
