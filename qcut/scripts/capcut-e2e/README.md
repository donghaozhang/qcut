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

## Round-trip parity case

Run the import-materialization, semantic, and four-output comparisons after
both applications have saved/exported the same case:

```bash
bun scripts/capcut-e2e/roundtrip-case.ts \
  --case-id <case-id> \
  --source-draft <source-draft-dir> \
  --roundtrip-draft <roundtrip-draft-dir> \
  --qcut-import-bundle <qcut-import-bundle.json> \
  --qcut-import-snapshot <qcut-import-snapshot.json> \
  --qcut-native-export <qcut-media> \
  --reference-native-export <jianying-or-capcut-media> \
  --qcut-preview-frames <qcut-frame-dir> \
  --reference-preview-frames <jianying-or-capcut-frame-dir> \
  --output <empty-evidence-dir> --json
```

With the imported project open in QCut, capture the trusted persisted snapshot
before running the round-trip case:

```bash
qcut editor interop import-snapshot \
  --project-id <qcut-project-id> \
  --bundle-digest <bundle-sha256> \
  --output <qcut-import-snapshot.json> --json
```

The renderer reads the project, raw timeline, and media blobs twice from QCut
storage, rejects state that changes between reads, and streams each persisted
blob through SHA-256. Electron accepts the response only from the active main
frame. The path-free snapshot binds the bundle digest, import ID, and source
profile ID to project geometry/FPS/name, complete tracks, and media
ID/type/byte length/SHA-256. The verifier emits manifest schema 2 and returns
`pass` only when the trusted capture and every binding and materialization
check match.

Legacy schema-1 snapshots whose media entries contain absolute `sourcePath`
values remain readable for local diagnostics. Even an exact legacy match is
`not-comparable`; it cannot prove that the running QCut renderer persisted the
state. Absolute paths are never retained in evidence manifests.

The import gate can also run independently:

```bash
bun scripts/capcut-e2e/qcut-import-verification.ts \
  --bundle <qcut-import-bundle.json> \
  --qcut-snapshot <qcut-import-snapshot.json> \
  --output <empty-evidence-dir> --json
```

The source draft determines a fixed-seed sample plan. Each preview directory
must contain a cropped canvas PNG named `frame-XXXXXXXX.png` for every planned
zero-based frame. Do not provide whole-window captures: application chrome,
sidebars, playback controls, display scaling, and monitor color management are
outside the canvas comparison contract.

The aggregate manifest fixes semantic roles as source to roundtrip, import
roles as bundle to persisted QCut state, and media roles as reference to QCut.
Aggregate schema 2 embeds path-free import, semantic, native-frame,
preview-frame, and audio manifests; schema 1 evidence predates the mandatory
import gate and is not equivalent. Import or comparison failure exits `1`;
missing or candidate evidence exits `2`; harness errors exit `3`. Exit `0` is
reserved for fully verified import state, thresholds, frame coverage, and
provenance. Current CapCut 8.1 thresholds and provenance are
candidate-unverified, so matching synthetic outputs intentionally return
`unverified` rather than a verified pass.
