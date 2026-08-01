# Jianying Filter Cache Formats

Use package contents as implementation evidence and UI captures as visual
ground truth. A title match alone does not prove that the package belongs to
the selected card because Jianying can expose multiple resources with the same
display name.

## Resource database mapping

The resource databases live under:

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
```

Recent versions keep filter cards in JSON responses inside `http_cache` as well
as normalized rows in `effect`. Important fields are:

- `common_attr.title`: visible card name;
- `common_attr.id` / `effect_id`: primary package directory candidate;
- `common_attr.third_resource_id_str`: alternate engine resource ID;
- `common_attr.md5`: package version directory;
- `common_attr.requirements` and `sdk_model`: runtime dependencies;
- `common_attr.publish_source`: useful when duplicate titles exist.

Keep all resource IDs as strings. Values routinely exceed JavaScript's safe
integer range.

## Package roots

Both roots are mixed containers and must be checked:

```text
Cache/artistEffect/<id>/<md5>/
Cache/effect/<id>/<md5>/
```

Try the primary ID, effect ID, and third resource ID. Prefer an exact
`<id>/<md5>` match. If the exact version is missing, do not silently inspect a
different hash; apply one card in the UI and repeat the mapping.

## VF_V 3D LUT

Common pure color grades contain:

```text
AmazingFeature/texture/filter.cube.vf
AmazingFeature/shaders/.../*.frag
AmazingFeature/lua/SeekModeScript.lua
```

`filter.cube.vf` has a 10-byte little-endian header:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 4 | ASCII `VF_V` |
| 4 | 2 | width |
| 6 | 2 | height |
| 8 | 2 | depth |

The payload is `width × height × depth × 3` little-endian float32 values. The
observed ordering is red/X fastest, then green/Y, then blue/Z. Validate the
payload length before reading values. Dimensions such as 17³ and 32³ are both
used.

Read the compiled fragment shader to confirm semantics. A typical pure grade
samples `sampler3D` with the source RGB and mixes the result with the original
using the intensity uniform. In those packages, `SeekModeScript.lua` merely
forwards the intensity event and contains no color math.

When replaying a sampler3D shader on CPU, reproduce normalized texture sampling
and edge clamping. Compare that replay with the captured Jianying chart. A low
replay-to-capture error validates the package mapping and decoder before QCut is
evaluated.

## Skin-segmented dual LUT

Signals include:

```text
SkinFilter/image/filter_bg.png
SkinFilter/image/filter_skin.png
SkinFilter/algorithmConfig.json
SkinFilter/shaders/.../*.frag
requirements: skin_seg
sdk_model: tt_skin_seg
```

The observed LUT images are 512×512 atlases containing a 64³ cube as 8×8 blue
slices. The shader samples background and skin LUTs separately, then mixes them
with the alpha channel of the segmentation mask. Read the shader for exact tile
coordinates, slice interpolation, mask orientation, and intensity behavior.

A color chart has no skin region, so it verifies only the background LUT. Use a
common face clip for parity claims. A single global QCut LUT cannot reproduce
this architecture on both skin and background.

## Shader or effect package

If there is no recognized LUT but the package contains shaders, textures,
passes, models, or algorithm nodes, switch to the `jianying-reference` workflow.
Inspect readable compiled shaders and Lua, capture stepped visual evidence, and
identify the missing QCut runtime capability before implementing an
approximation.

## Evidence and ownership

Record outside the worktree:

- exact card title and category;
- resource ID, md5, database row timestamp, and package path;
- why duplicate-title candidates were rejected;
- package classification and runtime dependencies;
- package replay vs Jianying screenshot RMSE;
- QCut vs package replay RMSE for natural colors and the full chart;
- labeled left/right comparison images.

Do not commit cached LUT values, textures, Lua, compiled shaders, package dumps,
or derived lookup tables. Transcribe behavior into QCut-owned math and prose;
comparison screenshots may be retained as review evidence only when needed.
