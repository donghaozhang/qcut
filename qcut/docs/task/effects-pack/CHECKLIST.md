# QCut effects catalog — exact checklist for adding one new visual effect

All paths relative to worktree root `/Users/peter/Desktop/code/qcut/qcut/.claude/worktrees/effectspack/qcut/`. Core dir: `apps/web/src/lib/effects/`.

## 1. Data flow (traced end to end)

`effect-*-catalog.ts` (per-render-kind file, entries built by a local `create*CatalogEntry()` factory) → spread into `EFFECT_CATALOG` in `effect-catalog.ts` (order: legacy, filter, motion, overlay, composite, sound, audio-reactive, creative-ai, particle, decoration, distortion, person) → typed by `effect-catalog-types.ts` → filtered/sorted by `effect-catalog-selectors.ts` → rendered by the panel `apps/web/src/components/editor/media-panel/views/effects.tsx` (+ `effect-preview-thumbnail.tsx`) → also auto-projected into the asset manifest by `createEffectAssetEntry()` in `apps/web/src/lib/assets/qcut-asset-manifest.ts` (kind `"effect"`, id = preset id, version = `assetVersion`, `localizedNames["zh-CN"]` = `localizedName`, deps auto-derived from overlay stages + `audioCompanion`). Apply path: `useEffectsStore.applyEffect(elementId, preset)`; drag payload validated by `effect-preset-drag.ts` (only `publication === "published"` presets parse). Export needs no per-entry code: it dispatches on `renderProgram.stages[*].kind` (`apps/web/src/lib/export-cli/sources/effect-procedural-sources.ts` bakes particles/decoration PNG sequences; `effect-companion-audio-sources.ts` resolves `audioCompanion`).

## 2. Entry shape (all required fields)

