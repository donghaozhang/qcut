# JianYing and QCut Bidirectional Draft Implementation Plan

<!-- markdownlint-disable MD013 -->

**Status:** Implementation design; not all work below exists yet  
**Date:** 2026-08-04  
**Baseline branch:** `codex/transition-v2`  
**Dependencies:** [Verified JianYing Timeline Track Rules](./timeline-track-rules.en.md), [QCut Timeline Rule Gap Analysis](./qcut-timeline-rule-gap-analysis.en.md)

## Objective

Build a maintainable bidirectional path:

```text
JianYing/CapCut draft
  -> safe read-only discovery
  -> version-profile detection
  -> raw reference-graph parsing
  -> semantic interchange model
  -> asset and resource rebinding plan
  -> atomic QCut import
  -> QCut editing
  -> profile-driven export
  -> JianYing/CapCut open, save, and export
  -> structural and audiovisual verification
```

Success is not “the JSON parses” or “CapCut opens the folder.” Within a declared support set, projects must round-trip, remain editable, preserve unknown data without silent corruption, and keep QCut and JianYing exports within explicit visual and audio tolerances.

## Current Foundation and Gaps

### Existing foundation

- [`QCutDraftExportSnapshotV1`](../../../packages/editor-core/src/jianying-draft/types.ts) converts renderer state into a serializable export snapshot.
- [`buildJianyingDraft()`](../../../packages/editor-core/src/jianying-draft/build.ts) supports a synthetic plaintext 5.9 baseline and derives `canWrite` from issue severity.
- [`buildCapCut81Draft()`](../../../packages/editor-core/src/jianying-draft/capcut-8-1-build.ts) has a CapCut 8.1 profile with LUT, static-mask, font, and native-dissolve handling.
- [`StandaloneJianyingDraftExportSession`](../../../packages/jianying-draft-export/src/export-session.ts) already uses a trusted two-phase `plan → commit` writer.
- [`writer.ts`](../../../packages/jianying-draft-export/src/writer.ts) provides path checks, media probing, hashing, staging directories, and atomic rename.
- [`scripts/capcut-e2e/`](../../../scripts/capcut-e2e) contains controlled assets, draft installation, real-app reopen/save, visual oracles, and hash-bound evidence.
- [`storage-service.ts`](../../../apps/web/src/lib/storage/storage-service.ts) stores projects, scenes, timelines, media metadata, and OPFS media bytes.

### Current gaps

- The repository has no production JianYing/CapCut-to-QCut importer.
- The export snapshot is one-way; it cannot retain source provenance and unknown fields for a round trip.
- Profiles focus on 5.9 and CapCut 8.1 output and do not share one detection/migration registry.
- Asset staging is export-oriented and has no import-side rebinding, deduplication, licensing, or missing-resource policy.
- Complex text, color, masks, keyframes, and transitions still produce many blocking or warning mappings.
- The visual E2E framework exists, but many GUI preview/reopen/export checks remain `unverified`.
- QCut project storage lacks a complete import journal, checkpoints, and startup recovery protocol.

## Architecture Principles

1. **Separate parsing from writes.** `inspect` is read-only, `plan` is deterministic, and only `commit` may create a QCut project or target draft.
2. **Separate semantics from the raw format.** QCut timeline types must not absorb every unknown JianYing field, and raw evidence must not leak into editor-domain types.
3. **Use strict profiles.** Uncertain detection may be inspected but must not enable writable round trips.
4. **Use four capability states:** exact, downgrade, opaque, and blocked.
5. **Give unknown fields ownership.** Preserve them only while relevant parent domains remain unchanged; structural changes require revalidation or a blocked write.
6. **Resolve proprietary resources locally.** JianYing binaries, cache packages, bundled fonts, and proprietary assets never enter Git or release bundles by default.
7. **Share commands across UI, CLI, and AI.** UI presents plan/commit state; it does not duplicate parser or migration logic.
8. **Make every phase recoverable, retryable, and idempotent.** A crash cannot expose half a QCut project or mutate an existing JianYing draft.

## Proposed Module Boundaries

### Core: pure data and pure functions

Keep `packages/editor-core/src/jianying-draft/` as the mapping core and add:

```text
packages/editor-core/src/draft-interop/
  document.ts
  capability.ts
  provenance.ts
  dirty-domains.ts
  issues.ts

packages/editor-core/src/jianying-draft/import/
  raw-types.ts
  profile-detection.ts
  graph-reader.ts
  normalize.ts
  qcut-mapping.ts
  validation.ts

packages/editor-core/src/jianying-draft/profiles/
  registry.ts
  plaintext-5-9.ts
  capcut-8-1.ts
  jianying-11-readonly.ts
```

