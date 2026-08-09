# Jianying Runtime Probe

This directory contains a local interoperability probe for Jianying's transition
runtime. It contains independently written parsers and behavioral models, but no
Jianying binaries, assets, source code, or copied proprietary implementation.

The static format and algorithm recovery notes live in
[`DECOMPILATION.md`](./DECOMPILATION.md). The accompanying tools parse recovered
metadata without bundling proprietary fixtures:

The next twenty recovered transition packages, their timing, algorithm families,
and real-runtime validation contract are documented in
[`TWENTY-TRANSITIONS.md`](./TWENTY-TRANSITIONS.md), with machine-readable identities
in [`twenty-transition-manifest.json`](./twenty-transition-manifest.json).

```bash
bun inspect-serialized.ts \
  --dictionary-binary ../../.local/jianying-runtime/Frameworks/libcccreator.dylib \
  --summary /path/to/file.seq /path/to/file.xshader
bun inspect-ausl.ts /path/to/file.ausl
```

## Safety boundary

- The repository never contains proprietary binaries or transition packages.
- Disposable probe payloads live under Git-ignored `.local/jianying-runtime/`.
- The durable private backup lives outside the repository under
  `~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/`.
- The backup script resolves symlinks, permits only that local Application
  Support tree, and rejects iCloud Drive and `~/Library/CloudStorage`.
- Backup files are private to the current user and carry a SHA-256 manifest with
  `localOnly: true` and `cloudUpload: false`. The script has no upload path.
- Do not redistribute the copied payloads or build a product dependency on them.
- A shippable QCut transition engine still requires our own implementation or a
  separately licensed runtime.

## Local payload

`copy-runtime.sh` copies the smallest useful runtime closure from the installed
`/Applications/VideoFusion-macOS.app` bundle:

- `libLumiGeneRuntime.dylib`: bridge around the scripted transition runtime.
- `libAGFX.dylib`: AmazingEngine graphics and shader runtime.
- `libcccreator.dylib`: high-level `AmazingEngine::TransitionSegment` runtime.
- `libEGL.dylib` and `libGLESv2.dylib`: Metal-backed rendering dependencies.
- `lumi_js_resources`: the feature plugin and built-in Lumi resources. It does
  not contain the default `lumigene-core.js` entry script.
- `VEMetalBinary_Mac.bundle`: precompiled Metal resources.

Override the source app only when needed:

```bash
JY_APP_BUNDLE=/path/to/VideoFusion-macOS.app ./copy-runtime.sh
```

## Offline private backup

Create or verify the durable local-only backup:

```bash
bun research/jianying-runtime-probe/backup-private-runtime.ts
```

The first backup starts with the version-pinned five core libraries in
`.local/jianying-runtime`, resolves their complete non-system dependency closure,
copies the two runtime resource directories and all 520 binary transition
packages, then probes the result without the Jianying app bundle. The verified
2026-08-09 backup contains 23 dylibs and 520 packages (about 1.08 GiB):

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/
  D6342ECD-5432-33F0-A2AD-0C28F5699994-catalog-520/
  current -> D6342ECD-5432-33F0-A2AD-0C28F5699994-catalog-520
```

Re-running the command verifies the exact file set, byte sizes, SHA-256 hashes,
catalog count, core UUID, and an app-less bridge launch before retaining the
`current` link. QCut discovers this private backup before the disposable
`.local` copy or an installed app bundle.

Once this backup exists, the 520 ordinary binary transitions do not require
Jianying to be installed or running. The app is needed only as an initial local
source when a missing dependency closure or package set must be collected. A
strict app-less health check is:

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
QCUT_JIANYING_RUNTIME_ROOT="$HOME/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current" \
QCUT_JIANYING_TRANSITION_PACKAGE_ROOT="$HOME/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current/Packages" \
bun run qcut transition doctor --json
```

## Catalog coverage and CLI

The research catalog contains 540 unique entries across the 14 Jianying groups.
AI one-take keeps 20 generation recipes, and every binary-backed group has 40
entries:

