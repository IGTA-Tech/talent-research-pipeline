// ============================================================
// Task: scheduled-research — Continuous scheduled processing
// Processes candidates from all 3 sheets in order: list1, list2, list3
// Runs every 15 minutes, picks up unprocessed candidates
// ============================================================

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { fetchSheetData } from "../sheets/reader.js";
import { researchCandidate } from "./research-candidate.js";
import type { CandidateRow } from "../types.js";

// Track processed candidates across runs using metadata
const BATCH_SIZE = 5; // Process 5 candidates per scheduled run

export const scheduledResearch = schedules.task({
  id: "scheduled-research",
  // Run every 15 minutes
  cron: "*/15 * * * *",
  queue: { concurrencyLimit: 1 },

  run: async () => {
    logger.info("Scheduled research run starting...");

    // Process sheets in order: list1 → list2 → list3
    const sheetOrder: Array<"list1" | "list2" | "list3"> = ["list1", "list2", "list3"];

    let totalTriggered = 0;

    for (const sheetSource of sheetOrder) {
      if (totalTriggered >= BATCH_SIZE) break;

      let candidates: CandidateRow[];
      try {
        candidates = await fetchSheetData(sheetSource);
      } catch (error: any) {
        logger.warn(`Failed to fetch ${sheetSource}: ${error.message}`);
        continue;
      }

      // Filter: must have a name, skip already completed
      const allCandidates = candidates.filter((c) => c.name && c.name.trim().length > 0);
      candidates = allCandidates.filter((c) => c.researchStatus !== "completed");

      logger.info(`${sheetSource}: ${allCandidates.length} total, ${candidates.length} unprocessed`);

      const remaining = BATCH_SIZE - totalTriggered;
      const batch = candidates.slice(0, remaining);

      if (batch.length === 0) {
        logger.info(`${sheetSource}: No candidates to process`);
        continue;
      }

      logger.info(`${sheetSource}: Triggering research for ${batch.length} candidates`);

      // Fan out research tasks
      const batchItems = batch.map((candidate) => ({
        payload: {
          candidate,
          sheetSource,
        },
      }));

      // Trigger without waiting — let them run in parallel
      await researchCandidate.batchTrigger(batchItems);
      totalTriggered += batch.length;

      logger.info(`${sheetSource}: Triggered ${batch.length} candidates`);
    }

    const summary = {
      status: "completed",
      totalTriggered,
      timestamp: new Date().toISOString(),
    };

    logger.info("Scheduled run complete", summary);
    return summary;
  },
});
