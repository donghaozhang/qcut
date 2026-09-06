# Cached Jianying Cover Text Layouts and Dependency Diagnostics

Date: 2026-09-06. Branch: `codex/cover-design`. PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

## Delivered Scope

Real cached template definitions can now produce editable QCut cover text layers through **Apply text layout**. Fonts and native word art reuse the existing labs and QCut-owned private caches. S23 and HERO rendered through the native InfoSticker runtime; changing HERO to QCUT changed the rendered glyphs, rather than displaying a template preview image.

This is **not full native cover composition or pixel parity**. The import preserves the user's background and crop, and does not import template video, audio, backgrounds, or background filters. Seven of eight cached samples pass layout/resource preparation. Three have actual UI render, save, and reopen evidence; preparation alone does not prove rendering.

## Why Dependencies Appeared Incomplete

- Five unresolved references belong to background filters. Following `material_id` and `extra_material_refs` now distinguishes background-only dependencies from text dependencies. The UI can show both missing background filters and ready text resources, with names and resource IDs. Unknown/shared references stay unresolved.
- The implicit `text/` system font must resolve to the verified owned `SystemFont/zh-hans.ttf`, not an arbitrary OS fallback.
- The native runtime's font catalog could predate newly restored cover fonts. It now reads owned font bytes by SHA-256 before falling back to catalog lookup.
- Browser development lacks Electron font IPC. A development-only, same-origin localhost route provides verified font bytes and glyph coverage. Production Web has no such route; native InfoSticker still requires the desktop runtime.
- Day 1's named style is descriptive metadata, with explicit color and outline values already present. It is no longer misclassified as an unsupported external style resource.

## Implementation

The parser validates the owned `template.json` and maps horizontal text ordering, position, uniform scale, rotation, color, opacity, spacing, outline, and shadow. Layouts fit the target canvas proportionally, preserve manual text, and replace only previous template text, up to 20 layers.

Fonts are retained by the existing private font cache. Word-art packages are restored into `JianyingText/Cache/artistEffect` by verified resource ID and package hash. Restoration validates safe relative paths, duplicate paths, package kind, byte lengths, and checksums. Existing packages must match the exact expected inventory; unexpected files, symlinks, and corruption fail. New packages are written to a temporary directory before publication. Historical aliases require catalog evidence, not matching titles.

Font loading, glyph coverage, and actual render preflight complete before the design changes. Edits, project switches, disabled editing, and unmounting invalidate pending imports. Failures preserve the design and allow retry. Unsupported vertical text, flips, nonuniform scale, keyframes, and multiple text effects are explicitly rejected.

The shared font cache also handles a Windows concurrent-publication race: after a failed rename, another writer's result is accepted only if its bytes already match the requested hash. A corrupt destination still fails.

## Real Sample Matrix

Counts are from preparation with actual cached definitions and resources, not generated fixtures.

| Template | Texts | Fonts | Native packages | Preparation | UI evidence this run |
| --- | ---: | ---: | ---: | --- | --- |
| Weekend ritual | 6 | 4 | 0 | Pass | Browser rendering, save, reopen; desktop and narrow viewport |
| Jessica's Travel Vlog | 10 | 4 | 0 | Pass | Not individually rendered in UI |
| Iceland Vlog | - | - | - | Vertical text rejected | Correctly distinguished from missing fonts |
| S23 | 3 | 2 | 2 | Pass | Electron rendering, save, reopen after reload |
| Day 1 guitar lesson | 3 | 2 | 0 | Pass | Not individually rendered in UI |
| Shopping cart | 4 | 3 | 0 | Pass | Not individually rendered in UI |
| HERO | 3 | 2 | 2 | Pass | Electron rendering; edited to QCUT, saved and reopened |
| Tacos Cheese Omelette | 4 | 4 | 0 | Pass | Not individually rendered in UI |

## Remaining Background Filters

These exact historical packages remain unavailable in the inspected accessible caches. No guessed LUT or same-name replacement was used. This does not establish that the resources are permanently unavailable.

