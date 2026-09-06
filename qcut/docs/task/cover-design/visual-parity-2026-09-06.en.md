# Cover Visual Parity: Native Colors, Portrait Layouts and Real Previews

Date: 2026-09-06. Branch: `codex/cover-design`. Existing PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

## Implemented

- Keep the private catalog in two columns on desktop and narrow desktop windows, using actual QCut-owned cached preview images. Compact headings and text input; scroll the template details independently.
- A ready card applies its text layout with one click when the required runtime is available. Unsupported cards show diagnostics instead; busy cards cannot start another application.
- Open the frame strip automatically, sampling up to ten unique project frame numbers between the first and last frame. Reserve loading slots and wait for media recovery before reading thumbnails.
- Fix an observed reload race: opening the cover before timeline recovery previously froze its duration at zero. Duration now follows the timeline, without overriding a user's explicit collapse choice.
- Preserve normalized native anchors on portrait canvases: `x=(1+transform.x)/2`, `y=(1-transform.y)/2`. Scale text using the canvas short edge instead of letterboxing the anchors with the original landscape canvas.
- Preserve `use_effect_default_color` through native definition parsing, persisted cover layers and the existing Word Art Lab runtime. Only an explicit `false` sends the layer fill color; absent values retain effect defaults.
- Enable host-text fill changes for TextStyle/InfoSticker. Reject this override for ScriptInfoSticker or externally generated segment payloads. Clear the mode when removing native word art or choosing another preset.

## Root Cause and Runtime Proof

The real S23 definition requests blue `#047bff` for its main title and yellow `#ffbf17` for its subtitle, with `use_effect_default_color:false`. The parser previously dropped the flag, while the native bridge always enabled default effect colors.

The optional `textColor` request now participates in the render cache key. `JY_TEXT_COLOR` is explicitly set or cleared, and the native bridge uses the verified local `TextStickerFilter::set_text_color(const std::string&)` ABI. Only six-digit hexadecimal colors are accepted. Default requests retain their existing behavior.

Real native renders increased matching blue pixels from 0 to 9,547, and matching yellow pixels from 0 to 43,935. Counts require alpha >= 240 and a per-channel RGB tolerance of 8. Repeated custom-color requests hit the corresponding cache; default and custom paths differ. This proves a rendered color change, not whole-template parity.

Fonts, effect packages and runtime binaries remain private local dependencies. Catalog previews are for browsing; the final cover is rendered from editable layers rather than using the catalog image as the user's output.

## Same-Source UI Evidence

The native app was `/Applications/VideoFusion-macOS.app`. QCut ran with an isolated Electron profile and test project `6a06e56b-8d45-4561-9b2a-33b8bd7abeee`, without modifying the user's original QCut project. Native cover editing was cancelled without publishing to the original project.

Both applications imported the same `source-frame.jpg`, copied from an existing test draft cover. The image is 1920x1080 with side bars. Jianying used a centered 9:16 crop; QCut used a 1080x1920 canvas with fill adaptation. Small crop-edge differences remain, so these are not pixel-identical comparison inputs after cropping.

| Check | Result |
| --- | --- |
| S23 | Native colors and portrait placement checked; save, page reload and reopen produced identical PNG bytes |
| Weekend | One-click cached layout application and native text render checked; save and reopen produced identical PNG bytes |
| Responsive | 1136x676, 790x760, 390x844 and 1440x900: two catalog columns, no cover-workspace horizontal overflow, zero broken images |

S23 output: 1080x1920, 2,088,036 bytes, SHA-256 `601afe2f05029e4a3c89fca30fe4ce3e82ebc72bd020e67b8382759da090c250` before and after reload.

Weekend output: 1080x1920, 1,968,085 bytes, SHA-256 `f106e682180b32bacf0db930ede144e3c243365a327d0535b6d6e28fdd3512d1` before and after reopening.

A real three-second `00-real-person-clean-3s.mp4` was imported through the media UI and added to the isolated timeline. All ten 144x256 thumbnails have distinct SHA-256 hashes. Selecting frame 40 (1.33 seconds), saving, reloading and reopening produced identical PNG hash `ed8928b92c371354f7732f5d44028feaffa000b881323fb0640a9efd64c70bf4`. The ten-frame strip recovered automatically after reload. At 390x844 there is no workspace horizontal overflow, although the expanded strip reduces the portrait canvas display area. See `filmstrip-evidence.json` and the `qcut-filmstrip-1136.png` / `qcut-filmstrip-390.png` screenshots.

## Evidence Location

Local directory: `$EVIDENCE_ROOT/qcut-cover-comparison-2026-09-06/parity-pass-2/`.

- `jianying-s23-same-source.jpg`, `jianying-weekend-same-source.jpg`: native screenshots.
- `qcut-s23-1136.png`, `qcut-weekend-1136.png`: QCut comparison screenshots; additional widths are available.
- `qcut-s23-position-before.png`: earlier portrait-position evidence. Its background adaptation also differs, so it is not a single-variable pixel benchmark.
- `qcut-*-render.png`, `qcut-*-reopened-render.png`: actual rendered outputs.
- `color-evidence.json`, `ui-evidence.json`: color, hash and layout measurements.
- `color-audit.ts`, `ui-audit.cjs`, `filmstrip-audit.cjs`: local reproduction scripts with machine-specific paths.

Validation uses the APFS dependency mirror `$HOME/.cache/qcut-cover-validation/qcut`, byte-synchronized with changed SSD source files. The native bridge compiled with `-Wall -Wextra -Werror` and was executed against real packages.

Final validation: 296 tests across 32 files passed, covering cover UI/model/rendering, caches and the native bridge. Web TypeScript, the Electron build, changed-file Biome checks and `git diff --check` passed. Mocked unit fixtures do not replace the real native-output evidence above.

## Remaining Gaps

1. No catalog growth is claimed: the UI still contains eight cached samples, not the full online catalog. Discovery, caching, applicability and verification are separate stages.
2. Missing background filters and full `cover_draft` background composition are not resolved by this text-layout/color work.
3. Visible stroke, glyph and spacing differences remain, particularly the red S23 lettering. No pixel-parity claim is made.
4. The observed source definitions use a 1280x720 canvas. Short-edge scaling is not proof for every template orientation or script; the Iceland vertical-text restriction remains.
5. The frame strip is sampled, not a full timeline thumbnail cache. Complex timelines may take longer. Portable cover storage, cross-machine font/runtime migration and complete project export remain outside this acceptance scope.
