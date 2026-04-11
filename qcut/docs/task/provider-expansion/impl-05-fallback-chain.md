# Implementation Plan: Automatic Fallback Chain

> **Priority:** P1 | **Estimated Effort:** ~20 min
> **Depends on:** None (improves existing infrastructure)
> **Reference:** OpenClaw `src/video-generation/runtime.ts`

---

## Overview

When a video generation request fails (provider down, rate limit, timeout), automatically retry with a fallback provider instead of showing an error. OpenClaw implements this as a sequential fallback chain in the runtime.

---

## Subtasks

### 1. Define Fallback Configuration
**Files:**
- `apps/web/src/lib/ai-video/core/fallback-config.ts` — new file

**Fallback chains (per model family):**
```typescript
const FALLBACK_CHAINS: Record<string, string[]> = {
  // Veo 3.1: try FAL → GMI → Direct Google
  "veo31_text_to_video": ["veo31_text_to_video", "gmi_veo31_lite_t2v", "google_veo31_t2v"],
  // Kling V3: try FAL → GMI
  "kling_v3_pro_t2v": ["kling_v3_pro_t2v", "gmi_kling_v3_t2v"],
  // Hailuo: try FAL → Direct MiniMax (when available)
  "hailuo23_pro_t2v": ["hailuo23_pro_t2v"],
};
```

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/fallback-config.test.ts`

---

### 2. Implement Fallback Runtime
**Files:**
- `apps/web/src/lib/ai-video/core/fallback-runtime.ts` — new file
- `apps/web/src/lib/ai-video/core/provider-router.ts` — integrate fallback

**Logic:**
1. Try primary model
2. On failure (network error, 5xx, timeout), check fallback chain
3. Try next model in chain
4. Record each attempt's result
5. Return first success or all failures

**Error types that trigger fallback:**
- Network errors
- HTTP 5xx (server errors)
- Timeout (provider-specific)
- Rate limit (429) — with backoff

**Error types that do NOT trigger fallback:**
- HTTP 4xx (bad request, auth failure)
- User cancellation

**Tests:**
- `apps/web/src/lib/ai-video/core/__tests__/fallback-runtime.test.ts`

---

### 3. Add Fallback UI Feedback
**Files:**
- `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/` — update progress callbacks

**UX:**
- Show "Trying alternative provider..." message when falling back
- Log which provider was tried and why it failed
- Final result shows which provider actually succeeded

---

## Acceptance Criteria

- [ ] Fallback chains defined for models with multiple backends
- [ ] Runtime retries on server errors/timeouts
- [ ] Does NOT retry on auth failures or bad requests
- [ ] UI shows fallback progress to user
- [ ] Each attempt's result logged for debugging
- [ ] Unit tests cover success, single fallback, all-fail scenarios
