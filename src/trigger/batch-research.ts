// ============================================================
// Task: batch-research — Orchestrator that reads sheet and fans out
// ============================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import type { BatchResearchPayload, CandidateRow } from "../types.js";
import { fetchSheetData, fetchAllSheets } from "../sheets/reader.js";
import { researchCandidate } from "./research-candidate.js";

export const batchResearch = task({
  id: "batch-research",
  queue: { concurrencyLimit: 1 }, // Only one batch at a time
  retry: { maxAttempts: 1 }, // Don't retry the orchestrator

  run: async (payload: BatchResearchPayload) => {
    const { sheetSource, limit, startIndex = 0, dryRun = false } = payload;

    logger.info(`Starting batch research`, {
      sheetSource,
      limit,
      startIndex,
      dryRun,
    });

    // ─── Fetch Candidates ───
    let candidates: CandidateRow[];

    if (sheetSource === "all") {
      candidates = await fetchAllSheets();
    } else {
      candidates = await fetchSheetData(sheetSource);
    }

    // Apply filters
    // Only process candidates that have at least a name
    candidates = candidates.filter((c) => c.name && c.name.trim().length > 0);

    // Apply start index
    if (startIndex > 0) {
      candidates = candidates.slice(startIndex);
    }

    // Apply limit
    if (limit) {
      candidates = candidates.slice(0, limit);
    }

    logger.info(`Candidates to process: ${candidates.length}`);

    if (dryRun) {
      logger.info("DRY RUN — Preview of candidates:");
      candidates.forEach((c, i) => {
        logger.info(`  ${i + 1}. ${c.name} | ${c.email || "no email"} | ${c.linkedInUrl || "no LinkedIn"} | ${c.profession || "no profession"}`);
      });

      return {
        status: "dry_run",
        totalCandidates: candidates.length,
        candidates: candidates.map((c) => ({
          name: c.name,
          email: c.email,
          linkedInUrl: c.linkedInUrl,
          profession: c.profession,
          sheetSource: c.sheetSource,
        })),
      };
    }

    // ─── Fan Out — Trigger research for each candidate ───
    logger.info(`Triggering research for ${candidates.length} candidates...`);

    const batchItems = candidates.map((candidate) => ({
      payload: {
        candidate,
        sheetSource: candidate.sheetSource,
      },
    }));

    // Use batchTriggerAndWait to process all candidates
    // Trigger.dev handles concurrency (5 at a time per research-candidate queue)
    const results = await researchCandidate.batchTriggerAndWait(batchItems);

    // Summarize results
    let completed = 0;
    let failed = 0;

    for (const run of results.runs) {
      if (run.ok) {
        completed++;
      } else {
        failed++;
        logger.error(`Failed: ${run.error}`);
      }
    }

    const summary = {
      status: "completed",
      totalCandidates: candidates.length,
      completed,
      failed,
      sheetSource,
    };

    logger.info(`Batch research complete`, summary);
    return summary;
  },
});
