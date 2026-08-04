# Representative transition implementation plan

## Purpose

This document turns package inspection into an implementation and validation
plan for five representative Jianying transitions:

1. `叠化` establishes the dual-input and timing contract.
2. `左移` / `右移` establishes package-local progress easing and direction.
3. `翻页` establishes nonlinear UV deformation and edge treatment.
4. `横移模糊` establishes a multi-pass 2D render graph.
5. `立方旋转` establishes the WebGL 3D and export boundary.

The observations below are behavioral facts derived from locally cached
packages. Do not copy Jianying shaders, scripts, textures, databases, or
package files into QCut. Implement the behavior in original QCut code and use
QCut-owned assets.

## Current state

| Transition | Package family | Default duration | Package progress | QCut status |
| --- | --- | ---: | --- | --- |
| `叠化` | simple dual-input GLSL | 0.5 s | linear | timing and formula represented |
| `左移` / `右移` | simple dual-input GLSL | 1.0 s | quintic ease-in-out | easing and push direction represented |
| `翻页` | nonlinear dual-input GLSL | 0.5 s | linear | UI exists; preview/export are approximations |
| `横移模糊` | Lua multi-pass graph | 0.8 s | linear outer progress plus baked curves | UI exists; preview/export are approximations |
| `立方旋转` | Lumi/AE 3D graph | 1.0 s | linear outer progress plus baked curves | UI exists; preview/export are approximations |

The transition catalog, card preview, drop payload, timeline clip model,
properties panel, browser presentation, and FFmpeg export path already exist.
The next work is renderer fidelity, not another transition browser.

## Measured baseline (2026-08-01)

The calibration run used original asymmetric BT.709 clips and sampled five
fixed progress stops. Values below are RGB RMSE in the 0-255 domain. Cross
export is the strongest renderer-parity signal. The QCut preview/export column
combines renderer differences with display capture, scaling, and color
transforms; it does not isolate preview-renderer drift.

| Transition | Jianying vs QCut export mean / worst | QCut preview vs export mean / worst | Finding |
| --- | ---: | ---: | --- |
| `叠化` | 6.462 / 7.810 | not recaptured after BT.709 normalization | export formula meets the <= 8 gate |
| `左移` | 4.052 / 5.846 | 16.457 / 19.795 | export is close after endpoint pixel snapping; the combined preview/capture path differs |
| `右移` | 4.606 / 8.366 | 18.107 / 23.443 | near the export gate; the combined preview/capture path differs |
| `翻页` | 73.708 / 129.647 | 134.504 / 156.304 | flat CSS/soft-wipe approximations do not reproduce the curl |
| `横移模糊` | 52.319 / 139.278 | 18.251 / 21.435 | missing delayed source switch and multi-pass graph |
| `立方旋转` | 81.099 / 117.917 | 95.301 / 145.425 | independent planes and 2D squeeze do not reproduce shared 3D geometry |

The UI shell is already sufficient for implementation work: transition
catalog, preview, property controls, seam marker, duration, deletion, and
export are present. The representative midpoint captures show that page flip
and cube rotate need a shared GPU renderer first; adding more cards would only
multiply approximations.

## Shared renderer contract

Keep the timeline model independent from any particular renderer:

```ts
interface TransitionRenderRequest {
  from: VideoFrameSource;
  to: VideoFrameSource;
  progress: number;
  width: number;
  height: number;
  parameters: Readonly<Record<string, number | string | boolean>>;
}
```

The actual project types may differ; the contract needs these semantics:

- `progress` reaches exact endpoints `0` and `1` after frame quantization.
- A preset chooses its progress policy. A quintic package must not silently
  change the default easing for unrelated transitions.
- Both sources use the same fit, crop, orientation, color, and alpha rules.
- Preview and export call the same effect math or consume the same render
  recipe. Duplicating constants in CSS and FFmpeg will drift.
- Every effect defines a deterministic endpoint fast path: return A at zero
  and B at one before unstable geometry or blur stages run.
- Renderer output dimensions are fixed. Intermediate render targets may grow,
  but the final crop is always the project frame.

Split implementation concerns into three layers:

1. **Core recipe:** pure progress, curves, geometry parameters, and render-pass
   descriptions in `packages/editor-core`.
2. **Preview executor:** WebGL renderer in the web app. CSS remains acceptable
   only for effects whose package behavior is affine and compositing-only.
3. **Export executor:** FFmpeg for formulas it can reproduce exactly; a
   headless GPU/frame-bake path for nonlinear 3D or multi-pass parity effects.

