# QCut Jianying On-Device Cache Deflicker Provider

> Completed: 2026-08-31
> Target: Jianying Pro for macOS 11.3.0
> Platform: Apple Silicon macOS
> Boundary: user-owned on-device cache only; no upload, commit, packaging, or redistribution

## What changed

QCut's Lab deflicker now has its first real Jianying on-device runtime path. It does more than load a model: consecutive BGRA frames are processed by `VideoDeflickerGpuBackend`, encoded as a derived MP4, validated, cached, and inserted back into the timeline.

After setting a strength under `Video > Basic > Local video lab`, the user can click `Process with local Jianying cache`. A successful run:

1. verifies runtime version, manifests, file sizes, and SHA-256 values;
2. decodes the source and processes each frame through the Lens/Metal backend;
3. emits H.264 CRF 16 plus AAC 192 kbps while preserving geometry, average fps, duration, and audio;
4. validates and atomically publishes the derived media to QCut's cache; and
5. replaces the timeline media and resets `labDeflicker` to zero so the public FFmpeg fallback is not applied a second time during export.

![QCut local-cache deflicker UI E2E](./evidence/real-video-matrix/qcut-private-deflicker-ui.png)

## Pipeline

```text
source MP4
  -> FFmpeg BGRA decoder
  -> macOS FIFO
  -> QCut native host
  -> Jianying VideoDeflickerGpuBackend + Metal cache
  -> macOS FIFO
  -> FFmpeg H.264/AAC encoder
  -> ffprobe validation
  -> QCut derived-media cache
  -> timeline replacement
```

The native host runs under a `sandbox-exec` profile that denies network access. Frames do not traverse a JavaScript stream and are not stored as raw files. Both FIFOs live only in a per-task temporary directory and are removed at completion.

The cache key covers source path, size, modification time, strength, runtime identity, and route version. A cache hit is still probed for resolution, fps, duration, and audio; invalid media is removed and rebuilt.

## Compatibility and privacy gates

The provider accepts only an exact private Jianying `11.3.0` snapshot. It verifies the deflicker Metal library, `liblens.dylib`, `libfastcv.dylib`, `libbytenn.dylib`, and `libIESAppLogger.dylib` against pinned hashes, and requires `localOnly: true` plus `cloudUpload: false` in the Lens manifest.

QCut does not guess an ABI when a version or hash differs. Public QCut code contains only the QCut-owned native host. Jianying libraries, models, and cache files remain under:

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingBasicVideo/current
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current
```

They are not committed, bundled, or publicly downloaded. This establishes local interoperability, not redistribution rights.

## CLI

```bash
qcut edit deflicker \
  -i /absolute/path/source.mp4 \
  --strength 70 \
  --output /absolute/path/result.mp4
```

`--strength` is an integer from `1` to `100` and defaults to `70`. Existing outputs require `--force`. CLI and UI share the same provider, cache, cancellation, and media validation.

## Real-person result

On the same 360 x 640, 24 fps, 72-frame, three-second challenge track at strength 70:

| Metric | QCut private provider | Jianying UI export |
| --- | ---: | ---: |
| Frame-luma standard deviation | `-3.305%` | `-1.172%` |
| Spatial detail | `-1.403%` | `-4.861%` |
| Temporal difference | `-0.907%` | `+0.125%` |
| SSIM against each editor's baseline | `0.982599` | `0.976897` |
| Output | 72 frames / 3.000 s | 90 frames / 3.000 s |

The baseline frame rates and export paths differ, so this proves real processing and direction of change rather than pixel-identical calibration. The QCut output SHA-256 is `824e11b75d4618e16b2db18e6f20e13cf14d1e7623c11d64f5b857174fae4960`.

## Completed E2E

- Native ABI: 90 consecutive frames with `51,992,477` changed bytes.
- CLI cold run: 640 x 360, 90 frames in about `0.98s`; cache hit in about `0.06s`.
- Real-person CLI: 360 x 640, 72 frames in about `0.63s`.
- Real-person video with audio: the latest cold path produced three-second H.264 + AAC in about `0.63s`, with audio retained.
- Packaged simulation: staged `resources/bin/qcut-jianying-deflicker-host` processed all 90 frames.
- Visible Electron UI: real import, strength input, click, timeline replacement, non-empty preview, and screenshot; Playwright `1 passed (10.7s)`.

Evidence:

- [UI state JSON](./evidence/real-video-matrix/qcut-private-deflicker-ui.json)
- [Four-way frame comparison](./evidence/real-video-matrix/qcut-private-deflicker-contact-sheet.png)
- [Machine-readable metrics](./evidence/real-video-matrix/qcut-jianying-real-video-metrics.json)
- [QCut private-provider output](./evidence/real-video-matrix/qcut-private-deflicker.mp4)

## Remaining boundary

- Deflicker is the first private runtime promoted to `input-processed`. VAS stabilization, ByteNN denoise, UMVFI interpolation, and VMB motion blur still lack a complete stable frame-processing ABI.
- Exact mapping between Jianying's visible strength control and the low-level `strength` value is not calibrated.
- Support is limited to Apple Silicon macOS and the exact Jianying 11.3.0 snapshot.
- QCut keeps public FFmpeg `deflicker` as a cache-free fallback. The private derived-media path runs only after the user clicks the local-cache action.