| Group | Catalog entries | Local binary render |
| --- | ---: | ---: |
| AI one-take | 20 | 0 |
| Dissolve | 40 | 40 |
| Split | 40 | 40 |
| Glitch | 40 | 40 |
| Light | 40 | 40 |
| Interactive emoji | 40 | 40 |
| Slideshow | 40 | 40 |
| Blur | 40 | 40 |
| Distortion | 40 | 40 |
| Shooting | 40 | 40 |
| Camera | 40 | 40 |
| Natural | 40 | 40 |
| Variety | 40 | 40 |
| MG animation | 40 | 40 |

The 20 AI one-take records are generation configurations, not two-input
`TransitionSegment` packages. The other 520 entries use the local binary bridge.
QCut exposes the distinction as `runtimeKind` instead of claiming that AI
generation is a local transition binary.

The observed Jianying database contains only 15 interactive-emoji entries,
eight distortion entries, and 34 eligible MG entries. The catalog therefore
fills those sparse UI groups with 25, 32, and six related transitions,
respectively. Every supplement is a real Jianying transition, remains globally
unique, and records its original group in `sourceGroup`; no placeholder
transition is used.

Generate the ignored local selection and download missing package payloads:

```bash
bun research/jianying-runtime-probe/prepare-category-catalog.ts \
  --binary-per-category 40 --download
bun research/jianying-runtime-probe/generate-category-catalog.ts \
  --manifest .local/jianying-runtime/category-forty/selection.json
```

Inspect availability and render any binary-backed catalog entry through the
public CLI:

```bash
qcut transition list --json
qcut transition doctor --json
qcut transition render \
  --preset jianying-local-6724845717472416269 \
  --input-a a.mp4 \
  --input-b b.mp4 \
  --output joined.mp4 \
  --force --json
```

`transition doctor` constructs a real `TransitionSegment` in a child process
before reporting entries as available. It therefore rejects an updated
`libcccreator.dylib` whose private ABI does not match the bridge. Development
builds prefer the private Application Support backup, then the version-pinned,
Git-ignored `.local/jianying-runtime` copy. Set
`QCUT_JIANYING_RUNTIME_ROOT` to test one explicit runtime root without falling
back to another candidate.

Run the reproducible CLI smoke matrix with any two local videos:

```bash
bun research/jianying-runtime-probe/verify-cli-catalog.ts \
  --input-a .local/jianying-runtime/cli-e2e/a.mp4 \
  --input-b .local/jianying-runtime/cli-e2e/b.mp4
```

The verifier calls `qcut transition render` separately for every one of the 520
binary-backed entries, then requires a non-empty, non-black H.264 video with the
requested dimensions. It refuses to write outside a Git-ignored directory. The
previous 67-entry baseline passed 67/67 app-less at 64x64, 6 fps, and a
0.5-second transition window. The expanded 520-entry catalog has been prepared
and backed up but has intentionally not yet received a full render-matrix run.

## Probe modes

```bash
./copy-runtime.sh
./run-probe.sh inspect
./run-probe.sh config
./run-probe.sh launch
./run-probe.sh gpu
./run-probe.sh textures
./run-probe.sh transition
JY_TRANSITION_PACKAGE=/path/to/Cache/effect/id/md5 \
  ./run-probe.sh transition-load
JY_ENABLE_TRANSITION_II=1 \
  JY_TRANSITION_PACKAGE=/path/to/Cache/effect/id/md5 \
  ./run-probe.sh transition-load
JY_TRANSITION_PROGRESS=0.5 \
  JY_TRANSITION_PACKAGE=/path/to/Cache/effect/id/md5 \
  ./run-probe.sh transition-frame
JY_TRANSITION_PACKAGE=/path/to/Cache/effect/id/md5 \
  ./render-transition-video.sh input-a.mp4 input-b.mp4 output.mp4 0.5
bun transition-parity-matrix.ts \
  --matrix /path/to/local-matrix.json \
  --output /path/to/ignored-evidence-directory
```

- `inspect` loads the copied libraries and resolves the bridge ABI without
  constructing runtime objects.
