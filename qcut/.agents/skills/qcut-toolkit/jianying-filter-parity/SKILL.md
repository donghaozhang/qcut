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

For a `skin-segmented-dual-lut` package with 512x512 `filter_bg.png` and
`filter_skin.png`, QCut can expose both 64-level tiled cubes only when a
package shader also proves the two-LUT-plus-mask mix. `available` then means
the cubes are loadable, not that segmentation parity is established. Keep the
card `unverified` until a real portrait comparison includes mask IoU; the
product's `skin-tone-v1` heuristic is not equivalent to spatial skin
segmentation.

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

## Full-binary multi-pass replay (local evidence only)

When a package is a multi-pass graph, use the complete local binary graph as
the interoperability oracle before replacing it with FFmpeg or Web effects.
Three controlled fixtures now reach exact RGB parity with Jianying UI:

- Clear Food reaches `RMSE 0 / PSNR 100 / SSIM 1` after explicitly sending
  the filter intensity event with value `1`; value `0` is byte-identical
  passthrough. An omitted intensity event is not equivalent to UI 100.
- Vignette Old Film reaches the same exact parity while exercising its packaged
  `src1.png`, sampler state, texture coordinates, Y orientation, alpha, blur,
  and pass order.
- Fog reaches exact parity across a four-stage graph: horizontal and vertical
  blur, a luminance-derived mask, two-input screen blending, three full-size
  intermediate render textures, and a final 64-level LUT. Its first frame is
  not UI-equivalent until the explicit `intensity=1` event is delivered.

Do not manually approximate a packaged blur, vignette, or blend and then infer
that the binary differs. First replay the graph with the package's own resources
and explicit UI parameters. Keep binaries, shaders, textures, LUTs, and raw
evidence outside git; record only hashes, commands, metrics, and conclusions.

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
segmentation history. This is verified both by returning to the same portrait
and by switching to a different person: in `portrait A -> gray -> portrait B`,
all ten B frames without reset differ from a fresh-B process, while manager
reset makes all ten byte-identical to fresh-B starting at B's first frame. Keep
one manager for continuous frames; recreate it at a clip/source boundary until
a real Jianying UI trace proves a narrower reset is sufficient.

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

The real UI update-mode trace is now known for preview load, paused seek, and
playback. Group calls by the underlying `SwingManager` pointer; grouping only by
time can mix unrelated interactions. One manager receives `0,1,1,2` during load,
`0` for a paused timeline seek, and repeated `1` calls while playing. All observed
calls enter through `TESwingManagerInterfaceWrapper::setUpdateMode`; the top-level
`TESwingProcessUnit::setUpdateMode` setter receives no application calls. Mode `3`
was not observed. Export remains untraced.

Replaying load as `0,1,1,2` before one render reaches `30.876 dB` on the 60-frame
static fixture; replaying it as staged `0;1;1;2` reaches `30.374 dB`. Both are
worse than the rejected `3;1;2` candidate at `31.412 dB` and the Low-level baseline
at `37.331 dB`. The UI mode order is therefore evidence about orchestration, but
it is not the missing parity variable. Do not spend another run permuting mode
values. Isolate manager/AlgorithmService/segment/feature initialization, AB state,
or segmentation model selection next.

The segmentation-result handoff is now isolated for the independent V2 host.
Do not interpret a zero `SkinSegInfo::textureId()`, null `nativeBuffer()`, or no
`updateTexture()` call as a missing mask. Working Low-level Effect and V2 show
all three conditions. Both instead use the CPU fallback: the native result's
`+0x18` field points to a container whose `+0x10/+0x18` fields are the mask
begin/end pointers. Both paths expose a complete `224x128`, 28672-byte mask.
Low-level repeats one byte-identical mask for 20 reads; V2 exposes valid masks
through all five `0;1;1;2;1` stages.

