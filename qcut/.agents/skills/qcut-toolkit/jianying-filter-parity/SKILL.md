---
name: jianying-filter-parity
description: Trace a Jianying (剪映) filter from its local resource database to the downloaded package, classify its LUT/shader/segmentation implementation, then reproduce pure color grades in QCut with measured parity. Use for 剪映滤镜, 滤镜对标, 滤镜缓存, 拟合滤镜, 复刻滤镜, adding jy-* filter presets, or matching a reference color grade.
argument-hint: <filter-name-or-family>
---

# Jianying Filter Parity

QCut filters ("System A", `apps/web/src/lib/filters/`) are procedurally
generated 17³ LUTs: each preset is a `FilterLutRecipe` fed through the pure
`transformFilterColor` function in `filter-lut.ts`. This model can closely fit
some global color grades, but it cannot express every Jianying filter. A card
may instead use a higher-resolution 3D LUT, per-hue behavior, separate skin and
background LUTs, segmentation, textures, or a multi-pass shader graph.

**Inspect the downloaded package before fitting screenshots.** Package evidence
defines what the filter actually is; captures verify that the package mapping
and replay are correct. Only then decide whether a `FilterLutRecipe` is an
appropriate implementation target.

## Step 0 — Map the card to its local package

Jianying stores UI metadata and packages separately:

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
~/Movies/JianyingPro/User Data/Cache/artistEffect/<resource-id>/<md5>/
~/Movies/JianyingPro/User Data/Cache/effect/<resource-id>/<md5>/
```

Run the read-only inspector with the exact visible card title:

```bash
bun .agents/skills/qcut-toolkit/jianying-filter-parity/scripts/inspect-filter-cache.ts "静谧暗调"
```

The tool preserves 64-bit IDs as strings, searches both resource databases,
maps `title → resource ID + md5`, locates packages in both mixed cache roots,
and classifies common implementations:

- `3d-lut`: a `VF_V` float32 cube plus a sampler3D shader;
- `skin-segmented-dual-lut`: separate background/skin LUT images and a skin mask;
- `shader-or-effect-package`: inspect readable shaders, Lua, config, and graph;
- `unknown`: gather more UI/cache evidence before fitting.

An exact title can return multiple resources. Disambiguate with the UI card
order, cover image, or the `jianying-reference` one-card mtime probe. Never pick
the first title match silently. If the package is absent, apply that one card in
a disposable draft to force its download, then rerun the inspector.

A file that cannot be read or parsed is reported in that package's `issues`
array rather than aborting the run, so a half-downloaded asset never hides the
packages that did resolve. Treat a non-empty `issues` list as an incomplete
download: reopen the card in Jianying to finish it and rerun before concluding
anything about `kind`.

Read [cache-formats.md](references/cache-formats.md) before decoding or replaying
a package. Cached assets are local interoperability evidence: do not copy LUTs,
textures, shaders, Lua, or derived tables into the repo or product.

## Step 1 — Build a calibration chart (do this instead of a photo)

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

## Step 2 — Capture references from Jianying desktop (macOS)

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

## Step 3 — Fit the recipe

Build a one-off bun harness (they have always been ad-hoc; keep it out of
the repo):

1. Copy `transformFilterColor` plus the color-space math it calls from
   `filter-lut.ts` inline into the script (no imports — keeps it runnable
   anywhere).
2. Load both captures, sample a few thousand pixel-aligned (original,
   filtered) pairs.
3. Optimize the recipe parameters with random-restart + coordinate descent
   minimizing RGB RMSE. Report both weighted and natural-color RMSE.
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
6. Compare the fit against the **package replay**, not only the screenshot.
   A package replay that differs from the Jianying capture by >8 natural RMSE
   usually means the resource mapping, sampler coordinates, intensity, or
   segmented path is wrong. Fix that evidence chain before judging QCut.

For skin-segmented dual-LUT packages, a calibration chart validates only the
background path. Capture a common face clip to measure the skin path. Do not
claim full parity from a chart-only fit.

## Swing segmented-host parity (required)

Use this gate when a package consumes `share://skinsegmask.texture`. The
low-level Effect handle does not reproduce Jianying's host-side segmentation
state machine. Exercise the local interoperability probe instead:

```bash
research/jianying-runtime-probe/run-probe.sh filter-sequence
```

The manifest is `input<TAB>update-mode<TAB>reset-action`:

- `3,1,2` applies all mode changes before one seek/render;
- `3;1;2` performs one seek/render after each mode stage;
- `keep` performs one seek/render without changing the current mode;
- reset is `none`, `feature`, `video`, or `manager`.

Rebind the input texture before **every** staged seek. Omitting that call makes
the segmentation result weak or unstable. In the current 854x480 portrait
fixture, `3;1`, `3;1;2`, and direct mode `1` converge to the same byte-identical
mask. Mode `3` is `PREPARE_SEEK`; it is not a normal rendered-frame result.
This convergence does **not** establish UI parity. On the same lossless frame,
the established low-level Effect replay reaches `37.331 dB` against Jianying,
while the legacy C API Swing `3;1;2` candidate reaches only `32.669 dB`; the two host paths
are only `33.413 dB` apart. Preserve the low-level replay as the reference and
do not replace it with `3;1;2` until another sequence beats that baseline.

At a source/content discontinuity, recreate the Swing manager and its
`AlgorithmService`. `feature` and `video` resets do not clear the observed skin
segmentation history. The verified sequence
`portrait -> gray frames -> same portrait` restores the initial mask exactly
only with `manager` reset. Keep one manager for continuous frames; recreate it
at a clip/source boundary until a real Jianying UI trace proves a narrower
reset is sufficient.

