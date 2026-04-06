// ============================================================
// Supabase Storage — Upload PDFs to O1DMatch Storage
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../config.js";
import type { UploadResult } from "../types.js";

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseClient;
}

const BUCKET = "talent-documents";

/**
 * Upload a PDF buffer to Supabase Storage.
 * Files are stored under pipeline/{candidateHash}/{filename}
 */
export async function uploadPdf(
  pdfBuffer: Buffer,
  fileName: string,
  candidateIdentifier: string
): Promise<UploadResult> {
  const supabase = getSupabase();

  // Create a safe path from candidate name
  const safeId = candidateIdentifier
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);

  const timestamp = Date.now();
  const path = `pipeline/${safeId}/${timestamp}-${fileName}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    fileUrl: urlData.publicUrl,
    fileName,
    fileSize: pdfBuffer.length,
    bucket: BUCKET,
    path: data.path,
  };
}

/**
 * Upload both profile and evidence PDFs for a candidate
 */
export async function uploadCandidatePdfs(
  candidateName: string,
  profilePdf: Buffer,
  evidencePdf: Buffer
): Promise<{ profileUpload: UploadResult; evidenceUpload: UploadResult }> {
  const safeName = candidateName.replace(/[^a-zA-Z0-9\s]/g, "").trim();

  const [profileUpload, evidenceUpload] = await Promise.all([
    uploadPdf(profilePdf, `${safeName}-profile-summary.pdf`, candidateName),
    uploadPdf(evidencePdf, `${safeName}-evidence-mapping.pdf`, candidateName),
  ]);

  console.log(`[Storage] Uploaded PDFs for ${candidateName}`);
  console.log(`  Profile: ${profileUpload.fileUrl}`);
  console.log(`  Evidence: ${evidenceUpload.fileUrl}`);

  return { profileUpload, evidenceUpload };
}

/**
 * Get the Supabase admin client (for use in import task)
 */
export function getAdminClient() {
  return getSupabase();
}