- `config` constructs `LumiGeneRuntimeBridgeConfig`, prints its default strings,
  and verifies the inferred width, height, and sandbox-root layout.
- `launch` runs in its own process, creates the bridge, registers the config, and
  calls `Launch`, one frame update, `SyncRender`, and `GetIOSurface`.
- `gpu` follows Jianying's own AGFX lifecycle: create a Metal `GPDevice`, call
  `init`, obtain its `RendererDevice`, then deinitialize and release it.
- `textures` additionally creates red and blue RGBA input `DeviceTexture`
  objects plus an empty output texture, verifies their engine-reported IDs,
  dimensions, and formats, binds the output through an AGFX framebuffer for one
  empty render pass, and then releases every GPU object.
- `transition` loads `libcccreator`, resolves the high-level transition methods,
  and directly constructs and destroys `AmazingEngine::TransitionSegment`.
- `transition-load` additionally calls `loadSegment` and `unloadSegment` with a
  package at its original cache path. It never copies that package into QCut.
- `JY_ENABLE_TRANSITION_II=1` reconstructs Jianying's in-process AB injection by
  calling `bef_effect_config_ab_value` before loading the package.
- `transition-frame` binds two solid-color textures to real VideoSegments, loads
  the cached transition, drives the exported SwingManager seek path, reads back
  the output texture, and validates a linear dissolve.
  `JY_TRANSITION_PROGRESS` defaults to `0.5` and accepts values from `0` through
  `1`.
- `render-transition-video.sh` uses FFmpeg to normalize two real videos to RGBA,
  preserves their adjacent timeline duration, centers the transition across the
  cut, renders it through `TransitionSegment`, and encodes the combined frames
  as BT.709 H.264 MP4. When whole-file inputs provide no trim handles, the host
  holds A's final frame after the cut and B's first frame before the cut, matching
  the observed Jianying timeline behavior.
  The optional final argument is transition duration in seconds. Frame rate
  defaults to `30`; `JY_VIDEO_FPS`, `JY_VIDEO_WIDTH`, and `JY_VIDEO_HEIGHT` can
  override normalization. `JY_TRANSITION_HOLD_EXACT_ENDPOINTS=1` bypasses the
  package render at the first and last available transition endpoints for
  packages where Jianying holds the source frame exactly.

This command does not need a Jianying draft or project file. It needs the local
runtime and the downloaded transition package; a project file would only supply
timeline placement, source trims, duration, and the selected resource ID.

The video wrapper is deliberately an interoperability prototype:

- Output is video-only. Audio mixing and muxing are not implemented yet.
- Both decoded inputs and the rendered output use temporary raw RGBA files, so
  long or high-resolution videos require substantial temporary disk space.
- One AGFX device, SwingManager, transition segment, and pair of video segments
  remain alive across the overlap. Each frame still crosses CPU RGBA files and
  GPU readback, so this is not the production performance model.
- FFmpeg normalizes orientation, aspect ratio, frame rate, and pixel format.
  Source HDR and original color metadata are normalized to BT.709 rather than
  preserved by this first path.

For a parity check, export the same source files, engine render resolution, frame
rate, cut, and transition duration from Jianying and the probe. Compare decoded
PNG frames, not MP4 bytes. The engine timestamp for zero-based transition frame
`i` is `i / (2 * floor(N / 2))`; this keeps the cut frame at exactly `0.5` for
both odd and even windows. Evidence stops use source frame
`round(p * (N - 1))` for `p = 0 / 0.25 / 0.5 / 0.75 / 1`. The repository's
transition reference tool can calculate decoded RGB metrics from those pairs:

```bash
bun .agents/skills/qcut-toolkit/jianying-transition-reference/scripts/inspect-transition.ts \
  parity-report --title 叠化 --manifest /path/to/manifest.json \
  --formula 'C(p) = (1 - p) A + p B'
```

