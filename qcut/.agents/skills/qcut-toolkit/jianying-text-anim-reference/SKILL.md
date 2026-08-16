---
name: jianying-text-anim-reference
description: Trace Jianying (剪映专业版) text animations from catalog cards through Cache/effect packages to the AE-style text-animator runtime in libcccreator. Use for 文字动画对标, studioAnim.lsanim anatomy, Text_BaseSelector keyframe math, sticker/text SwingSegment animation calls, or planning exact QCut text-animation replicas.
---

# Jianying Text Animation Reference

Verified 2026-08-16 against the 23-lib PrivateRuntimes closure
(`~/Library/Application Support/qcut/PrivateRuntimes/JianyingTransition/current/Frameworks`)
and the local effect cache. Treat a Jianying text animation as four layers:

```text
catalog card (rp.db http_cache, panel ruchang/chuchang/xunhuan)
  -> Cache/effect/<resource_id>/<md5>/  (studioAnim.lsanim package)
  -> AE-style text animator model (selectors + effectAnimators + cubic keyframes)
  -> Swing sticker/text segment runtime (libcccreator AETextAnimator)
```

## 1. Catalog layer

Text animations live in the panel with category keys `ruchang`(入场, id 2066) /
`chuchang`(出场, 2067) / `xunhuan`(循环, 2133) plus `caption_animation`(字幕动画,
39829). Full counts (beta 2026-08-15, `has_more=false`, exact): 入场 200,
出场 136, 循环 127, 字幕动画 156; ~65% VIP. The complete lists sit in
`get_panel_info` responses in `Cache/ressdk_db/*/rp.db` `http_cache` —
**preloaded with the full `effect_item_list` per category**, so unlike sound
effects there is no pagination to chase. A neighbouring panel with keys
`in/out/group` (3340/3341/3342: 200/200/155) is the video/sticker animation
panel, not text.

## 2. Package anatomy

`Cache/effect/<resource_id>/<md5>/` for a text animation contains:

| File | Meaning |
|---|---|
| `config.json` | script type, animation document path, package version |
| `studioAnim.lsanim` | THE animation document (see §3). Some are plaintext JSON, some are encrypted — check whether the file starts with `{` |
| `textAnim.lsproj` | node graph wiring the animator into the text render pipeline; usually plaintext |
| `res/*.jsdat` | expression-selector script, encrypted under its own format |

Roughly half of a typical local cache is plaintext. Directory names are opaque
resource ids; the human-readable name mapping lives in the catalog database.

**Do not record specific resource ids, cached file inventories, or package
name lists in this repo.** Work from whatever the local cache happens to hold
at the time, and keep only the structural conclusions here.

## 3. The animation model (plaintext `studioAnim.lsanim`)

Top-level `studio_anim_params` has two arrays — this is After Effects' text
animator model, executed by `AERender/data/AETextAnimator.cpp`:

```text
{
  "studio_anim_params": {
    "selectors": [{
      "class": "Text_BaseSelector",
      "selector_attrs": {            // AE range selector
        "class": "...",
        "start": {"value": 0, "motionKeyFrameInfo": [...]},  // animated range!
        "end":   {"value": 1, "motionKeyFrameInfo": [...]},
        "offset": {...}, "shape": {...}, "basedOn": {...},
        "randomSort": {...}, "randomSeed": {...},
        "smooth": {...}, "constrained": {...}, "customShape": {...}
      },
      "base_attrs": {                // properties applied per selected unit
        "position": {"type", "distance", "x", "y"},
        "color": {"motionKeyFrameInfo": [...]},   // per-char color IS a channel
        "scale": {"x", "y", "separation"},
        "alpha": {...}, "rotate": {...},
        "anchor": {"mode", "based", "x", "y"},
        "custom_script": {"path": "/res/<ts>.jsdat"}  // expression selector
      }
    }],
    "effectAnimators": [{
      "effects": [{ "name": "SoftGlow", "caption": "柔光",
                    "path"/"prefabName", "params": {..motionKeyFrameInfo..} }],
      "renderGroup_attrs": { "mode", "shape", "expandRatioX/Y", "isRDGMode",
                             "priority", "randomSeed", "randomSort", "duration" }
    }]
  }
}
```

- **Keyframes**: `motionKeyFrameInfo: [{t, v, vi, vo, vti, vto, it: "cubic"}]`
  — cubic bezier with explicit in/out values and tangents. Times are seconds
  within the anim window (`animDuration` scales them at runtime).
