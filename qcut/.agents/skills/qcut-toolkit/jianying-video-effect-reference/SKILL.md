---
name: jianying-video-effect-reference
description: Trace how Jianying (剪映专业版) implements 画面特效/人物特效 (the 特效 panel) across its four layers — effects2/face-prop catalog in ressdk_db http_cache, materials.video_effects + dedicated effect tracks in drafts, AmazingFeature packages under Cache/effect, and the single-input seek-mode render contract — and map the QCut landing zone. Use for 剪映特效, 画面特效, 人物特效, 特效对标, effects2 panel, materials.video_effects, effect track render_index, AmazingFeature 包结构, effects_adjust_* params, or planning QCut video-effect parity.
---

# Jianying Video Effect (画面特效) Reference

Treat a Jianying 特效 as a four-layer relationship:

```text
catalog card (effects2 / face-prop panel, http_cache JSON)
  -> materials.video_effects[] material          (draft)
  -> own segment on a dedicated type:"effect" track
  -> Cache/effect/<effect_id>/<md5>/ AmazingFeature package
  -> single-input, seek-mode, event-parameterized renderer
```

This complements [jianying-reference](../jianying-reference/SKILL.md) (generic
package harvesting + stepped-frame capture — reuse its mtime-marker protocol
and capture traps verbatim) and parallels
[jianying-transition-reference](../jianying-transition-reference/SKILL.md)
(transitions are the dual-input case; 特效 are single-input).

## Layer 1 — Catalog (ressdk_db http_cache)

