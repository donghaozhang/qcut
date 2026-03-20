# Step 4: Timeline Assembler — Build QCut Project from Generated Media

## Goal
Take generated media files + original recipe and assemble a QCut timeline that matches the source video's rhythm.

## File to Create

### `electron/native-pipeline/replicate/replicate-assembler.ts`

```typescript
export async function assembleTimeline(
  recipe: VideoRecipe,
  generatedShots: GeneratedShot[],
  options: {
    projectId?: string;     // existing project, or create new
    addSubtitles?: boolean;
    addTransitions?: boolean;
    matchTiming?: boolean;   // strict timing match vs natural flow
  }
): Promise<{ projectId: string; trackCount: number; elementCount: number }> {
  // 1. Create QCut project (or open existing)
  // 2. Import all generated media files
  // 3. For each shot in recipe order:
  //    a. Find matching generated media
  //    b. Add to main video track at correct startTime
  //    c. Trim to match original shot duration
  // 4. If addSubtitles: create captions track from recipe subtitle data
  // 5. If addTransitions: add transitions between shots per recipe
  // 6. Return project info
}
```

## Two Modes

### Mode A: Headless (CLI only, no QCut running)
- Build a project.json directly
- Save to project folder
- Can be opened in QCut later

### Mode B: Live (QCut running)
- Use `claude-timeline-bridge` patterns to add elements to running editor
- User sees timeline build in real-time
- Use existing `addElementToTrack`, `addCaptionElement` etc.

**Recommended: Start with Mode A**, add Mode B later.

## Reuse Patterns

From `electron/native-pipeline/autoclip/step-cut.ts`:
- Creating timeline structures from analysis data
- Setting element startTime/duration/trimStart/trimEnd

From `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts`:
- `addClaudeMediaElement` — add media to track
- `addClaudeCaptionElement` — add captions
- `addClaudeTextElement` — add text overlays

## Timing Alignment

```typescript
function alignShotToTimeline(
  shot: ShotRecipe,
  generated: GeneratedShot,
): TimelineElement {
  const generatedDuration = generated.duration;
  const targetDuration = shot.duration;

  return {
    type: "media",
    mediaId: generated.filePath,
    startTime: shot.startTime,
    duration: generatedDuration,
    // Trim or speed-adjust to match target duration
    trimStart: 0,
    trimEnd: Math.max(0, generatedDuration - targetDuration),
  };
}
```
