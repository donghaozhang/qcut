# Covers Reuse the Native Word-Art and Font Labs

Date: 2026-09-06. Branch: `codex/cover-design`. PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

## Correction and Scope

QCut already has word-art and font labs plus a native Jianying text runtime. The previous cover phase only consumed approximation parameters. The missing work was cover integration, persistence and rendering, not a new effects engine.

| Capability | Current change |
| --- | --- |
| Native TextStyle | Apply a lab card through the actual runtime, retaining editable text |
| Textured InfoSticker | Reuse native rendering instead of reducing textures to static paint |
| ScriptInfoSticker text templates | Preserve multiple parts, vertical layout and timing; select a frame |
| Local Jianying fonts | Reuse the font lab, glyph checks, real font loading and content identity |
| QCut-owned font copies | Retain original bytes on read and support private-only discovery |
| Complete `cover.cover_draft` templates | **Not directly applicable yet**; these are not ScriptInfoSticker text templates |

## Data and Rendering

1. Cover cards reuse the lab catalog, categories, cached thumbnails and `buildTextStyleLabUpdates`. Runtime-only entries are no longer excluded for lacking approximation data.
2. Text entries in `CoverDesignV1.layers[]` persist `jianyingTextStyle`, `nativeFrameTime` and optional `fontAsset`. References contain resource identity, package hash/type and text/time mappings, not absolute package paths or temporary PNG paths.
3. A shared pure normalizer validates native references. Cover validation additionally checks font SHA-256 identity, CSS family and frame time. Older cover designs remain readable.
4. Covers reuse `createJianyingTextRenderEntry` and Electron `jianyingTextRuntime.render`, compositing the native frame at the returned coordinates. Layer ordering is preserved; rotation and alpha are not applied twice.
5. Preview, saved PNG and thumbnail share the rendering path. Rapid edits cancel stale work. Missing glyphs/packages, runtime diagnostics and invalid outputs fail explicitly rather than silently saving an approximation.

Applying word art retains text, layer ID, font, size and geometry. Native packages own color, stroke, B/I/U and alignment, so unsupported flat-text controls are disabled. Text, size, real fonts, bounds, rotation and frame time remain editable; removing native word art restores flat text.

The existing font picker is shared. Changing text/selection or unmounting invalidates pending glyph checks, preventing late font application to another layer. Escape closes the font popup without closing the cover editor.

## Font Retention and Backup

Persistent QCut directory: `~/Library/Application Support/QCut/PrivateAssets/JianyingFonts/`.

Backup: `$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingFonts/`.

- Files are named by original SHA-256. Original bytes are verified and retained before browser-compatibility rewrites, preserving content identity.
- Each font is limited to 128 MiB; writes use temporary files and atomic replacement. Verified QCut copies take priority over changed original caches.
- Discovery includes QCut fonts, QCut text packages and the original Jianying roots, deduplicated by content. The picker includes a QCut-owned source filter.
- This machine retained **147 unique fonts, 467,685,232 bytes (about 446 MiB)** in bounded batches. All 147 SSD backup fonts match the originals by SHA-256. ExFAT `._` metadata sidecars are not counted as fonts.
- Scanning only the QCut font directory found 147 entries and zero invalid files; the selected font remained readable. User-owned Jianying caches were not renamed or removed to simulate offline behavior.

Fonts and native packages remain local private assets, outside Git. Possession of a cache does not grant redistribution rights or prove visual parity for every entry. Cross-machine packaging and licensing remain separate concerns.

## Verification

Changed source was individually synchronized from the SSD checkout to the APFS validation mirror at `$HOME/.cache/qcut-cover-validation/qcut`.

- **322 tests across 43 files passed**; one existing environment-gated test file containing one test was skipped.
- Coverage includes all three reference kinds, font identity/persistence, renderer errors/cancellation/output limits, saved copies, font-picker races and shared lab regressions.
- Web TypeScript and the complete `build:electron` passed. The shared reference validator is included in Electron's CJS build.

Real desktop verification used Electron, production IPC handlers and private cached assets, without injected mocks. A separate project, `6a06e56b-8d45-4561-9b2a-33b8bd7abeee`, kept the user's original project untouched. The lab showed 2,210 applicable styles; that is a catalog count, not an individual visual test count.

| Sample | Observed result |
| --- | --- |
| TextStyle `7332292224668994867` | Native orange/gold outlined text on the cover |
| InfoSticker `7127668616656506149` | Textured Chinese text; editing content changed output pixels |
| InfoSticker with TsangerFWJT-W05 | Actual glyph changes; save, full reload and reopen retained font identity and PNG hash |
| ScriptInfoSticker `7205562420020989240` | Vertical layout and additional decorative parts at 2.1 seconds; reopen retained time and pixels |
| 1440x900 and 390x844 | Nonblank rendering, wrapped tools and no horizontal cover-workspace overflow |

InfoSticker after selecting the font and after reopen: `2fc23a7166253d3ce09157b03c8a2b820ec584865c8f9e3ac192611b85404f42`.

ScriptInfoSticker at 2.1 seconds and after reopen: `ce7084f70972f81c3053448156f9211d05910c8780181087c64fa38dccc44db2`.

## Screenshots and Remaining Gaps

Private evidence directory: `$EVIDENCE_ROOT/qcut-cover-comparison-2026-09-06/`.

- `qcut-cover-native-infosticker.png`: actual textured word-art application.
- `qcut-cover-native-font-picker.png`: shared font lab and actual selected font.
- `qcut-cover-native-script-frame.png`: native text-template frame at 2.1 seconds.
- `qcut-cover-native-textstyle.png`, `qcut-cover-native-mobile.png`: desktop and narrow-screen rendering.
- `native-cover-evidence.json`: sample identities, pixel counts, hashes and limitations.

Complete cover-draft import and its background/sticker/dependency composition are still missing. A native text-template frame is not a complete cover template. Some inherited lab thumbnails are historical generated previews: the tested ScriptInfoSticker thumbnail does not match its native multipart layout and needs regeneration. No matched-material, matched-template Jianying pixel comparison was performed, so this does not establish full visual parity.
