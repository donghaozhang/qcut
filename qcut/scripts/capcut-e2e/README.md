# CapCut 8.1 E2E fixture pipeline

Generate a self-contained run under `.tmp/capcut-e2e/runs/<run-id>`:

```bash
bun run capcut:e2e:fixtures
```

The six-second H.264 High/yuv420p source video is video-only. It uses fixed
QP 10, all-intra frames, and disables deblock/AQ/psy/mbtree so a frozen plate
decodes to identical ROI pixels at every calibrated frame. Clip A freezes the first
`testsrc2` frame and Clip B freezes the first SMPTE-bars frame. Both plates add
different asymmetric corner marks. The top 96-pixel strip shows the zero-based
global frame ordinal; the locked comparison ROI is `1280x624+0+96`, so visual
metrics never compare that changing strip. Every rendered label is printable
ASCII. A separate
`source-audio.wav` contains mono 48 kHz PCM s16le audio (440 Hz for three
seconds, then 660 Hz for three seconds), so a draft can place video and audio
without doubling embedded sound. Chinese is rendered only in
`cjk-font-proof.png`, after cmap coverage is verified with
`assertFontCoversText`.

`manifest.json` records FFmpeg/FFprobe 8.1.2 banners, probes for both source
files, artifact hashes, font coverage reports, and hashes of the exact ASCII
and CJK font files used for rendering. FFmpeg `astats` also measures the two
audio windows from zero crossings: Clip A must be 440 Hz and Clip B 660 Hz,
each within ±1 Hz, and the recorded frequency must equal
`zeroCrossings / (2 * durationSeconds)`. Generation fails if any check differs.

Manifest schema `2` records exact source-frame calibration: frame 45 at
1,500,000µs for Plate A and frame 135 at 4,500,000µs for Plate B, selected with
FFmpeg's zero-based frame index. Generation also keeps twelve hashed pixel
proofs: the comparison ROI must have identical PNG hashes at A frames
0/45/46/83/89 and B frames 90/97/135/136/179, the A/B hashes must differ, and
ordinal-strip frames 45/46 must have different hashes. Schema-1 runs under
`.tmp/capcut-e2e/runs` are
intentionally incompatible and should be regenerated. Bundle generation
re-hashes every artifact and both font files before using a run; the spec and
file-name set must exactly match the locked schema.

On macOS the default CJK font is CapCut's
`Contents/Resources/Font/SystemFont/zh-hans.ttf`. Override it on any platform
with an absolute path:

```bash
QCUT_CAPCUT_E2E_CJK_FONT=/absolute/path/to/font.ttf \
  bun run capcut:e2e:fixtures -- --run-id local-proof
```

`QCUT_CAPCUT_E2E_ASCII_FONT` can similarly override the platform ASCII font.
The command only accepts QCut's staged FFmpeg and FFprobe 8.1.2 binaries for
the current platform; it never falls back to `ffmpeg-static` or the system
`PATH`.

After generating and validating a fixture run, create three verified CapCut
migration bundles without launching or installing CapCut:

```bash
bun run capcut:e2e:bundles -- --run-id <existing-run-id>
```

The command writes `bundles/bundle-run-manifest.json` beneath that fixture run.
It covers native title/caption/sticker plus independent audio, native dissolve,
and a repeated Clip A with a 2x2 invert LUT and static ellipse mask. Every case
must match its exact warning allowlist before it can commit, and every resulting
bundle is re-read with `verifyCapCut81MigrationBundle`. The final draft content
is then checked for the exact Chinese payloads and live text tracks, independent
audio/photo overlay, dissolve duration and source ranges, mask/LUT references,
and the complete generated 2x2 invert `.cube` body.

Bundles are built in a run-local staging directory and atomically renamed to
`bundles` only after all three cases and the summary manifest pass. Existing
`bundles` output is never overwritten; generate a new fixture run ID instead.