Compare model identity before comparing those bytes. The established Low-level
fixture loads the 260961-byte static `tt_skin_seg_v5.0.model` (MD5
`2b5a3aed4a9a45a67b7febabe9247d6e`), while the V2 resource callback loads the
407541-byte `tt_skin_seg_video_seg_fp16_v1.0.model` (MD5
`cd5474732a4b56b7fffceba8a83d7c1e`). After vertical orientation correction,
their final masks still differ by `MAE 15.442 / RMSE 40.492`, but that is not a
same-model parity result. Forcing the video model into Low-level loads the same
MD5 but yields an invalid weak result (`reflector=0`, range `0-15`), proving the
model also depends on V2 host configuration. Trace model selection and
AlgorithmService initialization before testing feathering or more mode orders.

The wrapper's manager-create boolean is not the missing configuration. Static
tracing shows that it maps `false` to Swing init mode `0` and `true` to mode
`2`, with UUID `8`. The independent host now performs the same mapping. Under
one fixed 854x480 input, package, `3;1;2` sequence, and model resolution, modes
`0` and `2` render byte-identical 10-frame outputs. Their discarded warm-up
frames are both `22.227 dB`; their first measured mode-1 frames are both
`32.899 dB`. Do not spend another run varying this mode.

Two additional manager flags are also ruled out for the Olympus segmented
fixture. `TESwingManagerInterfaceWrapper` maps `setIsImageQuality(true)` to
`SwingManager::setParameterBool("EnableImageQuality", true)`, and the live UI
does log `image quality is: 1`. In the independent V2 host, however,
`EnableImageQuality=false/true` produces byte-identical output across all ten
frames, selects the same video skin-seg model, and reports the same algorithm
size. `EnableAdjustColorWithFloat=false/true` is likewise byte-identical. Do not
repeat either flag as a parity experiment.

Do not interpret `bef_swing_segment_video_get_algorithm_width_height()` returning
`0x0` immediately after segment creation as a missing `AlgorithmService`. That
field is lazy: after the first seek/render it becomes `398x224` and remains
stable for the ten-frame run. The logs also show a real `edit_alg_system`
`AlgorithmService`, graph parsing, and skin-seg execution. The remaining problem
is configuration parity inside a running service, not service absence.

The raw feature-construction path is substantially shared. The public
`bef_swing_segment_video_create_feature` API obtains the video segment's manager
and creates feature segment type `0` with the package path. The UI's clip-based
path ultimately creates the same AmazingEngine segment classes, then adds
model-clip parameters, cache state, and tracking metadata around them.

Do not look for pixel-relevant portrait configuration in
`TESwingSegmentUtils::_generateFeatureParams`. Static tracing shows that function
only transfers feature order and start/end offsets into the `EffectBundle`.
`_syncClipSegmentParameters` is also a false lead: its
`CCJsScriptUpdateParams` value is delivered only to a `ScriptSegment`. The real
model-clip JSON channel is `ITEModelClip["amazing param"]`, read by
`TESwingEffectManager::updateSegmentParam` and delivered through the same segment
vtable `+0xc0` entry used by `bef_swing_segment_set_params`, which resolves to
`FeatureSegment::setParameters`.

That UI JSON has now been captured for Olympus at intensity 100. The only call
occurred while the draft loaded; selecting the filter track did not emit another
call. Its complete payload was
`{"blendMode":false,"hasPostEffect":false,"intensity":1.0,"previewColor":[0,0.756862759,0.80392158,0.501960814],"preview_effect_id":"","time":[]}`.
It contains no model, segmentation, mask, landmark, or AB configuration, so do
not repeat `amazing param` experiments.

The adjacent `TESwingEffectManager::updateBachAlgorithmParam` channel is also
ruled out for Olympus. A read-only observer captured the exact pre-service model
clip while the real UI loaded: `cc_model_enabled=0`, `amazing effect algorithm
type=0`, an empty `amazing effect algorithm result directory`, and a
`clip_res_path` pointing to resource `7361792068475325735`. The function exits
unless type is `1`, so the precomputed-result-directory path is disabled. Do not
force type `1` in the independent host; that would invent a UI state. The
installed `11.2.13024` build updated `libcccreator`, so the observer selects a
verified layout by UUID and refuses unknown layouts rather than reusing stale
field offsets. `support_external_model_name` has now been read at Swing init in
both paths: UI and independent V2 are both `3`, so do not mutate it. Both paths
request the same logical face, face-extra, and skin-seg names, but Jianying's
cache resolver maps face-extra and `tt_skin_seg_v5.0.model` to newer physical
files while the exact-first research finder returns the old files. Logical-name
parity is therefore not physical-model parity.

