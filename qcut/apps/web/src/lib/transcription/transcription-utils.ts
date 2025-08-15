import { env } from "@/env";

export function isTranscriptionConfigured(): { configured: boolean; missingVars: string[] } {
  const missingVars: string[] = [];

  // SECURITY NOTE: Only check client-safe configuration
  // Server-side credentials are checked in API routes
  if (!env.R2_BUCKET_NAME) missingVars.push("R2_BUCKET_NAME");

  // TODO: Replace with server-side configuration check via API
  // For now, assume configured if bucket name is present
  return { configured: missingVars.length === 0, missingVars };
}