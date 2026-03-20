# Step 3: Shot Generator — Parallel AI Media Generation

## Goal
Execute the shot plans in parallel, generating AI video/images for each shot.

## File to Create

### `electron/native-pipeline/replicate/replicate-generator.ts`

```typescript
interface GeneratedShot {
  shotIndex: number;
  filePath: string;      // local path to generated media
  type: "video" | "image";
  duration: number;
  success: boolean;
  error?: string;
}

export async function generateShots(
  plans: ShotPlan[],
  outputDir: string,
  options: {
    concurrency?: number;   // default 3
    onProgress?: (shot: number, total: number, status: string) => void;
  }
): Promise<GeneratedShot[]> {
  // 1. Create output directory
  // 2. Generate shots in parallel (limited concurrency)
  // 3. For each shot plan:
  //    a. Call fal.ai API (LTX/Kling/Wan/Flux)
  //    b. Download result to outputDir
  //    c. Report progress
  // 4. Return results with success/failure per shot
}
```

## Reuse Existing Generation Infra

From `electron/native-pipeline/execution/step-executors.ts`:
- `executeGenerateImage` — fal.ai Flux image generation
- `executeCreateVideo` — fal.ai video generation (LTX/Kling/Wan)

From `apps/web/src/hooks/timeline/use-gap-generation.ts`:
- LTX video generation with progress tracking
- Model selection (ltx-video, kling, wan, minimax)

**Pattern:** Wrap existing `executeCreateVideo` in a batch runner with concurrency control.

## Concurrency & Rate Limiting

```typescript
import pLimit from 'p-limit';

const limit = pLimit(options.concurrency ?? 3);

const results = await Promise.allSettled(
  plans.map((plan, i) => limit(async () => {
    onProgress?.(i, plans.length, `Generating shot ${i + 1}...`);
    return generateSingleShot(plan, outputDir);
  }))
);
```

## Fallback Strategy
- If video generation fails → try image generation + Ken Burns
- If image generation fails → generate solid color placeholder with text overlay
- Always continue (don't abort entire pipeline for one shot failure)