The initial physical skin-seg model comparison changed old `v5.0` to the
UI-resolved `v5.1_size100` file and observed the full UI mask improve from
`MAE 9.797590 / IoU 0.853549` to `MAE 3.243866 / IoU 0.962409`, while RGB
changed from `RMSE 1.796547 / 43.042030 dB` to
`RMSE 0.916513 / 48.888033 dB`. It proves that the resolver selects a
pixel-relevant physical model, but a later readiness-controlled run found that
the v5.1 candidate first rendered before CoreML reported ready. The same v5.1
file after controlled readiness instead reaches `RMSE 1.168216 /
46.780337 dB` and mask `MAE 4.988363 / IoU 0.946869`. Do not attribute the
entire old `5.846004 dB` delta to the model file. A pure v5.0/v5.1 model
measurement still requires both groups to share the same ready-before-render
protocol.

The UI-observed `enable_skin_seg_use_simd_optim` difference is now ruled out as
a pixel variable for the controlled v5.1 fixture. The probe injects `0/1`
before manager creation and the runtime reads `false/true`, respectively. Once
both CoreML backends report ready before the final staged preparation output,
all 71 RGBA frames and all 72 complete masks are byte-identical across the two
groups. Independent repeats produce the same trees. Earlier no-delay differences
correlated with different model-ready timing and decayed over subsequent moving
frames; they were lifecycle contamination, not SIMD output. Do not test this AB
again.

First-result delivery is now isolated for the independent V2 host. With model,
SIMD, package, input, texture flags, and parameters fixed, the probe reads the
actual in-place V2 texture immediately after the renderer callback, services the
current run loop for two seconds without an EffectSDK call, then reads the same
texture again. Five consecutive frames each changed `0/1639680` bytes; an
independent one-frame repeat also changed zero bytes and produced no extra CPU
mask. CoreML readiness is observed only when a later seek re-enters the
algorithm graph, and a ready log emitted inside a seek does not prove that seek
consumed the new result. Do not add passive waits to recover a pre-ready frame.
The explicit same-timestamp re-seek is now measured. With static history it
replaces the pre-ready mask and reaches `RMSE 0.916513 / 48.888033 dB` plus
mask `MAE 3.276394 / IoU 0.962641`; independent repeats are byte-identical.
After 60 static and 10 moving frames, the same re-seek falls to
`40.140233 dB / IoU 0.265185`, again deterministically. Re-seek consumes a
ready result but does not clear temporal segmentation history. Keep one manager
for a continuous clip; recreate the manager and AlgorithmService at a
clip/source boundary or backward timestamp discontinuity.

The UI's `enableAlgorithmCache:9` log is not itself the missing state. The real
wrapper entry is `setAlgorithmCacheFlag(9)`, which maps directly to
`SwingManager::setParameterInt("AlgorithmCacheFlag", 9)`. The separate
`RunAlgorithmMode` boolean was held unchanged. A controlled `0/9` comparison
changed the V2 initialization log as expected, but all ten output frames were
byte-identical, with the same model and `398x224` algorithm size. Do not test
this cache flag again. Keep the UI-resolved physical v5.1 model fixed while
isolating model-ready and first-result lifecycle, and do not rebuild the basic
video/feature graph without evidence.

The resource finder has an opt-in exact-first mode. With
`JY_PREFER_EXACT_MODEL_FILENAME=1`, it first matches the requested basename and
then falls back to the model family. This prevents a request for
`tt_skin_seg_v5.0.model` from silently receiving the video-family model. In the
current static fixture, exact-model output improves from
`RMSE 1.813743 / 42.959291 dB` to `RMSE 1.796547 / 43.042030 dB` against UI.
This comparison is old `v5.0` versus an incorrect video-family fallback. The UI
has since been observed resolving the same logical request to physical `v5.1`,
so the small gain does not bound the contribution of the UI's actual model.
Preserve exact-first for controlled comparisons, but do not call it physical
model parity or complete AlgorithmService parity.

