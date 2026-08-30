# QCut-Owned Local Audio Runtime

Date: 2026-08-30

## Goal

Jianying is a behavioral reference and comparison oracle only. It is not a QCut runtime dependency.
QCut Desktop must use its own FFmpeg runtime, derived-result cache, and capability reporting. It must
not load Jianying dylibs, copy Jianying models, or label cloud results as local processing.

## Implemented In This Pass

| Capability | Local status | QCut implementation |
| --- | --- | --- |
| Volume and fades | Ready | Existing QCut FFmpeg envelope graph |
| Loudness normalization | Ready | FFmpeg `loudnorm` |
| High-quality local denoise | Ready | QCut `afftdn` spectral cleanup with cached FLAC output |
| Voice enhancement | Ready | QCut three-band parametric enhancement |
| Pitch | Ready | QCut resampling and tempo compensation graph |
| Stereo balance | Ready | FFmpeg `stereotools` |
| Channel configuration | Ready | Real stereo/mono/left/right/swap routing plus panel control |
| Neural denoise | Model not installed | Capability reports `model-required`; no Jianying fallback |
| Six-stem separation | Model not installed | Capability reports `model-required: demucs` |
| Voice conversion | Model not installed | Capability reports `model-required` |
| Audio translation | Model not installed | Capability reports `model-required` |

The Desktop "Local enhance" action now requires `qcut-audio-runtime:process`. The browser build may
retain its existing FAL fallback, but the Desktop local path does not upload source audio.

## QCut Cache Contract

The runtime ID is `qcut-ffmpeg-audio-v1`. Electron resolves the exact root with
`app.getPath("userData")`; the relative directory is:

```text
Cache/qcut-audio-derived-v1
```

Each artifact has two files:

```text
<cache-key>.flac
<cache-key>.json
```

The cache key covers the full source SHA-256, normalized signal-affecting settings, engine version,
format, sample rate, and channel count. Task status, error text, `processedMediaId`, and display-only
loudness measurements do not change the key. Manifests contain hashes and provenance but omit the
absolute source path. Writes use a partial file and atomic rename; identical concurrent work is
coalesced. The derived cache is capped at 8 GiB or 1,024 entries and uses LRU eviction. Global cache
cleanup includes derived audio but deliberately excludes future QCut model packages.

## Jianying Alignment Boundary

This establishes parameter, lifecycle, and measurable-output alignment, not private-algorithm cloning:

- The same calibration audio can measure volume, fades, loudness, pitch, pan, and channel routing.
- QCut spectral cleanup is neither Jianying's private neural model nor DeepFilterNet.
- Separation, conversion, and translation remain `model-required` until QCut-owned, distributable
  model packages pass real-audio acceptance tests.
- Jianying caches remain read-only evidence. QCut must not link, copy, or distribute their binaries or
  model files.

## Verification

| Check | Result |
| --- | --- |
| Electron TypeScript | Passed |
| Web TypeScript | Passed |
| New runtime, real FFmpeg, and existing audio export regression | 10 files / 32 tests passed |
| Complete Web audio test directory | 35 files / 213 tests passed |
| Cache maintenance | 3 tests passed |
| Targeted Biome | Passed |
| Full properties-panel group | 22 files / 113 tests passed |

The real test generates a stereo calibration source with 440 Hz on the left and 880 Hz on the right
using QCut's bundled FFmpeg. The first run writes a 48 kHz stereo FLAC; the second identical run reuses
the same cache path. In left-channel mode, every decoded left and right PCM sample matches. The cache
manifest contains neither the source path nor a `Jianying` marker.

## Next Work

1. Select a distributable QCut neural-denoise model and define signed install, SHA-256, versioning,
   and removal behavior.
2. Package Demucs or an equivalent as a QCut-owned offline runtime without system Python.
3. Split voice conversion into model installation, reference-voice consent, inference cache, and
   derived-media lifecycle.
4. Split audio translation into locally testable ASR, translation, TTS, and timing-alignment stages.
5. Complete Jianying calibration cases A-001 through A-010 and record numeric and perceptual deltas.
