# Transition capture and parity protocol

## Goal

Separate three questions:

1. Is this the same catalog and package version?
2. Is QCut using the same timing, progress curve, and parameters?
3. Do QCut preview and exported frames match Jianying closely enough?

A visual side-by-side is useful, but it does not replace fixed-progress pixel
measurements.

## Build calibration clips

Create two original, lossless clips at the target project resolution and FPS.
Use at least 120 frames per clip so every tested transition has enough handles.

- **A/outgoing:** red/cyan grid, asymmetric corner labels, diagonal ruler, and
  a large per-frame number.
- **B/incoming:** green/magenta grid with different cell spacing, mirrored
  corner labels, opposite diagonal, and a large per-frame number.
- Keep hard edges, flat fields, fine detail, and transparent-free full frames.
- Use the same color space, resolution, FPS, and codec in Jianying and QCut.

The asymmetry reveals horizontal/vertical flips and wrong source coordinates.
Frame numbers reveal off-by-one sampling. Fine detail exposes blur and scaling.

## Lock the identity

Before capture, retain one structural report:

```bash
bun scripts/inspect-transition.ts inspect --title "左移"
```

Require an exact resource/package version or state the ambiguity. Record:

- catalog resource ID, catalog effect ID, MD5, and response timestamp;
- draft effect ID, package path, applied duration, FPS, and overlap flag;
- owner/next segment, seam delta, renderer family, and internal easing;
- visible Jianying card/category and selected duration in a screenshot.

## Define progress by rendered frames

Let `N` be the number of rendered transition frames after frame quantization.
First identify the actual transition interval from the exported numbered A/B
frames; do not assume `is_overlap` changes target timeline ranges.

For each normalized stop `p` use:

```text
k(p) = round(p * (N - 1))
p in {0, 0.25, 0.5, 0.75, 1}
```

Record both `p` and the concrete frame index. If the runtime defines progress
with `N` rather than `N - 1`, endpoint behavior will expose it; report the
off-by-one instead of shifting captures until they look better.

## Capture four comparable streams

At each stop capture:

1. Jianying preview player, cropped to the exact video viewport.
2. QCut preview player at the same viewport size and device pixel ratio.
3. A lossless frame from Jianying export.
4. A lossless frame from QCut/FFmpeg export.

Preview and export have separate references because display transforms,
scaling, and UI capture can differ from encoded pixels. Never compare a QCut
preview screenshot against a Jianying export frame.

For preview captures:

- hide overlays, selection outlines, safe-area guides, playhead badges, and
  transport UI from the crop;
- use the same monitor, scaling, canvas zoom, and crop dimensions;
- visually inspect every capture for occluding windows or stale frames.

For exports:

- use lossless PNG frame extraction or a lossless intermediate;
- compare the same resolution and color metadata;
- disable unrelated filters, transforms, masks, opacity, and adjustment layers.

## Manifest

Paths can be absolute or relative to the manifest:

```json
{
  "transitionTitle": "叠化",
  "formula": "C(p) = (1 - p) A + p B",
  "samples": [
    {
      "progress": 0,
      "jianyingPreview": "jy-preview-000.png",
      "qcutPreview": "qcut-preview-000.png",
      "jianyingExport": "jy-export-000.png",
      "qcutExport": "qcut-export-000.png"
    },
    {
      "progress": 0.25,
      "jianyingPreview": "jy-preview-025.png",
      "qcutPreview": "qcut-preview-025.png",
      "jianyingExport": "jy-export-025.png",
      "qcutExport": "qcut-export-025.png"
    }
  ]
}
```

Add entries for `0.5`, `0.75`, and `1`. For controlled synthetic tests where
one reference truly serves both channels, use `jianying` as a fallback instead
of separate `jianyingPreview` and `jianyingExport`.

Run the report:

```bash
bun scripts/inspect-transition.ts parity-report \
  --title "叠化" \
  --manifest parity-manifest.json \
  --formula "C(p) = (1 - p) A + p B"
```

The inspector resolves FFmpeg from `--ffmpeg-path`, `FFMPEG_PATH`, QCut's
bundled binary, or `PATH`, in that order.

## Metrics and confidence

Metrics are computed over decoded RGB channel samples in the 0-255 domain:

```text
MAE  = mean(|Q - J|)
RMSE = sqrt(mean((Q - J)^2))
```

The report also includes maximum and 95th-percentile absolute error.

- **High:** catalog + draft + package + formula are present; identity is
  unambiguous; all five preview and export pairs exist; worst RMSE <= 8.
- **Medium:** structural evidence and formula are complete, identity is clear,
  and compared frames remain <= 16 RMSE, but coverage or exactness is weaker.
- **Low:** captures exist but structural evidence, formula, identity, coverage,
  or error is inadequate.
- **Unverified:** no comparable frames exist.

Do not collapse the report to one average. A good midpoint can hide wrong
endpoints, an inverted direction, or a progress curve that only diverges at
25% and 75%.

## Representative validation order

1. **叠化:** endpoints, linear mix, duration, and renderer plumbing.
2. **左移/右移:** coordinate direction, edge fill, and internal quint easing.
3. **翻页:** nonlinear geometry and border behavior.
4. **横移模糊:** multi-pass displacement, crop, Gaussian blur, exposure, and
   AE curve ordering.
5. **立方旋转:** perspective, 3D transforms, backface/edge behavior, and the
   boundary between WebGL parity and a simplified interpretation.

Sequence composites come after the renderer contract is stable. Recreate
their masks and light strips independently; do not copy cached package media.

## Failure diagnosis

| Symptom | Likely cause |
| --- | --- |
| endpoints wrong | source ordering, progress convention, or off-by-one frame |
| 25/75 wrong but midpoint close | doubled or missing easing |
| geometry shifted | crop/aspect/UV convention mismatch |
| preview differs, export matches | canvas scaling, DPR, or display transform |
| export differs, preview matches | FFmpeg/render implementation divergence |
| only edges differ | sampling, clamping, premultiplication, or border fill |
| flat regions differ | color space, opacity, exposure, or blend equation |
| unstable run to run | stale preview frame, async texture readiness, or cache |
