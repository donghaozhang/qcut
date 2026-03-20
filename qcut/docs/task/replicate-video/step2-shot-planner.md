# Step 2: Shot Planner — Map Recipe to Generation Strategy

## Goal
Take a VideoRecipe and decide how to generate each shot: AI video generation, AI image + animation, user-provided media, or placeholder.

## File to Create

### `electron/native-pipeline/replicate/replicate-planner.ts`

```typescript
interface ShotPlan {
  shotIndex: number;
  strategy: "ai-video" | "ai-image" | "user-media" | "placeholder";
  model: string;           // "ltx-video" | "kling" | "wan" | "flux-image"
  prompt: string;          // refined prompt for generation
  negativePrompt?: string;
  duration: number;
  width: number;
  height: number;
  userMediaPath?: string;  // if strategy is user-media
}

export function planShots(
  recipe: VideoRecipe,
  options: {
    userMediaDir?: string;     // directory of replacement clips
    preferredModel?: string;   // override model for all shots
    imageOnly?: boolean;       // generate stills instead of video
    budgetLimit?: number;      // max $ to spend on generation
  }
): ShotPlan[] {
  // For each shot in recipe:
  // 1. Check if user provided a matching clip in userMediaDir
  // 2. If not, choose AI generation model based on shot characteristics
  // 3. Refine prompt (add style tags, negative prompts)
  // 4. Estimate cost, respect budget
}
```

## Strategy Selection Logic

| Shot Type | Duration | Strategy |
|-----------|----------|----------|
| Title card | Any | AI image + text overlay |
| Transition | <1s | Skip (handled by timeline transitions) |
| Static shot | <5s | AI video (LTX/Wan) |
| Dynamic shot | <5s | AI video with camera motion prompt |
| Long shot | >5s | Split into multiple AI generations |
| With voiceover | Any | AI image + Ken Burns effect |

## User Media Matching

If `--media-dir` provided, match user clips to shots by:
1. Filename matching (shot_01.mp4 → shot index 1)
2. Duration matching (closest duration clip for each shot)
3. Manual mapping via `--media-map shot_1=clip_a.mp4`
