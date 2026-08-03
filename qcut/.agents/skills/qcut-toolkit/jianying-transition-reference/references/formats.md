# Jianying transition evidence formats

## Five-layer model

A usable transition record is the join of five layers:

```text
1. Resource catalog card
   title / categories / resource_id / catalog effect_id / md5 / default duration
                               |
2. Draft materials.transitions[]
   UUID / draft effect_id / resource_id / duration / is_overlap / path
                               |
3. Outgoing segment extra_material_refs[]
   owns the UUID; the following segment is selected by timeline adjacency
                               |
4. Cache/effect/<effect-or-resource-id>/<md5>/
   extra.json / config.json / shaders / Lua / Lumi / JS / sequences
                               |
5. Runtime protocol
   #TransitionInput0 + #TransitionInput1 + normalized progress -> outputTex
```

No single layer is enough to prove identity or behavior.

## How transitions differ from audio and filters

The three reference workflows share a catalog-to-cache join, but the timeline
and renderer contracts are different:

| Material | Identity chain | Timeline ownership | Renderer inputs | Main parity question |
| --- | --- | --- | --- | --- |
| audio | catalog card -> download index -> cached media payload | one audio segment references one media item | one decoded audio stream | is this the same recording and timing? |
| filter | catalog card -> effect package -> LUT/shader/segmentation assets | one clip references one filter material | one video frame plus parameters | is the per-frame color/segmentation transform equivalent? |
| transition | catalog card -> transition material -> effect package | the outgoing segment owns the transition UUID; the incoming segment is found by track adjacency | two time-sampled video frames plus normalized progress | are source sampling, duration, easing, geometry, compositing, and endpoints equivalent? |

A transition therefore cannot be modeled as another clip filter. It needs a
seam-level object, two source samplers, frame-quantized progress, and an
explicit preview/export execution contract.

## Resource catalog

