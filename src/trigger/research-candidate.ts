// ============================================================
// Task: research-candidate — Core research pipeline per candidate
// ============================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import type {
  ResearchCandidatePayload,
  CandidateInfo,
  ResearchResult,
  DiscoveredSource,
  GenerateDocumentsPayload,
} from "../types.js";
import { PIPELINE } from "../config.js";
import { conductPerplexityResearch } from "../research/perplexity-research.js";
import { lookupCandidate, lookupToDiscoveredSources, deduplicateSources } from "../research/ai-lookup.js";
import { verifyLinkedInIdentity } from "../research/identity-verify.js";
import { conductUrlResearch, urlResearchToSources } from "../research/url-research.js";
import { fetchMultipleUrls, classifyUrlTier } from "../research/url-fetcher.js";
import { archiveMultipleUrls } from "../research/archive-org.js";
import { extractProfile } from "../research/profile-extractor.js";
import { generateProfileSummary } from "../documents/profile-generator.js";
import { generateEvidenceMapping } from "../documents/evidence-generator.js";
import { buildPdf } from "../documents/pdf-builder.js";
import { uploadCandidatePdfs, getAdminClient } from "../storage/supabase.js";
import { updateSheetRow } from "../sheets/writer.js";
import { sleep } from "../research/ai-client.js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config.js";
import { createClient } from "@supabase/supabase-js";

