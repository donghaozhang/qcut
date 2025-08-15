// Simplified environment for Vite/Electron - no server-side validation
// Completely removed T3 env validation to prevent runtime errors

export const env = {
  NODE_ENV: import.meta.env.MODE || "development",
  // Mock server vars that components might expect but won't be used in Electron
  ANALYZE: undefined,
  NEXT_RUNTIME: undefined,
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  // Mock auth vars
  BETTER_AUTH_SECRET: "",
  NEXT_PUBLIC_BETTER_AUTH_URL: "http://localhost:3000",
  // Mock database vars
  DATABASE_URL: "",
  // Transcription service vars
  CLOUDFLARE_ACCOUNT_ID: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID || "",
  R2_ACCESS_KEY_ID: import.meta.env.VITE_R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: import.meta.env.VITE_R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET_NAME: import.meta.env.VITE_R2_BUCKET_NAME || "opencut-transcription",
  MODAL_TRANSCRIPTION_URL: import.meta.env.VITE_MODAL_TRANSCRIPTION_URL || "",
};
