---
name: jianying-text-style-reference
description: Trace Jianying (剪映专业版) decorative text and word-art cards from local ressdk catalog metadata to downloaded artistEffect packages, classify TextStyle versus InfoSticker, inspect gradients, textures, strokes, shadows, and SDF runtime dependencies, and plan clean-room QCut parity. Use for 剪映花字, 文字样式, 花字缓存, word art, decorative text, transparent text textures, effectStyle.json, SDFTextSystem, or questions about how a Jianying text style is stored and reproduced.
---

# Jianying Text Style Reference

Treat a Jianying word-art card as four separate evidence layers:

```text
catalog card -> ressdk http_cache metadata -> artistEffect package
             -> rendered glyph behavior
```

Use `jianying-reference` for text animations such as typewriter, entry, exit,
loop, or per-character motion. Use this skill for the static visual appearance
of editable text.

Follow `jianying-draft-binary-reference` for private ABI ownership evidence and
`jianying-transition-reference` for the local-only runtime lifecycle. Reuse the
verified private backup instead of creating another binary collection.

Read [package-formats.md](references/package-formats.md) before interpreting an
`effectStyle.json`, shader package, or QCut implementation gap.

## Keep Evidence Private

- Work read-only against locally cached files from the signed-in Jianying client.
- Use a disposable draft and change exactly one card during a cache probe.
- Keep database extracts, signed URLs, packages, textures, fonts, shaders,
  prefab data, and captures in a scratch directory outside the repository.
- Never commit or redistribute Jianying assets. A `free` or `VIP` flag is
  product access state, not a redistribution license.
- Record behavior, normalized parameters, equations, and original QCut code.
  Use synthetic fixtures and QCut-owned or separately licensed visual assets.

## Locate the Catalog Record

Find every local resource database; do not assume one account directory:

```bash
CACHE_ROOT="$HOME/Movies/JianyingPro/User Data/Cache"
find "$CACHE_ROOT/ressdk_db" -name rp.db -type f -print
```

Query `http_cache`, including recent rows that may not be materialized in the
`effect` table:

```bash
DB="/absolute/path/to/ressdk_db/<account-id>/rp.db"
sqlite3 -readonly -json "$DB" '
  SELECT id, url, timestamp
  FROM http_cache
  WHERE url LIKE "%flower%" OR url LIKE "%get_panel_info%"
  ORDER BY timestamp DESC;
'
```

Keep 64-bit IDs as strings. Extract one response to scratch without printing
signed `item_urls`:

```bash
SCRATCH="$(mktemp -d /tmp/jy-text-style.XXXXXX)"
ROW_ID="<http-cache-row-id>"
sqlite3 -readonly "$DB" \
  "SELECT response_body FROM http_cache WHERE id=$ROW_ID" \
  > "$SCRATCH/catalog.json"

jq '[.data.effect_item_list[]? | {
  id: .common_attr.id,
  title: .common_attr.title,
  md5: .common_attr.md5,
  category_ids: .common_attr.category_ids
}]' "$SCRATCH/catalog.json"
```

For panel responses, inspect `.data.categories` and
`.data.category_resources`. For category responses, inspect
`.data.effect_item_list[].common_attr`. Copy `rp.db-wal` and `rp.db-shm` with a
copied live database, or query the original database read-only.

## Map One Card to Its Package

Prefer the catalog identity tuple `resource id + md5`:

```text
~/Movies/JianyingPro/User Data/Cache/artistEffect/<resource-id>/<md5>/
```

Do not default to `Cache/effect`; verified word-art packages use
`Cache/artistEffect`. If catalog identity is unavailable, create an mtime
baseline before touching one uncached card:

```bash
MARKER="$SCRATCH/before"
touch "$MARKER"
# In Jianying, preview or apply exactly one uncached card and wait for download.
find "$CACHE_ROOT/artistEffect" -mindepth 2 -maxdepth 2 -type d \
  -newer "$MARKER" -print
```

An already cached card may leave no new mtime. Treat the card's download-arrow
state and an exact catalog path as stronger evidence than a blank diff. Reject
the mapping when multiple unrelated packages change.

Use the correct UI action:

- In the left `花字库`, select a card to preview it; use the card's bottom-right
  add control to create a new styled text clip.
- To style an existing clip, select that clip and use the right property panel
  `文本 -> 花字`; selecting a style there must not create another text layer.

Record which action was used. Preview, download, apply-to-existing, and
add-new-text are different state changes.

## Classify Before Decoding

Inspect the package entry point:

```bash
PACKAGE="/absolute/path/to/artistEffect/<resource-id>/<md5>"
jq -r '[.effect.Link[]?.type] | unique | .[]' "$PACKAGE/config.json"
find "$PACKAGE" -maxdepth 2 -type f -print | sort
```

Route by type:

| Type | Meaning | Next action |
|---|---|---|
| `TextStyle` | Editable layered glyph appearance | Decode `effectStyle.json` |
| `InfoSticker` | Runtime scene, commonly SDF text plus materials/shaders | Inspect dependencies; verify with the local oracle when available |
| `ScriptInfoSticker` | Script-driven runtime package | Use the verified type-10 oracle; keep QCut application support separate |
| `AmazingFeature` | Engine feature or opaque graph | Classify dependencies; do not guess semantics |

Do not infer behavior from the package folder name, card title, or
`cover_icon.png`. The cover is a thumbnail, not the style implementation.

## Decode TextStyle

Preserve the complete versioned appearance instead of flattening it into one
CSS text shadow:

```bash
jq '{
  version,
  textable,
  fill,
  strokes,
  inner_shadows,
  shadows
}' "$PACKAGE/effectStyle.json" > "$SCRATCH/style-summary.json"
```

Classify every layer's `content.render_type` as `solid`, `gradient`, or
`texture`. Preserve array order and all alpha, color, angle, distance, blur,
scale, range, wrap, flip, and blend parameters. Resolve texture paths relative
to the package only for local analysis.

Render through a glyph alpha or SDF mask. A normal `TextStyle` does not imply a
rectangular background; a visible thumbnail-colored rectangle in QCut usually
means the preview image or texture was composited without the glyph mask.

## Handle Runtime Text Packages

For `InfoSticker`, inventory `content.json`, `sticker.config`, scene, prefab,
material, shader, render-target, texture, and font references. Treat
`SDFTextSystem` and readable shader stages as architectural evidence, not as a
portable package. Missing engine fonts or binary prefab parameters mean the
package is not self-contained outside Jianying.

Capture the result over high-contrast footage with the same text, font size,
canvas, scale, and normalized position. Compare full-canvas frames. Do not
claim exact parity from a cropped card thumbnail.

## Verify With the Local Runtime Oracle

Use the repository's independently written probe when private runtime evidence
is needed. It reuses the durable local-only runtime at:

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current
```

Do not make another binary copy when that manifest passes. Never commit the
runtime, package, font, generated payload, or rendered frame.

Render one real package with Jianying's host payload and type-3 text segment:

```bash
JY_RUNTIME_ROOT="$HOME/Library/Application Support/QCut/PrivateRuntimes/JianyingTransition/current" \
  JY_TEXT_PACKAGE="$CACHE_ROOT/artistEffect/<resource-id>/<md5>" \
  JY_TEXT_OUTPUT="$SCRATCH/frame.rgba" \
  JY_TEXT_PAYLOAD_OUTPUT="$SCRATCH/payload.json" \
  JY_TEXT_FONT_PATH=/absolute/path/to/local-font.ttf \
  JY_TEXT_CONTENT=花字测试 \
  JY_TEXT_FONT_SIZE=18 \
  JY_TEXT_SEGMENT_TYPE=3 \
  JY_VIDEO_WIDTH=512 \
  JY_VIDEO_HEIGHT=512 \
  research/jianying-runtime-probe/run-probe.sh text-frame
```

The proven sequence is important:

1. Build a `TextStickerFilter` and apply the effect path through the host API.
2. Serialize the engine-generated text payload.
3. Create the `TextSegment` using the package directory.
4. Add it to `SwingManager`, then pass the generated payload through
   `bef_swing_segment_sticker_set_params` before seeking a frame.

Directly creating the segment from the generated JSON rendered blank in the
verified runtime. Do not replace the sequence with a shorter guessed call path.

`ScriptInfoSticker` is not a type-3 text effect. Its proven initialization is:

```text
create ScriptSegment(type 10, {"path":"/absolute/package/path"})
  -> add segment to SwingManager
  -> seek without a TextStickerFilter payload
```

The `path` key is required. A bare path or a JSON string root resolves to an
empty package path and attempts to read `/config.json`. A valid path object lets
the engine validate `ScriptInfoSticker`, load `js/template/template.js`, and
initialize the package's `ScriptTemplate` content.

For cache coverage, use the baseline-aware batch:

```bash
JY_TEXT_PACKAGE_TYPE=TextStyle \
  JY_TEXT_FONT_PATH=/absolute/path/to/local-font.ttf \
  research/jianying-runtime-probe/run-text-package-batch.sh

