# Plan: Auto Prompt from Frame — IMPLEMENTED

When regenerating a clip that has no original prompt (imported video/image), auto-generate a descriptive prompt by sending the first frame to Gemini.

> **Status**: Implemented
> **Files modified**: `electron/gemini-chat-handler.ts` (gemini:describe-frame IPC), `electron/preload.ts` (describeFrame bridge), `apps/web/src/types/electron/api-gemini-pty-mcp.ts` (type), `apps/web/src/test/mocks/electron.ts` (mock)

**LTX source**: `useRegeneration.ts` (lines 193-254)
**Estimated time**: ~10 minutes (2 subtasks)

---

## Subtask 1: Frame-to-prompt via Gemini (~7 min)

Extract first frame from any clip, send to Gemini for description, store result.

**What to copy from LTX** (`useRegeneration.ts` lines 193-254):
```
1. Check if asset has generationParams.prompt → use it
2. If not, extract first frame:
   - Video: seek to trimStart + 0.1, canvas → dataURL
   - Image: use source directly
3. Send to Gemini: "Describe this frame as a video generation prompt"
4. Store result: asset.generationParams = { prompt: result, ... }
5. Future regenerations reuse this prompt instantly
```

**Files to modify**:
- `electron/gemini-chat-handler.ts` — add `gemini:describe-frame` IPC handler
  ```typescript
  // System prompt (from LTX):
  "You are a video prompt writer. Describe this image as a concise video generation prompt.
   Focus on: subject, action, camera angle, lighting, mood, style.
   Write 2-3 sentences. No labels or explanations."
  ```
- `electron/preload.ts` — expose `geminiChat.describeFrame(imageDataUrl)`
- `apps/web/src/types/electron/api-gemini-pty-mcp.ts` — add type

**QCut adaptation**: Use the same HTML5 canvas frame extraction pattern from `gap-generation-modal.tsx` (`extractFrameAsDataUrl`). No FFmpeg needed.

---

## Subtask 2: Wire into regeneration flow (~3 min)

Before regenerating, check for prompt. If missing, auto-generate.

**Files to modify**:
- `apps/web/src/components/editor/timeline/timeline-element.tsx` — in the regenerate handler:
  ```typescript
  const handleRegenerate = async () => {
    let prompt = mediaItem.metadata?.generationParams?.prompt;
    if (!prompt && mediaItem.url) {
      // Auto-describe via Gemini
      const frameUrl = await extractFrameAsDataUrl(mediaItem.url, 0.1);
      if (frameUrl) {
        const result = await window.electronAPI.geminiChat.describeFrame(frameUrl);
        prompt = result.prompt;
        // Persist for future use
      }
    }
    // Dispatch generation with prompt...
  };
  ```

**Test file**: `apps/web/src/components/editor/timeline/__tests__/auto-prompt.test.ts`
- Test: clips with existing prompt skip Gemini call
- Test: clips without prompt trigger describeFrame
- Test: result stored in metadata for future use

---

## Reuse Summary

| LTX Code | Lines | Reuse |
|---|---|---|
| Auto-prompt detection logic | 15 | Copy condition checks |
| Frame extraction for prompt | 10 | Already exists in gap-generation-modal.tsx |
| Gemini system prompt for frame description | 5 | Copy verbatim |
| Result storage pattern | 10 | Adapt to MediaItem.metadata |
| **Total** | **~40 lines** | ~70% direct copy |