| Template | Filter | Resource ID | Historical package hash |
| --- | --- | --- | --- |
| Weekend | A-log | 6867493201318515207 | 306ef80eeb16aaad4b9a7ccfde1dcdc3 |
| Jessica | Afternoon | 6709359425695519240 | c2636a1fe82498d503e1d9f28343851f |
| Iceland | Small town | 6877828523751379470 | 77a842c891a712e7569d6799d631bf46 |
| S23 | Natural | 6864084600281371150 | 49825cb1ed50117a7fe586ebaedcd6e3 |
| HERO | Cyberpunk | 6746808141544952323 | 8e723bd567bbe6feb195e90843479b73 |

The Chinese companion includes the original names. Recovery needs exact identity or verified version mapping, followed by background-filter integration.

## Cache and Evidence

Both caches were reverified: eight templates, 119 unique objects, 46,579,803 bytes. SHA-256 of the parsed catalog serialized as JSON matches: `d51da387b21b7e1ae2278c26da11a3e77bcac599bafbc2d813fe40c6ff7af318`.

- Owned cache: `/Users/peter/Library/Application Support/QCut/PrivateAssets/JianyingCover`
- Backup: `/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover`
- Screenshots: `/Users/peter/Desktop/qcut-cover-comparison-2026-09-06/`

Evidence files: `qcut-cover-layout-weekend-reopened.png`, `qcut-cover-layout-mobile.png`, `qcut-cover-layout-s23.png`, `qcut-cover-layout-s23-reopened.png`, `qcut-cover-layout-hero.png`, `qcut-cover-layout-hero-edited.png`, and `qcut-cover-layout-hero-edited-reopened.png`. The neutral background isolates text rendering; this is not a same-background pixel comparison with Jianying.

Browser test project: `ed8c9463-739a-4136-b4b5-c2d7769493c7`. Electron used the isolated `/Users/peter/.cache/qcut-cover-native-audit-profile` and project `6a06e56b-8d45-4561-9b2a-33b8bd7abeee`. The user's original browser project `77e01234-cb19-4a84-b4d3-2d7396382b13` was not edited.

The saved QCUT title project reference records a 1920x1080 PNG, 166,701 bytes, SHA-256 `26f3f0e82ca8cffef101be7b5b5b0d1383ceda2c4b9ab10b19b46ed49c3038bb`, plus a 640x360 WebP thumbnail of 8,626 bytes. The reopened UI visibly retains QCUT's native effect and both other text layers. This hash comes from the saved project reference; no claim is made that a fresh post-reopen export was hash-compared this run.

## Validation

Source: `/Volumes/MOVE SPEED/qcut/qcut`. Dependencies/tests/build: synchronized APFS mirror `/Users/peter/.cache/qcut-cover-validation/qcut`. No proprietary font, word-art, preview, or generated build files were added to Git.

```sh
bun x vitest run apps/web/src/lib/cover apps/web/src/components/editor/cover apps/web/src/lib/fonts electron/__tests__/jianying-cover electron/__tests__/jianying-font-private-cache.test.ts electron/__tests__/jianying-text-font-resolver.test.ts packages/editor-core/src/cover electron/__tests__/jianying-text-runtime electron/__tests__/jianying-text-render apps/web/src/lib/preview/__tests__/jianying-text-render-entry.test.ts
bun x tsc --noEmit -p apps/web/tsconfig.json
bun run build:electron
```

- 281 tests passed, one environment-gated native version-parity E2E skipped; 32 files passed, one skipped.
- Web TypeScript, full Electron build, and Biome checks on all 33 changed code files passed.
- Security tests cover nonlocal Host, cross-origin/cross-site requests, methods, malformed/oversized font requests, and generic errors without host-path disclosure. Asset tests cover corruption, traversal, duplicate paths, unexpected package files, symlinks, and missing implicit fonts.
- At 390x844, the dialog fits the viewport without horizontal overflow. Apply text layout has equal client/scroll width of 293 pixels; the screenshot was visually inspected.
- Before this push, the previous PR HEAD `b957e1d8` passed macOS/Linux CI but failed Windows. The related private-font rename EPERM was addressed with regression tests. That run also reported Remotion platform-initialization and person-cutout test-path failures outside this change. Local success is not a claim that the new Windows CI is green.

## Remaining Gaps

S23 renders native package default colors that differ from the template preview; template-specific color overrides still need integration. Vertical text, template background filters, and complete composition remain unsupported. Spacing, shadows, italics, and bounds are mapped parameters, not universal pixel equivalence. Next acceptance work is same-background/font/text export comparison and UI verification of the other four prepared samples.