Core never reads user directories, calls Electron, creates Blobs, or scans JianYing caches.

### Runtime: constrained filesystem and transactions

Add a package symmetric with the exporter:

```text
packages/jianying-draft-import/
  src/discovery.ts
  src/snapshot-reader.ts
  src/asset-resolver.ts
  src/import-session.ts
  src/import-journal.ts
  src/project-writer.ts
  src/runtime-validation.ts
  src/__tests__/
```

Only main process or CLI code may call this package. Reuse the exporter's absolute-path, realpath, symlink, TOCTOU, size-limit, and bounded-concurrency patterns.

### Web and Electron integration

```text
electron/jianying-draft-import-contract.ts
electron/jianying-draft-import-handler.ts
electron/preload-types/api-types/jianying-draft-import-api.ts

apps/web/src/hooks/import/use-jianying-draft-import.ts
apps/web/src/components/import-dialog/jianying-draft-import-card.tsx
apps/web/src/lib/jianying-draft/qcut-import-commit.ts

electron/native-pipeline/cli/command-registry-editor-draft.ts
electron/native-pipeline/cli/cli-handlers-editor-draft.ts
```

The UI does not parse drafts. It displays profile, issues, resource decisions, estimated disk use, and commit results.

## Bidirectional Semantic Interchange

### DraftInteropDocumentV1

Introduce an interchange model rather than mapping raw JianYing JSON directly into `TimelineTrack[]`:

```ts
interface DraftInteropDocumentV1 {
  schemaVersion: 1;
  source: DraftSourceDescriptor;
  project: InteropProject;
  timelines: InteropTimeline[];
  resources: InteropResource[];
  links: InteropLink[];
  foreignEnvelope: ForeignDraftEnvelope;
  issues: InteropIssue[];
}
```

Important fields:

- `source`: product, profile, app/schema version, platform, file inventory, and hashes.
- `timelines`: tracks, clips, source/target ranges, layering, transitions, and child timelines.
- `resources`: video, audio, images, fonts, LUTs, filters, effects, transition packages, and resolution state.
- `links`: audio/video, caption ownership, effect targets, groups, compounds, and semantic-scene links.
- `foreignEnvelope`: raw documents and node bindings stored only with the local project.
- `issues`: stable machine-readable codes independent from UI wording.

### Four capability states

| State | Meaning | Automatic commit |
| --- | --- | --- |
| `exact` | QCut can edit and write the feature losslessly for the target profile | Yes |
| `downgrade` | A declared static or approximate result is available | Only after warning acceptance |
| `opaque` | QCut does not edit the node but preserves its raw representation and references | Only for the same profile while unchanged |
| `blocked` | The feature cannot be expressed or verified safely | No |

Assign capability per track, clip, companion material, and resource rather than giving the whole project one vague score.

## 1. Production Importer

### Pipeline

```text
discover
  -> snapshot immutable files
  -> detect profile
  -> parse bounded JSON/binary envelope
  -> validate graph references
  -> normalize semantic document
  -> build resource-resolution plan
  -> build QCut import plan
  -> accept warnings and mappings
  -> commit to staging project
  -> verify persisted project
  -> publish project atomically
```

### Inspect

Inspect returns profile candidates, file size/mtime/identity/hash, timeline and material counts, broken references, duplicate IDs, invalid ranges, unknown buckets, required disk space, missing resources, capability counts, and encrypted or unverifiable inputs. It writes no QCut storage, creates no media Blob, and never changes the source draft.

### Plan

A plan is bound to every inspected input hash. Any source change invalidates it. It contains deterministic QCut project/scene/timeline/element IDs, source-to-QCut ID mappings, resource actions, downgrade warning fingerprints, blocked reasons, checkpoints, and disk estimates.

### Commit

Commit writes `staging/<importId>/`, then rereads and validates media, metadata, timeline, project, and the foreign envelope. The project becomes visible only after verification. Ordinary failures remove staging; crashes are resumed or rolled back from the journal on the next launch.

### CLI

```bash
qcut editor draft inspect --source "/path/to/draft" --json
qcut editor draft import-plan --source "/path/to/draft" --profile auto --json
qcut editor draft import-commit --plan-id <id> --accept-warning <fingerprint>
qcut editor draft roundtrip-verify --project <qcut-project-id> --target capcut-8.1
```

