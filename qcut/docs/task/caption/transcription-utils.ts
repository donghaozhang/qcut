import { env } from "@/env";

export function isTranscriptionConfigured(): { configured: boolean; missingVars: string[] } {
  const missingVars: string[] = [];

  if (!env.CLOUDFLARE_ACCOUNT_ID) missingVars.push("CLOUDFLARE_ACCOUNT_ID");
  if (!env.R2_ACCESS_KEY_ID) missingVars.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missingVars.push("R2_SECRET_ACCESS_KEY");
  if (!env.R2_BUCKET_NAME) missingVars.push("R2_BUCKET_NAME");
  if (!env.MODAL_TRANSCRIPTION_URL) missingVars.push("MODAL_TRANSCRIPTION_URL");

  return { configured: missingVars.length === 0, missingVars };
}