`transition-parity-matrix.ts` automates the repeatable form of that protocol.
Start from `transition-parity-matrix.example.json`; keep the populated matrix in
an ignored local directory because it contains Jianying cache and export paths.
Set matrix `renderSize` to Jianying's engine/export resolution. The tool renders
at that size and, when necessary, normalizes the candidate at CRF 0 to the
reference dimensions before comparison. For every entry, it confirms
frame-comparable metadata, extracts all five stops, calculates decoded RGB
MAE/RMSE/P95/max error, measures full-interval RGB PSNR/RMSE and SSIM, and
generates side-by-side and 8x difference evidence images. It writes aggregate
JSON and Markdown reports and refuses to place evidence in a non-ignored
repository directory. `--reuse` accepts an existing render only when its saved
request fingerprint still matches the inputs, package identity, dimensions,
timing, endpoint policy, and renderer sources.

`libcccreator` has a large dependency graph. The minimal `.local` copy still
needs unresolved sibling libraries from the installed app bundle. The private
Application Support backup instead contains the verified 23-library closure and
loads with only its own `Frameworks` directory in `DYLD_LIBRARY_PATH`. Neither
copy is a standalone redistributable runtime.

`launch` is intentionally explicit because this is a private, version-specific
C++ ABI with no vendor headers. A failed call or process crash is evidence about
the missing host contract, not an API QCut can safely ship.

## ABI notes

Observed in Jianying `11.1.12975` (`CFBundleVersion 11.2.0-beta5`):

- `LumiGeneRuntimeBridge::RegisterConfig(...)` forwards to config `CopyFrom`.
- `LumiGeneRuntimeBridge::Launch()` returns `bool`.
- `Launch()` checks config validity before creating its internal
  `CustomGameView`.
- Config validity requires positive input width and height plus a non-empty first
  `std::string`, inferred to be the runtime sandbox root.
- The config and bridge object sizes and field offsets are inferred from the
  arm64 machine code. They are not a stable public contract.

The probe answers whether the installed engine can be loaded and called locally.
The companion decompilation reports recover selected package algorithms, but do
not make the engine or proprietary package assets redistributable.

## Verified result

Local runs on 2026-08-01 and 2026-08-02 against Jianying `11.1.12975`
established all of the following without launching the Jianying app process:

1. The copied AGFX, EGL, GLES, LumiGene, and CCCreator libraries load with
   `dlopen`.
2. The probe resolves the private bridge and `TransitionSegment` methods listed
   above.
3. `LumiGeneRuntimeBridgeConfig` changes from invalid to valid after setting
   `1280x720` and the sandbox root.
4. `LumiGeneRuntimeBridge::Launch()` returns `true`, creates a non-null
   `IOSurface`, accepts a frame update, syncs, and shuts down cleanly.
5. `AmazingEngine::TransitionSegment` constructs and destructs cleanly.
6. A real cached `叠化` package (`resource_id 6724845717472416269`) is accepted by
   `loadSegment` and then released by `unloadSegment`.
7. Injecting `enable_transition_ii=true` through `bef_effect_config_ab_value`
   succeeds without a license file and produces a non-null parsed transition
   config for the tested package.
8. AGFX independently creates and initializes a Metal `GPDevice` and exposes a
   non-null `RendererDevice`.
9. The renderer creates two RGBA input `DeviceTexture` objects, one output
   texture, and an output framebuffer; one empty render pass completes and all
   objects are released cleanly.
10. `bef_swing_manager_create_with_gpdevice` creates the Amazer global context
    and viewer while retaining the supplied host `GPDevice`.
11. Amazer creates a separate `AmazingEngineMainDevice`; converting all three
    host textures through `SwingTexture::convertMetalTextureInPlace` produces
    valid friend textures for that device.
12. Two real `VideoSegment` objects and one real `TransitionSegment` can be
    assigned time ranges and unique render indices, linked as left/right inputs,
    and registered with the manager's simplified segment graph.
13. `bef_swing_manager_seek_frame_device_texture` fills the transition's current
    frame cache from those VideoSegments and renders into the supplied output.
14. The tested dissolve package returned exact RGBA values at all three sampled
    points: `0 -> (255, 0, 0, 255)`, `0.5 -> (128, 0, 128, 255)`, and
    `1 -> (0, 0, 255, 255)`.
