# Jianying Cover vs QCut: UI Comparison and Implementation

Date: 2026-09-06. Branch: `codex/cover-design`. Existing PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

## Summary

Jianying treats a cover as a dedicated editing workspace, not simply an image picker. This iteration expands QCut's compact source-selection dialog into an editable template, text, canvas, frame-selection and save workflow. Findings come from actual interaction with native Jianying and QCut's browser UI, not solely from the supplied screenshot.

QCut uses five original text templates. No Jianying template images, fonts or proprietary packages were copied into the product. This implements the basic workflow and persistence, not full asset-library or visual parity.

## Native Jianying Observations

Application: `/Applications/VideoFusion-macOS.app`. Its version number was not independently checked during this run.

1. The timeline cover control opens a separate workspace with template/text tabs, a central canvas, a top text toolbar, undo/redo/crop controls, image import, a filmstrip, Cancel and Set as cover.
2. Categories include default, recommended, lifestyle, games, knowledge, fashion, film/TV and food. Cards use a two-column image grid; some require downloading.
3. Adding text exposes a selection box and rotation control. Text tools include content, font, color, shadow, stroke, background, bubbles, alignment/ordering and B/I/U.
4. Stroke has a popup with color, hexadecimal input and width, not only an on/off switch.
5. Crop mode displays a grid, temporarily hides text and disables template/text editing until completion.
6. Applying a travel template creates multiple editable text elements and preserves manually added text. Multiple selection prevents editing an individual element's content until it is selected alone.
7. The session ended with Cancel. The original project was restored without publishing a cover or exporting media.

The layer ownership in item 6 directly informs QCut's template switching: replace template-owned text, preserve manual layers.

## Comparison

| Workflow | Previous QCut | This iteration |
| --- | --- | --- |
| Entry | Preview toolbar; decorative timeline badge | Both controls open the same editor |
| Layout | Compact source/fit dialog | Library, text toolbar, canvas, sources and save footer |
| Templates | None | Five original editable presets plus original image; categories and real-background previews |
| Template switching | None | Replaces template-owned layers and preserves manual text |
| Text | None | Content, size, system font families, color, B/I/U, alignment, ordering and deletion |
| Styles | None | Stroke/shadow/background switches with fixed parameters |
| Geometry | Image contain/cover | Text drag, keyboard positioning, box size and rotation; background zoom/position/crop mode |
| Sources | Image/current playhead | Adds exact frame, frame stepping, slider and seven sampled thumbnails |
| History | None | Up to 60 undo/redo steps; one step per completed drag; cancelled gestures discarded |
| Reopen | Background only | Restores source, crop, template and editable text properties |
| Responsive layout | Compact modal | Desktop columns; narrow-screen library above canvas and wrapping tools |

Text resizing and rotation use toolbar controls. The selection box supports movement, without nonfunctional resize handles. Fonts are limited to sans-serif, serif and monospace; glyphs may differ across systems.

## Implementation

- `packages/editor-core/src/cover/`: model validation, template definitions and isolated history. One background plus up to 20 text layers; existing single-image designs remain readable.
- `apps/web/src/components/editor/cover/`: workspace, library, toolbar, gestures, sources and asynchronous state.
- `apps/web/src/lib/cover/`: reuse of timeline text rendering and shared painting for template thumbnails, interaction previews and final output.
- `apps/web/src/lib/export/export-still-frame.ts`: optional requested time, snapped to project FPS without moving the timeline playhead.
- `apps/web/src/components/ui/dialog.tsx`: opt-in fixed layout, preserving the default scroll wrapper for other dialogs.

Publishing requires a completed render for the current design. Source operations have a synchronous busy lock and stale-request/unmount guards. Loading does not populate undo history. Cancel leaves the published binding unchanged. Resource copying preserves text layers instead of treating them as image assets.

## Verification

Source: `/Volumes/MOVE SPEED/qcut/qcut`. APFS dependency/runtime mirror: `/Users/peter/.cache/qcut-cover-validation/qcut`. This accommodates the SSD's exFAT filesystem; it is not a second development branch.

1. Imported a generated H.264 calibration video through the real file picker: 1280x720, 24 FPS, four seconds. Added it to the timeline through UI in a 1920x1080, 30 FPS project.
2. Opened the editor, captured frame zero, applied the travel template and edited its Chinese title. Expanded the seven sampled thumbnails and selected frame 36, or 1.2 seconds.
3. Added manual Chinese text, enabled underline/background and moved it to normalized y=0.7. Separately verified that switching templates preserves manual text and undo restores the previous template edits.
4. Published, waited for the dialog to close, reloaded and reopened. The frame, template title, manual text, position and styles persisted. An earlier refresh that interrupted an unfinished save is not counted as success.
5. Used the timeline entry, set background zoom to 1.01 and x to 0.51, saved, waited, reloaded and confirmed both values survived.
6. Visually inspected 1440x900 and 390x844 layouts. The narrow-screen canvas was approximately 344x193.5, with no page-wide horizontal overflow or obstructing controls. Screenshots were viewed in-session, not written to the historical screenshot directory.
7. The loaded preview was 1920x1080. Before the final crop adjustment, a 64x36 offscreen sample contained 424 RGBA colors and had FNV-1a 32-bit fingerprint `1539991225`. This is a nonblank-image check, not an exported-file SHA-256 or Jianying parity measurement.

Automated checks: 97 tests across 14 files passed, covering template/model boundaries, long Chinese text fitting, crop geometry, resource copy, explicit frame capture, stale render rejection, concurrent clicks, unmount, StrictMode, pointer cancellation, shared dialogs and timeline entry. Web TypeScript and changed-file Biome checks passed.

A timeline import emitted jsdom's unimplemented Canvas `getContext()` warning without failing the tests. Real rendering was separately checked through browser pixels and visual inspection above.

Commands are in [README](./README.md). Development URL: `http://127.0.0.1:5188/`.

## Remaining Differences

- No bubbles, downloaded custom fonts, decorative-text packages, full style parameters, multiple selection or direct resize/rotation handles.
- Built-in text presets are not a Jianying template-package interpreter. Package import, parameter binding and a cloud catalog are not implemented.
- Background crop retains project aspect ratio; arbitrary crop presets and full crop rotation tools are absent.
- The filmstrip samples seven positions, not a continuous thumbnail cache. Complex timelines may be slow to sample.
- This run validates the browser Web path, not native Electron, complex-transition pixel parity, cross-machine migration or native project-package export.
- Storage remains project-isolated OPFS. Clearing site data removes covers; unreferenced cancelled/replaced sources remain until project deletion.
- Project copy/delete resource behavior has unit coverage, but those full UI lifecycles were not repeated in this run.

The private reference cache remains 78 image payloads and zero complete editable template packages. No Jianying assets were added or published in this iteration. See [README](./README.md) for historical cache details.