Readback from the native Metal path is BGRA. Normalize it to RGBA before writing
`.rgba`; mode `3` passthrough must then match the input byte for byte.

At the `tt_skin_seg` ByteNN boundary, both initial host probes use BGR values with
`channel - 128` normalization and two half-pixel-center bilinear stages. Their
intermediate sizes differ for an 854x480 source: Low-level uses
`854x480 -> 227x128 -> 224x128`, while legacy C API Swing uses
`854x480 -> 398x224 -> 224x128`. Sparse impulses match both paths at 99.55%
with a maximum error of one; a deterministic 2D texture reaches RMSE 0.279 and
0.502 respectively. Direct one-stage resize or swapping the intermediate sizes
produces RMSE around 40-49. An earlier floor-versus-round inference assumed a
single resize and is withdrawn.

Do not treat that legacy Swing result as the UI path. Live sampling of Jianying
preview established the call chain `TESwingProcessUnit ->
TESwingEffectManagerV2 -> TESwingManagerInterfaceWrapper ->
SwingManager::seekFrameV2`. The public C create API hard-codes `XT_Init=true`,
which clears `enable_parallel_and_async_swing` during manager initialization
and silently selects legacy `seekFrame`. The UUID-gated research path can set
`JY_ENABLE_PARALLEL_ASYNC_SWING=1` and construct the manager without `XT_Init`.
Verify the sampled stack contains `seekFrameV2`; an accepted exit code alone is
not evidence.

For the 854x480 portrait fixture, the captured V2 tensor fits
`854x480 -> 227x128 -> 224x128` at `MAE 0.087 / RMSE 0.295`; the `398x224`
candidate is `MAE 0.819 / RMSE 1.812`. Together with the live UI V2 stack, this
strongly supports UI V2 and Low-level using the same intermediate size. Treat
that as a same-entry inference, not a direct UI tensor dump.

V2 output is in-place at the host boundary. Static tracing shows the wrapper
dereferences only the first `SwingDeviceTextureData` texture; the second struct
contributes its texture code but its texture is not read. Jianying's
`TESwingProcessUnit::renderEffect` passes the same `shared_ptr<ITEVideoFrame>`
address as both frame arguments. Read back the first DeviceTexture after
`seekFrameV2`; do not wait for a separate callback or read the legacy output
texture. A 10-frame 854x480 portrait run rendered 10/10 visible frames, with
frames 1-9 byte-identical after warm-up. The old black result came from reading
the unused legacy output texture. This proves the handoff contract, not final UI
parity; compare the exact UI fixture and package before reporting a new PSNR.

Keep the handoff proof separate from filter parity. The initial 10-frame proof
used local resource `7145394266209127694`, cataloged as Silver Blue. The exact
Olympus comparison uses resource `7361792068475325735`. With one duplicated
`3;1;2` preparation frame discarded and 180 aligned mode-1 frames, V2 reaches
only `31.720 dB` overall (`31.412` static, `31.882` dynamic), versus Low-level
at `40.741 dB` (`37.331`, `44.681`). Using the Low-level mask, V2 reaches
`22.552 dB` in the mask interior, `27.610 dB` on its soft boundary, and
`39.038 dB` in the background; interior blue is only `18.436 dB`. Entering
`seekFrameV2` and reading the correct texture therefore does not reproduce UI
segmentation state. Do not replace the Low-level baseline with this V2 sequence.

### Required validation checklist

- [ ] Capture the actual Jianying UI mode order for preview, play, seek, and
  export. Live sampling proves the V2 entry but not the mode values, so `3;1;2`
  remains a **rejected UI-like candidate**, not the captured UI sequence.
- [ ] Compare one calibration chart, one still portrait, and one short moving
  portrait at identical dimensions. Report whole-frame PSNR plus mask interior,
  boundary-band, and background errors separately.
- [ ] Verify manager reset on two different people and on a return-to-source
  seek. Initial and returned mask outputs must be byte-identical.
- [ ] Verify repeated frames within a continuous clip remain deterministic and
  do not require manager recreation.
- [ ] Read face boxes/landmarks through an independent result API before making
  any claim about face-keypoint parity; a working skin mask is not proof of
  working landmarks.
- [ ] Repeat short one-frame teardown runs before productizing. The proprietary
  runtime has shown one intermittent async teardown mutex failure.

To conserve investigation budget, do not repeat full-binary disassembly or long
180-frame runs when a targeted symbol lookup and the three fixtures above can
answer the question. Keep runtime libraries, models, packages, raw frames, and
logs outside git. Record only commands, hashes, metrics, and conclusions in
`docs/task/jianying-filter-runtime-research/`.

## Step 4 — Register the preset

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

## Step 5 — Thumbnails and verification

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
- Frame-verify every new preset against the same input at 100% intensity.
  Produce a labeled side-by-side image with Jianying/package replay on the left
  and QCut on the right, and record package-replay, natural, and all-chart RMSE.
- Keep raw cache assets and captured frames in a scratch directory outside the
  worktree. Comparison screenshots are acceptable evidence; proprietary package
  contents are not.

## Related

- `jianying-reference` — package harvesting + stepped-frame capture for
  non-LUT effects (text animations, transitions, shader filters, stickers).
- `scripts/inspect-filter-cache.ts` — exact-title database mapping and safe
  package classification without copying package contents.
- PR #373 shows the salvage pattern: presets carry fitted recipes as pure
  data, so they can be lifted from an abandoned branch with zero mechanism
  changes.
