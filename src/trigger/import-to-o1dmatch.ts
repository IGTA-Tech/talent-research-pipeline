// ============================================================
// Task: import-to-o1dmatch — Create talent profiles in O1DMatch
// ============================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IMPORT_SECRET_KEY } from "../config.js";
import type { ImportToO1DMatchPayload, CandidateRow } from "../types.js";
import { fetchSheetData, fetchAllSheets } from "../sheets/reader.js";
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

  run: async (payload: ImportToO1DMatchPayload) => {
    const { sheetSource, limit, dryRun = false } = payload;

    logger.info("Starting O1DMatch import", { sheetSource, limit, dryRun });

    // Fetch candidates
    let candidates: CandidateRow[];
    if (sheetSource === "all") {
      candidates = await fetchAllSheets();
    } else {
      candidates = await fetchSheetData(sheetSource);
    }

    // Filter: must have email
    candidates = candidates.filter((c) => c.email);

    if (limit) {
      candidates = candidates.slice(0, limit);
    }

    if (dryRun) {
      logger.info(`DRY RUN: Would import ${candidates.length} candidates`);
      return { status: "dry_run", count: candidates.length };
    }

    const supabase = getAdminClient();
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      try {
        // Check if email already exists
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", candidate.email!.toLowerCase())
          .single();

        if (existingUser) {
          logger.info(`Skipping ${candidate.name} — email already exists`);
          skipped++;
          continue;
        }

        // 1. Create auth user
        const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`;
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: candidate.email!.toLowerCase(),
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: "talent", full_name: candidate.name },
        });

        if (authError) {
          if (authError.message?.includes("already been registered")) {
            logger.info(`Skipping ${candidate.name} — auth user exists`);
            skipped++;
            continue;
          }
          throw new Error(`Auth creation failed: ${authError.message}`);
        }

        const userId = authData.user.id;
        logger.info(`Created auth user for ${candidate.name}: ${userId}`);

        // 2. Wait for trigger to create profiles row
        await sleep(500);

        // 3. Update profiles row
        await supabase
          .from("profiles")
          .update({
            full_name: candidate.name,
            role: "talent",
          })
          .eq("id", userId);

        // 4. Create talent_profiles row
        const nameParts = candidate.name.split(" ");
        const firstName = nameParts[0] || candidate.name;
        const lastName = nameParts.slice(1).join(" ") || "";

        const { error: talentError } = await supabase.from("talent_profiles").insert({
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          email: candidate.email!.toLowerCase(),
          phone: candidate.phone || null,
          professional_headline: candidate.profession || null,
          industry: candidate.industry || candidate.field || null,
          linkedin_url: candidate.linkedInUrl || null,
          country: candidate.country || "USA",
          o1_score: candidate.existingScore || 0,
          is_public: true,
          status: "enabled",
          profile_source: candidate.sheetSource === "list3" ? "list3_import" : "toptal_import",
          awaiting_claim: true,
          talent_category: "o1_candidate",
        });

        if (talentError) {
          throw new Error(`Talent profile creation failed: ${talentError.message}`);
        }

        imported++;
        logger.info(`✅ Imported ${candidate.name}`);

        // Small delay between imports
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