15. Two independently encoded MP4 inputs can be decoded, transitioned across
    their adjacent cut, and encoded into a valid MP4 without shortening the
    timeline. The integration fixture produced `24` frames at `64x64`, `6 fps`,
    and `4` seconds. Its encoded transition frames were `(254, 0, 0)`,
    `(127, 0, 127)`, and `(1, 0, 255)` after H.264 quantization.
16. The same two `1280x720`, `30 fps`, four-second calibration clips were
    rendered by Jianying and this probe through the same `3840x2160` engine path,
    then normalized at CRF 0 to `1280x720` BT.709 for decoded-pixel comparison.
    A 2026-08-02 matrix covered `淡入淡出`, `叠化`, `叠化拉近`, `翻页`,
    `横移模糊`, `立方旋转`, `拍立得`, `前后对比`, `前后对比 II`, `推镜虚化`,
    `雾化交叠`, `右移`, and `左移`. All `13/13` passed the strict decoded RGB
    RMSE threshold of `8`: the worst five-stop sample was `4.751`, the worst full
    transition interval was `3.837`, minimum PSNR was `36.452 dB`, and minimum
    SSIM was `0.996470`. The evidence set contains 65 aligned frame pairs, 65
    amplified difference images, and one five-stop contact sheet per transition.
    Rendering `拍立得` directly at the 720p comparison size produced a misleading
    full-interval RMSE of `11.120`; matching Jianying's 4K render path reduced it
    to `2.490`, demonstrating why engine resolution is part of the parity
    contract for blur and glow graphs.
17. The original private 23-library dependency closure plus 67 ordinary
    transition packages passed manifest verification, an app-less
    `transition doctor` (`appInstalled: false`, `availableCount: 67`), and a
    complete 67/67 CLI MP4 render matrix using only the Application Support
    backup. No Jianying process or app bundle path participated in that run.
18. The expanded local-only backup contains the same 23-library closure and 520
    transition packages. Its 50,705-file SHA-256 manifest, package count, core
    UUID, and app-less bridge launch passed. Full per-transition video rendering
    is intentionally deferred to a later staged test batch.

The dependencies now divide into three groups:

- Copied into the ignored local runtime: five dylibs, `lumi_js_resources`, and
  `VEMetalBinary_Mac.bundle`.
- Reconstructed by the probe at runtime: the AB value, host `GPDevice`,
  `RendererDevice`, SwingManager/Amazer/viewer context, two VideoSegments, one
  TransitionSegment, three host textures, and their effect-device friend
  textures. These are process-local objects, not files that can be copied.
- Not found as standalone files: a transition license/AB configuration and
  `lumigene-core.js`. The tested transition accepts the empty license once the
  AB value is injected; LumiGene still expects its entry script from a host
  source or virtual filesystem that the probe has not reconstructed.

The remaining work is productionizing the proven media path rather than
discovering an unknown transition rendering contract:

- LumiGene defaults to `lumigene-core.js`. No standalone copy was found in the
  installed app bundle or current user cache, so the bridge creates its surface
  but reports that the game JS could not be loaded. This did not block the
  tested CCCreator/Swing transition path.
- Replace full-file RGBA intermediates and CPU readback with streaming decode,
  `CVPixelBuffer`/Metal texture interop, and direct encoder surfaces.
- Reuse initialized engine infrastructure across adjacent transitions while
  preserving package-local segment state for each overlap.
- Read QCut or Jianying timeline metadata for trims, source handles, and
  duration rather than accepting two whole files and one duration argument.
- Render at production dimensions and preserve pixel format, color space, HDR,
  alpha state, and orientation across decode, friend-texture conversion, and
  output.
- Add audio overlap policy, retiming, and muxing; the current MP4 intentionally
  has no audio track.
- Test additional transition packages and provide a fallback for missing,
  incompatible, licensed, or version-specific resources. The exact private ABI
  used here is tied to Jianying `11.1.12975` and is not a shippable dependency.