The 特效 panel is TWO API panels: **`effects2`** = 画面特效 (`effect_type: 7`)
and **`face-prop`** = 人物特效 (`effect_type: 8`). All catalog state lives in
the `http_cache` table (raw response JSON keyed by hashed request URL); every
structured table (`effect`, `category_effect`, `panel_*`, `loki_*`) is empty
in current builds — do not query them.

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/rp_master.db   # ressdk_db_info: hash_path -> (did, uid)
~/Movies/JianyingPro/User Data/Cache/ressdk_db/<hash>/rp.db   # one per (device, uid); uid=0 = logged out
```

`http_cache(id, url, response_body, version, timestamp)` — two URL families:

- `/artist/v1/panel/get_panel_info_<32HEX>__jianyingpro_{0|beta}_…` — panel
  category list + page 1 of the default category embedded in
  `data.category_resources`. The 32-hex token is a hash of the full request
  params, so the panel name is NOT in the URL; find the effects2 panel by
  matching `data.categories[].category_id` against item `category_ids`.
- `/artist/v1/effect/get_resources_by_category_id_<32HEX>_<panel>_…` — one
  50-item page. Panel name IS readable in this URL suffix (`effects2`,
  `face-prop`, `filter`, `transitions`, …). `data.next_offset` advances
  50→100→…, `data.request_id` stays constant per browsing session,
  `has_more:false` marks the last page.

effects2 categories observed (2026-08, 28 tabs, `category_id 中文名 key`):
39654 热门 rm · 7728 基础 basis · 7730 动感 cool · 7729 氛围 dream · 43957 最新 new ·
38510 潮酷 chaoku · 7735 边框 zoomout · 5914834 多屏 · 5914631 有声 · 39547 光 light ·
21924 爱心 heart · 5914352 音频 · 5913855 创意AI · 5913856 运镜 · 7734 自然 reality ·
39241 金粉 jinfen · 7731 复古 retro · 39246 电影 dianying · 15502 Bling kira ·
39539 扭曲 niuqu · 27966 综艺 zongyi · 7733 分屏 split · 5914473 宠物 · 5913770 投影 ·
5913775 纹理 texture · 7732 漫画 comic · 37381 暗黑 halloween · 39264 DV dv.
Beware: face-prop has its OWN 热门 (38389) — a draft `category_id` tells you
which panel the card came from.

Per-item fields that matter (`data.effect_item_list[].common_attr` unless noted):

| Field | Meaning |
|---|---|
| `effect_id` / `id` | artist-store id. Equals the `Cache/effect/<dir>/` name only for recent packages; older ones sit under a legacy SHORT id (13661053, 2724384, …) that no current catalog row contains — the reliable catalog→disk join is `md5` = inner dir name |
| `third_resource_id_str` | equals the DRAFT material's `resource_id` (e.g. 发光分身 7233250530292666939) |
| `title` | display name (开幕, 抖动, 发光分身, …) |
| `md5` | package checksum = inner dir name on disk (the join key) |
| `item_urls[0]` | the ONE signed zip download URL (expires ~+1 yr) |
| `effect_type` | 7 = 画面特效; 8 = 人物特效 EXCEPT the 写真 AI-portrait cards (category 5913867), which are 47 — never filter face-prop by type 8 alone |
| `sdk_extra` (JSON string) | `setting.effect_adjust_params[] {effect_key, default, min, max}` — the sliders |
| `extra` (JSON string) | `effect_duration` (ms, almost always 3000), `is_vip`, `sliders` (effect_key → Chinese slider label) |
| `requirements[]` | renderer/CV capabilities: blit, matting, face, script, depth, … |
| `model_names` / `sdk_model` | AI model deps (tt_matting, tt_face, tt_face_extra) |
| `business_info.json_str` | `is_vip` + `paid_type` (~68% of effects2 are VIP/subscribe) |
| `special_effect.effect_duration` | default duration in ms, duplicated in `extra.effect_duration` with identical values (special_effect is the more complete copy — it keeps 0 where extra omits the key) |

Top slider keys by frequency: `effects_adjust_speed` (545/680), `intensity`,
`luminance`, `blur`, `background_animation`, `filter`, `size`, `color`,
`range`, `distortion`, `horizontal_shift`, `vertical_shift`,
`horizontal_chromatic`, `sharpen`, … — normalized 0–1 in catalog and draft
(~99.5%; a handful declare real ranges, e.g. luminance max 2.3).

Coverage caveats: only categories the user actually browsed have cached pages
(one row per 50-item scroll page); packages download lazily on FIRST APPLY, so
a machine can know 680 catalog effects yet hold only ~7 on disk. To re-derive:
open the 特效 panel (caches the panel row), click every tab and scroll each to
the bottom, and apply a card once to force its package download.

## Layer 2 — Draft (materials.video_effects + effect tracks)

Current `draft_info.json` is encrypted; evidence comes from plaintext
`*/.backup/*.load.bak` files (rare — scan with `head -c5 | grep '{'`).

An applied 特效 = one `materials.video_effects[]` entry + one segment on a
**dedicated `type:"effect"` track**. The segment's `material_id` is the
material UUID and its `extra_material_refs` is `[]`. Video segments NEVER
reference video_effects (contrast `materials.effects` — filters/adjusts — which
can be clip-attached via `extra_material_refs`). Material schema:

```jsonc
{
  "id": "<UUID>",                    // what segment.material_id points to
  "type": "face_effect",             // observed for face-prop; 画面特效 presumably "video_effect" (unverified)
  "name": "发光分身",
  "effect_id": "13661053",           // Cache/effect/<effect_id>/ dir (legacy short id — NOT the catalog effect_id)
  "resource_id": "7233250530292666939", // = catalog third_resource_id_str; ≠ effect_id (filters have them equal)
  "path": "…/Cache/effect/13661053/dbff6732319cf9488da4816c188d9f1a", // container path symlinks to ~/Movies
  "category_id": "38389", "category_name": "热门",   // which panel tab it came from
  "adjust_params": [{"name": "effects_adjust_intensity", "default_value": 0.8, "value": 0.8}],
  "apply_target_type": 2,            // only value observed; effects[] filters use 0.
                                     // Community convention 0=clip 2=global — NOT verified locally.
  "apply_time_range": null, "time_range": null,      // timing lives on the segment
  "value": 1.0,                      // overall strength
  "algorithm_artifact_path": "##_draftpath_placeholder_<GUID>_##/video_effect/multi_faces_algorithm/<UUID>",
  "disable_effect_faces": [], "common_keyframes": []
}
```

Effect segment specifics: universal segment schema with
`source_timerange: null`, `clip: null` (generated content, no media/transform),
`target_timerange` in **microseconds**, default `duration: 3000000` (3 s,
matching the catalog's `effect_duration`), start = playhead at apply time.

Render-order bands (`render_index_track_mode_on: true`): main video 0, PIP 2,
filter tracks 10000+, **effect tracks 11000+** (one +1 per effect segment in
creation order), sticker 14000+. So 特效 composite above filters and below
stickers. `track_render_index` is just the track's array index.
`adjust_params[].default_value` mirrors the package `extra.json` defaults
exactly; `value` is the user's slider state.

## Layer 3 — Package (Cache/effect AmazingFeature bundles)

`Cache/effect/<effect_id>/<md5>/` — shared by transitions/masks/beauty too
(filters live in `Cache/artistEffect/` instead). Two md5 dirs can coexist under
one effect_id (old + updated package versions — a draft's `path` may pin the
older md5 while the catalog already lists the newer one); a sibling
`<md5>_modity_time.txt` (present on the most recently downloaded version)
lists the extracted file manifest.

Every 特效 package is an **Amazing-engine bundle** (NOT the `.lsproj` node
graph — in this cache that format belongs exclusively to text animations):

```text
config.json           # effect.Link[] {path, type:"AmazingFeature", zorder≈8011}; bALG_BACH_CONFIG
extra.json            # setting.effect_adjust_params — same schema as catalog sdk_extra
algorithmConfig.json  # optional CV graph: nodes[] {type: blit|face|matting, config}, links[]
AmazingFeature/
  main.scene          # binary %SerializedFormat% scene
  sticker.config      # engine systemList + dev/min_version gate
  material/ rt/ mesh/ # entity-material graph, render targets
  xshader/*.frag      # PLAINTEXT GLSL, and/or compiled plaintext pairs under
  Library/ShaderData/<hash>/shaderGLES|shaderMetal/
  lua/SeekModeScript.lua, ImageBusinessSlider.lua, …
```

Renderer families observed (classify before porting):

| Family | Signature | Examples |
|---|---|---|
| (a) plain shader pass(es) | 1–3 xshader passes + SeekModeScript, no algorithm | 抖动, 卷动, 泡泡变焦 |
| (b) scene node graph | multi-entity multi-RT material chain | 发光分身 (matte→ghost splits→8-octave gaussian glow→blend), 电光眼 (face mesh + PNG Aniseq) |
| (c) AE/Lumi export | `AE2Effect`/`AEExporter` config, `lua/LumiFamily/*`, per-node effects/ dirs | 竖线屏闪, 云雾消散 |
| (d) baked media | per-aspect PNG `seq/` + `.seq`/`.imageatlas`, no math | 怀旧边框 II, 胶片框 |
| (e) algorithm hybrids | multiple AmazingFeature links (z 8011/8012/8013), face+matting models | 撕纸特写 |

**Render contract** (the part QCut parity work must honor):

- **Single input texture** — shaders sample one `inputImageTexture`; Lua reads
  `Amaz.BuiltinObject:getInputTextureWidth/Height()`; Lumi scripts get
  `InputTex/OutputTex/PingPongTex`. Extra samplers are internal RTs or CV masks
  (matting masks arrive y-flipped, value in `.r`), never a second clip.
- **Seek-mode time** — families (a)(b)(d)(e) carry a `SeekModeScript.lua`;
  progress = `(curTime - startTime) / (endTime - startTime)` with
  `endTime = 3.0` in most packages (a few use 10.0/0). The host-write
  mechanism varies: some scripts declare an explicit `--@input float curTime`
  slider, others are driven through an autoplay/playTime field. Family (c)
  Lumi/AE packages have NO SeekModeScript — `lua/LumiFamily/LumiManager.lua`
  accumulates `deltaTime` in `onUpdate` (default endTime 6.0) and pushes
  start/end/curTime down the layer tree, so they are wall-clock-stepped, not
  closed-form scrub-safe. Verify which contract a package uses before assuming
  QCut-style `f(progress)` parity.
- **Params as events** — the host dispatches
  `onEvent(key = "effects_adjust_*", value ∈ [0,1])` with the draft's
  normalized value. An auto-generated `ImageBusinessSlider.lua` (header
  `write by editor EffectSDK`) remaps to real uniform ranges declared
  data-side in `AmazingFeature/ImageBusinessSlider.json`
  (per-key → `{entity, material, uniform, minValue, maxValue}`; e.g. 发光分身
  intensity→`u_GlowIntensity`@Blend [0,1], size→`u_Scale.y`@displace0
  [0.05,0.5]). So draft 0–1 values are meaningless without the package's remap
  table — harvest it before calibrating.
- **CV pipeline** — `requirements` + `model_names` (catalog) declare it;
  `algorithmConfig.json` is the executable graph (blit downsample size, face
  detect ability flags). Effects needing matting/face cannot be ported as pure
  shaders; QCut needs its own segmentation/landmark source or a documented
  known difference.

## Rendering a package through the local runtime (verified)

QCut can render these packages by driving the Jianying runtime installed on the
machine — the same libraries the Transition Lab uses. Decoded by reading each
created object's vtable pointer back to its symbol:

**SwingSegmentType**: **0 = FeatureSegment (特效)**, 2 Sticker, 3 Text,
4 Template, 5 Emoji, 6 Custom, 7 Video, 8 Transition, 9 StickerBrush,
10 Script. 1/11/12 are unmapped and crash — the factory bounds-checks `<= 0xa`.

Render contract (proven across every family above, including Lumi/AE):

1. `bef_swing_manager_create_with_gpdevice` inside a GL/Metal context, then
   `set_parameter_bool(manager, "EnableSwingSimplify", true)` — **required**, or
   nothing renders at all.
2. Video segment = type 7; effect = type 0 created WITH the package path (that
   is what loads `main.scene`).
3. `bef_swing_segment_video_add_feature(video, feature)` — a 特效 is a feature
   ON the video segment, not a standalone segment. Adding it to the manager as
   well trips `_preProcessWithoutTracks: invalid segments, two -1 layer found`
   and voids both segments.
4. Per frame: `video_set_device_texture(video, &input)` then
   `manager_seek_frame_device_texture(manager, timestampMicroseconds, &input,
   &output)`.
5. Sliders arrive as `effects_adjust_*` key/value pairs (normalized 0–1,
   straight from the draft).

**The trap that wastes hours**: most effects are IDENTITY at most timestamps —
抖动 differs only near 0.2 / 0.6 / 1.2 s. A single-timestamp test reads as "the
effect never rendered". Sweep time, or validate against an always-on overlay
(胶片框 / 怀旧边框 II hold a constant ~17–19 mean channel difference).

The runtime needs the FULL 23-library closure
(`~/Library/Application Support/qcut/PrivateRuntimes/JianyingTransition/current`);
the 5-library `.local/jianying-runtime` root segfaults during manager init.

Implementation: `research/jianying-runtime-probe/effect-probe.mm` +
`electron/jianying-effect/` (PR #414).

## Harvest protocol

1. Map card → package with the mtime-marker loop from
   [jianying-reference](../jianying-reference/SKILL.md) (apply ONE card, find
   the new `Cache/effect` dir; already-cached cards leave zero disk trace).
2. Read `extra.json` + `ImageBusinessSlider.json` first (param schema + remap
   ranges), then classify the family (table above) before reading shaders.
3. Compiled shaders under `Library/ShaderData/` are plaintext even when
   `.ausl` sources are encrypted — same trick as text animations.
4. Capture stepped reference frames per jianying-reference's protocol (loop
   effects need the play-pause capture variant).
5. All of jianying-reference's Capture Traps apply unchanged.

## QCut landing zone (2026-08 state)

- Panel EXISTS: `apps/web/src/components/editor/media-panel/views/effects.tsx`
  (tab `effects`, label 特效, flag `VIDEO_EFFECTS` in `config/features.ts`),
  ~166 published presets in `apps/web/src/lib/effects/effect-catalog.ts`
  (+13 per-kind catalog files).
- Render model: `EffectRenderProgram` with 9 stage kinds in
  `packages/editor-core/src/types/effect-render.ts`; stage types are
  DUPLICATED in `electron/ffmpeg/effect-render-types.ts` — mirror both when
  adding a kind. Preview seam: `preview-panel/use-effects-rendering.ts` +
  `preview-element-renderer.tsx`. Export seams: canvas
  (`lib/export/export-engine-renderer.ts`) and CLI/FFmpeg
  (`lib/export-cli/sources/effect-*-sources.ts`).
- Timeline: active mechanism is per-clip `element.effects: EffectInstance[]`
  (synced with `stores/ai/effects-store.ts`); `TrackType "effect"` and
  `EffectElement` types exist in editor-core but nothing constructs them —
  Jianying's independent draggable effect clips are a gap.
- CapCut draft export does NOT emit `materials.video_effects`
  (`unsupported-features.ts` raises an error for element effects); import maps
  the bucket to segment kind `effect` with capability `opaque`. Both are open
  parity work.
- Prior research to reuse: `docs/task/effects-pack/` (JIANYING-LIST.md,
  MAPPING.md, PRIMITIVES.md, CHECKLIST.md) — panel screenshots, 44 mapped
  gaps, stage capability boundaries, add-one-effect recipe.

## Scope notes

- Read-only analysis of locally cached files for interop/parity. Do not
  redistribute Jianying assets or ship harvested content — and that covers the
  REPO, not just the product: no decompiled shaders, prefab dumps, `strings`
  output, or extracted media in commits. Transcribe behavior into your own
  equations/prose; raw files stay in the session scratch dir.
- Numbers above (category ids, counts, band values) were measured on the
  2026-08 CN build (draft `version 360000`, app 5.9.x); re-verify ids after
  app updates — catalog hashes embed the app version, so stale rows linger
  beside fresh ones in http_cache.