`--profile auto` proceeds only when one profile is proven. Ambiguous inputs require an explicit profile and never choose a “closest” version.

## 2. Profiles and Migration

### Profile contract

Each profile declares its ID, product, platform and version range; required/optional/forbidden files; top-level/config/material/keyframe buckets; time units and coordinates; track order and main-track rules; resource paths; read/write/round-trip capabilities; unknown-field policy; and fixture/real-app evidence version.

### Detection

Use app metadata, schema version, key sets, mirror-file layout, timeline registry, and path patterns. Detection returns `exact | ambiguous | unsupported | encrypted`; filenames alone are not evidence.

### Migration

```text
source raw
  -> source-profile parser
  -> DraftInteropDocumentV1
  -> QCut schema migrations
  -> target-profile writer
```

Do not build a web of direct `5.9 JSON -> 8.1 JSON` converters. Versions meet in the semantic model; only non-semantic opaque nodes remain in the foreign envelope.

### Initial matrix

| Profile | Import | Export | Round trip |
| --- | --- | --- | --- |
| Synthetic plaintext 5.9 | First production importer | Existing base | Exact subset |
| CapCut desktop 8.1 plaintext | Second phase | Existing migration base | Verified subset |
| JianYing 11.x newer format | Inspect/read-only first | No guessed writes | Blocked without evidence |

Every new profile requires sanitized golden fixtures, runtime validation, migration tests, and real-app open/save/reopen/export receipts.

## 3. Media, Fonts, and Package Rebinding

### ResourceResolutionPlan

Every resource receives one action:

```text
copy        copy into QCut content-addressed project storage
link        external reference only when explicitly selected and supported
transcode   make a proxy/intermediate for an unsupported decoder
resolve     locate a local package by resource ID and metadata
fallback    use a user-accepted static or replacement result
missing     block or create an explicit placeholder based on capability
```

### Content addressing

Deduplicate legally copyable assets by `sha256 + byteLength + probe signature`. Original paths are provenance, not cache keys. Renamed identical files can reuse data; same-name different files cannot collide.

### Resolution priority

1. Existing source path with matching file identity and hash.
2. Portable draft asset path and manifest.
3. Exact resource ID plus package metadata/hash.
4. Persisted user relink mapping.
5. Interactive selection.
6. Missing or downgraded.

Never auto-bind by basename alone; ambiguous candidates require a decision.

### Fonts

Persist requested family/PostScript name, source hash, glyph coverage, and source profile. Reuse `font-glyph-coverage.ts` for cmap preflight. Do not copy system or app-bundled fonts by default; store local bindings. Copy only user-licensed project fonts. Missing glyphs block exact mapping unless a fallback warning is accepted.

### Filters, effects, transitions, and binary packages

- Proprietary package resolvers stay in local runtime/skills, not editor-core fixtures.
- Git stores metadata schemas, hashes, and synthetic fixtures only.
- Provenance includes resource ID, effect ID, metadata MD5, and package hash.
- A package QCut cannot render is `opaque`; editing its time, target, or parameters triggers re-evaluation to `blocked` or an explicit bake/downgrade.

## 4. Complex Feature Mapping

### FeatureMapperRegistry

Register mappers by `featureKind + sourceProfile + targetProfile`:

```text
text.style
text.animation
color.basic
color.curves
color.lut
mask.static
mask.keyframes
media.keyframes
transition.native
transition.proprietary
```

Each mapper returns mapped value, capability, issues, consumed foreign paths, and test-evidence IDs.

### Delivery order

1. Base media timing, transform, opacity, and audio volume.
2. Plain text/captions, font, stroke, shadow, and background.
3. Basic color and LUT.
4. Static rectangle/ellipse masks.
5. Transform/opacity/audio keyframes.
6. Native dissolve and verified native transitions.
7. Curves, animated masks, text animation, and proprietary transitions.

### Mapping rules

- Exact mapping requires numeric bounds, coordinate conversion, and round-trip tests.
- Downgrade explains the visible difference, such as baking animated text to transparent video.
- Opaque nodes may remain attached or move with their parent but are not presented as editable parameters.
- Blocked data cannot be silently deleted to continue writing.
- Preview and export use the same normalized mapper or resolved plan.

## 5. Frame and Audio Parity

### Four-way comparison

Each fixture produces QCut preview capture, QCut native export, JianYing/CapCut preview capture, and JianYing/CapCut native export. Native exports are the primary oracle. GUI previews use a separate threshold because display color management and scaling can differ.

### Samples