Default location:

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
```

The useful payload is JSON in `http_cache.response_body`. Transition cards can
appear under either:

```text
$.data.effect_item_list[]
$.data.category_resources.*.effect_item_list[]
```

Important fields:

| Meaning | JSON path |
| --- | --- |
| visible title | `common_attr.title` |
| resource ID | `common_attr.id` |
| catalog effect ID | `common_attr.effect_id` |
| package MD5/version | `common_attr.md5` |
| categories | `common_attr.category_ids` |
| source | `common_attr.publish_source` |
| package defaults | parsed `common_attr.sdk_extra.transition` |
| parameter declarations | parsed `sdk_extra.setting.lumiai_material_properties` |
| VIP/paid state | parsed `common_attr.business_info.json_str` |

SQLite can coerce 64-bit JSON numbers. Cast IDs to `TEXT` at query time and
keep them as strings in TypeScript and reports.

Catalog history accumulates old responses. The same title may identify
multiple resources, and the same resource may have multiple MD5 versions.
Record database path, route, response timestamp, and every matching version.

### Identity trap

`common_attr.effect_id` is not guaranteed to equal the effect ID written into
a draft. A locally observed transition used:

```text
catalog effect ID = resource ID = 7450031574923350555
draft effect ID                  = 97482746
package path key                 = 97482746
```

Use the tuple below; never key an implementation by title or one effect field:

```text
resource_id + catalog_effect_id + draft_effect_id + metadata_md5
```

## Draft files

Default project root:

```text
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
```

Observed responsibilities:

| File | Role |
| --- | --- |
| `draft_info.json` | current draft body; recent versions may be encrypted base64 |
| `.backup/**/*.load.bak` / `*.save.bak` | per-timeline snapshots; plaintext on some versions and encrypted base64 on others |
| `subdraft/**/draft_content.json` | plaintext nested/compound draft content |
| `key_value.json` | usage attribution and category state, not renderer definition |
| `Timelines/project.json` | timeline registration, not segment transition content |

Do not attempt to decrypt current drafts for ordinary reference work. Prefer a
plaintext backup created by Jianying itself when available. On multi-timeline
projects, use `Timelines/project.json` and `.backup/timeline_backup_manifest.json`
to identify timeline ownership even when each timeline payload is encrypted,
then corroborate transition identity with the catalog, effect cache, visible
card, applied duration, and exported behavior.

### Material record

Relevant `materials.transitions[]` fields include:

```json
{
  "id": "project-local-transition-uuid",
  "name": "烟雾转场",
  "category_id": "39866",
  "category_name": "模糊",
  "duration": 1466666,
  "effect_id": "97482746",
  "resource_id": "7450031574923350555",
  "is_overlap": true,
  "path": "/.../Cache/effect/97482746/<md5>",
  "request_id": "..."
}
```

The transition UUID is referenced by the outgoing segment:

```json
{
  "extra_material_refs": ["project-local-transition-uuid"],
  "target_timerange": { "start": 0, "duration": 5000000 }
}
```

The incoming segment normally does not repeat that UUID. Pair it by the next
segment in the same track and preserve the track/segment indices in evidence.

### Overlap and duration

`is_overlap: true` is a renderer/input-sampling contract. In observed drafts,
the outgoing and incoming `target_timerange` values remain exactly adjacent.
Do not rewrite timeline ranges merely because the flag says overlap.

Package/catalog duration is a default. The draft stores the applied instance
in microseconds and may quantize it to whole frames:

```text
frames = duration_us * fps / 1,000,000
quantized_duration_us = round(frames) / fps * 1,000,000
```

Example: `1,466,666us * 30fps` is approximately 44 frames, while the package
default is 1.5 seconds.

## Effect packages

Common roots include both the user-visible and sandbox-container cache:

```text
~/Movies/JianyingPro/User Data/Cache/effect/<id>/<md5>/
~/Library/Containers/com.lemon.lvpro/Data/Movies/JianyingPro/User Data/Cache/effect/<id>/<md5>/
```

These can be mirrors of the same identity. Deduplicate by parent directory key
plus MD5, but retain every equivalent path.

`extra.json` usually carries transition defaults. `config.json` links one or
more renderer components. The package key can be a draft effect ID or resource
ID depending on package generation and Jianying version.

### Renderer families

| Family | Typical evidence | Representative effects | QCut approach |
| --- | --- | --- | --- |
| simple GLSL | `xshader/generalEffect.json`, fragment shaders | 叠化, 左移, 翻页 | implement shader/math directly |
| Lua pipeline | `lua/TransitionScript.lua`, multiple passes | 横移模糊 | model each pass and curve explicitly |
| Lumi/AE | `LumiExportData.lua`, graph/keyframe data | 立方旋转, 拍立得 | map supported 2D/3D nodes or declare boundary |
| sequence composite | `.seq`, PNG masks/light strips | 前后对比 II | analyze timing; recreate assets independently |
| ThreeJS | `js/ThreeJS/scriptScene.js` | 雾化交叠, 推镜虚化 | port math/shader behavior, not source files |
| opaque node graph | `graph.dat`, `.lsproj` without readable math | package-dependent | capture first; mark formula unresolved |

Packages can combine families. Report every detected family and choose a
primary family only for triage.

### Runtime contract and easing

Look for both transition inputs, a normalized time/progress source, and an
output render target. Then trace the exact progress path.

Some shaders are linear, for example a dissolve equivalent to:

```text
C(p) = (1 - p) A + p B
```

Other shaders receive linear `p` but apply `easeInOutQuint`, Bezier, or tween
curves internally. A global QCut `easeInOut` would double-ease those effects.
Store the progress formula per preset or expose an explicit progress policy.

For the locally observed `左移` package, the internal displacement is:

```text
e(p) = 16p^5                    when p < 0.5
e(p) = 1 + 16(p - 1)^5         otherwise
u'   = fract(u + e(p))
```

The shader selects input 0 before the wrapped boundary and input 1 after it;
its `mix` uses a binary mask, so a generic `linear-mix` signal does not make it
a dissolve. At `p=.25/.75`, quint displacement is `.015625/.984375`; a cubic
ease gives `.0625/.9375`. The endpoints and midpoint match while intermediate
frames remain visibly wrong. Always inspect how `mix` is weighted.

## Evidence and legal boundary

Cache metadata and local packages are reverse-engineering evidence, not QCut
shipping assets. Never commit Jianying databases, signed URLs, cached media,
textures, shaders, scripts, decrypted drafts, or proprietary package archives.
Ship only original implementation code and QCut-owned, generated, CC0, or
separately licensed media. Product access labels such as `free` and `VIP` do
not grant redistribution rights.
