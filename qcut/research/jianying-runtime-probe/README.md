# Jianying Runtime Probe

This directory contains a local interoperability probe for Jianying's transition
runtime. It does not contain Jianying binaries, assets, source code, or recovered
implementations.

## Safety boundary

- Proprietary payloads are copied only to `.local/jianying-runtime/`.
- That directory and the compiled probe are ignored by Git.
- The copy script refuses to run unless the destination is ignored.
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

`libcccreator` has a large dependency graph. The copied binary is loaded from
the ignored local directory while unresolved sibling libraries are read from
the installed app bundle through `DYLD_LIBRARY_PATH`; it is not a standalone
redistributable runtime closure.

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

This answers a narrow question: whether the installed engine can be loaded and
called locally. It does not recover the transition algorithms or make the engine
redistributable.

## Verified result

Local run on 2026-08-01 against Jianying `11.1.12975` established all of the
following without launching the Jianying app process:

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

The remaining work is now a media pipeline rather than an unknown transition
rendering contract:

- LumiGene defaults to `lumigene-core.js`. No standalone copy was found in the
  installed app bundle or current user cache, so the bridge creates its surface
  but reports that the game JS could not be loaded. This did not block the
  tested CCCreator/Swing transition path.
- Decode both source videos into timestamped GPU frames, then update the two
  VideoSegments before each manager seek.
- Map trims, overlap duration, frame rate, and transition progress onto the
  manager's microsecond timeline without duplicate or missing boundary frames.
- Render at production dimensions and preserve pixel format, color space, HDR,
  alpha state, and orientation across decode, friend-texture conversion, and
  output.
- Feed rendered frames to a hardware encoder and mux or retime audio. The probe
  currently performs a tiny CPU readback only for validation.
- Test additional transition packages and provide a fallback for missing,
  incompatible, licensed, or version-specific resources. The exact private ABI
  used here is tied to Jianying `11.1.12975` and is not a shippable dependency.
