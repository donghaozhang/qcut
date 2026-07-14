# Portrait Filter and Transition Audit

Status: Complete
Started: 2026-07-14
Completed: 2026-07-14
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

### Run 02d - Complete landscape filter matrix

Date: 2026-07-14
Result: PASS
Command: `bunx playwright test apps/web/src/test/e2e/portrait-filter-audit.e2e.ts --project=electron --reporter=line --grep 'landscape footage'`

Assertions passed:

- All 14 filter categories and all 56 production presets were selected through the real filter cards in a native 16:9 project.
- Every card updated the selected timeline element to its expected preset ID.
- The first preset created a non-empty color canvas, and every later preset produced a distinct sampled pixel hash.
- Every sampled result retained opaque pixels and a non-zero luminance range.
- The 1280x720 university portrait stayed decoded and ready throughout the matrix.
- The office portrait with `clarity-boost` and 59.94 fps chroma portrait with `teal-gold` passed the same canvas checks.

Runtime: 2 minutes.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-02-filters-landscape/manifest.json`
- Category screenshots: `output/playwright/portrait-filter-transition-audit/run-02-filters-landscape/01-*.png` through `14-*.png`
- Stress screenshots: `output/playwright/portrait-filter-transition-audit/run-02-filters-landscape/stress-*.png`

Modification decision: automated rendering checks found no broken landscape preset. Complete visual inspection before closing filter coverage.

### Run 03b - Landscape filter visual inspection

Date: 2026-07-14
Result: PASS
Method: reviewed all 14 category screenshots as a contact sheet, then inspected portrait, night, stylized, monochrome, HD, office, and chroma evidence at full size.

Observed:

- All 14 category results kept the 16:9 frame aligned and fully visible with no stale source, blank canvas, or aspect-ratio jump.
- `Peach Skin` retained facial highlight and eye detail on the outdoor university portrait.
- `Amber Night` and `Retro Pop` produced intentional warm styling without clipping the face into a flat color region.
- `Documentary Mono` retained distinct skin, shirt, foliage, and building tones.
- `Clean Detail` and the office `Clarity Boost` stress case showed no obvious halo at hair, plant, jacket, or chair edges.
- `Teal Gold` shifted the saturated chroma backdrop predictably while preserving dark skin, white-shirt detail, and the moving subject boundary.

Evidence:

- Contact sheet: `output/playwright/portrait-filter-transition-audit/run-02-filters-landscape/contact-sheet.png`
- Full-size images: `output/playwright/portrait-filter-transition-audit/run-02-filters-landscape/*.png`

Modification decision: no production filter adjustment is required. The filter audit closes with 112 successful real UI applications: 56 portrait and 56 landscape.

### Run 04a - Start portrait-to-landscape transition matrix

Date: 2026-07-14
Result: FAIL (visibility assertion at `photo-stack-up`; classification pending)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-transition-audit.e2e.ts --project=electron --reporter=line --grep portrait-to-landscape`

Observed:

- QCut imported the real 720x1280 colorful portrait and 1280x720 university portrait, created a four-second adjacent seam, and decoded both sources in the production preview.
- Transition card application and store mapping passed through the earlier presets in the matrix.
- At `photo-stack-up`, both real video frames remained ready, non-empty, and at their expected intrinsic dimensions.
- The run stopped because the generic midpoint assertion found no opacity, filter, clip-path, background, or relative-transform difference between the two presentation layers.
- This result does not yet establish a product defect: a staged preset can legitimately pass through a neutral pose at its exact midpoint, while the current audit samples only that one progress value.

Evidence:

- Failure screenshot: `docs/completed/test-results-raw/portrait-transition-audit.-db0a2--portrait-to-landscape-seam-electron/test-failed-1.png`

Modification decision: inspect the production `photo-stack-up` progress curve and sample multiple interior transition points. Change production only if the preset has no visible presentation across its active interval; otherwise correct the audit and rerun the complete matrix.

### Run 04b - Complete portrait-to-landscape transition matrix

Date: 2026-07-14
Result: PASS
Command: `bunx playwright test apps/web/src/test/e2e/portrait-transition-audit.e2e.ts --project=electron --reporter=line --grep portrait-to-landscape`

Assertions passed:

- All 13 transition categories and all 67 registered production presets were applied through the real transition cards at a 720x1280 portrait-to-1280x720 landscape seam.
- Every card created or replaced the seam transition with the expected preset ID, clip transition type, direction, tuning, default duration, and easing.
- At every transition midpoint, both source videos were decoded, retained their exact intrinsic dimensions, and produced non-empty frame samples with measurable luminance range.
- Every preset produced a visible production presentation signal through opacity, content opacity, filter, clip path, background, transform, or layer position.
- Hover previews advanced for one high-risk representative in every category, and the same 13 presets were captured in the live editor.

Runtime: 1 minute 30 seconds.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-04-transitions-portrait-to-landscape/manifest.json`
- Category screenshots: `output/playwright/portrait-filter-transition-audit/run-04-transitions-portrait-to-landscape/01-*.png` through `13-*.png`

Modification decision: Run 04a was an audit defect. QCut applies transition translation through the layer's `left` and `top` positions; adding those positions to the evidence model made `photo-stack-up` and the complete registry pass. No production transition change is justified by this direction.

### Run 04c - Complete landscape-to-portrait transition matrix

Date: 2026-07-14
Result: PASS
Command: `bunx playwright test apps/web/src/test/e2e/portrait-transition-audit.e2e.ts --project=electron --reporter=line --grep landscape-to-portrait`

Assertions passed:

- All 13 transition categories and all 67 registered production presets were applied through the real transition cards at a 1280x720 landscape-to-720x1280 portrait seam.
- Every applied transition matched its registered state mapping, including direction, tuning, default duration, and easing.
- The office and neon portrait videos remained decoded, non-empty, and at their exact source dimensions throughout the full matrix.
- Every preset produced a visible midpoint presentation signal, including position-based push and slide transitions.
- Hover animation and full editor screenshots completed for one representative in each category.

Runtime: 1 minute 30 seconds.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-04-transitions-landscape-to-portrait/manifest.json`
- Category screenshots: `output/playwright/portrait-filter-transition-audit/run-04-transitions-landscape-to-portrait/01-*.png` through `13-*.png`

Modification decision: no production transition change is required from the reverse-orientation matrix. Automated transition coverage closes with 134 successful real UI applications: 67 in each direction.

### Run 05a - Transition visual inspection across both orientation changes

Date: 2026-07-14
Result: PASS
Method: reviewed both 13-category contact sheets, then inspected page-turn, film-burn, and heavy-glitch evidence at full 1800x1040 resolution.

Observed:

- Dissolve and variety representatives blended both people without a stale frame, empty layer, or abrupt aspect-ratio jump.
- Page turn and push preserved a clean dividing edge between portrait and landscape sources; no uncovered canvas appeared outside the intended wipe area.
- Deep zoom blur covered the full project frame with a continuous blurred image rather than exposing transparent edges.
- Impact shake and elastic whip kept both subjects inside the expected transition motion and returned a coherent midpoint composition.
- Chromatic twist and heavy glitch produced intentional channel separation while retaining recognizable faces and source detail.
- Film burn produced the expected strong warm overlay without losing both underlying subjects.
- `fade-to-white` and `shutter-flash` intentionally reached white and light-gray peak frames. Their source videos remained decoded and non-empty in the automated frame samples, so these are designed flash states rather than blank-render failures.
- The same behavior held on native 9:16 and native 16:9 canvases.

Evidence:

- Portrait-to-landscape contact sheet: `output/playwright/portrait-filter-transition-audit/run-04-transitions-portrait-to-landscape/contact-sheet.png`
- Landscape-to-portrait contact sheet: `output/playwright/portrait-filter-transition-audit/run-04-transitions-landscape-to-portrait/contact-sheet.png`
- Full-size representatives: `03-slideshow-page-turn-left.png`, `09-light-film-burn.png`, and `10-glitch-heavy-glitch.png` in the corresponding Run 04 evidence directories.

Modification decision: the reviewed preview presentations need no production tuning. Continue to the native FFmpeg mapping and representative real export checks before closing Run 05.

### Run 05b - Complete production transition-to-FFmpeg mapping

Date: 2026-07-14
Result: PASS (21/21 tests)
Command: `bunx vitest run electron/__tests__/transition-filter.test.ts`

Assertions passed:

- Every one of the 67 visible transition presets resolved to a production timeline configuration and a non-empty custom FFmpeg expression.
- All 12 export presentation types produced their expected expression families, including every slide, push, and wipe direction.
- Duration handling, source-handle preparation, missing-handle padding, easing, RGB plane mapping, tint conversion, intensity, and frequency tuning passed.

Modification decision: the registry-to-export mapping is complete. Continue with real FFmpeg execution because a syntactically generated expression alone does not prove that native encoding succeeds.

### Run 05c - Execute every export presentation family with native FFmpeg

Date: 2026-07-14
Result: PASS (1 targeted test; 21 encoded transition cases)
Command: `bunx vitest run electron/__tests__/video-transform-export-real.test.ts -t 'matches supported transition presentations at fixed frames'`

Assertions passed:

- QCut's bundled FFmpeg encoded dissolve, fade-black, fade-white, zoom-blur, whip-pan, flash, light-leak, RGB glitch, and shake transitions.
- Native encoding also passed all four directions for slide, push, and wipe.
- Pixel probes before and at the cut matched the intended behavior for blending, black/white peaks, tinted light, channel effects, and directional entry regions.

Runtime: 6.5 seconds for the 21 native encodes.

Modification decision: all export presentation families execute correctly on deterministic sources. Run representative encodes on the downloaded portrait footage in both orientation directions to close the real-media evidence gap.

### Run 05d - Start real portrait-to-landscape native exports

Date: 2026-07-14
Result: FAIL (audit timeout)
Command: `bunx vitest run electron/__tests__/portrait-transition-export-audit.test.ts -t portrait-to-landscape`

Observed:

- The real portrait and landscape source paths were found, so the opt-in audit executed rather than skipping.
- QCut's production FFmpeg builder started the baseline plus all six representative transition encodes.
- The synchronous work took 11.7 seconds, after which Vitest applied its default five-second test timeout.
- No FFmpeg status, probe, decode, frame-range, or hash assertion reported a production failure before the framework timeout.

Modification decision: give this explicitly long-running native export audit a 120-second per-case timeout and rerun from a clean evidence directory. No production change is justified by this run.

### Run 05e - Export representative real portrait-to-landscape transitions

Date: 2026-07-14
Result: PASS (baseline plus 6 real transition encodes)
Command: `bunx vitest run electron/__tests__/portrait-transition-export-audit.test.ts -t portrait-to-landscape`

Assertions passed:

- QCut's production FFmpeg builder encoded `page-turn-left`, `push-down`, `deep-zoom-blur`, `impact-shake`, `film-burn`, and `heavy-glitch` from the downloaded colorful portrait into the downloaded landscape university portrait.
- Every output was H.264/yuv420p at 360x640, approximately three seconds long, larger than 5 KB, and fully decodable with the bundled FFmpeg.
- Every transition midpoint retained a luminance range greater than five and differed from the same real-media project's no-transition midpoint hash.
- All six midpoint hashes were unique, ruling out a shared stale or fallback frame.
- A full-resolution midpoint PNG was extracted successfully from every encoded file.

Runtime: 11.3 seconds.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-05-real-exports/portrait-to-landscape/manifest.json`
- Videos and midpoint frames: `output/playwright/portrait-filter-transition-audit/run-05-real-exports/portrait-to-landscape/`

Modification decision: the representative production export path needs no change in the native 9:16 project. Repeat the same six presets in a native 16:9 reverse-orientation project.

### Run 05f - Export representative real landscape-to-portrait transitions

Date: 2026-07-14
Result: PASS (baseline plus 6 real transition encodes)
Command: `bunx vitest run electron/__tests__/portrait-transition-export-audit.test.ts -t landscape-to-portrait`

Assertions passed:

- The same six high-risk presets encoded from the downloaded office landscape portrait into the downloaded neon portrait.
- Every output was H.264/yuv420p at 640x360, approximately three seconds long, larger than 5 KB, and fully decodable.
- Every midpoint retained visible luminance detail, differed from the no-transition real-media baseline, and produced a unique hash across the six presets.
- Midpoint PNG extraction succeeded for every encoded transition.

Runtime: 11.5 seconds.

Evidence:

- Manifest: `output/playwright/portrait-filter-transition-audit/run-05-real-exports/landscape-to-portrait/manifest.json`
- Videos and midpoint frames: `output/playwright/portrait-filter-transition-audit/run-05-real-exports/landscape-to-portrait/`

Modification decision: no production export change is required. The real-media export audit closes with 12 successful representative transition files across both project orientations, in addition to the complete 67-preset mapping and 21-case native presentation matrix.

### Run 05g - Inspect native real-media transition outputs

Date: 2026-07-14
Result: PASS
Method: reviewed both six-frame export contact sheets and verified the numeric evidence in both manifests.

Observed:

- Deep zoom blur filled both 9:16 and 16:9 frames with continuous image content and no transparent border.
- Film burn retained visible people beneath the intended orange overlay in both directions.
- Heavy glitch showed distinct scan-line and RGB separation while preserving recognizable source geometry.
- Impact shake produced layered motion rather than a duplicated static frame.
- Page turn retained a clean vertical source boundary; push down retained a clean horizontal boundary.
- All 12 exported midpoints matched the semantics seen in the production preview.
- The smallest export was 79,846 bytes, every duration was exactly 3.0 seconds, and the minimum midpoint luminance range was 32.

Evidence:

- `output/playwright/portrait-filter-transition-audit/run-05-real-exports/portrait-to-landscape/contact-sheet.png`
- `output/playwright/portrait-filter-transition-audit/run-05-real-exports/landscape-to-portrait/contact-sheet.png`

Modification decision: no filter or transition production parameter needs modification from this audit. Keep the fixture-driven E2E and real-export audits as regression coverage.

### Run 06a - Audit code formatting and static rules

Date: 2026-07-14
Result: PASS
Command: `bunx biome check apps/web/src/test/e2e/portrait-transition-audit.e2e.ts apps/web/src/test/e2e/helpers/portrait-transition-audit-helpers.ts electron/__tests__/portrait-transition-export-audit.test.ts`

Observed: all three new transition audit files passed Biome without changes.

Modification decision: no formatting or lint correction is required.

### Run 06b - Web TypeScript verification

Date: 2026-07-14
Result: PASS
Command: `cd apps/web && bunx tsc --noEmit --pretty false`

Observed: the web application and both new Playwright transition audit modules type-checked without diagnostics.

Modification decision: no web type correction is required.

### Run 06c - Repository type-check script audit

Date: 2026-07-14
Result: NO-OP (not counted as verification)
Command: `bun run check-types`

Observed: Turbo discovered ten workspace packages but executed zero tasks because the current package graph exposes no `check-types` task implementations.

Modification decision: do not report this command as a passing type check. Use the direct web TypeScript result above and compile the Electron audit through its actual Vitest transform plus the repository's available TypeScript configuration.

### Run 06d - Electron TypeScript verification

Date: 2026-07-14
Result: PASS
Command: `bunx tsc --noEmit --pretty false -p electron/tsconfig.json`

Observed: the Electron codebase and real portrait transition export audit type-checked without diagnostics.

Modification decision: no Electron type correction is required.

### Run 06e - Combined transition mapping and real-export regression

Date: 2026-07-14
Result: PASS (23/23 tests)
Command: `bunx vitest run electron/__tests__/transition-filter.test.ts electron/__tests__/portrait-transition-export-audit.test.ts`

Observed:

- The 21 transition filter and mapping tests passed together with both real portrait export cases.
- Both evidence directories were rebuilt from clean state; the run re-encoded the two baselines and all 12 representative outputs.
- No result depended on artifacts left by the earlier individual runs.

Runtime: 23 seconds.

Modification decision: the transition export regression set is stable when executed together.

### Run 06f - Complete real-media Electron UI regression

Date: 2026-07-14
Result: PASS (5/5 tests)
Command: `bunx playwright test apps/web/src/test/e2e/portrait-media-import-audit.e2e.ts apps/web/src/test/e2e/portrait-filter-audit.e2e.ts apps/web/src/test/e2e/portrait-transition-audit.e2e.ts --project=electron --reporter=line --workers=1`

Assertions passed together:

- Imported, identified, thumbnailed, and previewed all six licensed portrait fixtures.
- Applied all 56 filters on a native 9:16 project and all 56 filters on a native 16:9 project, including the four lighting, detail, skin, and high-frame-rate stress cases.
- Applied all 67 transitions at a portrait-to-landscape seam and all 67 transitions at a landscape-to-portrait seam.
- Rebuilt all filter and transition manifests and category screenshots from clean test projects.

Runtime: 6 minutes 36 seconds.

Modification decision: the complete real-media UI regression is green. No production fix or additional rerun is required.

### Run 06g - Pull-request repository lint

Date: 2026-07-14
Result: FAIL (pre-existing branch formatting drift)
Commands: GitHub Actions CI run `29300206467`; local reproduction with `bunx biome check --skip-parse-errors --max-diagnostics=50 .`

Observed:

- Linux and macOS CI failed at the shared `Lint` step before type checking or tests; the failure was platform-independent.
- The complete local reproduction found ten formatter errors in earlier branch files: five enhancement/frame-cache web files, three Electron preview-proxy files, and two generated database migration metadata files.
- None of the three new portrait transition audit files produced a diagnostic.

Modification decision: apply Biome formatting only to the ten reported files, review the resulting changes as mechanical formatting, then rerun the exact repository lint command. No filter, transition, or export behavior change is required.

### Run 06h - Unfiltered local repository lint retry

Date: 2026-07-14
Result: INCONCLUSIVE (local workspace contamination)
Command: `bunx biome check --skip-parse-errors --max-diagnostics=50 .`

Observed:

- The ten files reported by the clean GitHub Actions checkout had already been formatted.
- The local command still failed because it traversed ignored and generated directories that are absent from CI, including `dist/`, `output/`, generated website files, and local agent artifacts.
- Those diagnostics do not describe the pull-request checkout and are unrelated to the portrait filter and transition audit.

Modification decision: do not alter unrelated local artifacts. Reproduce the clean checkout's file set by running Biome against Git-tracked files only, then use that result to decide whether the pull request needs another formatting change.

### Run 06i - Explicit Git-tracked-file lint attempt

Date: 2026-07-14
Result: INCONCLUSIVE (not equivalent to repository lint)
Command: `git ls-files -z | xargs -0 -n 500 bunx biome check --skip-parse-errors --max-diagnostics=100`

Observed:

- Passing every tracked path explicitly caused Biome to inspect files that the root repository scan normally excludes.
- The explicit set included missing local symlink targets and archived website and agent files, producing diagnostics that were absent from the clean pull-request run.
- The wrapper also used zsh's read-only `status` name while capturing the exit code, so it could not report a trustworthy aggregate result.

Modification decision: do not modify files found only by the non-equivalent invocation. Create a detached clean worktree, apply the current patch, and run the exact `lint:clean` script from that worktree.

### Run 06j - Clean-worktree lint harness startup

Date: 2026-07-14
Result: NOT RUN (incorrect working directory)
Command: `bun run lint:clean` from the detached Git worktree root

Observed: the command exited with `Script not found "lint:clean"` because the Git repository root contains the application in its `qcut/` subdirectory. Biome did not start and no source file was checked.

Modification decision: recreate the clean worktree with the same patch and execute the repository script from its `qcut/` application directory.

### Run 06k - Clean-worktree repository lint

Date: 2026-07-14
Result: PASS
Command: `bun run lint:clean` from a detached clean worktree with the current patch applied

Observed:

- The exact CI script checked 3,756 files and exited successfully with no errors.
- Nine existing warnings and five informational parse-skip notices remained; neither category fails the repository lint command.
- The ten formatter errors reported by GitHub Actions were absent.

Modification decision: the scoped Biome formatting fully resolves the pull-request lint failure. Keep the existing non-blocking warnings out of this audit's production-change scope and verify the formatted modules with TypeScript and focused tests.

### Run 06l - Formatting and migration metadata integrity

Date: 2026-07-14
Result: PASS
Commands: `git diff --check`; canonical `jq -S` comparisons against `HEAD`; `jq empty`

Observed:

- The complete patch contained no whitespace errors.
- Both formatted migration metadata files parsed as valid JSON.
- Canonically sorted JSON from the working files exactly matched the corresponding `HEAD` content, proving that Biome changed presentation only.
- `git diff --ignore-all-space` was not used as the deciding signal because formatter line wrapping still appears to that command as a structural line diff.

Modification decision: keep the formatter output; neither migration metadata file contains a data change.

### Run 06m - Formatted module TypeScript verification

Date: 2026-07-14
Result: PASS
Commands: `cd apps/web && bunx tsc --noEmit --pretty false`; `bunx tsc --noEmit --pretty false -p electron/tsconfig.json`

Observed: both the Web and Electron TypeScript projects compiled without diagnostics after formatting.

Modification decision: no type or production-code correction is required.

### Run 06n - Formatted module focused regression

Date: 2026-07-14
Result: PASS (12/12 tests across 3 files)
Command: `bunx vitest run apps/web/src/hooks/preview/__tests__/use-video-enhancement-proxy.test.tsx apps/web/src/lib/preview/__tests__/shared-frame-cache.test.ts electron/__tests__/video-preview-proxy-real.test.ts`

Observed:

- All six video enhancement proxy hook tests passed.
- All five shared frame cache tests passed.
- The real FFmpeg video preview proxy test encoded and validated its playable cached proxy successfully.

Modification decision: the formatting-only patch preserves the tested preview behavior and is ready to commit.

## Planned Application Runs

| Run | Scope | Status |
| --- | --- | --- |
| 01 | Import all six fixtures and verify aspect ratio, duration, thumbnail, and playback | PASS after correcting two audit assumptions |
| 02 | Exercise every filter family on portrait and landscape people | PASS: 112 real UI applications across both orientations |
| 03 | Inspect high-risk filter presets across all lighting and skin-tone cases | PASS across all six fixtures |
| 04 | Exercise every transition family at portrait-to-landscape and landscape-to-portrait seams | PASS: 134 real UI applications across both directions |
| 05 | Inspect high-motion and edge-sensitive transitions, then export representative seams | PASS: 67-preset mapping, 21 native presentation cases, and 12 real portrait exports |
| 06+ | Fix and rerun any failed scope | PASS: audit defects corrected; 23/23 Vitest and 5/5 full Electron E2E regression |

## Final Decision

QCut's current production filter and transition implementations need no parameter or rendering change from this audit.

Completed evidence:

- Six licensed, approximately ten-second human portrait fixtures: three 9:16 and three 16:9, including dark, bright, occluded, saturated, and 59.94 fps sources.
- 112 successful real filter applications: every one of 56 presets on both native project orientations.
- 134 successful real transition applications: every one of 67 presets in both portrait-to-landscape and landscape-to-portrait directions.
- Complete 67-preset export mapping, 21 native FFmpeg presentation cases, and 12 representative real-media transition exports across both canvas orientations.
- Full visual inspection of source sheets, filter categories, transition categories, and native export midpoint frames.
- Final verification: Biome passed, web and Electron TypeScript passed directly, 23/23 transition/export Vitest tests passed, and 5/5 complete real-media Electron E2E tests passed.

The failed runs exposed six audit assumptions rather than production defects: thumbnail status representation, `trimEnd` semantics, Playwright closure serialization, unfiltered video rendering, transition position sampling, and native-test timeout budgeting. Each was documented at the time, corrected in the audit code, and followed by a complete passing rerun.

The downloaded media and generated screenshots/videos remain ignored local evidence. The committed fixture metadata, E2E coverage, native export audit, and this run log make the same audit reproducible by setting `QCUT_PORTRAIT_AUDIT_DIR` to a prepared fixture directory.
