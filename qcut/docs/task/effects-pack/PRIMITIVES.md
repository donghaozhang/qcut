# QCut Effect Render Primitives — Capability Boundaries (worktree `.claude/worktrees/effectspack/qcut`, branch `effectspackv1`)

## Architecture in one paragraph
Every effect preset carries an optional `EffectRenderProgram` (`{ version: 1, stages: EffectRenderStage[] }`) defined in `packages/editor-core/src/types/effect-render.ts`. Catalog entries (`apps/web/src/lib/effects/effect-*-catalog.ts`) are pure data: preset id/names/tags + a render program built from the 9 stage kinds + a `render` contract (`previewBackend`, `exportBackend`, `parity`). Preview executes stages via DOM/canvas components in `apps/web/src/components/editor/effects/*` (mounted from `preview-panel/preview-element-renderer.tsx` via `use-effects-rendering.ts`). Export executes via `apps/web/src/lib/export/export-engine-cli.ts` → per-stage source extractors in `apps/web/src/lib/export-cli/sources/effect-*-sources.ts` → FFmpeg filter graphs in `electron/ffmpeg-video-transform.ts` (+ expression builders in `electron/ffmpeg/effect-motion-expression.ts`, `effect-audio-reactive-expression.ts`, `effect-render-window.ts`; input wiring in `electron/ffmpeg-args-builder.ts`). **Critical**: the stage types are DUPLICATED in `electron/types` land at `electron/ffmpeg/effect-render-types.ts` (variant fields typed as plain `string` there, so new particle/decoration/distortion variants don't break electron compile — but new stage kinds/fields must be mirrored). Programs from multiple enabled effects are concatenated by `combineEffectRenderPrograms` and validated by `validateEffectRenderProgram` (`packages/editor-core/src/effects/render-program.ts`).

## Shared parameter: `window?: EffectRenderWindow`
Every stage accepts `{ startSeconds, endSeconds }` in **clip-local output seconds** (validated: start ≥ 0, end > start). Export gates every stage kind (FFmpeg `enable=`/`gte*lt` expressions or split+blend re-composite for filters lacking timeline support: composite, distortion, person). Helpers `withEffectRenderWindow`/`getEffectRenderWindow` exist in editor-core (derived from effect-element `timelineRange` in `packages/editor-core/src/timeline/effect-elements.ts`) but are **currently unconsumed** — no code path stamps windows onto stages yet. Preview canvases (particles, decoration, distortion, composite, overlay) **ignore `window` entirely**; only motion preview (`effect-motion-preview.ts`) honors it.

---

## 1. `filter`
- **Stage params**: none — `{ kind: "filter", window? }` is a marker; actual values live in the preset's flat `EffectParameters` (editor-core `types/effects.ts`).
- **Export capability (the real boundary)** — `FFmpegFilterChain.fromEffectParameters` (`apps/web/src/lib/ffmpeg/ffmpeg-filter-chain.ts`) supports exactly **10 parameters**: `brightness` (−100..100 → eq −1..1), `contrast` (−100..100 → eq 0..3), `saturation` (−100..200 → eq 0..3), `blur` (0..100 → boxblur), `hue` (deg, normalized 0–359), `grayscale` (0..100 → hue=s), `invert` (>0 → full `negate`, not partial), `sepia` (0..100 → colorchannelmixer), `vignette` (0..100 → vignette angle 0..~PI/2.2), `sharpen` (0..100 → unsharp 0..2). Keyframe animation on export exists for brightness/contrast/saturation/hue/grayscale (`fromEffectInstance` + `effect-keyframe-ffmpeg.ts`).
- **Preview** — `parametersToCSSFilters` (`effects-utils.ts`) supports the 10 above (sharpen = contrast approximation, vignette rendered as a CSS radial-gradient overlay in `effect-overlay-layers.tsx`) **plus preview-only composites** (vintage/dramatic/warm/cool/cinematic/pixelate/oilPainting/watercolor/pencilSketch/fadeIn/fadeOut) that have **no export mapping** — a catalog filter using them silently loses them on export. All shipped filter presets (`effect-filter-catalog.ts`, 14 entries) stick to the safe 10.
- **Legacy canvas fns** in `effects-canvas-advanced.ts` (pixelate/wave/twist/halftone/oil-painting) operate on old `EffectParameters`, not render programs; not part of the CLI export path.
- **New filter effect purely as catalog data?** YES — any combination of the 10 exportable params. New parameter → edit `FFmpegFilterChain` + `parametersToCSSFilters` (+ optionally keyframe transform).

## 2. `motion`
- **Params**: `intensity` (≥ 0, scales all channels), `channels[]` (non-empty): `property` ∈ {`x`,`y`,`scale`,`rotation`,`opacity`}; `waveform` ∈ {`sine`,`cosine`,`linear` (0→1 ramp over window/clip duration)}; `amplitude` (x/y = canvas-width/height ratio; scale/opacity = ±ratio applied as `1+v`, scale clamped ≥ 0.01, opacity clamped 0..1; rotation = degrees); `frequencyHz?` (default 1, ≥ 0); `phase?` (radians).
- **Preview**: `effect-motion-preview.ts` → CSS transform/opacity on the element; multiple stages compose (x/y/rotation additive, scale/opacity multiplicative). Honors window.
- **Export**: `electron/ffmpeg/effect-motion-expression.ts` builds x/y/scale/rotation/opacity FFmpeg expressions (window-gated), consumed in `ffmpeg-video-transform.ts`. Both implemented for all 5 properties × 3 waveforms. Parity verified.
- **New motion effect purely as catalog data?** YES (19 entries in `effect-motion-catalog.ts` today; `effect-sound-catalog.ts` also emits motion stages). New waveform/property → both the preview sampler and the electron expression builder + duplicated type.

## 3. `overlay`
- **Params**: `resourceId` (must resolve via `EFFECT_OVERLAY_RESOURCE_REFERENCES`), `blendMode` ∈ {`normal`,`screen`,`multiply`,`overlay`}, `opacity` 0..1, `fit` ∈ {`cover`,`contain`,`stretch`}.
- **Full resource id list** (`effect-overlay-resource-definitions.ts`, 9 ids): `qcut-themed:frames-frame-10` (borderToday), `qcut-themed:frames-frame-17` (borderHighlight), `qcut-themed:frames-frame-24` (borderSnapshot), `qcut-motion-emphasis:sparkle-pop` (lightSparkle), `qcut-motion-creator:creator-sparkle-pop` (lightCreatorSparkle), `qcut-themed:summer-burst-02` (lightBurst), `qcut-motion-emphasis:heart-beat` (heartBeat), `qcut-motion-creator:creator-heart-beat` (heartCreatorBeat), `qcut-themed:romance-frame-24` (heartRomance). Ids must exist as sticker assets in `qcut-asset-manifest.ts`.
- **Preview**: `effect-overlay-layers.tsx` — plain `<img>` with CSS `mix-blend-mode` + `opacity` + object-fit (window ignored). Animated webp/gif plays natively.
- **Export**: `effect-overlay-sources.ts` materializes the asset (SVG rasterized to canvas size), `ffmpeg-args-builder.ts` adds it as an input (`-stream_loop -1` when animated), `buildEffectOverlayFilters` composites (normal → `overlay`; other blend modes → split/blend/alphamerge graph honoring source alpha; `opacity<1` via `geq` alpha multiply; `fit` via `buildEffectOverlayFitFilter`). Window honored via `enable=`.
- **New overlay effect purely as catalog data?** YES for existing resources (9 catalog entries). **New resource** = add sticker asset to the asset manifest + one entry in `effect-overlay-resource-definitions.ts` — still no renderer code.

## 4. `composite`
- **Params**: `layout` ∈ {`split-horizontal`,`split-vertical`,`mirror`,`grid`}; `copies` 2|4 (validated: grid ⇒ 4, splits ⇒ 2, but **renderers derive tile count from layout and never read `copies`**); `gap` 0..0.25 (fraction of min canvas side).
- **Preview**: `effect-composite-canvas.tsx` — canvas that re-draws the underlying video/img/color-canvas into tiles (cover/contain fit, `hflip` for mirror), carries the source's computed CSS filter into tile 1. Window ignored.
- **Export**: `buildEffectCompositeFilters` in `ffmpeg-video-transform.ts` — split/scale/crop/hflip/overlay onto a black base; window via split + `blend=all_expr if(...)`. Parity verified.
- **New layout** → tile builders in BOTH `effect-composite-canvas.tsx` (`compositeTiles`) and `ffmpeg-video-transform.ts` (`effectCompositeTiles`) + union in both type files. Existing layouts: pure catalog data (4 entries + creative-ai grid usage).

## 5. `audio-reactive`
- **Params**: `driver` ∈ {`source` (target element's own audio, falls back to its track), `timeline` (full mix)}; `band` ∈ {`bass`,`mid`,`treble`,`full`}; `property` ∈ {`brightness`,`scale`,`opacity`}; `minimum`/`maximum` (finite, min ≤ max; multiplier applied as `min + (max-min)*level`, level 0..1); `attackMs`/`releaseMs` ≥ 0 (exp smoothing).
- **Preview**: `use-effect-audio-reactive-preview.ts` reads live levels from `audio-mix-engine` (`readAudioReactiveLevel`), smooths per-stage, then `effect-audio-reactive-state.ts` multiplies into motion state (scale/opacity) or appends CSS `brightness()`.
- **Export**: `effect-audio-reactive-sources.ts` offline-analyzes audio via `platform().ffmpeg.extractAudioWaveform` (band-filtered), samples at 12 Hz, normalizes+attack/release-smooths, simplifies to ≤ 240 keyframes → `EffectAudioReactiveEnvelope { stageIndex, keyframes }`; `electron/ffmpeg/effect-audio-reactive-expression.ts` turns envelopes into FFmpeg expressions multiplied into eq/scale/opacity. Both sides implement all 2×4×3 combinations.
- **New audio-reactive effect purely as catalog data?** YES (3 entries today). New `property` → preview state mapper + electron expression consumer + envelope wiring.

## 6. `person-tracking`
- **Params**: `target` ∈ {`face`,`body`,`person`} — **stored but NEVER consumed**; segmentation is always whole-person (no `stage.target` reads anywhere). `treatment` ∈ {`outline`,`spotlight`,`background-blur`,`subject-blur`,`subject-pixelate`,`echo`,`big-head`}; `echoVariant?` ∈ {`strobe`,`trail`,`shatter`,`dots`} (default strobe; trail/shatter = 3 ghost copies, others 2); `intensity?` 0.5..2 (clamped; spotlight dim/desat, blur sigma, pixelate block 8..64, big-head scale 1+0.32·i); `vignette?` bool (spotlight only); `stroke?` (outline only): `style` ∈ {`solid`,`electric`,`rainbow`,`flow`,`crayon`,`handwritten`,`shatter`,`neon`}, `color` hex, `width` 1..3 (dilation passes, capped 4), `glow` 0..3 (blur sigma); `fallback` ∈ {`center` (soft center blob),`full-frame`,`disable`}.
- **Preview**: `effect-person-tracking-canvas.tsx` + `effect-person-rendering.ts` — in-renderer segmentation (`person-cutout-client`), all 7 treatments + all echo variants + all 8 stroke styles drawn on canvas (rainbow/flow animated fills, electric/shatter alpha flicker).
- **Export**: `effect-person-sources.ts` pre-renders alpha media per source+fallback (png/webm via `exportPersonCutoutImage/Video`, MASK_SETTINGS: threshold .5, temporalSmoothing .55, edgeShift 1, feather 1.5) → FFmpeg input; `buildEffectPersonFilters` in `ffmpeg-video-transform.ts` implements all treatments (outline via dilation+gblur+blend subtract; stroke style modulation `geq` exprs for electric/crayon/handwritten/shatter — **rainbow/flow/neon export as the tighter default styling** (only a partial geq table exists: electric/crayon/handwritten/shatter); echo via split+colorchannelmixer/pixelize+hue; big-head crop-top-42%-and-rescale). Window honored via split+blend.
- **New person effect purely as catalog data?** YES within the treatment×variant×stroke grid (26 catalog entries incl. decoration-prop hybrids). New treatment/stroke style → `effect-person-rendering.ts` + `buildEffectPersonFilters` + both type unions.

## 7. `particles`
- **Variants (8, all preview+export complete)**: `snow`, `sakura`, `embers` (rises, twinkles), `stars` (static twinkle), `confetti`, `fog`, `coins`, `butterfly`.
- **Params**: `density` 0..1 (0 = none; scales per-variant baseCount 14–90), `speed` > 0 (fall/sway multiplier), `color` (any CSS color; **single color per stage** — confetti is monochrome), `opacity` 0..1.
- **Model**: deterministic, pure sampler `sampleEffectParticles` (`packages/editor-core/src/effects/particles.ts`) — same time ⇒ same field. Per-variant physics fixed in `VARIANT_CONFIG` (size range, fall speed sign, sway amplitude, twinkle) — **not catalog-tunable**.
- **Preview**: `effect-particle-canvas.tsx` draws via shared `drawParticleStageFrame` (`effect-procedural-draw.ts`); respects prefers-reduced-motion; time base = wall clock since mount (phase may differ from export's clip-local t=0; field model identical).
- **Export**: `effect-procedural-sources.ts` bakes one transparent PNG per output frame (OffscreenCanvas, same draw fn) → `saveEffectSequenceFrame` IPC → image2 sequence input → alpha `overlay` in `buildEffectProceduralFilters` (window via `enable=`). Requires export session.
- **New variant** = enum in `effect-render.ts` + `VARIANT_CONFIG` entry (particles.ts) + draw branch in `effect-procedural-draw.ts` `drawParticle` + catalog entry. Export needs **no changes** (bakes whatever preview draws). New *effects* from existing variants: pure catalog data (15 entries today, incl. recolored reuse like fireflies=embers, falling-leaves=sakura).

## 8. `decoration`
- **Variants (13 in enum, all drawn in `effect-procedural-draw.ts`, all export via the same PNG-sequence bake)**: `grid` (only static one — 1 baked frame; see `isDecorationStageAnimated`), `rainbow-rays`, `film-end` (letterbox + hardcoded "全剧终" text), `iris`, `standby`, `burst`, `lens-flare`, `floating-text` (✦ glyphs; also the fallback branch), `question-marks`, `hearts-orbit`, `idea-bulb`, `anger-burst`, `hp-bar`. Published: 8 in `effect-decoration-catalog.ts` + 5 as person-prop entries in `effect-person-catalog.ts`.
- **Params**: `color` (primary tint), `opacity` 0..1. Everything else (ray counts, speeds, text, glyphs, timings) hardcoded per variant.
- **Preview/export**: identical machinery to particles (shared draw fn; preview wall-clock, export clip-local frames; window export-only via `enable=`).
- **New variant** = enum + draw function + dispatcher branch in `drawDecorationStageFrame` + (`isDecorationStageAnimated` if static) + catalog entry. Export automatic.

## 9. `distortion`
- **Variants (4, exhaustive `satisfies never` guard)**: `fisheye` (static bulge), `magnifier` (static center loupe, radius 0.5 hardcoded), `ripple` (animated sine rings), `shockwave` (expanding ring, period ~2.45 s). Animated set duplicated in `isDistortionStageAnimated` (export, `effect-distortion-sources.ts`) and inline in preview (`effect-distortion-canvas.tsx`).
- **Params**: `strength` 0..1 only. Radial-from-center displacement fixed by `sampleDistortionSource` (`packages/editor-core/src/effects/distortion.ts`).
- **Preview**: per-pixel CPU remap capped at 320 px side; **only `stages[0]` is rendered — multiple distortion stages preview-drops extras** (export applies all). Wall-clock time.
- **Export**: bakes 16-bit PGM xmap/ymap pairs (≤ 480 px side, scaled up in-graph) per frame (1 pair for static variants) → FFmpeg `remap` in `buildEffectDistortionFilters`; window via split+blend (remap has no `enable`).
- **New variant** = enum + case in `sampleDistortionSource` + animated-set updates in BOTH `effect-distortion-sources.ts` and `effect-distortion-canvas.tsx` + catalog entry. Export map bake is automatic once the sampler exists.

## Companion audio (not a stage)
`EffectAudioCompanion { resourceId, offsetSeconds ≥ 0, durationSeconds > 0, gain ≥ 0 }` on the preset. `resourceId` = sound-effect asset id in `qcut-asset-manifest.ts` (e.g. `"-2003"`). Preview: `effect-companion-audio-players.tsx`; export: `effect-companion-audio-sources.ts` turns them into regular audio-mix inputs. Pure catalog data for existing sound assets.

## What "catalog data only" can build (summary matrix)
| Goal | Catalog-only? | Code needed otherwise |
|---|---|---|
| Filter using the 10 exportable params (incl. keyframes) | YES | — |
| Motion combo (5 props × sine/cos/linear, any amp/freq/phase/intensity) | YES | — |
| Overlay of the 9 existing sticker resources (4 blend modes, 3 fits, opacity) | YES | new sticker: asset-manifest + resource-definitions entry (still data) |
| Composite of the 4 layouts (gap 0–0.25) | YES | new layout: 2 tile builders |
| Audio-reactive (2 drivers × 4 bands × 3 props, min/max/attack/release) | YES | new property: preview state + electron expr |
| Person effect within treatments/echo/stroke grid | YES | new treatment/stroke: canvas + FFmpeg graphs |
| Particle recolor/redensity of the 8 variants | YES | new variant: enum + config + 1 draw branch (export free) |
| Decoration recolor of the 13 variants | YES | new variant: enum + draw fn (export free) |
| Distortion strength presets of the 4 variants | YES | new variant: enum + sampler case + 2 animated-lists |
| Multi-stage combos (e.g. filter+motion+overlay, creative-ai catalog) | YES | — |
| Sound-driven pulse + companion SFX | YES (existing sound assets) | — |

## Cross-cutting gotchas for the implementer
1. **Type duplication**: `electron/ffmpeg/effect-render-types.ts` mirrors the editor-core types; new stage kinds/fields/property unions must be added in both (variant strings are loose on the electron side).
2. **Preview windows**: only motion honors `window` in preview; all overlay/canvas stages render for the element's whole visible life. Effect-element ranges gate at the element level instead (`getTimelineEffectsAtTime`).
3. **Time-base parity caveat**: procedural/distortion preview animates from component-mount wall clock; export uses clip-local `frame/fps`. Field/shape identical, phase offset possible.
4. **Distortion preview renders only the first distortion stage.**
5. **`copies` on composite is validated but unused** — layouts imply tile count.
6. **`target` on person-tracking is decorative** — no face/body distinction exists.
7. **Filter params outside the exportable 10 are preview-only** and silently dropped by export.
8. **Rainbow/flow/neon outline styles** are approximated on export (geq modulation table covers only electric/crayon/handwritten/shatter).
9. All baked-source stage kinds (overlay, person, particles/decoration, distortion) **require an export session** (`saveEffectSequenceFrame` / `saveStickerForExport` / `saveTemp` IPC) and per-stage `stageIndex`-matched inputs wired in `ffmpeg-args-builder.ts` — missing inputs throw.
10. Catalog entries carry `render: { kind, previewBackend: css-filter|canvas|webgl|frame-renderer, exportBackend: ffmpeg-filter|ffmpeg-filter-complex|frame-renderer, parity: verified|pending }` (`effect-catalog-types.ts`) — set honestly; `effect-catalog-audit.ts` consumes them. New catalog files must be registered in `effect-catalog.ts`.

Key files (all under the worktree root `/Users/peter/Desktop/code/qcut/qcut/.claude/worktrees/effectspack/qcut/`): types `packages/editor-core/src/types/effect-render.ts`, samplers `packages/editor-core/src/effects/{particles,distortion,render-program}.ts`; preview `apps/web/src/components/editor/effects/*`, `apps/web/src/lib/effects/{effect-procedural-draw,effect-motion-preview,effect-audio-reactive-state,effect-person-rendering,effect-overlay-resource-definitions}.ts`; export extractors `apps/web/src/lib/export-cli/sources/effect-{procedural,overlay,distortion,person,audio-reactive,companion-audio}-sources.ts` + `effect-sequence-shared.ts`; FFmpeg graphs `electron/ffmpeg-video-transform.ts`, `electron/ffmpeg-args-builder.ts`, `electron/ffmpeg/effect-{render-types,render-window,motion-expression,audio-reactive-expression}.ts`; filter chain `apps/web/src/lib/ffmpeg/ffmpeg-filter-chain.ts`; catalogs `apps/web/src/lib/effects/effect-*-catalog.ts` (published counts: filter 14, motion 19, overlay 9, composite 4, audio-reactive 3, particles 15, decoration 8, distortion 4, person 26, sound 3, creative-ai 3).