`EffectCatalogEntry` (effect-catalog-types.ts:73-97):
- `preset: EffectPreset` — `{ id, name, description, category (legacy EffectCategory enum: motion→"cinematic"/"distortion", particles→"basic", overlay→"composite", sound→"distortion", filter→"basic"; only used by the old effects-gallery), icon, parameters, effectType?, renderProgram?, audioCompanion?, preview? }`
- `assetVersion: number` — 1 for new entries; bump when changing an existing entry (feeds the manifest's unique `effect:<id>@<version>` key and the resource-update UX)
- `localizedName?` / `localizedDescription?` — Chinese strings, inline
- `tags: readonly string[]` — feed search + manifest tags (deduped/trimmed by `uniqueTags`)
- `releasedAt: string` — ISO timestamp; drives 最新 (Latest) sort
- `popularityScore: number` — 0–100; drives 热门 (Popular) sort
- `publication: "published" | "legacy" | "planned"` — only `"published"` is visible (selectors, drag-parse, audit all filter on it); every current entry is `"published"`
- `render: EffectRenderContract` — `kind` ∈ filter|motion|overlay|composite|audio-reactive|person-tracking|particles|distortion; `previewBackend` ∈ css-filter|canvas|webgl|frame-renderer; `exportBackend` ∈ ffmpeg-filter|ffmpeg-filter-complex|frame-renderer; `parity: "verified" | "pending"` — published entries MUST be `"verified"` or `auditEffectRenderContracts` (and the catalog test) fails
- `family: "visual"` + `category: VisualEffectCategoryId` (or `family: "person"` + `category: "person"`)

Reference factories (copy the matching one):
- **Motion** (`effect-motion-catalog.ts`): input = id, name/localizedName, description/localizedDescription, category (`"dynamic"` or `"camera"`), icon, `channels: EffectMotionChannel[]` (`property` x|y|scale|rotation|opacity, `waveform` sine|cosine|linear, `amplitude` — x/y are canvas ratios, rotation degrees, `frequencyHz`), tags, releasedAt, popularityScore. Factory sets `effectType:"motion"`, stage `{kind:"motion", intensity:1, channels}`, render = motion/canvas/ffmpeg-filter-complex/verified.
- **Particle** (`effect-particle-catalog.ts`): input adds `variant` (snow|sakura|embers|stars|confetti|fog|coins|butterfly), `density`, `speed`, `color`, `opacity`; category defaults `"atmosphere"` (nature entries pass `"nature"`). Render = particles/canvas/**frame-renderer**/verified (export bakes transparent PNG sequence).
- **Overlay** (`effect-overlay-catalog.ts`): input adds `resourceId`, `fit` (cover|contain|stretch), `opacity`. Factory sets `effectType:"resource-overlay"`, stage `{kind:"overlay", resourceId, blendMode:"normal", opacity, fit}`, render = overlay/canvas/ffmpeg-filter-complex/verified. **Resource requirement**: `resourceId` must exist in `effect-overlay-resource-definitions.ts` — add to BOTH `EFFECT_OVERLAY_RESOURCE_IDS` and `EFFECT_OVERLAY_RESOURCE_REFERENCES` (`{collection, icon}` of an existing bundled sticker); `resolveEffectOverlayAsset` throws at preview time if unknown or if the resolved sticker id ≠ resourceId (identity check).
- **Sound** (`effect-sound-catalog.ts`): motion entry + `audioCompanion: {resourceId, offsetSeconds, durationSeconds, gain}`; category hard-coded `"sound"`. `resourceId` (e.g. `"-2003"`) must resolve as a `kind:"sound-effect"` asset with a `source` file in `QCUT_ASSET_CATALOG` (`resolveEffectSoundAsset` throws otherwise).

## 3. Category ids and 中文 tab mapping

`VISUAL_EFFECT_CATEGORY_IDS` (13, exact order): `basic 基础, dynamic 动感, atmosphere 氛围, trendy 潮酷, border 边框, multiscreen 多屏, sound 有声, light 光, heart 爱心, audio 音频, creative-ai 创意AI, camera 运镜, nature 自然`. Plus 2 derived collections `EFFECT_COLLECTION_IDS`: `popular 热门, latest 最新`. Sections: `favorites 收藏, visual 画面特效, person 人物特效`. Mapping lives in `effect-catalog-navigation.ts` (`VISUAL_EFFECT_NAVIGATION`, tab order interleaves collections: 热门, 基础, 动感, 氛围, 最新, 潮酷, 边框, 多屏, 有声, 光, 爱心, 音频, 创意AI, 运镜, 自然); panel `effects.tsx` renders tabs and requires a lucide icon per category in `CATEGORY_ICONS` (typed `Record<VisualEffectCategoryId, LucideIcon>` — missing key = compile error).

## 4. Invariants / tests that fail on a malformed entry

`apps/web/src/lib/effects/__tests__/effect-catalog.test.ts` (the main gate):
- nav order: categories extracted from `VISUAL_EFFECT_NAVIGATION` must equal `VISUAL_EFFECT_CATEGORY_IDS` exactly (order included); collections must equal `["popular","latest"]` → adding a category means editing types + navigation in matching relative order.
- legacy pin: `LEGACY_EFFECT_CATALOG` exactly 16 unique published verified presets → never add to `EFFECT_PRESETS`.
- coverage: every category needs ≥3 published visual entries with status `"ready"` (`auditEffectCatalogCoverage`, min 2 default but the test asserts ≥3); basic/atmosphere/trendy/light must be >3 → a NEW category must ship with ≥3 entries.
- every published `category:"sound"` entry must have `preset.audioCompanion` defined.
- every published `render.kind:"motion"` entry must have `renderProgram.stages[0].kind === "motion"`.
- `auditEffectRenderContracts(EFFECT_CATALOG)` must return `[]` → no published entry with `parity:"pending"` (`effect-catalog-audit.ts`).
- person: exactly 26 person entries pinned **by id, in order** → adding a person effect requires editing this list; person stages[0].kind must be person-tracking|decoration.

`apps/web/src/lib/assets/__tests__/qcut-asset-manifest.test.ts`:
- `validateAssetManifestPack` must be `{valid:true}` → enforces non-empty name/category, valid files/license, and unique `effect:<id>@<version>`. A **duplicate preset id** (at same assetVersion) makes `buildAssetCatalog` THROW at module import → cascading failures across many suites.
- effect asset count must equal `EFFECT_CATALOG.length`; specific dependency assertions for `light-sparkle-pop` (sticker dep), `sound-cinematic-impact` (sound-effect dep `-2003`), `person-neon-outline` (9 bundled files must exist on disk).

Other suites in `apps/web/src/lib/effects/__tests__/` (all read fully): `effect-presets.test.ts` (legacy-16 only: count/uniqueness/≥2 per legacy category/CSS+FFmpeg filters non-empty — fails only if you touch `effect-presets.ts`), `effect-preset-drag.test.ts` (parse must resolve `dynamic-camera-shake` and reject unpublished ids — new entries safe), `effect-resource.test.ts` (dependency-graph contract with synthetic fixtures; deps limited to `sticker`/`sound-effect` kinds per `EffectAssetDependency`), `effect-favorites.test.ts`, `effect-motion-preview.test.ts`, `effect-person-rendering.test.ts`, `canvas-utils.test.ts` (runtime helpers, unaffected by additions). Type-level gate: each catalog ends `as const satisfies readonly VisualEffectCatalogEntry[]` → missing/invalid field = `bun check-types` failure.

## 5. Direct answers

- **i18n**: NEW entries do NOT need `translations.ts` keys. `effects.tsx#localizeCatalogEntry`: locale zh → inline `localizedName`/`localizedDescription`; en → `getEffectPresetTranslationKeys()` (a closed `Record<EffectPresetId,…>` covering ONLY the 16 legacy ids in `effect-preset-translations.ts`) else falls back to `preset.name`/`preset.description`. So: inline zh strings + English name/description on the preset is the established pattern; don't touch `effect-preset-translations.ts` or `lib/i18n/translations.ts` (if you did add keys, the i18n test requires identical key sets in en and zh).
- **热门 (Popular)**: no threshold and no category — it's a derived collection: published + `family:"visual"` entries sorted by `popularityScore` desc, top `collectionLimit` (panel passes **12**; selector default 3 is tests-only). With 162 entries the current cutoff is ~90–91 (scores: 94, 92×2, 91×4, 90×7…); ties keep `EFFECT_CATALOG` aggregation order (stable sort). 最新 identical but sorted `releasedAt` desc. Search bypasses tab navigation entirely.
- **Icon convention**: neither emoji nor asset. New catalog entries use a 1–2 char uppercase mnemonic string (`"SH"`, `"SN"`, `"TF"`); legacy presets use symbols (`"+"`, `"C+"`). `preset.icon` renders only as plain text in the legacy `effects-gallery.tsx`; the new effects panel ignores it (cards show a live `EffectPreviewThumbnail` + lucide `Aperture`). Category tab icons are lucide components in `CATEGORY_ICONS`.

## 6. The checklist (existing primitive, existing category — the common case)

1. Pick the catalog file matching the render primitive and append one `create*CatalogEntry({...})` call: unique kebab-case id (convention: category prefix — `dynamic-`, `camera-`, `atmosphere-`, `nature-`, `border-`, `light-`, `heart-`, `sound-`, `basic-`), EN name+description, zh localizedName+localizedDescription, valid category id, 2-letter icon, primitive params, non-empty deduped tags, ISO `releasedAt`, `popularityScore` (≥91 to hit 热门), and let the factory supply assetVersion/publication/render.
2. Overlay only: register `resourceId` in `effect-overlay-resource-definitions.ts` (both maps) against an existing bundled sticker. Sound only: `audioCompanion.resourceId` must be an existing sound-effect asset; category must be `"sound"`.
3. Touch NOTHING else — no `effect-catalog.ts`, no types, no navigation, no panel, no export code, no i18n.
4. If new category: extend `VISUAL_EFFECT_CATEGORY_IDS` + `VISUAL_EFFECT_NAVIGATION` (same relative order) + `CATEGORY_ICONS` in `effects.tsx`, and ship ≥3 published entries. If new stage kind/variant: editor-core `packages/editor-core/src/types/effect-render.ts` + preview canvas + export baking + parity verification (large task).
5. If person effect: also update the pinned 26-id list in `effect-catalog.test.ts`.
6. Mind the 800-line file cap (`effect-motion-catalog.ts` is at 486, person at 457) — split into a new `effect-<theme>-catalog.ts` + one spread line in `effect-catalog.ts` when a file would grow past it.
7. Verify: `bun run test` (at minimum `effect-catalog.test.ts` + `qcut-asset-manifest.test.ts`), `bun check-types`, biome format (tabs) before pushing.