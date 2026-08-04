# JianYing and QCut Bidirectional Draft Implementation Plan

<!-- markdownlint-disable MD013 -->

**Status:** Implementation design; not all work below exists yet  
**Date:** 2026-08-04  
**Last verified revision:** `ab384a5bc`

**Dependencies:** [Verified JianYing Timeline Track Rules](./timeline-track-rules.en.md), [QCut Timeline Rule Gap Analysis](./qcut-timeline-rule-gap-analysis.en.md)

## Implementation Progress

| Subtask | Status | Completed | Notes |
| --- | --- | --- | --- |
| JYI-001 Interop/capability/issues | ✅ Done | 2026-08-04 | `packages/editor-core/src/draft-interop/{document,capability,issues}.ts` + `index.ts` subpath export; `DraftInteropDocumentV1` (integer-microsecond time base, fail-closed validating parser with precise JSON-pointer error paths), four-state capability (strictest-wins combine/aggregate plus the commit-gate table implemented row by row), 24 stable issue codes with exporter-style fingerprints (`\u001f`-separated, message excluded). Tests: [`draft-interop-document.test.ts`](../../../packages/editor-core/src/__tests__/draft-interop-document.test.ts) (11 cases: round-trip, nested paths, unknown-code rejection, aggregation, gate matrix, fingerprint stability) |
| JYI-002 Provenance/dirty-domains/envelope | ✅ Done | 2026-08-04 | `draft-interop/{provenance,dirty-domains,foreign-envelope}.ts`. Seven dirty domains + `evaluateUnknownSubtree` (preserve/drop/conflict: deleted owner → drop, structure or owned-domain edits → conflict; never silently keep or discard); provenance carries RESTRICTED `restrictedSourcePaths` with `redactProvenanceForEvidence` as the only outbound serialization (structural removal, bindings collapse to a count) and a fail-closed deep-walk `assertNoRestrictedProvenanceFields`; the envelope schema stores metadata only (bytes live behind the encrypted `payloadRef`, JYI-011) with deny-by-default sidecar admission — the hard-deny list (key store/.locked/logs/caches) beats any allowlist entry, and path traversal is rejected outright. Design decision: the envelope associates with the document by importId instead of embedding (inspect-only documents have no envelope; the encryption contract forbids inline bytes). Tests: [`draft-interop-envelope.test.ts`](../../../packages/editor-core/src/__tests__/draft-interop-envelope.test.ts) (26 cases: 10-row ownership matrix, 11 admission rows, persisted rejection, redacted serialization) |
| JYI-003 Profile registry/detection | ✅ Done | 2026-08-04 | `jianying-draft/profiles/{registry,plaintext-5-9,capcut-8-1,index}.ts` + `import/profile-detection.ts`. Profile contracts declare five per-operation levels (none/fixture/candidate/stable + realAppVerified); `isDraftProfileWritable` accepts only stable — both registered profiles (synthetic 5.9 = fixture-grade non-production, CapCut 8.1 = first production candidate) are currently non-writable. Detection weighs four independent signals (app metadata, schema/new_version, top-level key containment, file layout + plaintext classification); the 5.9 key set being a subset of 8.1's makes keys-only evidence inherently ambiguous — missing app metadata yields `ambiguous`, which never writes; encrypted content is terminal (JYR-002); a file name alone decides nothing. jianying-11 stays unregistered per the plan (no evidence, no entry). Tests: [`profile-detection.test.ts`](../../../packages/editor-core/src/__tests__/profile-detection.test.ts) (8 cases: exact×2 / ambiguous / unsupported / encrypted / name-only / registry constraints×2) |
| JYI-004 Raw graph parser | ✅ Done | 2026-08-04 | `jianying-draft/import/{raw-types,graph-reader,validation}.ts`. raw-types declares only the fields the reader needs (no full-coverage claim; unknown fields stay `unknown` and flow to the envelope). graph-reader indexes tracks/segments/material buckets in one pass with a JSON pointer per node; malformed subtrees are skipped and recorded as `DOCUMENT_MALFORMED` — nothing throws. validation emits stable issue codes: `REF_DUPLICATE_ID` (global across tracks/segments/materials), `REF_BROKEN` (dangling material_id/extra_material_refs), `TIME_RANGE_INVALID` (negative / zero-duration / non-integer microseconds), `TRACK_OVERLAP` (same-track half-open target overlap, reusing QTL-002 `rangesOverlap`), and `REF_CYCLE` (`detectDraftReferenceCycles` runs DFS over caller-provided draft-reference edges, one report per cycle — real compound child binding is gated on JYR-007, so edge extraction stays with the caller for now). The JYI-000 fixture need is met with our own output: `buildJianyingDraft` content, JSON round-tripped, feeds the parser with zero read issues and zero validation issues (writer↔reader self-consistency). Tests: [`raw-draft-graph.test.ts`](../../../packages/editor-core/src/__tests__/raw-draft-graph.test.ts) (12 cases: builder self-consistency / indexing / malformed pointers / duplicate id / dangling ref / time bounds×3 / overlap+adjacency / cycles×3) |
| JYI-005 Normalizer | ✅ Done | 2026-08-04 | `jianying-draft/import/{normalize,qcut-mapping}.ts`. normalize: raw graph → `DraftInteropDocumentV1`, deterministic (no clocks/randomness, semantic ids reuse raw ids), honest per-node capability — only the core media subset is exact; text/sticker/transition are a declared downgrade (`FEATURE_DOWNGRADED` warning, until JYI-016 mappers upgrade them); unknown buckets/track types are opaque (`FEATURE_OPAQUE`); dangling refs and missing target_timerange are blocked. extra_material_refs classify three ways: mechanical companion buckets (speeds/canvases/…) never degrade, mappable buckets (transitions/animations/fades) degrade to downgrade, unknown buckets to opaque. Original media paths are RESTRICTED — they never enter the document and return via the `restrictedSourcePathsByResourceId` side channel for provenance only; every semantic node emits a RawNodeBinding. Resources extract from the videos/audios buckets (with durationUs, status=pending until JYI-008 resolution). qcut-mapping: document → `QCutImportTimelinePlanV1` (pure data, seconds), Phase 1 maps only exact video/image/audio; everything else lands in `skipped` (with capability and reason), never silently dropped. Acceptance met: deterministic semantic snapshots for both the 5.9 and CapCut 8.1 fixtures (`__snapshots__/raw-draft-normalize.test.ts.snap`, no path leakage), and normalize output round-trips `parseDraftInteropDocumentV1`. Tests: [`raw-draft-normalize.test.ts`](../../../packages/editor-core/src/__tests__/raw-draft-normalize.test.ts) (11 cases) |
| JYI-006 Snapshot runtime | ✅ Done | 2026-08-04 | New package `packages/jianying-draft-import` (main-process/CLI only, zero writes), wired into workspaces/vitest/check-types. `discovery.ts`: realpath root + per-entry lstat, symlinks always skipped (a symlinked content file never becomes a candidate), denied directories (logs/caches/recycle bin) unscanned, depth ≤ 2, entries ≤ 4096, absolute paths never enter the manifest. `snapshot-reader.ts`: O_NOFOLLOW opens, BigIntStats size rejection before any byte is read (64 MiB/file, 256 MiB total defaults), hash-while-read, post-read fstat compare on dev/ino/size/mtimeNs — a mid-read swap surfaces as `SOURCE_FILE_CHANGED`; classification includes a NUL heuristic (binary content file → terminal `encrypted`); `verifyDraftSourceUnchanged` is the active-source gate plan/commit stages run (edit → CHANGED, delete → MISSING). `runtime-validation.ts`: fail-closed IPC/CLI allowlist (unknown keys, relative paths, `..`, NUL, oversized limits all rejected). Acceptance tests all pass: symlink (directory loop + content file + discovery-bypass direct read), TOCTOU/active-source change, per-file + total size limits, bounded reads, input allowlist. Tests: [`snapshot-runtime.test.ts`](../../../packages/jianying-draft-import/src/__tests__/snapshot-runtime.test.ts) (15 cases). Note: real JianYing directory-layout assumptions remain JYR-001 evidence scope |
| JYI-007 Plan artifact + store | ✅ Done | 2026-08-04 | `jianying-draft-import/src/{import-plan-artifact,import-plan-store}.ts`, mirroring the exporter's `TrustedJianyingDraftExportSessionCore` contract. Artifact (V1, persistable): random 32-byte token, TTL (5 min default / 24 h cap), buildIdentity binding (appVersion + interop schemaVersion), requestFingerprint (hash over source identities dev/ino/size/mtimeNs + sha256 + profile + build), issueSetFingerprint (severity + `\u001e` separator, `\u001d` join — isomorphic to the exporter's), warning/blocker fingerprints split, `canCommit = exact AND zero blockers`. RESTRICTED split: the absolute root path lives apart from loggable fields and `redactImportPlanArtifactForLog` removes it structurally (not blanked) — the only shape allowed near logs/CLI/evidence; the clock is an injected parameter so artifacts are fully deterministic. Store (private, main-process only): single-shot CAS consume, replays and concurrent consumers all get `ImportPlanConsumedError`, expiry deletes with no resurrection, build/schema mismatch refuses fail-closed and evicts, bounded capacity (consumed evicted first; a full store of live plans refuses instead of silently evicting), duplicate tokens rejected. Tests: [`import-plan.test.ts`](../../../packages/jianying-draft-import/src/__tests__/import-plan.test.ts) (11 cases: fingerprint split / determinism / TTL bounds / log redaction / expiry+build+schema mismatch / CAS / 3-way race / TTL deletion / cross-build refusal / capacity policy / duplicate tokens) |
| JYI-009 Import bundle | ✅ Done | 2026-08-04 | `editor-core/draft-interop/import-bundle.ts` (shared schema, pure data, no node deps) + `jianying-draft-import/qcut-import-bundle-builder.ts`. One shared schema: `QCutImportBundleV1` packs document + timelinePlan + resourceStaging + `internalIdBySemanticId`; the live bridge and the offline inbox must both pass the same `parseQCutImportBundleV1` (fail-closed structural + cross-reference validation: staging may only reference document-declared resources, every plan node needs a deterministic internal id, every plan element must reference a staged resource, staging keys must not be path-like / contain traversal / NUL). Digest: editor-core defines the canonical serialization (recursive key sort + digest field zeroed placeholder); the runtime computes/verifies with node:crypto — a structurally valid but tampered bundle parses but its digest necessarily mismatches (tested). Deterministic internal ids: `deriveImportInternalId` seeds on the requestFingerprint (pure TS, reusing `createDeterministicJianyingId`); re-planning the same source under different tokens yields identical ids. Conflict policy: `projectName: rename|fail` (default rename); unknown policies rejected. Builder self-check: runs the same parser the renderer runs before handing anything out. Tests: [`import-bundle.test.ts`](../../../packages/jianying-draft-import/src/__tests__/import-bundle.test.ts) (10 cases; fixture runs the full builder→normalize→plan→artifact→bundle chain) |
| JYI-008 Asset resolver | ✅ Done | 2026-08-04 | `jianying-draft-import/src/asset-resolver.ts`. Five outcomes: resolved / relink-required / missing / ambiguous / license-restricted. Hash evidence always outranks a declared path: a hash-mismatching declared path is never silently adopted — it records a warning and falls into the name search, where exactly one hash-matching same-name candidate resolves (method=hash-search); with no expected hash, a unique name candidate resolves (name-search) and multiple candidates are ambiguous (`RESOURCE_AMBIGUOUS` error); a mismatch with no alternative is relink-required (user decision). Licensing action: app-resource/package resources get zero probes and zero copies — straight to license-restricted (`RESOURCE_LICENSE_RESTRICTED`, JYR-008 gate, fail-closed). All probing is bounded: O_NOFOLLOW, 4 GiB per-file hash cap, name search depth ≤ 2 / entries ≤ 4096 / symlinks refused, fixed worker pool (default 4, cap 8; injectable instrumentation verifies the peak). Resolved absolute paths are RESTRICTED output (provenance only). Tests: [`asset-resolver.test.ts`](../../../packages/jianying-draft-import/src/__tests__/asset-resolver.test.ts) (10 cases: declared-path hash match / hash outranks mismatch / relink / same-name ambiguity / unique name candidate / missing / license zero-probe / symlink candidate refusal / concurrency peak + order preservation / pool bounds) |
| JYI-010 Renderer storage transaction | ✅ Done | 2026-08-04 | `apps/web/src/lib/storage/{import-journal,import-staging-adapter,import-recovery}.ts` + `lib/jianying-draft/qcut-import-transaction.ts`. Journal: an intent record lands BEFORE any project data write (Electron→IndexedDB→localStorage probe chain; injectable adapter for tests), phase staging→published, removed only after verified publish. Staging session: media bytes and timelines land under a fresh id no project record points at; `publishProject` is the single visibility step (once-only, id-match check, post-write readback); rollback deletes exactly what the journal attributes to this import (media + both timeline DBs + project). Transaction: the renderer re-runs the same `parseQCutImportBundleV1` + byte-level WebCrypto digest verification (fail-closed without WebCrypto) → quota check → project identity (deterministically seeded on SOURCE file hashes, not the bundle digest — policy changes don't change identity; conflicts follow rename/fail) → journal begin → per-resource staging (a missing resolved payload refuses before any side effect) → track building (minimal MediaElement; playbackRate carries speed) → dual timeline write → `verifyStaged` re-read → publish last → readback → journal cleared; failures mid-staging/publish roll back fully. Recovery at startup: staging records roll back, published+readable completes bookkeeping, published+missing cleans remains, unrecoverable records persist to the next startup. Bundle `internalIdBySemanticId` extended to cover staged resources (builder + parser tightened together). Tests: [`import-transaction.test.ts`](../../../apps/web/src/lib/storage/__tests__/import-transaction.test.ts) (12 cases: full-chain publish ordering / deterministic project id / tampered digest zero-write / missing payload zero-write / staging-failure rollback / publish-failure rollback / rename+fail conflict policies / single publish / id-mismatch refusal / three recovery states) |
| JYI-011 Envelope key service | ✅ Done | 2026-08-04 | `electron/jianying-envelope-key-{contract,handler}.ts` + preload/main.ts/both-side type wiring + renderer adapter [`envelope-key-adapter.ts`](../../../apps/web/src/lib/jianying-draft/envelope-key-adapter.ts). Key architecture: a random 32-byte data key per envelope → AES-256-GCM over the payload (iv‖authTag‖ciphertext at `userData/jianying-import/envelopes/<importId>.bin`, dir 0o700 / file 0o600) → the data key wrapped by safeStorage (OS keychain) and stored base64 in the key store (0o600). **Plaintext never lands on disk**: keychain unavailable → `keychain-unavailable`, fail-closed (unlike the api-keys plaintext degradation) with zero bytes written. All six channels (store/read/delete/purge/rotate/status) run `assertTrustedMainFrame` (iframes/non-main windows refused), importId allowlisted to `[A-Za-z0-9_-]{1,128}` (path traversal impossible), 256 MiB payload cap, IPC never throws (bounded ErrorDto). GCM auth failure = `envelope-corrupt`; rotation re-wraps everything under a bumped keyVersion and DROPS (file included) any entry that no longer unwraps — never carried forward blind. The renderer adapter returns a typed `bridge-unavailable` when the bridge is missing; the renderer never touches key material. Tests: [`jianying-envelope-key-handler.test.ts`](../../../electron/__tests__/jianying-envelope-key-handler.test.ts) (11 cases: round-trip + no plaintext on disk / keychain-unavailable zero-write / not-found + invalid id / GCM tamper detection / trust boundary on all six channels / single delete / purge / rotation success / rotation drops broken entries / status / dispose) |
| JYI-012 – JYI-018 | ⬜ Not started | | JYI-012 (Electron/CLI transport) is next |
| JYR-001 – JYR-008 research gates | ⬜ Not run | | Need real-app experiments; they gate writable paths only, not the pure data layer |

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
  import-bundle.ts

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

### Runtime: constrained filesystem and import bundle

Add a package symmetric with the exporter:

```text
packages/jianying-draft-import/
  src/discovery.ts
  src/snapshot-reader.ts
  src/asset-resolver.ts
  src/import-session.ts
  src/import-plan-artifact.ts
  src/qcut-import-bundle-builder.ts
  src/runtime-validation.ts
  src/__tests__/
```

Only main process or CLI code may call this package. Reuse the exporter's absolute-path, realpath, symlink, TOCTOU, size-limit, and bounded-concurrency patterns. The package owns source snapshots, parsing, resource plans, and `QCutImportBundle`, but it **must not write QCut IndexedDB or OPFS directly**.

### Renderer: QCut storage transaction

The project registry may use the Electron storage adapter, but timelines, media metadata, and media bytes still use renderer-owned IndexedDB/OPFS adapters. A Node filesystem rename therefore cannot make the entire QCut project atomic. Add a renderer transaction boundary:

```text
apps/web/src/lib/jianying-draft/qcut-import-transaction.ts
apps/web/src/lib/storage/import-staging-adapter.ts
apps/web/src/lib/storage/import-journal.ts
apps/web/src/lib/storage/import-recovery.ts
```

The transaction accepts a validated `QCutImportBundle`, writes project, scene, timeline, media metadata, OPFS bytes, and the foreign envelope into an isolated namespace, rereads and verifies the result, then makes it visible through one registry publish. Minimal journal, rollback, and startup recovery ship with the first writable commit path, not in a later performance phase.

### Web and Electron integration

```text
electron/jianying-draft-import-contract.ts
electron/jianying-draft-import-handler.ts
electron/preload-types/api-types/jianying-draft-import-api.ts

apps/web/src/hooks/import/use-jianying-draft-import.ts
apps/web/src/components/import-dialog/jianying-draft-import-card.tsx

electron/native-pipeline/cli/command-registry-editor-jianying.ts
electron/native-pipeline/cli/cli-handlers-editor.ts
electron/jianying-draft-import-inbox.ts
```

The UI does not parse drafts. It displays profile, issues, resource decisions, estimated disk use, and commit results. The CLI does not implement a second storage path: while QCut is running, it sends the bundle over the Electron bridge; while QCut is closed, it may only write a validated desktop import inbox entry that QCut consumes through the same renderer transaction on next launch.

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

### Five profile operation capabilities

“Bidirectional support” is not a Boolean. Every profile declares these operations independently:

| Capability | Meaning |
| --- | --- |
| `inspect` | Safely identify and report without creating a QCut project |
| `import` | Commit the declared supported subset as an editable QCut project |
| `sameProfileWriteback` | Write QCut edits back to the same product and profile |
| `crossProfileExport` | Migrate to one explicit different target profile |
| `realAppVerified` | Hold target-version open/save/reopen/native-export receipts |

Source import, same-profile round trips, and cross-profile migrations have separate tests and release status. A synthetic fixture proves only internal parser/writer consistency; it is not a production profile and cannot satisfy `realAppVerified`.

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

Persist a versioned `ImportPlanArtifactV1` bound at minimum to `planId`, `importId`, creator, creation/expiry time, QCut build/schema, source snapshot manifest hash, profile evidence hash, mapper versions, warning fingerprints, and bundle digest. Store it only in private QCut app data by default; logs and CLI output redact source paths. Commit uses compare-and-swap plan state and rejects expired, consumed, changed-source, incompatible-build, or concurrently executing plans.

Deterministic IDs are scoped by `importId + source semantic ID`. Replaying the same plan is idempotent. Reimporting the same source requires an explicit `new-project | replace-existing | update-linked` policy instead of overwriting a project through a deterministic project-ID collision.

### Commit

Runtime commit freezes the plan, resolves resources, and produces a digest-bound `QCutImportBundle`. Renderer commit writes the bundle into an isolated IndexedDB/OPFS staging namespace, rereads and verifies media, metadata, timeline, project, and foreign envelope, and only then publishes the project registry entry. Failures roll staging back; renderer journal recovery resumes or rolls back after a crash.

### CLI

```bash
qcut editor draft inspect --source "/path/to/draft" --json
qcut editor draft import-plan --source "/path/to/draft" --profile auto --json
qcut editor draft import-commit --plan-id <id> --on-conflict new-project --accept-warning <fingerprint>
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

| Profile | Inspect | Import | Same-profile writeback | Cross-profile export | Real-app state |
| --- | --- | --- | --- | --- | --- |
| Synthetic plaintext 5.9 | Fixture | Parser/plan fixture | Internal consistency only | Existing writer base | Not a production profile |
| CapCut desktop 8.1 plaintext | First production candidate | First production candidate | Enable one verified subset at a time | Existing migration base | Each subset needs real receipts |
| JianYing 11.x newer format | Read-only first | Blocked without evidence | Blocked | Blocked | Unresolved/encrypted |

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

The envelope is private local project data. Encrypt retained payloads at rest
with an OS-backed project key and allow access only while the owning project is
open. Delete the envelope when the project or imported source is deleted, and
provide an explicit purge action. Exclude envelope bytes and provenance from
ordinary media export, cloud synchronization, backups, diagnostics, telemetry,
and support bundles; only a separate informed user action may export a redacted
compatibility bundle.

Define the key contract before the first implementation persists an envelope. The main process wraps a project data key through the platform keychain/credential vault; the renderer requests encryption or decryption over narrow IPC and never persists the plaintext key. The contract covers key version, rotation, project deletion, unavailable system credentials, cross-machine migration, and explicit user export. If a protected key is unavailable, explicitly downgrade to an import without an envelope or block round-trip support; never write the envelope as silent plaintext.

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

`storageService` currently writes project, timeline, media, and OPFS data separately. A production importer must not call these ordinary methods while parsing, and a Node package cannot manipulate browser storage directly. Add a renderer bulk staging transaction that writes an isolated namespace and exposes it with one project-registry commit. Node runtime only creates and validates bundles; the Electron bridge transports them with backpressure and owns no persistence semantics.

### Crash tests

Inject process exit after every checkpoint and verify existing projects remain unchanged, no partial project is visible, staging is recoverable or removable, retries preserve IDs and deduplicate assets, and logs avoid unnecessary sensitive source paths.

## 8. Research Gates and Open Evidence

The module boundaries and transaction model in this plan are QCut architecture decisions. JianYing profiles, file ownership, cross-file references, and render semantics cannot be implemented from field names or static strings alone. Research follows [`jianying-draft-binary-reference`](../../../.agents/skills/qcut-toolkit/jianying-draft-binary-reference/SKILL.md), including its evidence levels and safety boundary.

### Open questions

| ID | Uncertainty | Risk | Preferred evidence | Implementation gate |
| --- | --- | --- | --- | --- |
| JYR-001 | Save transaction file set, write order, temporary files, and rename boundary | A snapshot may combine files that never formed one real state | One open/edit/save/close in a disposable project with PID/path-class filesystem trace | Until verified, an active project directory is not a consistent import snapshot |
| JYR-002 | JianYing 11.x opaque/encrypted `draft_info.json` envelope | Misclassifying opaque bytes as writable JSON | Payload classification, existing plaintext backup/subdraft, and static owner evidence without defeating encryption | Inspect only; parse/write remain blocked without a lawful stable protocol |
| JYR-003 | Authoritative profile detection fields and sidecars | The wrong writer may open once but fail continued editing | Multi-version real corpus, app metadata, schema/key-set comparison, and static version gates as supporting evidence | Ambiguous detection disables automatic commit |
| JYR-004 | Equivalence between synthetic plaintext 5.9 and the real 5.9 app | Internal round trips may be mislabeled as product compatibility | Matching-version first-open/save/reopen/export receipt | Never mark stable without a real-app receipt |
| JYR-005 | Ownership between unknown subtrees, indexes, checksums, and material registries | A JSON patch may break cross-file references | Single-variable plaintext unknown sentinel plus semantic diff after real-app save | Unverified ownership domains block writes |
| JYR-006 | Sidecar allowlist required by `ForeignDraftEnvelope` | Copying key stores, private paths, unrelated backups, or proprietary caches | File-access trace, same-profile deletion experiments, and sensitivity review | Deny by default; unproven files do not enter the envelope |
| JYR-007 | Parent/subdraft/compound timeline ID binding, versions, and save ownership | A compound may parse but fail writeback after child edits | Create/open/edit/close one compound and compare parent/subdraft/backup | Compound remains opaque or blocked until verified |
| JYR-008 | Resolver priority among resource ID, metadata, hashes, and cache databases | Binding a same-name or same-ID wrong resource | Read-only catalog/cache joins, missing/relink behavior tests, and package hashes | Private resources without exact evidence remain opaque; never guess by basename |

### Evidence selection

- Prefer plaintext data diffs for time units, ID/reference graphs, track order, ownership candidates, and backup/subdraft structure.
- Prefer real-app black-box tests for insert/delete/ripple/replace/transition behavior, relinking, font fallback, save/reopen/export, and frame/audio oracles.
- Use static binary research to identify likely draft, subdraft, profile, validator, or key-store owners. Static hits reach only `static-strong`; they do not prove runtime calls.
- Use runtime file tracing only when file ownership or save ordering changes importer safety. Use a disposable project, one UI variable, and recorded app version, PID, time, and path classes.

### Private binary boundary

Launch the real JianYing app as a behavior and export oracle. Do not build the importer on a private dylib ABI or call `libvideoeditor.dylib`, `libVECreator.dylib`, or private crypto functions. Do not patch, inject, defeat encryption, or read/copy key stores. A linked or loaded library proves availability only; controlled file-access or call traces are needed to attribute one operation.

### First research sequence

1. JYR-001 save transaction: trace one empty and one single-clip open/edit/save/close.
2. JYR-007 subdraft: compare parent, subdraft, and backup around one compound edit.
3. JYR-005 unknown sentinel: preserve one unknown node and inspect fields, references, and cross-file derived data after real-app save.
4. JYR-003 profile corpus: freeze app/schema/layout/key-set fingerprints and real receipts for each candidate version.
5. JYR-008 resource relink: test present, moved, missing, and manually relinked cases for a font, LUT, native transition, and one private resource.

Every result is labeled `runtime-observed | static-strong | architecture-only | unresolved`, records alternative explanations, and names the next check. Only `runtime-observed` evidence, or plaintext structure plus a real-app round trip, may enter a stable writable profile contract.

## Delivery Phases

| Phase | Independently acceptable deliverable | Dependency | Rough duration |
| --- | --- | --- | ---: |
| 0 | Initial JYR-001/JYR-003 evidence; interop, capability/issues, provenance, dirty domains, envelope schema, and profile registry | Timeline command semantics | 1–2 weeks |
| 1 | Read-only inspect/parse/semantic plan for synthetic fixtures and a CapCut 8.1 candidate; persistent plan artifact with no commit | Phase 0 | 2–3 weeks |
| 2 | Resource resolver, QCutImportBundle, renderer staging transaction, minimal journal/rollback/recovery, and Electron/CLI transport | Phase 1 | 3–4 weeks |
| 3 | Production import for a declared CapCut 8.1 subset, QCut reload, and real-app/source-unchanged evidence | Phase 2 and profile research gates | 2–3 weeks |
| 4 | CapCut 8.1 same-profile writeback, unknown preservation, real-app save/reopen/native-export, and semantic/frame/audio gates | Phase 3 and JYR-005/JYR-006 | 3–5 weeks |
| 5 | Text, color, mask, keyframe, and transition mappers with independent capabilities and receipts | Phase 4 | 4–8 weeks |
| 6 | 10k segments, 100 GB assets, cache metrics, complete fault injection, recovery, and cross-version hardening | Phases 2–5 | 2–4 weeks |

One engineer working serially is roughly 4–6 months. Two engineers familiar with QCut and media formats may parallelize to roughly 2.5–4 months. Every phase after Phase 2 remains releasable from its predecessor; an unsafe writable path cannot defer journals or unknown preservation to later work. This excludes defeating newer encrypted formats; without lawful, stable evidence, those profiles remain read-only or blocked.

## Subtasks and File Paths

| ID | Subtask and primary files | Dependencies/research gates | Completion and verification |
| --- | --- | --- | --- |
| JYI-000 | Evidence corpus: `scripts/capcut-e2e/fixtures/` and private local evidence manifest | JYR-001, JYR-003 | Sanitized fixtures may enter Git; real-app evidence stores only versions, hashes, and redacted receipts |
| JYI-001 | Interop/capability: `draft-interop/{document,capability,issues}.ts` | Timeline command semantics | Schema round trip, four-state aggregation, and unknown issue-code tests |
| JYI-002 | Provenance/envelope: `draft-interop/{provenance,dirty-domains,foreign-envelope}.ts` | Deny-by-default contracts from JYR-005/JYR-006 | Ownership/dirty-domain matrix and sensitive serialization rejection tests |
| JYI-003 | Profile registry/detection: `jianying-draft/profiles/*`, `import/profile-detection.ts` | JYI-000, JYI-001 | Exact/ambiguous/unsupported/encrypted fixtures; ambiguous inputs disable writes |
| JYI-004 | Raw graph parser: `import/{raw-types,graph-reader,validation}.ts` | JYI-001, JYI-003 | Malformed, duplicate ID, dangling ref, cycle, and time-bound tests |
| JYI-005 | Normalizer: `import/{normalize,qcut-mapping}.ts` | JYI-002–004 | Deterministic semantic snapshots for synthetic 5.9 and sanitized CapCut 8.1 fixtures |
| JYI-006 | Snapshot runtime: `packages/jianying-draft-import/src/{discovery,snapshot-reader,runtime-validation}.ts` | JYR-001 | Symlink, TOCTOU, size-limit, active-source mutation, and bounded-read tests |
| JYI-007 | Plan artifact: `import-plan-artifact.ts` and private plan store | JYI-003–006 | TTL, build/schema mismatch, CAS consumption, replay/concurrency, and log-redaction tests |
| JYI-008 | Asset resolver: `asset-resolver.ts` | JYI-006, JYR-008 | Hash priority, same-name conflict, missing/relink, license action, and bounded-concurrency tests |
| JYI-009 | Import bundle: `draft-interop/import-bundle.ts`, `qcut-import-bundle-builder.ts`, package exports, workspace manifest/lockfile | JYI-005, JYI-007–008 | One shared schema, runtime validation, digest, deterministic internal IDs, and conflict-policy tests |
| JYI-010 | Renderer storage transaction: storage staging/journal/recovery and `qcut-import-transaction.ts` | JYI-009 | IndexedDB/OPFS staging, reread verification, one publish, rollback, and reload tests |
| JYI-011 | Envelope key service: Electron keychain IPC and renderer envelope adapter | JYI-002, JYI-010 | Unavailable key, rotation, delete, and purge tests; no plaintext envelope at rest |
| JYI-012 | Electron/CLI transport: import contract/handler/inbox and existing JianYing registry/editor handlers | JYI-007, JYI-009–011 | Live bridge and offline inbox share one bundle validator and no second persistence path |
| JYI-013 | Import UI: `use-jianying-draft-import.ts` and import dialog card | JYI-012 | Component tests for profile, issues, resources, conflicts, warnings, and recovery |
| JYI-014 | CapCut 8.1 production import | JYI-000–013 and profile JYR gates | Declared exact subset imports and reloads; source hashes remain unchanged; real receipts exist |
| JYI-015 | Same-profile writer/unknown patch | JYI-014, JYR-005–007 | Unknown sentinel, dirty-domain isolation, and open/save/reopen semantic diff |
| JYI-016 | Feature mapper registry | JYI-015 | Independent mapper, capability, and profile tests for text/color/mask/keyframe/transition |
| JYI-017 | Semantic/frame/audio E2E: `scripts/capcut-e2e/{semantic-diff,audio-comparison,roundtrip-case}.ts` | JYI-014–016 | Four outputs, profile thresholds, and hash-bound evidence manifest |
| JYI-018 | Scale/recovery hardening: benchmarks, fault injection, cache metrics | JYI-010, JYI-017 | Separate parser/mapping/persistence/renderer budgets and recovery at every checkpoint |

Each subtask defaults to its own PR or atomic commit group; it need not be compressed into one file. Shared schemas with their first consumer, package manifests with lockfiles, and inseparable implementations with tests may form the smallest multi-file commit. Never mix an unverified profile writer with the foundational model in one commit.

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
9. JYR-001, JYR-003, JYR-005, and every other gate used by the profile have reproducible evidence and do not rely on an unverified private ABI or encryption assumption.

## Explicit Non-Goals

- Do not defeat encryption, DRM, signatures, or paid-resource licensing.
- Do not commit JianYing binaries, cached resources, fonts, or reverse-engineering artifacts.
- Do not guess writable output for unknown versions.
- Do not promise byte-identical JSON. Promise declared semantic equivalence and preservation of unconsumed unknown domains.
- Do not duplicate QCut timeline editing rules inside the importer; editing continues through the shared QCut command layer.

## Definition of Done

Base bidirectional support requires at least one real-app-verified production profile with import and same-profile writeback. A second profile must reach stable inspect/import or remain explicitly read-only. The production importer uses a recoverable renderer transaction, content-addressed resource rebinding, encrypted `ForeignDraftEnvelope`, and shared CLI/UI plan and commit. Real-app save/reopen/native-export plus structural, frame, and audio verification have hash-bound receipts. Every non-lossless feature is explicitly surfaced as `downgrade`, `opaque`, or `blocked` rather than silently discarded.

Two stable writable profiles are a later cross-profile compatibility milestone; they do not block safe import support for one verified profile from shipping independently.
