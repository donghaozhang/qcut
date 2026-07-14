# Portrait Filter and Transition Audit

Status: In progress
Started: 2026-07-14
Branch: `codex/editor-production-workflows`
Baseline commit: `34810a443`

## Objective

Exercise QCut's production filter and transition paths with real people rather than synthetic fixtures. The audit uses both portrait and landscape media, varied skin tones, mixed lighting, foreground occlusion, saturated backgrounds, and two source frame rates.

Acceptance criteria:

- Every fixture is approximately 10 seconds, decodes completely, and imports into QCut.
- Every filter family is exercised on real portrait footage; representative high-risk presets are visually inspected.
- Every transition family is exercised between real portrait clips in both aspect-ratio directions.
- Each test run is recorded below immediately after execution, including evidence and the modification decision.
- Any defect is fixed and the affected run is repeated before the audit is closed.

## Licensed Fixture Set

All source pages state that the selected clip is available under the Mixkit Stock Video Free License for commercial or personal use. Downloaded media and generated evidence live under the ignored `output/playwright/portrait-filter-transition-audit/` directory and are not committed.

| Fixture | Orientation | Coverage | Source page | Original | Prepared fixture | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `colorful-influencer-10s.mp4` | Portrait | Medium skin, colorful studio, face and hand motion | [Portrait of an influencer talking to the camera](https://mixkit.co/free-stock-video/portrait-of-an-influencer-talking-to-the-camera-42323/) | 720x1280, 23.976 fps, 16.850 s | 720x1280, 23.976 fps, 10.010 s | `b5f3b29dbd572748dee747486ddd559fb32ca24c2a4321e15c824df389df21e8` |
| `neon-man-10s.mp4` | Portrait | Dark silhouette, blue neon, glasses motion | [Urban man puts on glasses in a dark room](https://mixkit.co/free-stock-video/urban-man-puts-on-a-glasses-at-a-dark-room-1235/) | 720x1280, 23.976 fps, 15.140 s | 720x1280, 23.976 fps, 10.010 s | `cd6d5de49db6974648d000de315faa1354578512a1fda937c82399bbcb3ae470` |
| `beach-woman-10s.mp4` | Portrait | Bright backlight, white fabric, full-body movement | [A young woman's portrait at the beach](https://mixkit.co/free-stock-video/a-young-womans-portrait-at-the-beach-1221/) | 720x1280, 23.976 fps, 13.180 s | 720x1280, 23.976 fps, 10.010 s | `7d17026a91c8fd0f7f034d454e01f1e7f2f123498ed459e70d15611309b5703a` |
| `university-woman-landscape-10s.mp4` | Landscape | Light skin, stable outdoor close-up, natural greens | [Woman smiling at a university](https://mixkit.co/free-stock-video/woman-smiling-at-a-university-4821/) | 1280x720, 23.976 fps, 10.177 s | 1280x720, 23.976 fps, 10.010 s | `833a390d4690ab20cf6017f8a54ec8512898ab3590c9c823a4bdc9e5b9bfd44c` |
| `office-woman-landscape-10s.mp4` | Landscape | Medium skin, office light, foreground leaf occlusion | [Focused Woman at Office](https://mixkit.co/free-stock-video/focused-woman-at-office-101536/) | 1280x720, 23.976 fps, 15.807 s | 1280x720, 23.976 fps, 10.010 s | `58161d68154e59f5bcaeaf62d1741fe8f57e1d268c8e25c24c9c79d5a6f489cf` |
| `chroma-man-landscape-10s.mp4` | Landscape | Dark skin, saturated green screen, speaking gestures | [Man talking head-on on a chroma background](https://mixkit.co/free-stock-video/man-talking-head-on-on-a-chroma-background-28287/) | 1280x720, 59.940 fps, 15.949 s | 1280x720, 59.940 fps, 10.010 s | `25bdd29f6b08d385e5cbdad88a65f9fe9809b6beb678c02ed830212703899a65` |

License reference: [Mixkit license](https://mixkit.co/license/).

## Run Log

### Run 00 - Download, normalize, decode, and visually inspect fixtures

Date: 2026-07-14
Result: PASS
Environment: FFmpeg 8.1 on macOS

Procedure:

1. Downloaded the 720p MP4 from each licensed source page.
2. Selected continuous sections with a visible person and normalized each fixture with H.264, `yuv420p`, CRF 18, and fast-start metadata.
3. Used `ffprobe` to verify codec, dimensions, pixel format, frame rate, duration, and file size.
4. Decoded every frame with `ffmpeg -v error -i <fixture> -f null -`.
5. Generated four-frame contact sheets at 2.5-second intervals and inspected all six sheets.

Assertions:

| Check | Result |
| --- | --- |
| Three portrait and three landscape fixtures exist | PASS |
| Every prepared duration is 10.010 s | PASS |
| Every prepared fixture is H.264 with `yuv420p` | PASS |
| All fixtures decode from start to end without an FFmpeg error | PASS |
| People remain visible at useful filter/transition sample times | PASS |
| No source black frame, corrupt frame, or orientation metadata error is visible | PASS |

Visual notes:

- The beach subject leaves the frame near the end. Keep filter screenshots before 7.5 seconds; the exit remains useful for motion-transition testing.
- The neon fixture intentionally retains crushed source shadows. It is the dark-scene stress case, not a reference for neutral exposure.
- The office foreground leaves intentionally cross the face and provide a useful edge-detail stress case.
- The green-screen fixture remains at 59.940 fps to cover QCut's high-frame-rate import and preview path.

Evidence:

- Fixtures: `output/playwright/portrait-filter-transition-audit/sources/*-10s.mp4`
- Contact sheets: `output/playwright/portrait-filter-transition-audit/source-contact-sheets/*-10s.png`
- Source contact sheets: `output/playwright/portrait-filter-transition-audit/source-contact-sheets/*-source.png`

Modification decision: no QCut change is required from source preparation. Retain all six fixtures for application testing.

### Run 01a - Import all fixtures and wait for thumbnail state

Date: 2026-07-14
Result: FAIL (audit assertion defect)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-media-import-audit.e2e.ts --project=electron --reporter=line`

Observed:

- QCut imported all six files through the media import UI.
- Every media card displayed a real thumbnail and `0:10` duration.
- The audit timed out because it required every item to report `thumbnailStatus === "ready"`.
- Imported files can already include a generated `thumbnailUrl`; in that valid path the store does not add a background `thumbnailStatus` value.
- Temporary thumbnail `<video>` elements emitted cancelled `blob:` requests while being removed. The visible thumbnails completed successfully, so those cancellations were not decode failures.

Evidence:

- Failure screenshot: `docs/completed/test-results-raw/portrait-media-import-audi-bd3d6-ortrait-and-landscape-clips-electron/test-failed-1.png`
- Playwright context: `docs/completed/test-results-raw/portrait-media-import-audi-bd3d6-ortrait-and-landscape-clips-electron/error-context.md`

Modification decision: correct the audit to assert the user-visible contract (`thumbnailUrl` contains usable image data). No QCut production change is justified by this run.

### Run 01b - Import fixtures and create orientation preview clips

Date: 2026-07-14
Result: FAIL (audit fixture construction defect)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-media-import-audit.e2e.ts --project=electron --reporter=line`

Observed:

- The corrected thumbnail assertion passed for all six files.
- The audit-created timeline element displayed `No elements at current time`, so no preview `<video>` existed.
- The test passed `trimEnd: 6.01` as if it were an absolute source endpoint. QCut defines `trimEnd` as the duration removed from the tail; the test therefore created an invalid effective clip window.

Evidence:

- Failure screenshot: `docs/completed/test-results-raw/portrait-media-import-audi-bd3d6-ortrait-and-landscape-clips-electron/test-failed-1.png`

Modification decision: construct the same untrimmed media element used by production and existing transition E2E tests with `trimEnd: 0`. No QCut production change is justified by this run.

### Run 01c - Import and preview both source orientations

Date: 2026-07-14
Result: PASS
Command: `bunx playwright test apps/web/src/test/e2e/portrait-media-import-audit.e2e.ts --project=electron --reporter=line`

Assertions passed:

- The real media picker imported all six files in one operation.
- All six names, 10.01-second durations, dimensions, and thumbnail image data matched the prepared fixtures.
- The portrait timeline clip produced a ready video with intrinsic dimensions 720x1280.
- The landscape timeline clip produced a ready video with intrinsic dimensions 1280x720.
- Both clips rendered visible people in the production preview and generated complete timeline thumbnails.

Visual note: adding the portrait clip first switched the project canvas to 9:16. The later landscape clip retained its 1280x720 source metadata and decoded correctly, but the default `cover` fit cropped it into the portrait project. Filter runs must therefore include native 9:16 and native 16:9 project contexts.

Evidence:

- `output/playwright/portrait-filter-transition-audit/run-01-import/01-six-imported-fixtures.png`
- `output/playwright/portrait-filter-transition-audit/run-01-import/02-portrait-preview.png`
- `output/playwright/portrait-filter-transition-audit/run-01-import/03-landscape-preview.png`

Modification decision: the import and source-orientation path needs no production change. Keep the explicit dual-canvas requirement for subsequent runs.

### Run 02a - Start the complete portrait filter matrix

Date: 2026-07-14
Result: FAIL (audit browser-boundary defect)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-filter-audit.e2e.ts --project=electron --reporter=line --grep 'portrait footage'`

Observed:

- QCut imported all three portrait fixtures and loaded the colorful portrait into the production video player.
- The audit failed before applying the first filter because a Playwright `locator.evaluate` callback referenced Node-side `expectedWidth` and `expectedHeight` variables as an implicit closure.
- Playwright executes that callback in the renderer and does not serialize outer lexical variables.

Evidence:

- Failure screenshot: `docs/completed/test-results-raw/portrait-filter-audit.e2e.-41345-pects-lighting-stress-cases-electron/test-failed-1.png`

Modification decision: pass expected dimensions as an explicit evaluate argument. No QCut production change is justified by this run.

### Run 02b - Establish the unfiltered portrait pixel baseline

Date: 2026-07-14
Result: FAIL (audit rendering-path assumption)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-filter-audit.e2e.ts --project=electron --reporter=line --grep 'portrait footage'`

Observed:

- The explicit intrinsic-dimension check passed and the portrait video reached ready state.
- The audit expected `color-preview-canvas` before applying a filter.
- QCut intentionally renders the original `<video>` directly when no pixel color edit is active. It creates the color canvas only after the first filter or other pixel color operation, then hides the raw source layer.

Evidence:

- Failure screenshot: `docs/completed/test-results-raw/portrait-filter-audit.e2e.-41345-pects-lighting-stress-cases-electron/test-failed-1.png`

Modification decision: treat the raw ready video as the valid unfiltered path. Require a non-empty color canvas after the first filter, then require a new canvas hash for every subsequent preset. No QCut production change is justified by this run.

### Run 02c - Complete portrait filter matrix

Date: 2026-07-14
Result: PASS
Command: `bunx playwright test apps/web/src/test/e2e/portrait-filter-audit.e2e.ts --project=electron --reporter=line --grep 'portrait footage'`

Assertions passed:

- All 14 filter categories and all 56 production filter presets were selected through the real filter cards.
- Every selection updated the active timeline element to the expected preset ID.
- The first filter created a non-empty pixel-processing canvas, and every subsequent preset produced a different sampled pixel hash.
- Every sampled canvas contained opaque pixels and a non-zero luminance range.
- The 720x1280 colorful portrait remained decoded and ready throughout the complete matrix.
- The dark neon portrait with `night-blue` and bright beach portrait with `sunlight` both passed the same canvas checks.

Runtime: 1 minute 54 seconds.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-02-filters-portrait/manifest.json`
- Category screenshots: `output/playwright/portrait-filter-transition-audit/run-02-filters-portrait/01-*.png` through `14-*.png`
- Stress screenshots: `output/playwright/portrait-filter-transition-audit/run-02-filters-portrait/stress-*.png`

Modification decision: automated rendering checks found no broken portrait preset. Visual skin-tone, shadow, and highlight inspection is recorded separately after reviewing the evidence images.

### Run 03a - Portrait filter visual inspection

Date: 2026-07-14
Result: PASS
Method: reviewed all 14 category screenshots as a contact sheet, then inspected portrait, night, stylized, monochrome, HD, and both stress screenshots at full size.

Observed:

- All category results kept a visible, correctly framed person with no blank, transparent, stale, or displaced preview.
- `Peach Skin` kept natural midtone separation on the colorful portrait instead of flattening facial detail.
- `Amber Night`, `Retro Pop`, and `Documentary Mono` produced deliberate category-appropriate styling without color-channel artifacts or tonal banding.
- `Clean Detail` increased local contrast without obvious halos at the hairline.
- `Night Blue` kept the neon backlight and silhouette boundary on the intentionally underexposed source. The face remaining dark matches the source and preset intent.
- `Sunlight` strongly lifted the beach source but retained visible folds in the white dress and texture in bright sand.

Evidence:

- Contact sheet: `output/playwright/portrait-filter-transition-audit/run-02-filters-portrait/contact-sheet.png`
- Full-size images: `output/playwright/portrait-filter-transition-audit/run-02-filters-portrait/*.png`

Modification decision: no production filter adjustment is required from the portrait matrix. Continue with an independent native 16:9 run before closing filter coverage.

## Planned Application Runs

| Run | Scope | Status |
| --- | --- | --- |
| 01 | Import all six fixtures and verify aspect ratio, duration, thumbnail, and playback | PASS after correcting two audit assumptions |
| 02 | Exercise every filter family on portrait and landscape people | Portrait PASS; landscape pending |
| 03 | Inspect high-risk filter presets across all lighting and skin-tone cases | Portrait PASS; landscape pending |
| 04 | Exercise every transition family at portrait-to-landscape and landscape-to-portrait seams | Pending |
| 05 | Inspect high-motion and edge-sensitive transitions, then export representative seams | Pending |
| 06+ | Fix and rerun any failed scope | Pending |

## Final Decision

Pending completion of the application runs.
