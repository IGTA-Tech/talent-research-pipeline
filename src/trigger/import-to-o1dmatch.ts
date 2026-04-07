// ============================================================
// Task: import-to-o1dmatch — Create talent profiles for candidates
// that already have research completed (docs in Supabase Storage)
// ============================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config.js";
import type { ImportToO1DMatchPayload, CandidateRow } from "../types.js";
import { fetchSheetData, fetchAllSheets } from "../sheets/reader.js";
import { updateSheetRow } from "../sheets/writer.js";
import { sleep } from "../research/ai-client.js";

function getAdminClient() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const importToO1DMatch = task({
  id: "import-to-o1dmatch",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 900, // 15 min — may process many candidates

  run: async (payload: ImportToO1DMatchPayload) => {
    const { sheetSource, limit, dryRun = false } = payload;

    logger.info("Starting O1DMatch import for researched candidates", { sheetSource, limit, dryRun });

    // Fetch candidates
    let candidates: CandidateRow[];
    if (sheetSource === "all") {
      candidates = await fetchAllSheets();
    } else {
      candidates = await fetchSheetData(sheetSource);
    }

    // Filter: must have email + research completed + doc URLs
    candidates = candidates.filter((c) => {
      if (!c.email || !c.email.includes("@")) return false;
      if (!c.researchStatus?.startsWith("completed")) return false;
      return true;
    });

    if (limit) {
      candidates = candidates.slice(0, limit);
    }

    logger.info(`Found ${candidates.length} researched candidates with email to import`);

    if (dryRun) {
      candidates.forEach((c, i) => {
        logger.info(`  ${i + 1}. ${c.name} | ${c.email} | docs: ${c.profileDocUrl ? "yes" : "no"}`);
      });
      return { status: "dry_run", count: candidates.length };
    }

    const supabase = getAdminClient();
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      try {
        const email = candidate.email!.split(/[\/,;|]/)[0].trim().toLowerCase();

        // Check if already in O1DMatch
        const { data: existingTalent } = await supabase
          .from("talent_profiles")
          .select("id")
          .eq("email", email)
          .single();

        if (existingTalent) {
          logger.info(`Skipping ${candidate.name} — already in O1DMatch`);
          skipped++;
          continue;
        }

        // Also check auth.users
        const { data: existingAuth } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .single();

        if (existingAuth) {
          logger.info(`Skipping ${candidate.name} — auth user exists`);
          skipped++;
          continue;
        }

        // 1. Create auth user
        const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`;
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: "talent", full_name: candidate.name },
        });

        if (authError) {
          if (authError.message?.includes("already been registered")) {
            logger.info(`Skipping ${candidate.name} — auth user already registered`);
            skipped++;
            continue;
          }
          throw new Error(`Auth creation failed: ${authError.message}`);
        }

        const userId = authData.user.id;
        logger.info(`Created auth user for ${candidate.name}: ${userId}`);

        // 2. Create or update profiles row directly
        await sleep(1000);
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .single();

        if (existingProfile) {
          await supabase
            .from("profiles")
            .update({ full_name: candidate.name, role: "talent", email })
            .eq("id", userId);
        } else {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({ id: userId, full_name: candidate.name, email, role: "talent" });
          if (profileError) {
            throw new Error(`Profiles insert failed: ${profileError.message}`);
          }
        }

        // 3. Create talent_profiles
        const nameParts = candidate.name.split(" ");
        const firstName = nameParts[0] || candidate.name;
        const lastName = nameParts.slice(1).join(" ") || "";

        const { data: talentProfile, error: talentError } = await supabase
          .from("talent_profiles")
          .insert({
            user_id: userId,
            first_name: firstName,
            last_name: lastName,
            email,
            phone: candidate.phone || null,
            professional_headline: candidate.profession || null,
            industry: candidate.industry || candidate.field || null,
            linkedin_url: candidate.linkedInUrl || null,
            country: candidate.country || "USA",
            o1_score: candidate.existingScore || 0,
            is_public: true,
            profile_source: candidate.sheetSource === "list3" ? "list3_import" : "toptal_import",
            awaiting_claim: true,
            talent_category: "o1_candidate",
          })
          .select("id")
          .single();

        if (talentError) {
          throw new Error(`Talent profile failed: ${talentError.message}`);
        }

        const talentId = talentProfile?.id;

        // 4. Link existing docs if URLs are in the sheet
        if (talentId) {
          const docs = [];

          if (candidate.profileDocUrl) {
            docs.push({
              talent_id: talentId,
              title: `${candidate.name} - Profile Summary`,
              description: "AI-generated comprehensive talent profile",
              file_url: candidate.profileDocUrl,
              file_name: `${candidate.name}-profile-summary.pdf`,
              file_type: "application/pdf",
              status: "pending",
            });
          }

          if (candidate.evidenceDocUrl) {
            docs.push({
              talent_id: talentId,
              title: `${candidate.name} - O-1 Evidence Mapping`,
              description: "AI-generated evidence mapping to O-1 visa criteria",
              file_url: candidate.evidenceDocUrl,
              file_name: `${candidate.name}-evidence-mapping.pdf`,
              file_type: "application/pdf",
              status: "pending",
            });
          }

          if (docs.length > 0) {
            const { error: docError } = await supabase.from("talent_documents").insert(docs);
            if (docError) {
              logger.warn(`Doc linking failed for ${candidate.name}: ${docError.message}`);
            } else {
              logger.info(`Linked ${docs.length} documents for ${candidate.name}`);
            }
          }
        }

        // 5. Update sheet
        try {
          await updateSheetRow(candidate.sheetSource, candidate.rowIndex, {
            "O1DMatch Profile": "created",
          });
        } catch {}

        imported++;
        logger.info(`✅ Imported ${candidate.name} (talent_id: ${talentId})`);

        await sleep(300);
      } catch (error: any) {
        logger.error(`❌ Failed to import ${candidate.name}: ${error.message}`);
        errors++;
      }
    }

    const summary = {
      status: "completed",
      total: candidates.length,
      imported,
      skipped,
      errors,
    };

    logger.info("Import complete", summary);
    return summary;
  },
});
