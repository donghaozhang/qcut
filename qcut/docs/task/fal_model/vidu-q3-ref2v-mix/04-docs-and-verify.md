# Subtask 4 — Live Verification + Docs

End-to-end smoke against FAL, then record what we learned in the
existing CLI guide so future debugging has a real baseline.

## Verification command

```bash
qcut gen video -m vidu_q3_ref2v_mix \
  -t "Anime woman with long dark hair walks gently into frame, soft cinematic light, modern anime film style" \
  --image-url https://v3b.fal.media/files/b/0a9632d3/RjQKpimGKkHGbNX1zOH0R_front.png \
  -d 4s --resolution 720p --aspect-ratio 16:9
```

(Reuses the anime portrait we uploaded earlier today — already
public, avoids real-person privacy filters that triggered with
photorealistic refs.)

**Expected:**

- Submission lands on `IN_QUEUE` (no schema 422 — would mean the
  field-name mapping in subtask 2 is wrong).
- Wall-clock 2–5 min (Vidu Q3 i2v is in this range).
- Cost printed at end ≈ 4s × $0.154/720p = **~$0.62** (or whatever
  FAL actually charges for `mix`).
- MP4 saved to `~/Documents/QCut/exports/output_<ts>.mp4`.

## What to record

In `docs/task/gmi-video-cli-guide/07-stage-workflow.md` (under the
existing "Verified" sections, **not** as a new Stage) add a short
block titled **"Verified Vidu Q3 Ref2V mix via `gen video`"** with:

- Exact command used
- Wall-clock duration
- Cost reported (validates the registry's `perSecondPricing`
  assumption, or proves it needs adjusting)
- MP4 file path + size
- Any surprising behavior — content moderation, schema quirks,
  audio defaults

If the cost or wall-clock differs meaningfully from the registry
estimate, **update**:

- `electron/native-pipeline/registry-data/image-to-video.ts` — the
  `vidu_q3_ref2v_mix` `pricing` block / `costEstimate` /
  `processingTime`
- The `perSecondPricing` table in
  `apps/web/src/components/editor/media-panel/views/ai/constants/image2video-models-config.ts`

## Optional follow-ups (worth tracking but defer unless asked)

1. **Multi-image CLI flag.** `--image-urls a.png b.png c.png` (1–4)
   — current single-image path satisfies most users but the model
   accepts up to 4. Add a `string[]` flag in `command-registry.ts`
   `create-video.flags`, plumb through `CLIRunOptions.imageUrls`
   into `executeImageToVideo`, branch on it for `vidu_q3_ref2v_mix`.
2. **Editor UI generation handler.** If users want this model from
   the editor (not just the CLI), add a handler in
   `apps/web/src/components/editor/media-panel/views/ai/hooks/generation/handlers/image-to-video-handlers.ts`
   and a routing case in `model-handlers.ts` similar to how
   Seedance ref2v is wired. Requires UI for picking 1–4 reference
   images.
3. **Compare against `/reference-to-video` (non-mix).** If the
   non-mix endpoint exists with a different price/quality
   tradeoff, register it as `vidu_q3_ref2v` so users can pick.
   FAL's public docs don't currently distinguish; might be a
   server-side mode flag.

## Acceptance

- One real `gen video` call producing a downloadable MP4.
- Stage workflow doc updated with the verified-run block.
- If pricing differs from assumption, registry + UI config updated
  and a follow-up commit notes the corrected rate.
