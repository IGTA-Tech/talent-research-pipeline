// ============================================================
// Archive.org — Preserve URLs in the Wayback Machine
// Copied from mega-visa-generation-paid/app/lib/archive-org.ts
// ============================================================

import axios from "axios";
import type { ArchivedUrl } from "../types.js";

/**
 * Archive a single URL to the Wayback Machine
 */
export async function archiveUrl(url: string): Promise<ArchivedUrl> {
  try {
    const saveResponse = await axios.get(
      `https://web.archive.org/save/${url}`,
      {
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      }
    );

    let archiveUrl: string | null = null;

    if (saveResponse.headers["content-location"]) {
      archiveUrl = `https://web.archive.org${saveResponse.headers["content-location"]}`;
    } else {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, "")
        .slice(0, 14);
      archiveUrl = `https://web.archive.org/web/${timestamp}/${url}`;
    }

    return { originalUrl: url, archiveUrl, archivedAt: new Date(), success: true };
  } catch (error) {
    return {
      originalUrl: url,
      archiveUrl: null,
      archivedAt: new Date(),
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a URL has already been archived
 */
export async function getExistingArchive(url: string): Promise<string | null> {
  try {
    const response = await axios.get(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { timeout: 10000 }
    );

    if (
      response.data?.archived_snapshots?.closest?.available &&
      response.data.archived_snapshots.closest.url
    ) {
      return response.data.archived_snapshots.closest.url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Smart archive — check existing first, archive if not found
 */
export async function archiveUrlSmart(url: string): Promise<ArchivedUrl> {
  const existing = await getExistingArchive(url);
  if (existing) {
    return { originalUrl: url, archiveUrl: existing, archivedAt: new Date(), success: true };
  }
  return archiveUrl(url);
}

/**
 * Archive multiple URLs with delay between requests
 */
export async function archiveMultipleUrls(
  urls: string[],
  onProgress?: (current: number, total: number, url: string) => void
): Promise<ArchivedUrl[]> {
  const results: ArchivedUrl[] = [];

  for (let i = 0; i < urls.length; i++) {
    if (onProgress) onProgress(i + 1, urls.length, urls[i]);

    const result = await archiveUrlSmart(urls[i]);
    results.push(result);

    // 5-second delay to respect archive.org
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  return results;
}