- **Observed effect names** across local packages: SoftGlow, DeepGlowSimple,
  RadianceGlow, GaussianBlur, DirectionalBlurs, RadialBlur, LinearWipe, Dust.
- Runtime error strings confirm selector fields: `based`, `rangeUnit`, `shape`
  bounds-checked; `unsupport expression selector` when jsdat class is unknown.
- **QCut mapping**: selector ≈ our `phaseUnitProgress` + stagger; `base_attrs`
  ≈ our effect kinds; `motionKeyFrameInfo` ≈ our easing curves. Two things we
  lack: a per-unit **color channel** and the **effectAnimators post-effect
  chain** (glow/blur applied to the animated text as a render group).

## 4. Runtime invocation (libcccreator)

Same Swing API family as the video-effect recipe (see the
`jianying-video-effect-reference` skill and its memory notes for the manager
setup, `EnableSwingSimplify`, and the full-runtime-closure trap):

- `SwingSegmentType`: **3 = Text, 2 = Sticker** (text renders through the
  sticker pipeline: `Sticker2DV3Filter`, `InfoStickerManager`).
- Content: `bef_swing_segment_sticker_set_rich_text` /
  `bef_swing_segment_model_control_set_rich_text`;
  `bef_swing_rich_text_xml_to_json` converts the draft's rich-text XML.
- Animation attach: `bef_swing_segment_sticker_set_animation`,
  `..._set_animation_property`, `..._set_entrance_time`,
  `..._set_anim_absolute_update`; equivalents for video:
  `bef_swing_segment_video_set_animation(_with_type)`.
- The param blob uses keys `animInPath/animInDuration/animInType`,
  `animOutPath/animOutDuration/animOutType`,
  `animLoopPath/animLoopDuration/animLoopType`,
  `animPropertyKey/animPropertyValue`, `animJsonParam`, `animSeq` —
  i.e. **one call carries all three phases as package paths + durations**.
- Runtime guards worth knowing: `animIn->startTime < 0! Will reset` and
  `animOut->startTime < animsIn->endTime!! Will reset out anim startTime and
  duration` — out-anim is clamped after in-anim, like our `fitEdgeFrames`.
- Sequence-frame anims are separate (`animSeq`, `bef_swing_manager_set_anim_seq_*`).

## 5. Draft layer

Segments reference `materials.material_animations[]` entries through
`extra_material_refs`; one entry bundles all phases in its `animations[]`.
The current draft format is encrypted, so exact field names are not verified
here.

**Do not read the user's local draft files to work around that.** If field
names ever matter, confirm them against a draft this project itself produced,
or a synthetic fixture — not against whatever happens to be in the user's
project folder.

## 6. Traps

1. Both the animation document and the expression scripts have encrypted
   variants — don't attempt decryption; use the plaintext ones as ground truth.
2. rp.db must be snapshotted (`sqlite3 ".backup"`) while 剪映 runs; bun:sqlite
   cannot open any db in the sandboxed shell — pre-export JSON via the sqlite3
   CLI (see sound-effects batch-03 notes in docs/task/sound-effects-lab/).
3. `http_cache` timestamps are UTC.
4. Applying an animation in the UI does not necessarily persist plaintext
   evidence anywhere — the whole current-draft tier is opaque.
5. For native probes reuse the video-effect recipe verbatim (23-lib closure,
   `EnableSwingSimplify`, segments spanning the whole clip, sweep timestamps —
   many anims are identity at a given t).

## 7. Reproduce in QCut — suggested order

1. Read a plaintext package for an animation we already ported (波浪挤压,
   粒子碎落) and diff its `motionKeyFrameInfo` curves against our effect
   params — calibrates the reading of the format itself.
2. 变色弹跳's package is the reference for adding a per-unit color channel to
   `TextAnimationVisualState` (the single biggest capability gap; unlocks
   ~30 剪映 effects).
3. Then the effectAnimators post-chain (glow/blur render group) for 文字泛光 /
   闪色循环-class looks.
4. Native render probe of a text segment (type 3) is the parity oracle when
   package math is ambiguous — extend `research/jianying-runtime-probe`.

Do not copy Jianying scripts, packages, or assets into QCut; reimplement
observed behavior with original code. VIP/free flags are product access state,
not a redistribution license.
