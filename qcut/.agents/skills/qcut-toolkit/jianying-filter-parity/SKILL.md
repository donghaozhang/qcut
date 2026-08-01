---
name: jianying-filter-parity
description: Clone a Jianying (剪映) filter look into QCut as a fitted FilterLutRecipe preset — capture references from the Jianying desktop UI, least-squares fit the recipe, register it in the filter catalog, and lock it with parity tests. Use for 剪映滤镜, 滤镜对标, 拟合滤镜, 复刻滤镜, adding jy-* filter presets, or matching a reference color grade.
argument-hint: <filter-name-or-family>
---

# Jianying Filter Parity

QCut filters ("System A", `apps/web/src/lib/filters/`) are procedurally
generated 17³ LUTs: each preset is a `FilterLutRecipe` (exposure, contrast,
saturation, temperature, tint, fade, gamma, blackLift, hueShift,
shadow/highlight tint) fed through `transformFilterColor` in `filter-lut.ts`.
That function is **pure**, so any external look can be cloned by numerically
fitting the recipe against a reference before/after image pair. This produced
PR #347 (8 summer/cinema looks) and PR #373 (30 jy-* presets); typical fit
quality is 3–8 RMSE/255.

For filters that are *effect packages* (shaders, textures) rather than pure
color grades, harvest the package with the `jianying-reference` skill instead
— this skill covers the LUT-fit path only.

## Step 0 — Build a calibration chart (do this instead of a photo)

Fitting against a photo wastes most samples on one narrow region of color
space. Generate a **576-patch chart** at the project resolution instead:
8×8×8 RGB cube (512) + 16-step gray ramp + 16 skin tones + 32 saturated
hues, each patch a flat 60×60 block. Import it as a still, drop it on the
timeline, and sample **patch means** (9×9 px at each patch center) — one
clean (before, after) pair per patch, immune to the preview's scaling and
compression.

Locate the canvas rect in the capture programmatically before sampling:
find the saturated hue row's x-extent and its bottom edge, then derive
`(x0, y0, w, h)` from the known 16:9 aspect. Verify by reading back the
gray ramp — patch *i* must read ≈ `i*255/15`. A mis-derived rect silently
poisons every fit (cost us one full pass).

Weight the fit toward what real footage contains: grays/skin ×3, cube
interior ×2, cube edges ×0.5, saturated hues ×0.35. Report a separate
"natural" RMSE over grays/skin/interior only — that number, not the raw
fit, is what decides whether a preset ships.

## Step 1 — Capture references from Jianying desktop (macOS)

1. Add the filter as a **track segment** via the hover "+" button on the
   filter card. This is the only trustworthy path: segment intensity is
   always 100 and the panel shows the filter name (self-verifying).
   - Clicking a card only opens a transient preview; drag-to-clip applies a
     per-filter *default* intensity. Both make unusable references.
2. Pause the playhead on one representative frame. Capture with
   `screencapture -x -D 2 out.png`, then crop the player region with ffmpeg.
3. Capture the SAME frame with no filter (delete the segment) → the
   before/after pair.

**Capture traps (each has burned a session):**
- `screencapture` grabs *everything on screen* — unlike computer-use
  screenshots it does not hide other apps. A browser window overlapping the
  player silently corrupts the pair. **Visually verify every capture.**
- Never cycle filters with cmd+z loops: one missed drag desyncs the undo
  stack and contaminates every later capture. Delete + re-add the segment.
- Both captures go through the same display transform, so it cancels in the
  fit; captured pairs differ from true video frames by only ~2–3/255.

## Step 2 — Fit the recipe

Build a one-off bun harness (they have always been ad-hoc; keep it out of
the repo):

1. Copy `transformFilterColor` plus the color-space math it calls from
   `filter-lut.ts` inline into the script (no imports — keeps it runnable
   anywhere).
2. Load both captures, sample a few thousand pixel-aligned (original,
   filtered) pairs.
3. Optimize the recipe parameters with random-restart + coordinate descent
   minimizing RGB RMSE. Accept at ≤8 RMSE/255; the best fits land near 3.
4. **Do not hand-"fix" fitted values afterwards.** Outliers like
   `contrast: 2.82` or `gamma: 2.26` are legitimate fit results;
   `buildFilterCube` output is verified bounded by the catalog test.
5. **Fit more candidates than you ship and keep the closest.** QCut's
   recipe is a global tone/color transform — Jianying looks built on
   per-hue targeting or texture overlays cannot be expressed and fit at
   25–35 natural RMSE no matter the optimizer. Capturing 7–9 candidates
   per family and keeping the best 5 costs ~2 extra minutes per filter and
   keeps the catalogue honest. Rules of thumb: ≤12 natural RMSE is a close
   clone, 12–20 is a recognizable interpretation, >25 means the look needs
   machinery QCut does not have — drop it rather than shipping a stand-in.

## Step 3 — Register the preset

Follow the PR #373 layout in `apps/web/src/lib/filters/jianying-parity/`:

- Add the preset to the matching family file (`portrait-` / `landscape-` /
  `food-` / `camera-presets.ts`), or create a new family file and spread it
  into `index.ts`'s `JIANYING_PARITY_FILTER_PRESETS`.
- Registry wiring is already done (`filter-registry.ts` spreads the
  aggregate); a new family only touches `index.ts`.
- Conventions (enforced by tests): id `jy-<slug>`, Chinese + English names,
  `thumbnail: /images/filter-previews/<id>.webp`,
  `lutAssetId: qcut/filter/<id>/v1`, `defaultIntensity: 100` (= the parity
  point), `version: 1`, `isNew: true` for the release that ships it.
- Update `__tests__/filter-jianying-parity-presets.test.ts`:
  `EXPECTED_LOCALIZED_NAMES` order and per-family counts are a deliberate
  catalog snapshot — extend them, don't loosen them.

## Step 4 — Thumbnails and verification

- Generate the `/images/filter-previews/jy-*.webp` thumbnail with the
  existing generator. It needs the `packages/nexusai-website` showcase assets
  (a gitlink submodule — empty in fresh worktrees; symlink from the main
  tree). Regeneration rewrites **all** webp files; `git checkout --` the ones
  you didn't mean to touch.
- Run the catalog test (id/name/thumbnail/lutAssetId conventions + every
  recipe's 17³ cube finite and within [0,1]).
- `electron/__tests__/filter-library-parity-real.test.ts` auto-covers new
  presets but needs a real ffmpeg at
  `electron/resources/ffmpeg/darwin-arm64/ffmpeg` (not in git — symlink in
  worktrees, remove before committing).
- Frame-verify at least one preset visually against the Jianying reference
  (side-by-side crop) before opening the PR.

## Related

- `jianying-reference` — package harvesting + stepped-frame capture for
  non-LUT effects (text animations, transitions, shader filters, stickers).
- PR #373 shows the salvage pattern: presets carry fitted recipes as pure
  data, so they can be lifted from an abandoned branch with zero mechanism
  changes.
