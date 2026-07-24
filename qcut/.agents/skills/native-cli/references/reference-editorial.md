# Editorial Index, Plan, and Verification

Use this workflow when editing scenic, travel, montage, product, or other
multi-source footage. It complements `qcut analyze video`; it does not replace
the fast single-video command.

## Command Boundary

```bash
# Fast, one-off understanding of one video
qcut analyze video -i clip.mp4

# Reusable local and semantic index for a source directory
qcut analyze index --dir ./downloads -o ./analysis

# Deep visual inspection of one candidate interval
qcut analyze inspect \
  --index ./analysis/index.json \
  --source yarra.mp4 \
  --start 2 \
  --end 9

# Narration-beat alignment, first-class EDL, and QCut manifest
qcut edit plan \
  --index ./analysis/index.json \
  --script narration.en.txt \
  --duration 43 \
  -o ./plan-en

# Apply the planned timeline to an open QCut project
qcut editor timeline apply \
  --project-id <project-id> \
  --manifest @./plan-en/timeline.json \
  --replace \
  --atomic \
  --verify

# Inspect the exported result at every cut
qcut edit verify \
  --edl ./plan-en/edl.json \
  --video ./final-en.mp4 \
  --cut-window 1.5 \
  -o ./verification-en
```

Use space-separated CLI groups. Do not add a `video-use` command or slash
command for this workflow.

## Multi-Source Index

`analyze index` records:

- Media probe data and a SHA-256 source fingerprint
- Local FFmpeg scene boundaries
- Frame-level luma, contrast, sharpness, focus position, motion, and stability
- Stable ranges and ranked candidate in/out points
- Optional Gemini summary, tags, location, time of day, subjects, and scenes

The default semantic model is `openrouter_gemini_3_5_flash_video`. Local
sources are represented by up to 12 ordered 640x360 JPEG frames anchored to
FFmpeg scene boundaries. This avoids embedding a large source video in an
OpenRouter request. Use `--no-ai` for deterministic local-only indexing.

Primary output:

```text
analysis/index.json
```

Semantic analysis is best effort per source. A model failure is recorded in
that source's `warnings`; local scene and quality indexing still completes.

## Local Timeline View

`analyze inspect` produces a PNG and JSON sidecar containing:

- Continuous sampled frames
- Source time ruler
- Scene boundaries
- Narration waveform when `--narration` is supplied
- Word positions when `--transcript` is supplied

`edit plan` produces the same view for every selected clip under `views/`.
When only a script is available, word positions are estimated and marked as
such. Supplying narration audio triggers transcription unless a transcript is
provided explicitly.

## Beat-Aligned Planning

Label script beats with `NAME:`:

```text
YARRA: The Yarra River threads through the city.
TRAM: Trams move through Melbourne's street grid.
DUSK: At dusk, the skyline changes character.
```

The planner:

1. Creates beat timing from word timestamps or script weight.
2. Splits long beats into shot-sized slots.
3. Scores candidates for semantic relevance, technical quality, motion and
   composition continuity, and repetition.
4. Writes an EDL and a directly applicable QCut manifest.

Chinese and English scripts are planned independently. They may share source
decisions, but their beat timing and cut positions are not forced to match.

Each EDL clip includes:

```json
{
  "source": "pexels-yarra-riverfront.mp4",
  "start": 2.4,
  "end": 8.1,
  "beat": "YARRA",
  "reason": "matched river; stable composition; right screen motion"
}
```

Outputs:

```text
plan-en/edl.json
plan-en/timeline.json
plan-en/views/clip-01.png
plan-en/views/clip-01.json
```

Timeline boundaries are generated from one authoritative cursor. Adjacent
clips have no gap or overlap. Applying another language plan reuses existing
project media when filename and byte size match.

## Final-Cut Verification

`edit verify` checks every EDL cut for:

- One-frame luminance flashes
- Large composition jumps
- Motion-direction reversals
- Isolated audio RMS spikes
- Declared title overlap and title-safe-area risk

It writes:

```text
verification-en/verification.json
verification-en/cuts/cut-01-3.295s.png
```

The JSON report contains per-check measurements, status, severity, and a
human-readable message. `passed` is false when an error is present; warnings
remain visible for editorial review.

## E2E Acceptance

For a real source set, verify all of the following:

1. `index.json` contains every readable source and at least one candidate per
   useful scene.
2. A default-AI smoke run has populated `semantics` and no payload-size error.
3. `inspect` and per-clip views contain frames, ruler, and scene boundaries.
4. Chinese and English plans have independently derived cut arrays.
5. `editor timeline apply --atomic --verify` succeeds with transitions.
6. Read-back duration and trim values match the EDL.
7. Reapplying another language does not duplicate shared source media.
8. The exported file is 1920x1080 or better when 1080p is requested.
9. `edit verify` writes evidence for every cut and reports no unexplained
   errors.