The native texture-data third flag is pixel-critical for segmented filters.
With the old `00`-style configuration, the skin mask was vertically misbound;
using the verified `001` configuration and correct BGRA/RGBA normalization
raises the static portrait interior from `21.113` to `37.699 dB` and the full
frame from `30.442` to `44.521 dB`. Do not compare model or lifecycle variants
until this binding baseline is present.

`ExportMode` is a real manager parameter, but it is ruled out as a standalone
pixel variable for the current fixture. Setting
`SwingManager::setParameterBool("ExportMode", false/true)` before segment
creation produces ten byte-identical frames, the same model and algorithm
size, and the same clean teardown. A real export mismatch must therefore be
investigated in process orchestration, timestamps, source resets, concurrency,
or flush/wait order rather than by toggling this bool again.

Do not claim a direct UI object comparison from this result. Jianying rendering
runs in a hardened `--lvve-service` child that did not load the observer. A
forced OpenGL R8 texture ID reaches the result-packaging branch but cannot be
used by the Metal V2 renderer, so it is control-flow evidence only.

### Required validation checklist

- [x] Capture the actual Jianying UI mode order for preview load, play, and seek.
  The verified raw values are load `0,1,1,2`, paused seek `0`, and playback `1`.
- [x] Inspect the independent V2 skin-result handoff. Its consumed
  `SkinSegInfo` uses a complete CPU fallback mask despite having neither a
  texture ID nor a native buffer.
- [x] Match the wrapper's manager init mode mapping (`false -> 0`, `true -> 2`).
  The two modes produce byte-identical output in the controlled still fixture.
- [x] Compare the UI-visible image-quality flag. `false/true` produces
  byte-identical ten-frame output and does not change model identity or the
  post-render `398x224` algorithm size.
- [x] Match the UI's `AlgorithmCacheFlag=9`. The init log changes from `0` to
  `9`, but all ten frames remain byte-identical; `RunAlgorithmMode` was not
  changed.
- [x] Compare old `v5.0` exact-first against the incorrect video-family
  fallback. The static UI baseline changes `42.959291 -> 43.042030 dB`.
- [x] Return the UI-resolved physical `v5.1` skin-seg file for the same logical
  request and compare full masks plus RGBA before changing any AB value. The
  output changes materially, but the original `5.846004 dB` estimate also
  contains a model-ready lifecycle difference and is not a pure model delta.
- [x] With physical v5.1 held fixed, compare only
  `enable_skin_seg_use_simd_optim=0/1`. After controlling CoreML readiness, 71
  RGBA frames and 72 masks are byte-identical; SIMD is ruled out for this
  fixture.
- [x] With model, SIMD and input fixed, compare the same in-place texture before
  and after a two-second post-seek run-loop wait. Five frames and an independent
  repeat have zero changed bytes and no extra mask; passive time does not rerun
  the current frame.
- [x] After a later seek observes CoreML readiness, re-seek the original input
  at the same timestamp. Static history reaches `48.888033 dB / IoU 0.962641`;
  moving history reaches only `40.140233 dB / 0.265185`, establishing the
  backward-discontinuity manager-reset rule.
- [ ] Capture the actual Jianying export mode order. Do not infer it from preview.
- [ ] Compare one calibration chart, one still portrait, and one short moving
  portrait at identical dimensions. Report whole-frame PSNR plus mask interior,
  boundary-band, and background errors separately.
- [x] Verify manager reset on two different people and on a return-to-source
  seek. Different-person B is byte-identical to fresh-B from its first frame
  only after manager reset.
- [x] Verify repeated frames within a continuous clip remain deterministic and
  do not require manager recreation. Ten repeated B frames are stable in both
  continuous and reset runs.
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