Sample each clip boundary, each transition before/middle/after, each keyframe before/exact/after, subtitle appearance boundaries, seeded random interval frames, first/last frame, and the longest stable interval.

### Metrics

- RGB: existing RMSE, MAE, p95, and max.
- Alpha: transparent-pixel ratio and edge-region error.
- Geometry: ROI bounds and landmark displacement.
- Temporal: boundary-frame offset and realized transition window.
- Audio: duration, peak, loudness, channels, silence regions, and test-tone spectrum.

Thresholds are feature/profile-specific. Evidence manifests bind source draft, assets, fonts, app version, FFmpeg/FFprobe versions, export settings, and output SHA-256.

### Extend the existing harness

Extend [`scripts/capcut-e2e/`](../../../scripts/capcut-e2e) instead of creating another system:

```text
scripts/capcut-e2e/roundtrip-case.ts
scripts/capcut-e2e/qcut-import-verification.ts
scripts/capcut-e2e/semantic-diff.ts
scripts/capcut-e2e/audio-comparison.ts
scripts/__tests__/capcut-e2e-roundtrip-*.test.ts
```

## 6. Unknown Fields and Lossless Round Trips

### ForeignDraftEnvelope

Store raw bytes or a safe compressed copy and SHA-256, profile evidence, raw-node/JSON-pointer bindings to semantic IDs, unknown-subtree parent/ownership/reference data, dirty domains, and accepted downgrade fingerprints.

### Dirty domains

At minimum:

```text
timing
geometry
style
resource
linkage
structure
metadata
```

Renaming a clip should not destroy an unknown filter. Deleting a clip must remove its opaque companion references. A compound-structure edit blocks unknown child-timeline data unless safety can be proven.

### Write-back policy

1. Unchanged, same profile: patch known fields and preserve unconsumed subtrees.
2. Changed without ownership conflict: rebuild known domains and preserve other domains.
3. Ownership conflict: require downgrade or block.
4. Cross profile: opaque data is nonportable unless an explicit mapper exists.

Parsing and stringifying the whole JSON is not a lossless strategy. Whitespace and key order are secondary; unknown values, references, IDs, and ownership must survive.

### Round-trip tests

- Raw → interop → same-profile raw with unknown sentinels and reference-graph checks.
- JianYing → QCut → JianYing semantic equivalence in supported domains.
- QCut → JianYing → QCut with no supported-domain drift.
- Modify one QCut dirty domain and prove unrelated unknown subtrees survive.
- Open/save/close in the real app, then reimport and recover profile/bindings.

## 7. Large Projects, Cache, and Crash Recovery

### Initial scale budget

| Metric | Baseline target |
| --- | ---: |
| Timelines | 10 |
| Tracks | 200 |
| Segments | 10,000 |
| Material references | 100,000 |
| Media files | 5,000 |
| Source bytes | 100 GB |
| Inspect peak memory | Under 1 GB |

These are engineering budgets, not current guarantees. Profiles may enforce lower explicit limits but may not hang the renderer.

### Performance strategy

- Use bounded concurrency for inventory and hashes.
- Stream hashes and copies for large media.
- Initially allow bounded whole-file JSON parsing; block oversized JSON explicitly before adding a streaming parser.
- Index references once with `Map`/`Set`; never rescan all materials inside a segment loop.
- Content-address preview proxies, thumbnails, waveforms, font coverage, and package inspection.
- Include source hash, profile, mapper version, toolchain, and render settings in cache keys.
- Serialize import plans for restart recovery.

### Journal checkpoints

```text
DISCOVERED
SNAPSHOT_VERIFIED
PROFILE_LOCKED
PARSED
ASSETS_STAGED
PROJECT_WRITTEN
PROJECT_VERIFIED
PUBLISHED
```

Each checkpoint records input hashes, output inventory, and reversible actions. Startup recovery resumes unchanged complete staging, invalidates changed sources, verifies or rolls back unpublished projects, and finalizes completed journals.

### Atomicity

`storageService` currently writes project, timeline, media, and OPFS data separately. A production importer must not call these ordinary methods while parsing. Add a bulk staging writer that writes an isolated namespace and exposes it with one project-registry commit.

### Crash tests

Inject process exit after every checkpoint and verify existing projects remain unchanged, no partial project is visible, staging is recoverable or removable, retries preserve IDs and deduplicate assets, and logs avoid unnecessary sensitive source paths.

## Delivery Phases