Do not label a CSS or FFmpeg approximation as Jianying parity. Keep it as an
explicit fallback if the GPU executor is unavailable.

## 1. Dissolve (`叠化`)

### Evidence

- Resource ID: `6724845717472416269`
- Package MD5: `33d3a1ad16e89a4e2c9b6d45e3ec7aa1`
- Renderer: simple dual-input shader
- Formula: `C(p) = (1 - p) A + p B`
- Default duration: `0.5 s`
- Progress: linear

There is a catalog title collision with an AI transition. Lock the resource ID
and MD5 before capture instead of selecting the first `叠化` title match.

### Implementation

Use dissolve to prove source ordering, endpoint ownership, transition-frame
quantization, and preview/export plumbing. No WebGL-specific implementation is
needed if both browser and export use the same linear, color-correct blend.

Check whether browser canvas and FFmpeg blend in the same color space. A
formula can be mathematically identical while midtones differ because one
path blends display-encoded RGB and the other blends linear light.

### Tests

- Exact A at `p=0` and exact B at `p=1`.
- Asymmetric RGB samples at all five stops.
- Durations around frame boundaries at 24, 25, 30, and 60 fps.
- Preview and export five-stop RMSE against Jianying.

## 2. Move left/right (`左移` / `右移`)

### Evidence

`左移`:

- Resource ID: `6726711499676455435`
- Package MD5: `0f270429a317b5db68d2b0f18255f5f5`
- Default duration: `1.0 s`

`右移`:

- Resource ID: `6726711296063967748`
- Package MD5 observed in catalog: prefix `2e46...`
- The exact package still needs to be downloaded and identity-locked before a
  high-confidence claim.

The left-move package applies quintic ease-in-out internally:

```text
q(p) = 16p^5                         when p < 0.5
q(p) = 1 - 16(1 - p)^5              otherwise
```

At a 1920 px frame width, left-move A/B offsets are:

| p | A x | B x |
| ---: | ---: | ---: |
| 0 | 0 | 1920 |
| 0.25 | -30 | 1890 |
| 0.5 | -960 | 960 |
| 0.75 | -1890 | 30 |
| 1 | -1920 | 0 |

The right-move offsets are mirrored. A cubic ease would be visibly wrong at
25% and 75%, even though its midpoint and endpoints match.

### Implementation

- Store `easeInOutQuint` as a preset-selected progress policy.
- Evaluate easing once. The browser and export must consume the eased value
  and must not apply another CSS timing function afterward.
- Use full-frame translation with the incoming source filling the exposed
  area. Do not stretch either source or introduce an empty border.
- Verify the naming convention: Jianying `左移` means A exits left and B enters
  from the right. In the existing QCut push model this maps to the direction
  currently named `right`.

### Tests

- Pure quint values at all five stops.
- Pixel offsets at a known width for both directions.
- No gap, overlap seam, or wrap artifact at fractional pixel positions.
- Real `右移` package capture before declaring symmetry proven.

## 3. Page flip (`翻页`)

### Evidence

- Resource ID: `6747979085894390279`
- Package MD5: `8bed2cd10ef9673107511b411b8179a1`
- Renderer: nonlinear UV page curl
- Default duration of the inspected standard package: `0.5 s`
- Progress: linear

The title also points to a newer one-second package, so parity captures must
show the selected card and duration. The inspected package maps progress to a
cylinder travel value using `1.66p - 0.16`, then deforms normalized UVs around
a fixed curl axis. Its branches distinguish the flat page, curled front,
backside, see-through region, destination behind the curl, and edge shadow.
The backside is desaturated and shaded. A narrow antialiased edge blend avoids
a hard stair-stepped boundary.

### Current gap

The browser currently rotates flat CSS layers in perspective and darkens one
layer. The export path uses a moving fold boundary and shading expression.
Neither reproduces the cylindrical UV mapping, page backside, occlusion, or
edge treatment.

### Implementation

Build an original WebGL page-curl pass:

1. Normalize output coordinates and account for source fit/aspect.
2. Rotate into curl-axis space.
3. Classify each output pixel into flat, curled front, curled back, or exposed
   destination regions.
4. Invert the cylindrical projection to source UVs.
5. Apply backside desaturation and distance-based shading.
6. Antialias the page edge using pixel derivatives or a resolution-aware
   smooth band.
7. Return exact endpoints before the inverse projection runs.

Keep geometry and shading parameters in a pure recipe module. The WebGL
preview and export GPU executor should use those same values. Validate 16:9,
9:16, and 1:1 because an apparently correct 16:9 implementation can still
have the wrong curl radius or axis after aspect conversion.

### Tests

