# Step 1: Video Analyzer — Extract Recipe from Source Video

## Goal
Given a source video, use Gemini Vision to extract a structured `VideoRecipe` JSON describing every shot, style, timing, and audio characteristics.

## Files to Create

### `electron/native-pipeline/replicate/replicate-types.ts`
- `VideoRecipe`, `ShotRecipe`, `AudioRecipe`, `StyleRecipe` interfaces
- `ReplicateOptions` for CLI flags
- `ReplicateProgress` for streaming progress

### `electron/native-pipeline/replicate/replicate-prompts.ts`
System prompts for Gemini analysis:

```typescript
export const ANALYZE_VIDEO_PROMPT = `Analyze this video and extract a structured shot list.
For each shot, identify:
- Start/end timestamps (seconds)
- Shot type: wide, medium, closeup, detail, transition, title
- Camera movement: static, pan-left, pan-right, zoom-in, zoom-out, tracking
- Visual description (what's happening)
- AI generation prompt (how to recreate this shot)
- Transition to next shot: cut, dissolve, fade, wipe
- Whether text/subtitles are visible and their content

Also identify overall style:
- Genre (tutorial, vlog, cinematic, commercial, etc.)
- Mood (energetic, calm, dramatic, etc.)
- Color palette (dominant colors)
- Pacing (fast/medium/slow)

Also identify audio:
- Background music present? Style?
- Voiceover present? Language?

Return as JSON matching the VideoRecipe schema.`;
```

### `electron/native-pipeline/replicate/replicate-analyzer.ts`

```typescript
export async function analyzeVideo(
  videoPath: string,
  options?: { model?: string; verbose?: boolean }
): Promise<VideoRecipe> {
  // 1. Read video file
  // 2. Upload to Gemini via existing gemini-chat-handler pattern
  // 3. Send analysis prompt
  // 4. Parse JSON response into VideoRecipe
  // 5. Validate shot timings (no gaps, no overlaps)
  // 6. Return recipe
}
```

**Pattern to follow:** `electron/gemini-chat-handler.ts` — uses `@google/genai` SDK with video file upload. Specifically the `handleGeminiChatRequest` function which handles file → Gemini → response.

**Alternative:** Use existing `analyze-video` CLI command (`electron/native-pipeline/execution/step-executors.ts` → `executeAnalyzeVideo`) which already sends video to Gemini. Extend it with the recipe prompt.

## Steps

1. Define `VideoRecipe` + `ShotRecipe` types in `replicate-types.ts`
2. Write analysis prompts in `replicate-prompts.ts`
3. Implement `analyzeVideo()` in `replicate-analyzer.ts`:
   - Read video as buffer
   - Upload to Gemini (reuse `@google/genai` FileManager)
   - Send structured analysis prompt
   - Parse and validate JSON response
   - Handle edge cases: short videos, no audio, single-shot videos
4. Write tests: mock Gemini response, verify recipe parsing

## Existing Code References
- `electron/native-pipeline/execution/step-executors.ts` line ~300: `executeAnalyzeVideo` — existing Gemini video analysis
- `electron/gemini-chat-handler.ts` line ~50-100: Gemini SDK initialization + file upload
- `electron/native-pipeline/autoclip/step-outline.ts`: LLM-based video content extraction (similar pattern)
