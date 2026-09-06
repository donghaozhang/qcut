# Jianying Covers: Native Cache and Category Audit

Date: 2026-09-06. Branch: `codex/cover-design`. This is a local native-UI and filesystem observation, not an export of the entire online catalog.

## Correction

The previous implementation provided five original QCut text presets with QCut categories. Its reference archive contained four calibration JPEGs and 74 CEF image payloads, not editable template packages. It did not meet the requested Jianying category/cache parity.

The earlier research also generalized Web/CEF evidence to all cover editors. The native Qt cover editor demonstrably uses `Cache/template/<hash>/template.json`, containing `cover.cover_draft`. Keep the native and Web paths separate; the old claim that this directory only contains unrelated video templates is incorrect.

## Native Evidence

Used `/Applications/VideoFusion-macOS.app`, project `8月30日 (3)`. Browsed categories and applied sample templates in Jianying to inspect layout and download files. Finished with Cancel, without setting a project cover or exporting.

Relative to `~/Movies/JianyingPro/User Data/Cache`:

- `template/<32-character hash>/template.json`: native editable definition.
- `image/<hash>`: flattened card preview, 250x141 WebP for this batch.
- `effect/` and `artistEffect/`: separately downloaded font/effect packages.

The food template ZIP contained only a 25,304-byte definition. Downloading that ZIP does not establish dependency completeness. Author photo/video paths represent replaceable background slots and are excluded from asset collection.

Observed text materials are referenced by tracks labeled `sticker`; transforms are center-relative and normalized, and `render_index` controls ordering. Native font size is not directly equivalent to browser pixels. A zero-sized cover subcanvas may require project/source adaptation. No approximate conversion has been presented as native rendering.

## Categories and Stored Batch

The private library displays the native order: **Default, Recommended, Life, Games, Knowledge, Style, Film, Food**, with exact Chinese labels. Original QCut presets are separated into their own source. Default offers None and a cached overview; native recommendation section grouping is not fully reproduced. Templates can belong to multiple observed categories.

| Template | Observed categories |
| --- | --- |
| 周末的仪式感 | Recommended, Life |
| Jessica's Travel Vlog | Recommended, Life |
| Iceland Vlog 冰岛旅行 | Recommended, Life |
| 新赛季必备攻略 S23 | Games |
| Day 1 七天吉他速成教学 | Knowledge |
| 爱用物 购物车 | Style |
| HERO | Film |
| Tacos Cheese Omelette 鸡蛋芝士墨西哥饼 | Food |

Exact package hashes are documented in the [Chinese audit](./native-cache-2026-09-06.zh-CN.md). Local `observations.json` records package/preview/category mappings checked against the native UI and definition. Names and arbitrary CEF images are not used to guess mappings.

## Independent QCut Storage

- Primary: `~/Library/Application Support/QCut/PrivateAssets/JianyingCover`.
- Backup: `/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover`.
- Override: `QCUT_JIANYING_COVER_CACHE_ROOT`, read by the Electron/Vite process.
- Structure: `catalog.json` and content-addressed `objects/<sha256>`.
- Batch: **8 templates, 69 unique files, 33,938,996 bytes**, excluding manifests.
- **1 template has all explicit dependencies; 7 retain unresolved dependencies. All 8 require native rendering integration.**

QCut-owned storage means independent local copies, not ownership of the underlying intellectual property or redistribution rights. Private asset bytes stay outside Git and release bundles. No login tokens, request headers, encrypted draft bodies, or template-author background media are archived.

The importer verifies hashes and byte sizes, rejects path escapes and symlinks, merges sequential batches, and atomically publishes the catalog only after validation. A failed import may leave unreferenced content objects but does not publish a partial catalog. There is no cross-process import lock; run one writer at a time.

The UI reads only the independent library through main-frame-only Electron IPC or a localhost-only Vite development route. Cross-site requests and non-GET methods are rejected. Production browser builds expose no local filesystem route. Card selection inspects the package; it does not substitute the preview or an original QCut preset for template application.

## Gaps

There are nine unresolved logical references and one obsolete absolute iOS path. These include filters, one decorative-text package, fonts, and a brightness resource. The Knowledge sample declares a system font with an unresolved legacy path; it remains conservatively incomplete. A modern filter package can be associated with the food sample's old resource ID, but it has a different hash and was not silently treated as the original bytes.

This is an observed downloaded subset, not the full online library. Further batches require normal downloads in Jianying and verified mappings. Legacy dependency resolution, native rendering, editable application, and offline reopen verification remain unfinished. No login, payment, or download restrictions are bypassed.

## Import and Restore

Run in an app checkout with Bun/dependencies. On this Mac the APFS runtime mirror is `/Users/peter/.cache/qcut-cover-validation/qcut`; the SSD remains the source checkout.

```sh
bun scripts/cache-jianying-cover.ts \
  --observations "$HOME/Library/Application Support/QCut/PrivateAssets/JianyingCover/observations.json" \
  --backup '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'

bun scripts/cache-jianying-cover.ts --verify \
  --destination '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'
```

Each observation has `packageHash`, `previewHash`, `title`, `categories`, and `evidence: "native-ui-and-template-content"`. A subsequent batch merges existing entries. Restore by copying the complete backup directory and verifying it, or point the environment override at that directory and restart the app/server. Reading and restoring do not require the original observations file or Jianying source cache.

## Verification

All 121 tests across 17 files passed, together with Web TypeScript and scoped Biome checks.

Tests cover independent reads after fixture-source deletion, backup restore, idempotence, incremental batches, corruption, invalid paths, symlinks, incomplete resources, author-media exclusion, categories, refresh errors, stale async responses, and inspect-not-apply behavior. IPC tests reject other windows, subframes, detached frames, and destroyed windows.

The real SSD backup passed verification of all 69 files under a macOS sandbox denying all reads of `~/Movies/JianyingPro`. Actual Jianying data was not moved or deleted. The development endpoint returned eight entries; an external Origin returned 403 and POST returned 405.

The browser decoded eight actual 250x141 previews, filtered Games to S23, and displayed the Style template's four text layers and three cached dependencies without changing the existing design. Desktop 1440x900 and narrow 390x844 layouts were inspected. This is not native Electron cache-UI E2E or rendered Jianying-template parity.

Add `electron/__tests__/jianying-cover-private-cache.test.ts` and `electron/__tests__/jianying-cover-handlers.test.ts` to the cover regression command in README. Exclude `._*` and `.DS_Store` when syncing from exFAT; AppleDouble metadata must not enter the APFS source/test tree.