- Region classification and finite UV values at five stops.
- Exact endpoints and no NaN/transparent holes near the curl singularity.
- Snapshot tests with asymmetric corner markers.
- Edge-only error crop in addition to whole-frame RMSE.
- Three aspect ratios in preview and export.

### Risks

- The package works in normalized UV space, while QCut source fitting may
  already have applied crop and rotation.
- Premultiplied alpha and texture-edge clamping can create a bright fringe.
- FFmpeg expressions cannot cleanly invert the cylindrical geometry. Treat a
  GPU frame bake as the parity path.

## 4. Horizontal motion blur (`横移模糊`)

### Evidence

- Resource ID: `7316901787762430491`
- Package MD5: `e00463af9d4a2b2d3a42c3166ea80f09`
- Renderer: Lua-controlled multi-pass graph
- Default duration: `0.8 s`
- Intermediate canvas: approximately `1.6W x 1.1H`

The derived pipeline is:

```text
source selection and scale wipe
  -> motion compositor with mirrored edge fill
  -> Gaussian blur pass 1
  -> Gaussian blur pass 2
  -> exposure
  -> center crop to project frame
```

The selected source switches at `13/24` (`~0.5416667`), not at `0.5`. Motion,
blur, and exposure are driven by separate baked curves. The first blur rises
to a runtime intensity of about `35`, holds, then falls. The second reaches
about `1.75`. The Gaussian stage is separable, uses gamma-aware accumulation,
and maps its sample reach to a 720-based screen scale. Exposure peaks around
half a stop and is applied in linearized color.

### Current gap

The browser uses crossfade, small translation, CSS blur, and scale. The export
uses a short directional tap average. Both omit the package's displacement
curves, delayed source switch, expanded render target, two blur stages,
gamma-aware accumulation, exposure curve, and final crop.

### Implementation

Create a small render-graph executor rather than one monolithic transition:

1. Evaluate baked motion, blur, exposure, and source-selection curves from the
   normalized transition progress.
2. Render into an expanded target to preserve samples outside the final crop.
3. Fill translated edges with mirrored source sampling.
4. Composite the outgoing or incoming source according to the measured switch
   threshold and alpha rules.
5. Run horizontal and vertical Gaussian passes using reusable framebuffers.
6. Apply exposure in linearized RGB.
7. Center-crop the result to the project dimensions.

Represent the curves as named keyframe tracks with explicit interpolation.
Do not scatter frame-number constants through React components or shader
strings. Convert package frame positions to normalized progress once in the
recipe.

For export, first determine whether an FFmpeg `filter_complex` graph can match
the measured blur kernel and edge behavior within the RMSE threshold. If not,
use the same headless GPU executor as preview and encode its frames. The
current single-expression xfade interface is not sufficient.

### Tests

- Curve values and source selection immediately before/at/after `13/24`.
- Expanded target and center-crop geometry for odd and even dimensions.
- Mirrored edge sampling under maximum displacement.
- Blur impulse-response tests, including energy preservation.
- Exposure/color-space tests on neutral gray and saturated colors.
- Five-stop frames plus extra captures around the source switch.

### Risks

- Kernel radius, sample count, and gamma order can change both sharp details
  and flat colors.
- Downscaled preview may need resolution-adjusted blur while export uses full
  resolution; the result must remain perceptually and numerically aligned.
- Multi-pass allocation can cause preview stalls. Pool render targets and skip
  stages whose evaluated intensity is zero.

## 5. Cube rotate (`立方旋转`)

### Evidence

- Resource ID: `7400668689411871251`
- Package MD5: `b3e9d51fca9e26e3fea627f872f9826c`
- Renderer: Lumi/AE 3D graph
- Default duration: `1.0 s`
- Perspective field of view: approximately `60.5 degrees`

The inspected graph has separate 3D shapes fed by A and B, with front, back,
and side faces, depth testing/writing, backface culling, mirrored UV handling,
and a neutral dark background. A rotates from front to the side while B starts
orthogonal and rotates to the front. The visible rotation occupies roughly
progress `0.1333` through `0.6333` and follows a custom Bezier, not a generic
CSS `ease-in-out`. The camera distance also dollies inward and back. Separate
contrast and exposure curves darken the receding face and reveal the incoming
face.

The cached gradient background is not a redistributable QCut asset. Recreate
an original neutral background procedurally or with a QCut-owned texture.

### Current gap

The browser rotates two independent CSS panels with a nominal perspective.
The export squeezes two 2D images. Neither has shared 3D depth, perspective
projection, face occlusion, backface behavior, z motion, or color choreography.