| Phase | Deliverable | Dependency | Rough duration |
| --- | --- | --- | ---: |
| 0 | Interop model, capability/issues, profile registry | Timeline command semantics | 1–2 weeks |
| 1 | 5.9 inspect, parse, and semantic plan without commit | Phase 0 | 2 weeks |
| 2 | Asset resolver, staging commit, CLI/UI import | Phase 1 | 2–3 weeks |
| 3 | CapCut 8.1 import/migration and base round trip | Phase 2 | 3–4 weeks |
| 4 | Text, color, mask, keyframe, and transition expansion | Phase 3 | 4–8 weeks |
| 5 | Unknown preservation, real-app save/reopen, visual/audio gates | Phases 3–4 | 3–5 weeks |
| 6 | 10k-segment performance, journal, crash recovery | Phases 2–5 | 2–4 weeks |

One engineer working serially is roughly 4–6 months. Two engineers familiar with QCut and media formats may parallelize to roughly 2.5–4 months. This excludes defeating newer encrypted formats; without lawful, stable evidence, those profiles remain read-only or blocked.

## Subtasks and File Paths

| ID | Subtask | Minimum file group |
| --- | --- | --- |
| JYI-001 | Interop model and capability | `packages/editor-core/src/draft-interop/*` plus unit tests |
| JYI-002 | Profile registry/detection | `jianying-draft/profiles/*`, `import/profile-detection.ts` |
| JYI-003 | Raw graph parser/validator | `raw-types.ts`, `graph-reader.ts`, `validation.ts` |
| JYI-004 | 5.9 normalizer | `import/normalize.ts` plus sanitized golden fixtures |
| JYI-005 | Import runtime/session | `packages/jianying-draft-import/src/import-session.ts` and runtime validation |
| JYI-006 | Asset resolver | `asset-resolver.ts`, probe/hash/copy tests |
| JYI-007 | QCut staging writer | `project-writer.ts`, new bulk transaction API in `storage-service.ts` |
| JYI-008 | Electron/CLI contract | import IPC, preload types, `command-registry-editor-draft.ts` |
| JYI-009 | Import UI | `use-jianying-draft-import.ts`, import dialog card |
| JYI-010 | Foreign envelope/dirty domains | interop provenance plus project serialization/migration |
| JYI-011 | Complex feature registry | text/color/mask/keyframe/transition mappers and profile tests |
| JYI-012 | Round-trip semantic diff | `scripts/capcut-e2e/semantic-diff.ts` and fixtures |
| JYI-013 | Visual/audio parity | existing visual-oracle extensions and audio comparator |
| JYI-014 | Journal/recovery | `import-journal.ts`, startup recovery, fault-injection tests |
| JYI-015 | Scale/performance | 10k-segment fixture, benchmarks, and cache metrics |

Default to one atomic commit per subtask. Shared types with their first consumer, package manifest with lockfile, or inseparable implementation/tests may form one minimal multi-file commit.

## Test Matrix

Every stable profile covers malformed/oversized/path-traversal/symlink/TOCTOU inputs; duplicate IDs, dangling refs, child-timeline cycles, and invalid ranges; missing assets, ambiguous same-name candidates, hash mismatch, missing glyphs, and packages; all four capability states; expired plans, unaccepted warnings, and commit replay; QCut persistence reload; same-profile structural round trip; real-app first-open/save/reopen/native export; frame/audio comparison; large fixtures; and crash recovery at every checkpoint.

## Release Gates

A profile is stable only when:

1. Detection has no ambiguous fixture.
2. Every blocked feature has a stable issue code.
3. Unknown-sentinel round trips pass.
4. Real-app first-open/save/reopen passes.
5. Supported visual/audio thresholds pass.
6. Hashes of non-current user drafts remain unchanged.
7. Fault injection leaves no partial projects.
8. Proprietary-resource scanning confirms nothing entered Git, release bundles, or test artifacts.

## Explicit Non-Goals

- Do not defeat encryption, DRM, signatures, or paid-resource licensing.
- Do not commit JianYing binaries, cached resources, fonts, or reverse-engineering artifacts.
- Do not guess writable output for unknown versions.
- Do not promise byte-identical JSON. Promise declared semantic equivalence and preservation of unconsumed unknown domains.
- Do not duplicate QCut timeline editing rules inside the importer; editing continues through the shared QCut command layer.

## Definition of Done

Base bidirectional support requires two stable profiles, one production importer, recoverable atomic commit, content-addressed resource rebinding, a foreign envelope, shared CLI/UI plan and commit, real-app save/reopen evidence, and structural, frame, and audio verification. Every non-lossless feature must be explicitly surfaced as downgrade, opaque, or blocked rather than silently discarded.
