# Cover Text Editing: Closing the Interaction Gap

Date: 2026-09-06. Branch: `codex/cover-design`. Existing PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

This supplements the [earlier UI comparison](./ui-comparison-2026-09-06.en.md). Historical screenshots and cache completeness are not evidence of current native rendering parity.

This is the historical first-phase record. The subsequent [native word-art and font integration](./native-word-art-2026-09-06.en.md) reuses the existing labs and native renderer. Test counts and static-approximation limitations below describe the first phase only.

## Changes

| Area | Before | Now |
| --- | --- | --- |
| Stroke | Toggle and fixed parameters | Color, width and opacity |
| Shadow | Toggle and fixed parameters | Color, opacity, blur and X/Y offsets |
| Background | Toggle and fixed dark fill | Color, opacity, radius and padding |
| Glow | Unavailable | Separate enable state, color, opacity and spread |
| Layout | Fixed spacing and line height | Letter spacing, line height and vertical alignment |
| Text presets | Not connected to covers | Existing 13 presets, actual Canvas thumbnails, search and application |
| Word-art lab | Template dependency mapping only | Existing catalog/categories and static approximation parameters |
| Narrow screens | Old horizontal text list displaced the style library | Shared vertical scroll area and viewport-constrained popovers |

Validated parameters persist in the `textStyle` of text entries in `CoverDesignV1.layers[]`. Cover output, preview and style cards reuse the timeline text renderer. Legacy designs without overrides retain their default appearance. Disabling an effect preserves its settings for re-enabling.

Applying a style preserves text, layer ID, font family, size, geometry and rotation. Preset font families are deliberately not imported here. Thumbnail text uses a default font, so it is not a pixel-identical preview of a user's current font. No private package paths or transient runtime references are persisted in the design.

## Evidence

- 191 tests across 22 files passed, covering model validation, style conversion, painting, controls and the library, plus existing persistence, copy, reopen, frame capture, shared dialog and cache dependency regressions.
- Web `tsc --noEmit`, changed-source Biome checks and `git diff --check` passed.
- Real browser workflow: selected the existing travel title, applied Yellow Pop, set stroke width `10`, stroke opacity `0.75`, letter spacing `6` and line height `1.8`. Undo restored line height `1.2`; redo restored the edit before publishing.
- After publishing completed, a full page reload and cover reopen restored all four parameters and retained existing template and manually added text.
- Checked 1440x900, default 790x842 and 390x844 layouts. Narrow-screen search exposed both neon styles; tools wrapped and popovers remained in the viewport. The default viewport was restored afterward.

A separate read-only conversion audit used the actual QCut private `JianyingText/Cache/artistEffect` cache: 2,401 candidate packages produced 2,394 valid catalog records. All 1,143 records with approximation data converted and validated successfully; 1,251 records without approximation were not statically applicable.

These are raw local catalog counts, not deduplicated UI-visible totals or pixel-parity results. Browser mode has no Electron IPC and reports that the lab requires the desktop app. Mocked component tests are not presented as native desktop application evidence. Native cover templates and static text styles remain distinct features.

## Local Artifacts

Directory: `/Users/peter/Desktop/qcut-cover-comparison-2026-09-06/`.

- `jianying-native.png`: unchanged earlier native Jianying screenshot.
- `qcut-recommended.jpg`, `qcut-word-art-recovery.jpg`: unchanged earlier QCut catalog/dependency screenshots.
- `qcut-text-stroke-after.jpg`: editable parameters, restored values and preset library.
- `qcut-text-desktop-after.jpg`: 1440x900 text workspace.
- `qcut-text-mobile-after.jpg`: 390x844 style search and canvas.

Screenshots preserve actual UI content and remain local, outside Git. Different projects and media were used, so this is a structural/interaction comparison, not matched-template rendering parity.

Source: `/Volumes/MOVE SPEED/qcut/qcut`. APFS runtime mirror: `/Users/peter/.cache/qcut-cover-validation/qcut`. Dev URL: `http://127.0.0.1:5188/`. Changed files were explicitly synchronized before validation.

## Remaining Gaps

- The first phase did not connect InfoSticker, textured word art or real fonts. These already had labs and a runtime; a replacement engine was not needed. See the subsequent integration record above. Complete native cover templates remain non-applicable.
- Approximation imports supported static paint parameters only, not animation, textures, images or native fonts. Non-flat-compatible entries are labeled Approximate.
- The three system font families remain; no new Jianying font download, bubble asset library, multi-selection or on-canvas resize/rotation handles.
- Catalog coverage, continuous filmstrips, complex transition frame parity, native filesystem persistence and cross-machine packaging were outside this change.
