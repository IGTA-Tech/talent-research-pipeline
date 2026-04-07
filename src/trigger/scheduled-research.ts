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
const BATCH_SIZE = 20; // Process 20 candidates per scheduled run

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

      // Filter: must have name + LinkedIn URL, skip already completed
      const allCandidates = candidates.filter((c) => c.name && c.name.trim().length > 0);
      const withLinkedIn = allCandidates.filter((c) => c.linkedInUrl && c.linkedInUrl.includes("linkedin.com"));
      const skippedNoLinkedIn = allCandidates.length - withLinkedIn.length;
      candidates = withLinkedIn.filter((c) =>
        !c.researchStatus ||
        (!c.researchStatus.startsWith("completed") && !c.researchStatus.startsWith("skipped"))
      );

      if (skippedNoLinkedIn > 0) {
        logger.warn(`${sheetSource}: Skipped ${skippedNoLinkedIn} candidates without LinkedIn URL`);
      }
      logger.info(`${sheetSource}: ${allCandidates.length} total, ${withLinkedIn.length} with LinkedIn, ${candidates.length} unprocessed`);

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
