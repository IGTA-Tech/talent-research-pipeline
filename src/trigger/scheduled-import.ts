// ============================================================
// Task: scheduled-import — Continuously import researched candidates
// Runs every 10 minutes, no AI needed — just reads sheets and creates profiles
// Also picks up candidates whose email/LinkedIn were recently added
// ============================================================

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config.js";
import { fetchSheetData } from "../sheets/reader.js";
import { updateSheetRow } from "../sheets/writer.js";
import { sleep } from "../research/ai-client.js";
import type { CandidateRow } from "../types.js";

export const scheduledImport = schedules.task({
  id: "scheduled-import",
  cron: "*/10 * * * *", // Every 10 minutes
  queue: { concurrencyLimit: 1 },

  run: async () => {
    logger.info("Scheduled import run starting...");

    const supabase = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sheetOrder: Array<"list1" | "list2" | "list3"> = ["list1", "list2", "list3"];
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const sheetSource of sheetOrder) {
      let candidates: CandidateRow[];
      try {
        candidates = await fetchSheetData(sheetSource);
      } catch (error: any) {
        logger.warn(`Failed to fetch ${sheetSource}: ${error.message}`);
        continue;
      }

      // Filter: must have research completed + email + NOT already imported
      const readyToImport = candidates.filter((c) => {
        if (!c.email || !c.email.includes("@")) return false;
        if (!c.researchStatus?.startsWith("completed")) return false;
        if (c.o1dmatchProfile === "created") return false;
        return true;
      });

      if (readyToImport.length === 0) {
        logger.info(`${sheetSource}: No candidates ready to import`);
        continue;
      }

      logger.info(`${sheetSource}: ${readyToImport.length} candidates ready to import`);

      for (const candidate of readyToImport) {
        try {
          const email = candidate.email!.split(/[\/,;|]/)[0].trim().toLowerCase();

          // Check if already in O1DMatch
          const { data: existingTalent } = await supabase
            .from("talent_profiles")
            .select("id")
            .eq("email", email)
            .single();

          if (existingTalent) {
            // Already imported — update sheet to reflect
            try {
              await updateSheetRow(sheetSource, candidate.rowIndex, {
                "O1DMatch Profile": "created",
              });
            } catch {}
            totalSkipped++;
            continue;
          }

          // Check if auth user exists
          let userId: string;
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .single();

          if (existingProfile) {
            userId = existingProfile.id;
          } else {
            // Create auth user
            const tempPassword = `Temp${Date.now()}!${Math.random().toString(36).slice(2, 8)}`;
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { role: "talent", full_name: candidate.name },
            });

            if (authError) {
              if (authError.message?.includes("already been registered")) {
                // Find existing user
                const { data: { users } } = await supabase.auth.admin.listUsers();
                const found = users?.find((u) => u.email === email);
                if (found) {
                  userId = found.id;
                } else {
                  throw new Error(`Can't find auth user for ${email}`);
                }
              } else {
                throw authError;
              }
            } else {
              userId = authData.user.id;
            }

            // Create profiles row
            await sleep(1000);
            const { data: profileCheck } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", userId)
              .single();

            if (!profileCheck) {
              await supabase.from("profiles").insert({
                id: userId,
                full_name: candidate.name,
                email,
                role: "talent",
              });
            }
          }

          // Create talent_profiles
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
              profile_source: sheetSource === "list3" ? "list3_import" : "toptal_import",
              awaiting_claim: true,
              talent_category: "o1_candidate",
            })
            .select("id")
            .single();

          if (talentError) {
            throw new Error(`Talent profile failed: ${talentError.message}`);
          }

          // Link docs if URLs exist in sheet
          if (talentProfile?.id) {
            const docs = [];
            if (candidate.profileDocUrl) {
              docs.push({
                talent_id: talentProfile.id,
                title: `${candidate.name} - Profile Summary`,
                description: "AI-generated talent profile",
                file_url: candidate.profileDocUrl,
                file_name: `${candidate.name}-profile-summary.pdf`,
                file_type: "application/pdf",
                status: "pending",
              });
            }
            if (candidate.evidenceDocUrl) {
              docs.push({
                talent_id: talentProfile.id,
                title: `${candidate.name} - O-1 Evidence Mapping`,
                description: "AI-generated evidence mapping",
                file_url: candidate.evidenceDocUrl,
                file_name: `${candidate.name}-evidence-mapping.pdf`,
                file_type: "application/pdf",
                status: "pending",
              });
            }
            if (docs.length > 0) {
              await supabase.from("talent_documents").insert(docs);
            }
          }

          // Update sheet
          try {
            await updateSheetRow(sheetSource, candidate.rowIndex, {
              "O1DMatch Profile": "created",
            });
          } catch {}

          totalImported++;
          logger.info(`✅ Imported ${candidate.name} (${email})`);
          await sleep(300);
        } catch (error: any) {
          logger.error(`❌ Failed ${candidate.name}: ${error.message}`);
          totalErrors++;
        }
      }
    }

    const summary = { totalImported, totalSkipped, totalErrors };
    logger.info("Scheduled import complete", summary);
    return summary;
  },
});
