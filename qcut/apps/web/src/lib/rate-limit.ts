// lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const waitlistRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 requests per minute
  analytics: true,
  prefix: "waitlist-rate-limit",
});

// General API rate limiting
export const baseRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
  analytics: true,
  prefix: "api-rate-limit",
});

// Transcription-specific rate limiting (more restrictive due to processing cost)
export const transcriptionRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "5 m"), // 3 transcriptions per 5 minutes
  analytics: true,
  prefix: "transcription-rate-limit",
});