### Implementation boundary

Use a shared WebGL/Three.js scene for parity:

- one cube-like shared geometry, or two meshes whose transforms are proven
  equivalent;
- A on the outgoing face and B on the incoming side;
- perspective camera with measured FOV and aspect;
- depth test, depth write, and backface culling;
- the measured custom rotation and z curves;
- per-input exposure/contrast curves;
- QCut-owned neutral background and explicit texture edge behavior.

Three.js is suitable for scene and resource management. Keep progress and
curve evaluation in editor-core so the scene is a deterministic executor, not
the owner of timeline semantics.

An FFmpeg transition expression cannot reproduce perspective projection and
occlusion. The exact export path should render deterministic GPU frames and
pipe them to the encoder. Keep the current 2D export only as a named fallback
when GPU export is unavailable.

### Tests

- Camera/mesh matrix snapshots at all five stops.
- Face visibility, winding, and backface tests near 90 degrees.
- Pixel checks proving the background appears only outside projected faces.
- Aspect-ratio tests and very small preview-size tests.
- WebGL context loss and texture-readiness recovery.
- Five-stop preview/export RMSE plus intermediate samples around the start and
  end of the rotation interval.

### Risks

- Two independently transformed planes can separate at the shared edge; use
  shared geometry or mathematically locked transforms.
- Texture orientation differs between DOM video textures and decoded export
  frames.
- Headless GPU output must use the same color management as interactive
  preview or the geometry will match while RMSE remains high.

## Delivery phases

### Phase 0: timing and identity baseline

- Keep exact package durations in presets.
- Keep linear and quintic progress policies explicit and serialized.
- Lock resource ID, MD5, card/version, project FPS, and applied duration for
  every comparison.
- Finish real captures for dissolve and left/right move first.

Exit gate: five-stop preview and export captures exist for dissolve and move;
endpoints are exact and worst RGB RMSE is at or below `8/255`.

### Phase 1: page-curl WebGL renderer

- Add a focused transition GPU surface and texture-source adapter.
- Implement page region classification, inverse projection, backside shading,
  and edge antialiasing.
- Integrate with the existing preview state without changing timeline logic.
- Add the GPU frame-bake export seam behind a feature flag.

Exit gate: 16:9, 9:16, and 1:1 five-stop preview/export captures pass with no
holes, edge inversion, or endpoint drift.

### Phase 2: reusable multi-pass graph

- Add pooled intermediate render targets and separable blur passes.
- Implement motion-blur keyframe tracks, source switch, mirrored fill,
  exposure, and crop.
- Measure preview performance at project resolution and downscaled display
  resolution.

Exit gate: five stops and switch-boundary samples pass; zero-strength stages
are bypassed; repeated playback does not leak GPU resources.

### Phase 3: shared 3D scene

- Add the cube geometry, camera, textures, depth state, custom curves, and
  color choreography.
- Reuse the frame-bake export path established for page flip.
- Keep the old CSS/FFmpeg implementation as an explicitly named fallback.

Exit gate: projected faces remain joined, endpoint frames are exact, and both
preview and export satisfy the parity report.

### Phase 4: regression suite and rollout

- Store only original calibration clips and approved expected frames.
- Run the parity report for all five representative effects.
- Add GPU capability checks and a visible but unobtrusive fallback status.
- Roll the shared renderer out to other transitions only after their package
  families and asset provenance are understood.

## Capture matrix

Each representative effect requires 20 images:

| Stream | 0% | 25% | 50% | 75% | 100% |
| --- | --- | --- | --- | --- | --- |
| Jianying preview | required | required | required | required | required |
| QCut preview | required | required | required | required | required |
| Jianying export | required | required | required | required | required |
| QCut export | required | required | required | required | required |

For five effects this is 100 baseline images, plus diagnostic samples around
the motion-blur source switch and cube rotation boundaries. Save viewport
screenshots separately from cropped comparison frames so UI similarity and
render parity are not conflated.

Report MAE, RMSE, maximum error, and 95th-percentile error for every pair. A
single midpoint screenshot is useful for orientation, but it cannot prove
direction, easing, endpoints, or export parity.

## Definition of done

A representative transition is complete only when:

- its catalog/package identity and applied draft ownership are unambiguous;
- its timing, progress policy, source ordering, and endpoint behavior are
  covered by unit tests;
- preview and export use the same derived recipe;
- all five preview and export pairs have been captured and inspected;
- worst RGB RMSE is at or below `8/255`, or the remaining difference is
  explicitly documented and the effect is not called exact parity;
- no Jianying-owned implementation or media asset has been copied into QCut.
