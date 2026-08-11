# Jianying Text Style Package Formats

## Contents

- [Catalog records](#catalog-records)
- [TextStyle packages](#textstyle-packages)
- [InfoSticker packages](#infosticker-packages)
- [Verified runtime contract](#verified-runtime-contract)
- [Transparent rendering](#transparent-rendering)
- [QCut implementation boundary](#qcut-implementation-boundary)
- [Evidence and tests](#evidence-and-tests)

## Catalog Records

Treat `ressdk_db/*/rp.db/http_cache` as the freshest catalog evidence. Current
clients can fetch a card into `http_cache` without creating a corresponding row
in the older `effect` table.

The useful response shapes are:

```text
panel endpoint
  data.categories[]
  data.category_resources

category endpoint
  data.effect_item_list[]
    common_attr.id
    common_attr.title
    common_attr.md5
    common_attr.category_ids[]
    common_attr.item_urls[]
    word_art
```

Use `id` and `md5` to resolve the package. Keep `item_urls` only in temporary
scratch: they can be signed and short-lived. Do not treat response ordering or
category IDs as stable across accounts, regions, or app versions.

## TextStyle Packages

A typical editable style package contains:

```text
config.json
effectStyle.json
cover_icon.png
<optional texture images>
```

Require `config.json.effect.Link[].type == "TextStyle"` before interpreting
`effectStyle.json` as an editable appearance. Version 3 files observed locally
contain these top-level fields:

```text
version
textable
fill
strokes[]
inner_shadows[]
shadows[]
```

Each visual layer can contain an alpha plus a `content` object. Decode
`content.render_type` first:

### Solid content

```text
content.solid.color     normalized RGB triplet
content.solid.alpha     normalized alpha
```

### Gradient content

```text
content.gradient.color[]    normalized RGB stops
content.gradient.alpha[]    per-stop alpha
content.gradient.percent[]  stop positions
content.gradient.angle      orientation
content.gradient.mode       coordinate space, often character-relative
content.gradient.style      optional gradient behavior
```

Validate that color, alpha, and position arrays have compatible lengths. Do not
silently sort stops without proving Jianying does so.

### Texture content

```text
content.texture.path
content.texture.alpha
content.texture.scale
content.texture.angle
content.texture.blend
content.texture.flip[]
content.texture.range
content.texture.stretchMode
content.texture.wrapMode
```

Optional fields vary by package. Preserve unknown keys in the normalized model
so a later renderer can add support without re-importing the source package.
Resolve `path` relative to the package and reject traversal outside it.

### Geometry and shadows

Strokes and shadows are arrays, not single CSS properties. Observed version 3
packages can use several strokes and several outer shadows, and nested shadow
content can itself carry strokes. Preserve every layer's width, distance,
angle, diffuse or feather value, alpha, and content.

Do not assume JSON field order proves painter order. Establish painter order by
isolating layers in synthetic reconstruction and comparing same-text captures.
Once proven, lock it in tests.

An observed local sample of 21 `TextStyle` packages used version `3.0` and
`textable: false`; some used textures in fill, stroke, inner shadow, or outer
shadow. Treat these counts as evidence from one cache snapshot, not format
limits.

## InfoSticker Packages

An `InfoSticker` word-art package can contain:

```text
content.json
sticker.config
main.scene
effect.prefab
materials and textures
xshader/
render-target definitions
```

`sticker.config` may expose `SDFTextSystem`, `MeshRenderer`, transforms, and
other runtime components. Readable shader variants can reveal SDF fill,
multiple outlines, inner line, gradients, texture mapping, and shadow passes.
Use that evidence to describe the architecture and equations; do not copy the
shader into QCut.

Prefabs and materials can store required numeric parameters in binary form and
can reference fonts or engine resources absent from the cache. Record every
missing dependency. Classify such a package as runtime-dependent rather than
claiming that its files can be executed directly. The verified private local
runtime can execute some `InfoSticker` text packages, but that does not make the
package portable or redistributable.

Route `ScriptInfoSticker` and `AmazingFeature` packages to a runtime/package
analysis workflow. Never reinterpret them as ordinary `TextStyle` merely
because their UI card appears in the same 花字 panel. The verified local
`ScriptInfoSticker` route creates a type-10 `ScriptSegment` with a JSON object
whose required `path` value is the package directory. It does not use the
type-3 `TextStickerFilter` payload.

## Verified Runtime Contract

Jianying 11.2.0's saved `libcccreator` closure rendered cached `TextStyle` and
`InfoSticker` flower packages with this sequence:

```text
createTextStickerFilter(text, font)
  -> setTextEffect(packagePath)
  -> set font size and use-effect-default-color
  -> textStickerToJson()
  -> create TextSegment(type 3, packagePath)
  -> add segment to SwingManager
  -> bef_swing_segment_sticker_set_params(generatedJson)
  -> seek into a transparent RGBA target
```

The sticker-parameter object holds up to nine string pointers plus a count. The
probe keeps the engine-generated payload alive through the call. Creating the
text segment directly with that JSON did not establish glyph layout and rendered
blank; passing content JSON to the default-parameter API is a different ABI and
is not supported by this evidence.

A valid runtime result must satisfy all of these checks:

- the process exits successfully and the manager seek returns success;
- the frame has non-zero colored and alpha pixels;
- the frame still has fully transparent pixels outside glyph coverage;
- the raw RGBA SHA-256 differs from the no-effect baseline;
- package matrices run each package in a fresh process.

The 2026-08-11 local flower snapshot passed 197 of 197 `TextStyle` packages and
79 of 79 `InfoSticker` packages. Every package within each group produced a
unique RGBA hash. A separate local sample passed 25 of 25 `ScriptInfoSticker`
packages through the distinct type-10 contract, with transparent pixels and 25
unique hashes. Sending those same packages through type 3 produced one repeated
ordinary-text hash and remains useful only as a negative control. The first two
counts describe packages mapped from local `%flower%` catalog responses; the
script sample was selected from the broader local `artistEffect` cache. None of
the counts describe Jianying's global catalog.

The package matrix uses one fixed known-good font. It establishes effect-package
coverage, not per-font character coverage. Test cached font files separately
with representative CJK, Latin, numeral, punctuation, emoji, and missing-glyph
fixtures.

App-less evidence used only the 23-library private runtime with core UUID
`D6342ECD-5432-33F0-A2AD-0C28F5699994`. The complete 25-package script matrix
reproduced the same package hashes with the Jianying app Framework path removed.
Keep this runtime as a local oracle. Do not bundle it or make the portable QCut
renderer depend on the private ABI.

Post-load script editing uses `bef_swing_segment_set_params` with the updated
`ScriptTemplate` object. Verify pixels, not just the ABI return code: 22 of 25
sampled packages changed at two seconds, while three retained their default
hash. A package can partially construct and render before a script exception,
then lack the root/widget references required by its `setParameters` handler.

The verified compatibility fallback is a package copy created under QCut's
external research/evidence directory. Edit the copy's structured
`content.json` before segment creation, preserve every rich-text slot, and
distribute replacement code points across those slots so per-character
templates remain valid. The app-less preload-copy matrix rendered 25 of 25
visible transparent frames, and every edited hash differed from its matching
default frame. Never modify the Jianying cache in place and never commit or
redistribute the copied package.

## Transparent Rendering

The transparent shape is the text glyph coverage, not the rectangular bounds
of the texture or card thumbnail. Use one of these equivalent compositing
models:

```text
solid:   sourceColor * glyphCoverage
gradient: gradient(x, y) * glyphCoverage
texture: texture(mappedGlyphCoordinates) * glyphCoverage
```

Apply stroke and shadow coverage from expanded or blurred glyph masks. Keep any
explicit text-background box as a separate QCut feature. Do not infer a box
from `cover_icon.png` or a source texture's opaque pixels.

Test transparency with:

- checkerboard and solid black/white backgrounds;
- pixels inside the text bounds but outside glyph coverage;
- holes in glyphs such as `O`, `口`, and `日`;
- antialiased edges at multiple scales;
- shadow-only pixels and texture alpha;
- preview, thumbnail, and exported-frame comparisons.

## QCut Implementation Boundary

The current flat style path resolves one fill color, one stroke, one shadow,
one glow, and an optional background. Inspect these files before planning a
port because paths and capabilities can evolve:

```text
packages/editor-core/src/types/timeline.ts
apps/web/src/lib/text/text-style.ts
apps/web/src/lib/text/text-canvas-renderer.ts
apps/web/src/lib/text/text-animation-canvas-renderer.ts
apps/web/src/components/editor/preview-panel/preview-element-renderer.tsx
apps/web/src/lib/export-cli/
```

Prefer a versioned `TextAppearance`-style model with ordered arrays and tagged
content variants. Adapt legacy flat fields into it. Use the same normalized
model in thumbnails, editor preview, and export. A new style is incomplete if
only the library card resembles Jianying while the timeline or export falls
back to another renderer.

Separate these concerns:

- catalog metadata and search taxonomy;
- QCut-owned visual resources and provenance;
- style normalization and migration;
- glyph layout and masks;
- layer evaluation and bounds;
- preview/thumbnail/export adapters.

## Evidence and Tests

Use synthetic fixtures rather than copied Jianying packages. Include at least:

- solid, gradient, and texture content variants;
- multiple strokes and shadows with stable ordering;
- inner-shadow clipping;
- texture rotation, scale, flip, and wrapping;
- transparent pixels outside glyph coverage;
- CJK, Latin, emoji, multiline, and empty text;
- missing texture and unsupported runtime fallback;
- serialization round trips and backward compatibility;
- deterministic seek, thumbnail, preview, and export parity.

Keep a research report explicit about what was observed, inferred, unsupported,
or approximated. A package parse without same-text visual evidence is not exact
parity.
