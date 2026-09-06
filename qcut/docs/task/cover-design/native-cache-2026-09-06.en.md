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
- Initial batch: 8 templates, 69 unique files, 33,938,996 bytes. After recovery: **8 templates, 119 referenced unique files, 46,579,803 bytes**, excluding manifests and unreferenced objects.
- **3 templates have files for all explicit dependencies; 5 still lack one old filter each.** This includes explicit catalog-version mappings and builtin bindings, not byte-identical historical packages. All 8 still require native rendering integration.

QCut-owned storage means independent local copies, not ownership of the underlying intellectual property or redistribution rights. Private asset bytes stay outside Git and release bundles. No login tokens, request headers, encrypted draft bodies, or template-author background media are archived.

The importer verifies hashes and byte sizes, rejects path escapes and symlinks, merges sequential batches, and atomically publishes the catalog only after validation. A failed import may leave unreferenced content objects but does not publish a partial catalog. There is no cross-process import lock; run one writer at a time.

The UI reads only the independent library through main-frame-only Electron IPC or a localhost-only Vite development route. Cross-site requests and non-GET methods are rejected. Production browser builds expose no local filesystem route. Card selection inspects the package; it does not substitute the preview or an original QCut preset for template application.

## Lab-backed Recovery

Recovery reuses the existing text lab catalog, local-package index and validated installer, plus the filter lab downloader. It prefers exact hashes, then explicit resource-ID or `third_resource_id_str` alias matches, never title matching. Files are copied into the cover library's own SHA-256 objects. The original definition is preserved; dependency `resolution` records the source, method, resource IDs and resolved package hash without retaining signed URLs.

- Zhongxiu font: original ID `6917512631515353607` and hash `9561161c74ae03658e101577ec5cfae6` recovered, 2 files.
- S23 word art: old ID `6724177156223537672` maps to catalog ID `6896137661153578248`, hash `77c43f3eca3e0979c3c5972ec6fe4822`, 22 files. This is **InfoSticker**, not TextStyle; the existing word-art installer supports this distinction. An opaque archive without extracted configuration is not accepted as a recovered dependency.
- Food filter: old ID `6830373641172029966` maps to catalog ID `7127678346472819982`, hash `46a045d4b8ed3d6058a4d2141efba43a`; 15 files copied from the managed filter lab.
- Knowledge system font: explicit system-font semantics with no resource ID bind to the application's `Font/SystemFont/zh-hans.ttf`. Actual font bytes are copied; historical hash equality is not claimed.
- S23 brightness: the recognized native builtin path and material type bind to `DefaultAdjustBundle/brightness_v1`, honoring the material's `v1`, 13 files. Unknown versions are rejected.

The UI labels font, word-art and filter lab sources and catalog version changes. These mappings establish resource availability, not native rendered parity.

## Gaps

Five referenced legacy filters remain unavailable: A-log (`6867493201318515207`), afternoon (`6709359425695519240`), town (`6877828523751379470`), natural (`6864084600281371150`), and cyberpunk (`6746808141544952323`). Both current account catalogs, QCut's text catalog cache, the 888 filter candidates, and 36 historical filter-runtime resource databases yielded no usable mappings or URLs for these IDs. Exact old hashes were also absent from the inspected local package indexes. This does not prove permanent upstream removal. They remain `catalog-missing`, pending authentic packages or verified ID mappings; no title-based replacement or identity LUT is substituted.

This is an observed downloaded subset, not the full online library. Native rendering, editable application and offline reopen verification remain unfinished. No login, payment or download restrictions are bypassed.

## Import and Restore

Run in an app checkout with Bun/dependencies. On this Mac the APFS runtime mirror is `/Users/peter/.cache/qcut-cover-validation/qcut`; the SSD remains the source checkout.

```sh
bun build scripts/cache-jianying-cover.ts --target=node --outfile /tmp/qcut-cache-cover.mjs
node /tmp/qcut-cache-cover.mjs --recover \
  --observations "$HOME/Library/Application Support/QCut/PrivateAssets/JianyingCover/observations.json" \
  --application-resources /Applications/VideoFusion-macOS.app/Contents/Resources \
  --backup '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'

bun scripts/cache-jianying-cover.ts --verify \
  --destination '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'
```

Recovery requires Node 22.13+ because the shared catalog reader uses `node:sqlite`. Without `--recover`, import retains its original exact-package, local-copy-only behavior and does not download. Verification reads neither Jianying nor the other labs. Use one writer at a time.

Each observation has `packageHash`, `previewHash`, `title`, `categories`, and `evidence: "native-ui-and-template-content"`. A subsequent batch merges existing entries. Restore by copying the complete backup directory and verifying it, or point the environment override at that directory and restart the app/server. Reading and restoring do not require the original observations file or Jianying source cache.

## Verification

All 139 tests across 18 files passed after recovery, together with Web/Electron TypeScript and scoped Biome checks. Added coverage includes lab reuse, version precedence and provenance, InfoSticker recovery, opaque-archive rejection, builtin versions, trusted filter URLs, no default downloads and independent copies.

Tests cover independent reads after fixture-source deletion, backup restore, idempotence, incremental batches, corruption, invalid paths, symlinks, incomplete resources, author-media exclusion, categories, refresh errors, stale async responses, and inspect-not-apply behavior. IPC tests reject other windows, subframes, detached frames, and destroyed windows.

The real SSD backup passed verification of all 119 files under a macOS sandbox denying reads of Jianying user data, the Jianying application, QCut's text cache and its managed filter packages. Actual Jianying data was not moved or deleted. The development endpoint returned eight entries; an external Origin returned 403 and POST returned 405.

After recovery, the browser displayed cached resources for Knowledge, Fashion and Food. S23 details showed 5/6 dependencies with the word-art lab/version mapping and the remaining Natural filter catalog miss, without altering the original cover design.

The browser decoded eight actual 250x141 previews, filtered Games to S23, and displayed the Style template's four text layers and three cached dependencies without changing the existing design. Desktop 1440x900 and narrow 390x844 layouts were inspected. This is not native Electron cache-UI E2E or rendered Jianying-template parity.

Add `electron/__tests__/jianying-cover-private-cache.test.ts`, `electron/__tests__/jianying-cover-handlers.test.ts` and `electron/__tests__/jianying-cover-dependency-recovery.test.ts` to the cover regression command in README. Exclude `._*` and `.DS_Store` when syncing from exFAT; AppleDouble metadata must not enter the APFS source/test tree.
