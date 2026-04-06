// ============================================================
// URL Fetcher — Fetch and parse web content
// Adapted from mega-visa-generation-paid/app/lib/url-fetcher.ts
// ============================================================

import axios from "axios";
import * as cheerio from "cheerio";
import type { FetchedUrlData } from "../types.js";
import { PIPELINE } from "../config.js";

/**
 * Fetch a single URL and extract its text content
 */
export async function fetchUrl(url: string): Promise<FetchedUrlData> {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $("script, style, nav, footer, header, iframe, noscript, aside, .sidebar, .ad, .advertisement").remove();

    // Extract title
    const title =
      $("title").text().trim() ||
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "No title";

    // Extract main content — try multiple selectors
    let content = "";
    const contentSelectors = [
      "article",
      "main",
      '[role="main"]',
      ".content",
      ".article",
      ".post",
      ".entry-content",
      ".article-body",
      "#content",
      "#main",
      "body",
    ];

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length && element.text().trim().length > 100) {
        content = element.text();
        break;
      }
    }

    // If no content from selectors, get all paragraph text
    if (!content || content.trim().length < 100) {
      content = $("p")
        .map((_, el) => $(el).text())
        .get()
        .join("\n");
    }

    // Clean up content
    content = content
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Limit content length
    if (content.length > PIPELINE.maxContentLength) {
      content = content.substring(0, PIPELINE.maxContentLength) + "... [Content truncated]";
    }

    const domain = new URL(url).hostname;

    return { url, title, content, domain, fetchedAt: new Date(), success: true };
  } catch (error: any) {
    return {
      url,
      title: "Failed to fetch",
      content: "",
      domain: "",
      fetchedAt: new Date(),
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch multiple URLs with concurrency control
 */
export async function fetchMultipleUrls(
  urls: string[],
  concurrency: number = 5
): Promise<FetchedUrlData[]> {
  const validUrls = urls.filter(
    (url) => url && typeof url === "string" && url.trim().startsWith("http")
  );

  const results: FetchedUrlData[] = [];

  // Process in batches for controlled concurrency
  for (let i = 0; i < validUrls.length; i += concurrency) {
    const batch = validUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((url) => fetchUrl(url.trim())));
    results.push(...batchResults);

    // Small delay between batches
    if (i + concurrency < validUrls.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Analyze publication quality by domain
 */
export function analyzePublicationQuality(domain: string): {
  tier: "Major Media" | "Trade Publication" | "Online Media" | "Unknown";
  estimatedReach: string;
} {
  const d = domain.toLowerCase();

  const majorMedia = [
    "nytimes.com", "wsj.com", "washingtonpost.com", "bbc.com", "bbc.co.uk",
    "cnn.com", "forbes.com", "bloomberg.com", "reuters.com", "espn.com",
    "theguardian.com", "ft.com", "time.com", "usatoday.com", "apnews.com",
    "nbcnews.com", "abcnews.go.com", "cbsnews.com", "foxnews.com",
    "techcrunch.com", "wired.com", "nature.com", "science.org",
    "thelancet.com", "nejm.org", "ieee.org", "acm.org",
    "harvard.edu", "stanford.edu", "mit.edu", "oxford.ac.uk", "cambridge.org",
    "linkedin.com", "scholar.google.com", "researchgate.net",
  ];

  const tradePublications = [
    "medium.com", "substack.com", "arxiv.org", "ssrn.com",
    "businessinsider.com", "inc.com", "entrepreneur.com", "fastcompany.com",
    "venturebeat.com", "arstechnica.com", "theverge.com",
    "sherdog.com", "mmafighting.com", "mmajunkie.com", "tapology.com",
    "variety.com", "hollywoodreporter.com", "billboard.com", "deadline.com",
    "pitchfork.com", "rollingstone.com", "imdb.com",
  ];

  if (majorMedia.some((m) => d.includes(m))) {
    return { tier: "Major Media", estimatedReach: "Millions (National/International)" };
  }
  if (tradePublications.some((t) => d.includes(t))) {
    return { tier: "Trade Publication", estimatedReach: "Hundreds of thousands (Industry-specific)" };
  }
  if (d.includes("news") || d.includes("press") || d.includes("journal") || d.includes(".edu")) {
    return { tier: "Online Media", estimatedReach: "Thousands to hundreds of thousands" };
  }

  return { tier: "Unknown", estimatedReach: "Unable to determine" };
}

/**
 * Classify a URL's tier (1=gold, 2=strong, 3=supplementary)
 */
export function classifyUrlTier(domain: string): 1 | 2 | 3 {
  const quality = analyzePublicationQuality(domain);
  if (quality.tier === "Major Media") return 1;
  if (quality.tier === "Trade Publication") return 2;
  return 3;
}
