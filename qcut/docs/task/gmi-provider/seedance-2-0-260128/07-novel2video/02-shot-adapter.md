# Subtask 2 — Per-shot adapter (pure, testable)

> **Status:** ✅ Landed. 23 tests green (12 adapter + 7 sanitize +
> 4 clamp). Adapter stayed under 170 lines, zero fs/fetch imports.
> The live smoke exercised its t2v fallback branch — when portrait
> uploads fail, the adapter logs uncatalogued characters in
> `skippedCharacters` and the handler surfaces the reason
> `"t2v: N character not catalogued, degrading"` in
> `videos/registry.json`.

Turn one `Shot` + the portrait registry into a ready-to-submit
Seedance payload + variant decision. Keeping this pure means the
handler (subtask 3) stays a thin loop and the decision logic is
unit-testable without any HTTP or disk I/O.

## Files

### Add

- `electron/native-pipeline/cli/vimax-cli-handlers/video-shot-adapter.ts`
  — new. ~180 lines. Zero side effects; no fetch, no fs.

### Test

- `electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts`
  — new. 12–15 cases covering variant selection, payload shape,
  prompt sanitization, and degenerate inputs.

## Surface

```ts
import type { CharacterPortraitRegistry } from "../../vimax/types/character.js";

export type SeedanceVariant =
	| "gmi_seedance_2_0_260128_ref2v"
	| "gmi_seedance_2_0_260128_i2v"
	| "gmi_seedance_2_0_260128_t2v";

export interface ShotInput {
	shotId: string;                     // e.g. "1-1-3"
	description: string;                // raw shot.description (bilingual ok)
	characters: string[];               // character names from script
	durationSeconds: number;            // clamped to [4, 15] by adapter
	firstFrameUrl?: string;             // set by continuity pass
	aspectRatio?: string;
	resolution?: string;
}

export interface AdaptedShot {
	variant: SeedanceVariant;
	payload: Record<string, unknown>;
	referenceUrls: string[];            // for logging / dedupe
	skippedCharacters: string[];        // named in script but no portrait
	reason: string;                     // why this variant was chosen
}

export function adaptShotForSeedance(
	shot: ShotInput,
	portraits: Record<string, string>, // character → HTTPS URL
): AdaptedShot;
```

`portraits` is the already-uploaded HTTPS URLs keyed by character
name. Subtask 3 (the handler) walks `portraits/registry.json`, runs
each `front_view` through the subtask-1 uploader, and passes the
resulting map into the adapter.

## Variant selection

```text
if firstFrameUrl set          → i2v
else if any character in portraits → ref2v
else                          → t2v
```

Always return a single variant — no silent combining of i2v +
references. Seedance's `ref2v` generator rejects payloads with a
`first_frame` (`gmi-image-to-video.ts:generateSeedance260128ReferenceVideo`),
so mixing is already invalid upstream; the adapter reflects that.

## Prompt sanitization

Shot descriptions from `chunk_NNN.json` mix stage directions (`△`
prefixed) and dialogue (`<character>:` prefixed). Seedance prompts
work better on pure visual descriptions.

Rules (documented, simple, reversible):

- Strip leading `△` markers but keep the text that follows them
  (stage direction is the *most* video-relevant content).
- Strip dialogue: lines matching `^[^：:\n]{1,20}[：:]` get their
  speaker tag removed; keep the spoken text in case the scene
  depends on it.
- Trim to 8000 characters max (Seedance doesn't document a hard
  cap; raised from 500 to support long-form scene descriptions.
  Empirically 300–500 chars remains the sweet spot for cdrama
  material — the cap exists as an upper bound, not a target).
- Collapse duplicate whitespace.

No LLM rewriting — keep the transform deterministic so the adapter
stays fast and testable.

## Payload construction

Build the payload with **only** fields the caller provided. Use the
shared `applySeedance260128OptionalFields` helper already exported
from `apps/web/src/lib/ai-video/generators/gmi-text-to-video.ts`
(re-exported via `apps/web/src/lib/ai-video/index.ts`) to avoid
drifting from the in-app payload contract. Adapter imports the
barrel, not the inner module.

Required:

- `prompt` — sanitized description.
- `duration` — `clamp(shot.durationSeconds, 4, 15)` as integer.

Added conditionally:

- `resolution`, `ratio` — only if caller specified (rely on
  registry defaults otherwise).
- `first_frame` — i2v only.
- `reference_images` — ref2v only. Slice to first 4 (GMI limit from
  the subtask-2 doc of the original plan).
- `generate_audio` — pass through; default handled upstream.

## Tests (`video-shot-adapter.test.ts`)

1. Picks `t2v` when shot has no characters and no `firstFrameUrl`.
2. Picks `ref2v` when at least one character has a portrait.
3. Picks `i2v` when `firstFrameUrl` is set, regardless of character
   list.
4. Mixed shot with 2 catalogued + 1 uncatalogued character returns
   `ref2v` with 2 refs and logs the uncatalogued name in
   `skippedCharacters`.
5. Clamps `durationSeconds: 2` up to 4; clamps `20` down to 15;
   passes `7` through as integer.
6. Strips `△` and dialogue prefixes; keeps dialogue text.
7. Truncates prompts over 8000 chars to 8000, preserving word
   boundaries.
8. Omits `reference_images` from t2v payload entirely (not
   `reference_images: []`).
9. Limits `reference_images` to 4 when 6 characters are catalogued.
10. Collapses duplicate whitespace inside the prompt.
11. Uses explicit `aspectRatio` / `resolution` overrides when
   provided; omits them otherwise.
12. Output `payload` passes `applySeedance260128OptionalFields`'s
   sanity check (no extra keys, no string durations).
13. `reason` string is stable & human-readable for each variant
   branch — assert it contains the variant name so logs are
   greppable.

Mock nothing — adapter is pure. Tests take <10 ms total.

## Why split this out

- Decisions the adapter makes (variant, prompt shape, clamping) are
  the lines most likely to evolve as we see real output quality.
  Keeping them pure means iteration doesn't reach into the handler's
  loop + reporter + upload concerns.
- Subtask 5's integration tests can re-use this module's cases as
  fixtures — the handler test mocks the adapter's return value
  rather than re-encoding all 13 branches.

## Definition of done

- [x] `video-shot-adapter.ts` < 200 lines; no fs/fetch imports.
- [x] 23/23 tests pass: `bunx vitest run
  electron/native-pipeline/cli/vimax-cli-handlers/__tests__/video-shot-adapter.test.ts`.
- [x] Re-export via `cli/vimax-cli-handlers/index.ts` so the handler
  and tests import from a stable path.