JY_TEXT_PACKAGE_TYPE=InfoSticker \
  JY_TEXT_FONT_PATH=/absolute/path/to/local-font.ttf \
  research/jianying-runtime-probe/run-text-package-batch.sh

JY_TEXT_PACKAGE_TYPE=ScriptInfoSticker \
  JY_TEXT_FLOWER_ONLY=0 \
  JY_TEXT_TIMESTAMP=700000 \
  JY_TEXT_FONT_PATH=/absolute/path/to/local-font.ttf \
  research/jianying-runtime-probe/run-text-package-batch.sh
```

The batch defaults to exact `%flower%` catalog identities and compares every
RGBA frame with a no-effect baseline. A visible frame that matches the baseline
is `fallback`, not success. On 2026-08-11, the current Jianying 11.2.0 cache
passed `197/197` `TextStyle` and `79/79` `InfoSticker` packages, all with
transparent pixels and package-unique hashes. A separate local sample passed
`25/25` `ScriptInfoSticker` packages through type 10, also with transparent
pixels and 25 unique hashes. The earlier type-3 run returned one ordinary-text
hash for all 25 and is a negative control, not a support verdict. All 25 script
packages reproduced identical hashes with the Jianying app Framework path
disabled. These are one local cache snapshot's results, not a claim about every
Jianying account or release.

To verify editable script text, set `JY_TEXT_SCRIPT_TEXT`. The default
`JY_TEXT_SCRIPT_EDIT_MODE=runtime` calls `bef_swing_segment_set_params` after
initialization; it changed 22 of the 25 sampled package hashes. Do not treat a
zero return code alone as editable success. Compare the edited frame hash with
the package's default frame.

Use `JY_TEXT_SCRIPT_EDIT_MODE=preload-copy` for packages whose script does not
finish constructing editable widget references. This mode copies the package
under the external evidence root, distributes the replacement across existing
rich-text slots, edits only the copied `content.json`, and creates the type-10
segment from that copy. It never mutates the Jianying cache. The app-less local
matrix rendered visible transparent output for `25/25`, with all 25 hashes
different from their default frames. Keep this as a private-adapter fallback,
not as evidence that QCut's portable renderer supports `ScriptInfoSticker`.

Keep style-package and font-file coverage separate. This matrix varies the
flower package while holding one known-good font constant. Use the font lab's
own load, glyph, preview, and export audit before claiming every cached font file
works in QCut.

Use this binary route only as a local oracle, optional private adapter, and
regression reference. Runtime rendering proves pixel execution, not editable
QCut semantics. The ABI is private and version-specific, and package assets are
not redistributable. A shippable QCut feature must use QCut-owned code and
licensed assets.

## Reproduce in QCut

Inspect the current QCut boundary before editing:

```bash
rg -n "interface TextElement|ResolvedTextStyle|resolveTextStyle" \
  packages/editor-core/src/types/timeline.ts \
  apps/web/src/lib/text \
  apps/web/src/lib/export-cli
```

Use a versioned structured appearance model when the reference needs multiple
fills, strokes, inner shadows, outer shadows, gradients, or textures. Keep one
canonical evaluation and rendering contract for editor preview, thumbnails,
and export; do not build separate approximations that drift.

Implement in this order:

1. Use the private runtime oracle to establish same-text visual behavior and
   failure boundaries before implementing a package family.
2. Preserve layer data and normalization without Jianying-owned files.
3. Render solid and gradient glyph fills through the glyph mask.
4. Add ordered multi-stroke and inner/outer shadow composition.
5. Add QCut-owned texture fills with explicit mapping and wrapping semantics.
6. Add an SDF/WebGL path only for behavior that Canvas cannot reproduce.
7. Verify transparent pixels, layer ordering, bounds, seek stability, preview,
   thumbnail, and export with synthetic fixtures.

Do not extend the flat legacy text fields one special case at a time. Keep a
compatibility adapter from existing `TextElement` styles into the structured
model, then make the renderer consume that model.

## Required Output

For each researched card, retain:

- visible title, category, card order, account database, endpoint, row timestamp;
- resource ID, MD5, package path, package type, and exact mapping evidence;
- decoded layers, parameter units, texture/runtime dependencies, and ambiguity;
- same-text captures on transparent and high-contrast backgrounds;
- runtime-oracle result, no-effect baseline hash, and fallback classification;
- QCut capability gap, original implementation scope, tests, and asset provenance;
- confidence level and unresolved black boxes.

Call a mapping proven only when catalog identity, local package identity, and
rendered behavior agree.
