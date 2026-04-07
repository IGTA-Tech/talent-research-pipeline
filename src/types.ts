// ============================================================
// Core Types for Talent Research Pipeline
// ============================================================

/** Candidate information from Google Sheets */
export interface CandidateRow {
  sheetSource: "list1" | "list2" | "list3";
  rowIndex: number;
  name: string;
  email?: string;
  linkedInUrl?: string;
  profession?: string;
  field?: string;
  industry?: string;
  phone?: string;
  country?: string;
  existingScore?: number;
  researchStatus?: string;
  profileDocUrl?: string;
  evidenceDocUrl?: string;
  // Additional columns depending on sheet
  [key: string]: unknown;
}

/** Simplified candidate info for research engine */
export interface CandidateInfo {
  fullName: string;
  profession: string;
  field?: string;
  linkedInUrl?: string;
  nationality?: string;
  background?: string;
  existingUrls?: string[];
}

/** A discovered URL from research */
export interface DiscoveredSource {
  url: string;
  title: string;
  sourceName: string;
  tier: 1 | 2 | 3;
  criteria: string[];
  keyContent: string;
  datePublished?: string;
  evidenceType: string;
}

/** Title/profile analysis result */
export interface ProfileAnalysis {
  title: string;
  levelDescriptor: string;
  domain: string;
  role: string;
  specialization: string;
  primaryCriteria: string[];
  secondaryCriteria: string[];
  weakCriteria: string[];
  researchStrategy: string;
  evidenceThreshold: string;
}

/** Full research result for a candidate */
export interface ResearchResult {
  candidateName: string;
  profileAnalysis: ProfileAnalysis;
  discoveredSources: DiscoveredSource[];
  totalSourcesFound: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  criteriaCoverage: string[];
  researchSummary: string;
  fetchedContent: FetchedUrlData[];
  structuredProfile: ExtractedProfile;
}

/** Fetched URL content */
export interface FetchedUrlData {
  url: string;
  title: string;
  content: string;
  domain: string;
  fetchedAt: Date;
  success: boolean;
  error?: string;
}

/** Archived URL result */
export interface ArchivedUrl {
  originalUrl: string;
  archiveUrl: string | null;
  archivedAt: Date;
  success: boolean;
  error?: string;
}

/** Structured profile extracted from research data */
export interface ExtractedProfile {
  professionalHeadline?: string;
  currentJobTitle?: string;
  currentEmployer?: string;
  industry?: string;
  yearsExperience?: number;
  skills?: string[];
  education?: string;
  university?: string;
  fieldOfStudy?: string;
  nationality?: string;
  city?: string;
  state?: string;
  country?: string;
  background?: string;
  achievements?: string[];
  awards?: string[];
  publications?: string[];
  mediaMetions?: string[];
  memberships?: string[];
  patents?: number;
  publicationsCount?: number;
  hIndex?: number;
  citationsCount?: number;
  confidence: "high" | "medium" | "low";
}

/** Evidence mapped to O-1 criteria */
export interface EvidenceMapping {
  criterion: string;
  evidenceFound: Array<{
    description: string;
    sourceUrl: string;
    sourceTier: 1 | 2 | 3;
    confidence: "high" | "medium" | "low";
  }>;
  strength: "strong" | "moderate" | "weak" | "none";
}

/** Generated document */
export interface GeneratedDocument {
  type: "profile_summary" | "evidence_mapping";
  title: string;
  markdownContent: string;
  pdfBuffer?: Buffer;
  pageCount?: number;
}

/** Upload result */
export interface UploadResult {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  bucket: string;
  path: string;
}

/** Payload for the batch research task */
export interface BatchResearchPayload {
  sheetSource: "list1" | "list2" | "list3" | "all";
  limit?: number;
  startIndex?: number;
  dryRun?: boolean;
}

/** Payload for individual candidate research task */
export interface ResearchCandidatePayload {
  candidate: CandidateRow;
  sheetSource: "list1" | "list2" | "list3";
}

/** Payload for document generation task */
export interface GenerateDocumentsPayload {
  candidateName: string;
  candidateEmail?: string;
  researchResult: ResearchResult;
  sheetSource: "list1" | "list2" | "list3";
  rowIndex: number;
}

/** Payload for upload and sheet update task */
export interface UploadAndUpdatePayload {
  candidateName: string;
  candidateEmail?: string;
  profilePdf: { buffer: number[]; fileName: string };
  evidencePdf: { buffer: number[]; fileName: string };
  sheetSource: "list1" | "list2" | "list3";
  rowIndex: number;
  structuredProfile: ExtractedProfile;
  evidenceMappings: EvidenceMapping[];
}

/** Payload for O1DMatch import task */
export interface ImportToO1DMatchPayload {
  sheetSource: "list1" | "list2" | "list3" | "all";
  limit?: number;
  dryRun?: boolean;
}

/** O-1 visa criteria (matching O1DMatch's enum) */
export const O1_CRITERIA = [
  "awards",
  "memberships",
  "published_material",
  "judging",
  "original_contributions",
  "scholarly_articles",
  "critical_role",
  "high_salary",
] as const;

export type O1Criterion = (typeof O1_CRITERIA)[number];

/** Sheet configuration */
export interface SheetConfig {
  id: string;
  gid: string;
  name: string;
  source: "list1" | "list2" | "list3";
}

/** Visa knowledge base evidence category */
export interface EvidenceCategory {
  name: string;
  description: string;
  searchTerms: string[];
}
