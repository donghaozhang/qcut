---
name: jianying-transition-reference
description: Trace Jianying (剪映专业版) transitions from catalog cards through plaintext draft ownership and local effect packages, classify GLSL/Lua/Lumi/ThreeJS/sequence implementations, and produce five-stop QCut parity reports. Use for 剪映转场, 转场对标, transition cache inspection, materials.transitions, extra_material_refs, Cache/effect packages, or planning exact QCut transition replicas.
---

# Jianying Transition Reference

Treat a Jianying transition as a five-layer relationship, not one JSON object:

```text
catalog card -> materials.transitions[] -> outgoing segment reference
             -> Cache/effect package -> dual-input renderer
```

Read [formats.md](references/formats.md) before interpreting IDs, overlap, or
package paths. Read [capture-and-parity.md](references/capture-and-parity.md)
before claiming visual parity.
Read
[representative-implementation-plan.md](references/representative-implementation-plan.md)
before implementing the five representative transitions. It records the
derived package behavior, the current QCut gap, and the preview/export
renderer boundary.

## Inspect structure first

Use the exact visible card title. Keep all IDs as strings:

```bash
SKILL_DIR="/absolute/path/to/jianying-transition-reference"

bun "$SKILL_DIR/scripts/inspect-transition.ts" categories
bun "$SKILL_DIR/scripts/inspect-transition.ts" inventory
bun "$SKILL_DIR/scripts/inspect-transition.ts" inspect --title "烟雾转场"
```

`inspect` joins cached catalog versions, plaintext draft evidence, outgoing
segment ownership, adjacent target ranges, duration quantization, and matching
effect packages. It deliberately reports multiple title/version/package
matches instead of choosing the first one.

Use repeatable `--database` and `--draft` options for copied evidence. Override
the standard roots with `--cache-root` and `--project-root`.

## Inspect draft ownership

Current `draft_info.json` can be encrypted base64. Scan plaintext backups and
subdrafts instead of attempting decryption:

```bash
bun "$SKILL_DIR/scripts/inspect-transition.ts" scan-drafts
bun "$SKILL_DIR/scripts/inspect-transition.ts" scan-drafts \
  --draft "/absolute/project/.backup/example.load.bak"
```

Require exactly one outgoing segment to reference the transition UUID through
`extra_material_refs`. Record the next segment and seam delta separately.
`is_overlap: true` does not prove that the two `target_timerange` values overlap.

## Classify the renderer

Prefer the package path stored in the draft. Fall back to the identity tuple
`resource_id + draft effect_id + metadata md5`:

```bash
bun "$SKILL_DIR/scripts/inspect-transition.ts" classify-package \
  --path "/absolute/path/to/Cache/effect/<id>/<md5>"

bun "$SKILL_DIR/scripts/inspect-transition.ts" classify-package \
  --resource-id "6724845717472416269" \
  --metadata-md5 "33d3a1ad16e89a4e2c9b6d45e3ec7aa1"
```

The report identifies simple GLSL, Lua pipelines, Lumi/AE graphs, ThreeJS,
sequence composites, or opaque node graphs. It also reports dual inputs,
normalized progress, output render targets, internal easing, and mathematical
signals. Derive the actual formula from the named shader/script; do not infer
it from the card title.

## Prove parity

Capture Jianying and QCut at normalized progress `0, .25, .5, .75, 1` using
the calibration protocol. Then run:

```bash
bun "$SKILL_DIR/scripts/inspect-transition.ts" parity-report \
  --title "叠化" \
  --manifest "/absolute/path/to/parity-manifest.json" \
  --formula "C(p) = (1 - p) A + p B"
```

The report keeps catalog, draft, package, formula, QCut preview error, QCut
export error, ambiguity, and confidence separate. `high` requires all five
preview and export samples, complete structural evidence, no unresolved
identity ambiguity, and worst RGB RMSE at or below 8/255.

## Reproduce in QCut

Work in this order:

1. `叠化`: verify the linear mix and the transition timing contract.
2. `左移` / `右移`: preserve package-local easing; do not add global easing.
3. `翻页`: validate coordinate mapping and edge treatment.
4. `横移模糊`: separate motion, crop, blur, exposure, and curve stages.
5. `立方旋转`: use it to define the 3D implementation boundary.

Analyze sequence-based effects, but do not copy Jianying textures, scripts,
shaders, databases, or cached packages into QCut. Reimplement observed behavior
with original code and QCut-owned or separately licensed assets. Jianying
`free`/`VIP` metadata is product access state, not a redistribution license.

## Required output

For each researched transition, retain:

- exact title, category, card/version timestamp, resource ID, catalog effect ID,
  draft effect ID, MD5, and package mirror paths;
- transition UUID, owner segment, next segment, seam delta, overlap flag,
  package default duration, applied microseconds, FPS, and frame quantization;
- renderer family, input/progress/output protocol, internal easing, formula,
  parameter mapping, and unresolved black boxes;
- five-stop captures, preview/export metrics, confidence, and explicit reasons;
- QCut implementation scope, tests, unsupported behavior, and asset provenance.