export const researchCandidate = task({
  id: "research-candidate",
  queue: { concurrencyLimit: 20 },
  machine: { preset: "medium-1x" },
  retry: { maxAttempts: 3 },

  run: async (payload: ResearchCandidatePayload) => {
    const { candidate, sheetSource } = payload;
    const candidateName = candidate.name;

    logger.info(`Starting research for: ${candidateName}`, {
      email: candidate.email,
      profession: candidate.profession,
      linkedIn: candidate.linkedInUrl,
    });

    // ═══════════════════════════════════════════
    // CHECK: Already processed in O1DMatch?
    // ═══════════════════════════════════════════
    if (candidate.email) {
      const supabase = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: existingProfile } = await supabase
        .from("talent_profiles")
        .select("id, first_name, last_name")
        .eq("email", candidate.email.toLowerCase())
        .single();

      if (existingProfile) {
        logger.info(`Skipping ${candidateName} — already exists in O1DMatch as ${existingProfile.first_name} ${existingProfile.last_name}`);
        // Mark as completed in sheet so schedule doesn't retry
        try {
          await updateSheetRow(sheetSource, candidate.rowIndex, {
            "Research Status": "completed",
            "Research Date": new Date().toISOString().split("T")[0],
          });
        } catch {}
        return {
          candidateName,
          email: candidate.email,
          sheetSource,
          rowIndex: candidate.rowIndex,
          skipped: true,
          skipReason: "Already exists in O1DMatch",
        };
      }
    }

    // ─── Build CandidateInfo ───
    const candidateInfo: CandidateInfo = {
      fullName: candidateName,
      profession: candidate.profession || "Professional",
      field: candidate.field || candidate.industry,
      linkedInUrl: candidate.linkedInUrl,
      nationality: candidate.country,
      existingUrls: candidate.linkedInUrl ? [candidate.linkedInUrl] : [],
    };

    // ═══════════════════════════════════════════
    // PHASE 0: Verify LinkedIn identity
    // ═══════════════════════════════════════════
    if (candidate.linkedInUrl) {
      logger.info("Phase 0: Verifying LinkedIn identity...");
      const verification = await verifyLinkedInIdentity(candidate.linkedInUrl, candidateName);

      if (!verification.match) {
        logger.warn(`Identity mismatch for ${candidateName}`, {
          linkedInName: verification.linkedInName,
          sheetName: candidateName,
          reason: verification.reason,
        });

        // Skip this candidate — wrong person. Write to sheet so it's visible.
        try {
          await updateSheetRow(sheetSource, candidate.rowIndex, {
            "Research Status": "skipped - identity mismatch",
            "Research Date": new Date().toISOString().split("T")[0],
          });
        } catch {}
        return {
          candidateName,
          email: candidate.email,
          sheetSource,
          rowIndex: candidate.rowIndex,
          skipped: true,
          skipReason: `LinkedIn name "${verification.linkedInName}" does not match sheet name "${candidateName}". ${verification.reason}`,
        };
      }

      logger.info(`Identity verified: LinkedIn "${verification.linkedInName}" matches "${candidateName}"`);

      // Use LinkedIn data to enrich candidate info
      if (verification.headline) {
        candidateInfo.profession = verification.headline;
      }
    }

    // ═══════════════════════════════════════════
    // PHASE 1: AI Lookup (Claude) — 10-15 URLs
    // ═══════════════════════════════════════════
    logger.info("Phase 1: AI Lookup...");
    const lookupResult = await lookupCandidate(
      candidateInfo.fullName,
      candidateInfo.profession,
      candidateInfo.linkedInUrl
    );
    const lookupSources = lookupToDiscoveredSources(lookupResult);
    logger.info(`AI Lookup found ${lookupSources.length} sources`);

    if (lookupResult.verificationData) {
      logger.info("Verification:", {
        likelyCorrect: lookupResult.verificationData.likelyCorrectPerson,
        confidence: lookupResult.verificationData.confidence,
        summary: lookupResult.verificationData.summary,
      });
    }

    await sleep(2000);

    // ═══════════════════════════════════════════
    // PHASE 2: Perplexity 3-Phase Research — 30-50 URLs
    // ═══════════════════════════════════════════
    logger.info("Phase 2: Perplexity 3-phase research...");
    const perplexityResult = await conductPerplexityResearch(candidateInfo, (stage, progress, message) => {
      logger.info(`[${stage}] ${progress}% - ${message}`);
    });
    logger.info(`Perplexity found ${perplexityResult.totalSourcesFound} sources`);

    await sleep(2000);

    // ═══════════════════════════════════════════
    // PHASE 3: Claude URL Research — 20-30 URLs
    // ═══════════════════════════════════════════
    logger.info("Phase 3: Claude URL research with O-1 criteria...");
    const existingUrls = [
      ...lookupSources.map((s) => s.url),
      ...perplexityResult.discoveredSources.map((s) => s.url),
    ];
    const urlResearch = await conductUrlResearch(candidateInfo, existingUrls);
    const urlResearchSources = urlResearchToSources(urlResearch.categorizedUrls);
    logger.info(`URL research found ${urlResearch.stats.validUrls} new URLs`);

    // ═══════════════════════════════════════════
    // COMBINE & DEDUPLICATE ALL SOURCES
    // ═══════════════════════════════════════════
    const allSources: DiscoveredSource[] = deduplicateSources([
      ...lookupSources,
      ...perplexityResult.discoveredSources,
      ...urlResearchSources,
    ]);

    // Reclassify tiers based on actual domain analysis
    for (const source of allSources) {
      try {
        const domain = new URL(source.url).hostname;
        source.tier = classifyUrlTier(domain);
      } catch {
        // Keep original tier
      }
    }

    logger.info(`Total unique sources: ${allSources.length}`, {
      tier1: allSources.filter((s) => s.tier === 1).length,
      tier2: allSources.filter((s) => s.tier === 2).length,
      tier3: allSources.filter((s) => s.tier === 3).length,
    });

    // ═══════════════════════════════════════════
    // PHASE 4: Fetch URL Content
    // ═══════════════════════════════════════════
    logger.info(`Fetching content from top ${PIPELINE.maxUrlsToFetch} URLs...`);

    // Prioritize by tier (fetch Tier 1 first)
    const sortedUrls = [...allSources]
      .sort((a, b) => a.tier - b.tier)
      .slice(0, PIPELINE.maxUrlsToFetch)
      .map((s) => s.url);

    const fetchedContent = await fetchMultipleUrls(sortedUrls, 5);
    const successfulFetches = fetchedContent.filter((f) => f.success);
    logger.info(`Fetched ${successfulFetches.length}/${sortedUrls.length} URLs successfully`);

    // ═══════════════════════════════════════════
    // PHASE 5: Extract Structured Profile
    // ═══════════════════════════════════════════
    logger.info("Extracting structured profile data...");
    const structuredProfile = await extractProfile(
      candidateName,
      candidateInfo.profession,
      fetchedContent,
      allSources
    );
    logger.info(`Profile extracted — confidence: ${structuredProfile.confidence}`, {
      headline: structuredProfile.professionalHeadline,
      achievements: structuredProfile.achievements?.length || 0,
      awards: structuredProfile.awards?.length || 0,
      publications: structuredProfile.publications?.length || 0,
    });

    // ═══════════════════════════════════════════
    // PHASE 6: Archive Top-Tier URLs
    // ═══════════════════════════════════════════
    const tier1Urls = allSources
      .filter((s) => s.tier === 1)
      .slice(0, PIPELINE.maxUrlsToArchive)
      .map((s) => s.url);

    if (tier1Urls.length > 0) {
      logger.info(`Archiving ${tier1Urls.length} Tier 1 URLs...`);
      const archiveResults = await archiveMultipleUrls(tier1Urls);
      const archived = archiveResults.filter((r) => r.success).length;
      logger.info(`Archived ${archived}/${tier1Urls.length} URLs`);
    }

    // ═══════════════════════════════════════════
    // PHASE 7: Generate Documents
    // ═══════════════════════════════════════════
    const researchResult: ResearchResult = {
      candidateName,
      profileAnalysis: perplexityResult.profileAnalysis,
      discoveredSources: allSources,
      totalSourcesFound: allSources.length,
      tier1Count: allSources.filter((s) => s.tier === 1).length,
      tier2Count: allSources.filter((s) => s.tier === 2).length,
      tier3Count: allSources.filter((s) => s.tier === 3).length,
      criteriaCoverage: perplexityResult.criteriaCoverage,
      researchSummary: perplexityResult.researchSummary,
      fetchedContent,
      structuredProfile,
    };

    logger.info("Generating Profile Summary PDF...");
    const profileDoc = await generateProfileSummary(researchResult);
    const profilePdf = await buildPdf(profileDoc.markdownContent, profileDoc.title);
    logger.info(`Profile PDF: ${profilePdf.pageCount} pages`);

    logger.info("Generating Evidence Mapping PDF...");
    const { document: evidenceDoc, mappings } = await generateEvidenceMapping(researchResult);
    const evidencePdf = await buildPdf(evidenceDoc.markdownContent, evidenceDoc.title);
    logger.info(`Evidence PDF: ${evidencePdf.pageCount} pages`);

    // ═══════════════════════════════════════════
    // PHASE 8: Upload PDFs & Update Sheet
    // ═══════════════════════════════════════════
    logger.info("Uploading PDFs to Supabase Storage...");
    const uploads = await uploadCandidatePdfs(
      candidateName,
      profilePdf.buffer,
      evidencePdf.buffer
    );

    // ═══════════════════════════════════════════
    // PHASE 9: Create Talent Profile in O1DMatch
    // ═══════════════════════════════════════════
    let o1dmatchProfileId: string | null = null;
    if (candidate.email) {
      try {
        logger.info("Creating talent profile in O1DMatch...");
        const supabase = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // 1. Create auth user
        const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`;
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: candidate.email.toLowerCase(),
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: "talent", full_name: candidateName },
        });

        if (authError) {
          if (authError.message?.includes("already been registered")) {
            logger.info("Auth user already exists — skipping profile creation");
          } else {
            throw authError;
          }
        } else {
          const userId = authData.user.id;

          // 2. Wait for trigger to create profiles row
          await sleep(500);

          // 3. Update profiles row
          await supabase
            .from("profiles")
            .update({ full_name: candidateName, role: "talent" })
            .eq("id", userId);

          // 4. Create talent_profiles
          const nameParts = candidateName.split(" ");
          const firstName = nameParts[0] || candidateName;
          const lastName = nameParts.slice(1).join(" ") || "";

          const { data: talentProfile, error: talentError } = await supabase
            .from("talent_profiles")
            .insert({
              user_id: userId,
              first_name: firstName,
              last_name: lastName,
              email: candidate.email.toLowerCase(),
              phone: candidate.phone || null,
              professional_headline: structuredProfile.professionalHeadline || candidate.profession || null,
              current_job_title: structuredProfile.currentJobTitle || null,
              current_employer: structuredProfile.currentEmployer || null,
              industry: structuredProfile.industry || candidate.industry || candidate.field || null,
              years_experience: structuredProfile.yearsExperience || null,
              skills: structuredProfile.skills || [],
              education: structuredProfile.education || null,
              university: structuredProfile.university || null,
              field_of_study: structuredProfile.fieldOfStudy || null,
              linkedin_url: candidate.linkedInUrl || null,
              city: structuredProfile.city || null,
              state: structuredProfile.state || null,
              country: structuredProfile.country || candidate.country || "USA",
              publications_count: structuredProfile.publicationsCount || 0,
              h_index: structuredProfile.hIndex || 0,
              citations_count: structuredProfile.citationsCount || 0,
              patents_count: structuredProfile.patents || 0,
              o1_score: candidate.existingScore || 0,
              is_public: true,
              profile_source: sheetSource === "list3" ? "list3_import" : "toptal_import",
              awaiting_claim: true,
              talent_category: "o1_candidate",
            })
            .select("id")
            .single();

          if (talentError) {
            logger.error(`Talent profile creation failed: ${talentError.message}`);
          } else {
            o1dmatchProfileId = talentProfile?.id || null;

            // 5. Create talent_documents entries for the PDFs
            if (o1dmatchProfileId) {
              await supabase.from("talent_documents").insert([
                {
                  talent_id: o1dmatchProfileId,
                  title: `${candidateName} - Profile Summary`,
                  description: "AI-generated comprehensive talent profile based on online research",
                  file_url: uploads.profileUpload.fileUrl,
                  file_name: uploads.profileUpload.fileName,
                  file_type: "application/pdf",
                  file_size: uploads.profileUpload.fileSize,
                  status: "pending",
                },
                {
                  talent_id: o1dmatchProfileId,
                  title: `${candidateName} - O-1 Evidence Mapping`,
                  description: "AI-generated evidence mapping to O-1 visa criteria",
                  file_url: uploads.evidenceUpload.fileUrl,
                  file_name: uploads.evidenceUpload.fileName,
                  file_type: "application/pdf",
                  file_size: uploads.evidenceUpload.fileSize,
                  status: "pending",
                },
              ]);

              logger.info(`✅ Talent profile created in O1DMatch: ${o1dmatchProfileId}`);
            }
          }
        }
      } catch (error: any) {
        logger.error(`O1DMatch import failed (non-fatal): ${error.message}`);
      }
    } else {
      logger.warn(`No email for ${candidateName} — skipping O1DMatch profile creation`);
    }

    // Update Google Sheet row
    try {
      await updateSheetRow(sheetSource, candidate.rowIndex, {
        "Profile Doc URL": uploads.profileUpload.fileUrl,
        "Evidence Doc URL": uploads.evidenceUpload.fileUrl,
        "Research Status": "completed",
        "Sources Found": String(allSources.length),
        "O1DMatch Profile": o1dmatchProfileId ? "created" : "no email",
        "Research Date": new Date().toISOString().split("T")[0],
      });
      logger.info("Sheet row updated with doc URLs");
    } catch (error: any) {
      logger.warn(`Sheet update failed (non-fatal): ${error.message}`);
    }

    // ═══════════════════════════════════════════
    // RETURN RESULTS
    // ═══════════════════════════════════════════
    const criteriaStrengths = mappings.map((m) => `${m.criterion}: ${m.strength}`).join(", ");

    logger.info(`✅ Research complete for ${candidateName}`, {
      totalSources: allSources.length,
      profilePages: profilePdf.pageCount,
      evidencePages: evidencePdf.pageCount,
      criteriaStrengths,
      profileUrl: uploads.profileUpload.fileUrl,
      evidenceUrl: uploads.evidenceUpload.fileUrl,
    });

    return {
      candidateName,
      email: candidate.email,
      sheetSource,
      rowIndex: candidate.rowIndex,
      totalSources: allSources.length,
      tier1Count: researchResult.tier1Count,
      tier2Count: researchResult.tier2Count,
      tier3Count: researchResult.tier3Count,
      profileDocUrl: uploads.profileUpload.fileUrl,
      evidenceDocUrl: uploads.evidenceUpload.fileUrl,
      structuredProfile,
      evidenceMappings: mappings,
      profileConfidence: structuredProfile.confidence,
    };
  },
});
