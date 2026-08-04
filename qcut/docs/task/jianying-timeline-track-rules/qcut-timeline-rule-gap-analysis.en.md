# QCut Timeline Rule Gap Analysis and Repair Plan

<!-- markdownlint-disable MD013 -->

**Status:** Audit baseline + implementation in progress (see progress table)  
**Audited on:** 2026-08-04  
**Audited branch:** `codex/transition-v2`  
**Reference rules:** [Verified JianYing Timeline Track Rules](./timeline-track-rules.en.md)

## Implementation Progress

| Task | Status | Completed | Notes |
| --- | --- | --- | --- |
| QTL-001 Centralize command guards and lock enforcement | ✅ Done | 2026-08-04 | Pure preflight + every entry point wired + 26-case matrix test; also fixes the `replaceElementMedia` stale-snapshot write-back |
| QTL-002 Shared Collision Engine | ✅ Done | 2026-08-04 | Pure interval math in `collision-policy.ts` + explicit `reject\|insert\|overwrite` parameter; deleteTimeRange and add-with-overwrite share one trim/split implementation; replace concurrency regression test |
| QTL-003 Ripple Domains and typed Links | ✅ Done | 2026-08-04 | `ripple-plan.ts`: typed links derived from groupId (video-audio/group) + ripple-domain resolution; unrelated tracks no longer shift; a locked dependency blocks the whole command |
| QTL-004 Transaction history | ⬜ Not started | | |
| QTL-005 – QTL-012 | ⬜ Not started | | |

## Conclusion

This audit decomposes the JianYing research baseline into **50 independently testable timeline rules** and checks each rule against QCut's current code and tests:

| Status | Count | Share |
| --- | ---: | ---: |
| Complete | 36 | 72% |
| Partial | 7 | 14% |
| Missing | 7 | 14% |
| **Requires repair or implementation** | **14** | **28%** |

The audit baseline identified 19 of 50 rules needing changes; with QTL-001 through QTL-003 done, **QCut still needs code changes for 14 of the 50 timeline rules** — seven with useful foundations but incomplete contracts, seven without a first-class model or command.

QCut's foundation is stronger than the gap count may suggest. It already has typed tracks, explicit main-track identity, visibility, mute, ordering, canonical composition, grouping, compound containers, transitions, and ripple operations. The largest gap is the operation-semantics layer: locks are not enforced by every entry point, insert/overwrite/replace do not share a collision engine, main-track magnetism is not separate from snapping and ripple, relationships still rely heavily on generic `groupId`, and undo stores only track arrays.

## Scoring Method

| Class | Definition |
| --- | --- |
| Complete | A clear data contract and callable command exist, with tests covering the core invariant |
| Partial | A UI path works, but Store, CLI, async, persistence, or boundary behavior is inconsistent |
| Missing | No first-class model or command exists, or callers must assemble the behavior ad hoc |

“Requires repair or implementation” is the sum of Partial and Missing. The denominator covers timeline behavior only. It does not include asset-catalog size, filter count, visual transition similarity, or full JianYing draft-export parity.

## Domain Totals

| Domain | Atomic rules | Complete | Partial | Missing | Needs work |
| --- | ---: | ---: | ---: | ---: | ---: |
| Track types and operations | 7 | 6 | 0 | 1 | 1 |
| Layering and rendering | 5 | 4 | 1 | 0 | 1 |
| Insert, overwrite, and replace | 5 | 4 | 1 | 0 | 1 |
| Ripple and main-track magnetism | 5 | 4 | 0 | 1 | 1 |
| Trim modes | 5 | 4 | 0 | 1 | 1 |
| Snapping | 5 | 3 | 0 | 2 | 2 |
| Links, groups, and compounds | 5 | 3 | 1 | 1 | 2 |
| Transitions | 5 | 4 | 1 | 0 | 1 |
| Undo and redo | 3 | 2 | 1 | 0 | 1 |
| Navigation and cache | 3 | 1 | 2 | 0 | 2 |
| AI semantics | 2 | 1 | 0 | 1 | 1 |
| **Total** | **50** | **36** | **7** | **7** | **14** |

## Detailed 50-Rule Assessment

### 1. Track types and operations: 6 complete, 0 partial, 1 missing

**Complete:** Explicit track types, explicit `isMain`, stable `order`, add/reorder, visibility, and mute/solo. The core contracts live in [`timeline.ts`](../../../packages/editor-core/src/types/timeline.ts) and [`track-utils.ts`](../../../packages/editor-core/src/timeline/track-utils.ts).

**Complete (QTL-001, landed 2026-08-04): track locking.** The lock contract is now enforced by the pure preflight in [`lock-contract.ts`](../../../packages/editor-core/src/timeline/lock-contract.ts), wired through [`timeline-lock-guard.ts`](../../../apps/web/src/stores/timeline/timeline-lock-guard.ts) into every Store content command (crud, element, track, media-timing, transition, effects, compound, group). Policy: a command whose explicit target hits a locked track fails closed — no state change, no history entry; derived sets (ripple shift domains, "all tracks" defaults, broad caption-style scopes) skip locked tracks; track metadata (mute, hidden, height, rename, reorder, and the unlock toggle itself) is not content and stays editable. See the matrix test [`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts) (26 cases) and the editor-core unit test (8 cases).

**Missing: project-level track profiles.** Compatibility is fixed to typed tracks. QCut cannot express `classic`, `free-layer`, and `mixed-material` modes or losslessly represent a JianYing project after Free Layer and Mixed Materials are enabled. See [`validation.ts`](../../../packages/editor-core/src/timeline/validation.ts).

Additional migration risk: if every existing track has `order` and a main track is missing, `ensureMainTrack()` assigns the new main track the final order value. A regression test must confirm that it cannot land below audio tracks.

### 2. Layering and rendering: 4 complete, 1 partial

**Complete:** QCut has a canonical composition plan. Tracks are stored in top-to-bottom UI order and drawn bottom-to-top; hidden tracks and elements can be removed from visual composition; audio is mixed separately; media has opacity. See [`composition-plan.ts`](../../../packages/editor-core/src/timeline/composition-plan.ts).

**Partial: blend modes.** `MediaBlendMode` currently exposes six modes: `normal`, `multiply`, `screen`, `overlay`, `darken`, and `lighten`. More importantly, preview, native export, and draft export still need a shared golden-frame contract before more mode names are added.

### 3. Insert, overwrite, and replace: 4 complete, 1 partial, 0 missing

**Complete: automatic stacking.** `addMediaAtTime()` finds a free track of the same type and creates another track when every lane is occupied. See [`timeline-add-ops.ts`](../../../apps/web/src/stores/timeline/timeline-add-ops.ts). `separateAudio` now stacks too: detached audio lands on the first unlocked audio lane that is free at the clip's range, otherwise a fresh lane.

**Complete (QTL-002, landed 2026-08-04): the no-overlap invariant.** `addElementToTrack()`, `moveElementToTrack()`, and `updateElementStartTime()` (including whole-group moves) reject overlap-creating calls at the store layer with no state or history change. UI drag pre-checks remain as interaction feedback, but the contract lives in the store commands — the CLI (claude-bridge → the same store commands) and AI entry points inherit it automatically. Interval math lives in [`collision-policy.ts`](../../../packages/editor-core/src/timeline/collision-policy.ts); see [`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts).

**Partial: replacement.** `replaceElementMedia()` imports a new file and updates the media reference, but it replaces the clip duration with the new asset duration, potentially breaking seams and transitions. ~~It also ignores track locking and writes a stale pre-import `_tracks` snapshot afterward~~ — both fixed with QTL-001, and the concurrent-edit regression test landed with QTL-002. The remaining gap is the duration/transition-preservation policy (QTL-012). See [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts).

**Complete (QTL-002): an explicit Insert command.** `addElementToTrack(trackId, data, { collision: "insert" })` splits the occupant at the drop point with manual-split semantics and shifts everything at or after the point right by the inserted duration.

**Complete (QTL-002): an explicit Overwrite command.** `addElementToTrack(trackId, data, { collision: "overwrite" })` clears the target range (remove / trim / split at both edges) while keeping downstream positions. The range-clearing trim/split math is one shared implementation with `deleteTimeRange` and ripple range deletion ([`timeline-collision-utils.ts`](../../../apps/web/src/stores/timeline/timeline-collision-utils.ts)). The CLI batch-add API passes `collision` through verbatim.

### 4. Ripple and main-track magnetism: 4 complete, 0 partial, 1 missing

**Complete:** Same-track ripple move, same-track ripple delete, and explicit range delete have Store operations and tests. See [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts), [`timeline-track-ops.ts`](../../../apps/web/src/stores/timeline/timeline-track-ops.ts), and [`timeline-ripple-ops.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts).

**Complete (QTL-003, landed 2026-08-04): linked cross-track ripple.** `removeElementFromTrackWithRipple()` and `deleteSelectedElementsWithRipple()` now shift a ripple domain: the edited track plus tracks holding elements explicitly linked to it ([`ripple-plan.ts`](../../../packages/editor-core/src/timeline/ripple-plan.ts) derives typed `video-audio` / `group` links from groupIds). Unrelated tracks hold their positions; a locked linked dependency blocks the whole command (no half-applied commit), while a locked unrelated track is simply outside the domain. `removeTrackWithRipple()` and `rippleDeleteAcrossTracks()` remain explicit cross-track commands (all tracks minus locked) by design. See [`timeline-ripple-domain.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-domain.test.ts).

**Missing: independent main-track magnetism.** QCut currently has `snappingEnabled` and `rippleEditingEnabled`. JianYing treats Main Track Magnet, Auto Snapping, and Main Track Linkage as separate concepts; QCut currently compresses the latter behaviors into one “Linked editing” toggle.

### 5. Trim modes: 4 complete, 1 missing

**Complete:** Ordinary edge trim, split, Slip, and Roll exist. Slip/Roll check reverse playback, source handles, minimum duration, and locked tracks, and they have atomic undo tests. See [`precision-edit.ts`](../../../apps/web/src/lib/timeline/precision-edit.ts) and [`timeline-precision-edit-ops.ts`](../../../apps/web/src/stores/timeline/timeline-precision-edit-ops.ts).

**Missing: the Slide and explicit Ripple Trim mode family.** QCut has no slide edit that preserves the clip duration while adjusting both neighbors, and no explicitly named, CLI-callable ripple-trim command. Both should reuse one source/target range math layer instead of extending UI handlers.

### 6. Snapping: 3 complete, 2 missing

**Complete:** Clip starts/ends, the playhead, and frame/audio-beat boundaries participate in some drag paths. The core hook is [`use-timeline-snapping.ts`](../../../apps/web/src/hooks/timeline/use-timeline-snapping.ts).

**Missing: bookmark and transition-seam candidates.** The ruler already renders bookmarks and transitions have explicit seams, but the snapping engine generates only element start/end and playhead candidates. See [`timeline-ruler.tsx`](../../../apps/web/src/components/editor/timeline/timeline-ruler.tsx) and [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts).

**Missing: candidate priority and temporary disable.** The current implementation picks only the nearest point. It has no deterministic equal-distance priority and no Shift-to-disable behavior during drag. The 10 px threshold is a reasonable base, but every drag and trim path must share it.

### 7. Links, groups, and compound clips: 3 complete, 1 partial, 1 missing

**Complete:** Group/ungroup, group selection/movement, and detached-audio timing synchronization exist. See [`timeline-group-operations.ts`](../../../apps/web/src/stores/timeline/timeline-group-operations.ts), [`timeline-media-timing-ops.ts`](../../../apps/web/src/stores/timeline/timeline-media-timing-ops.ts), and [`aligned-generated-media.ts`](../../../apps/web/src/lib/timeline/aligned-generated-media.ts).

**Partial: atomic group behavior.** Normal selection expands a group, but direct deletion, trim, cross-track movement, and lock conflicts do not share a group closure. `groupId` currently carries UI grouping, detached audio, and AI-aligned media semantics, so its responsibility will continue to grow unless those relationships are separated.

**Missing: a typed dependency graph (partially advanced).** QTL-003 introduced typed links derived from groupIds (`video-audio`, `group`; see `ripple-plan.ts`) that already power ripple domains, but persisted `caption-owner` / `effect-target` / `semantic-scene` links, pre-delete/move dependency closures, and persisted one-sided unlink state remain missing (QTL-008 / QTL-011).

Compound clips can be created and decomposed, but the current representation is a `MediaElement.compound.clips[]` container, not a navigable child timeline with its own fps, markers, and cache version. This should evolve after typed links exist rather than adding more meaning to `groupId`.

### 8. Transitions: 4 complete, 1 partial

**Complete:** Same-track adjacent video eligibility, add/update/remove, duration clamps, neighboring-transition handle limits, and stale-transition cleanup share a core implementation. Every `updateTracksAndSave()` reconciles transitions. See [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts), [`timeline-transition-ops.ts`](../../../apps/web/src/stores/timeline/timeline-transition-ops.ts), and [`timeline-store-autosave.ts`](../../../apps/web/src/stores/timeline/timeline-store-autosave.ts).

**Partial: insufficient handles and replacement policy.** The current policy clamps or rejects. It has no JianYing-style edge-frame extension profile. Media replacement also does not explicitly preserve a target slot, recompute handles, and decide whether the transition survives. The existing transition invariants are a good base and should not be rewritten; they need a policy layer.

### 9. Undo and redo: 2 complete, 1 partial

**Complete:** Track arrays support undo/redo, and transition and precision edits restore as one history operation.

**Partial: history snapshot scope.** `history` and `redoStack` store only `TimelineTrack[][]`. Selection, selected transition, playhead, scene switching, asynchronous media import, and cross-Store operations are outside one transaction. The multi-select branch of `selectElement()` also appends the same new selection twice, showing that selection invariants need dedicated tests. See [`timeline-store.ts`](../../../apps/web/src/stores/timeline/timeline-store.ts) and [`timeline-store-persistence.ts`](../../../apps/web/src/stores/timeline/timeline-store-persistence.ts).

### 10. Navigation and cache: 1 complete, 2 partial

**Complete: bookmarks.** Project bookmarks render and seek the playhead when clicked.

**Partial: scene navigation.** `scene-store.ts` supports create, switch, rename, and per-scene timeline persistence, but the toolbar's scene manager still reports “coming soon,” and scene deletion has a TODO for timeline-storage cleanup. See [`scene-store.ts`](../../../apps/web/src/stores/timeline/scene-store.ts) and [`timeline-toolbar.tsx`](../../../apps/web/src/components/editor/timeline/timeline-toolbar.tsx).

**Partial: frame-cache identity.** The cache includes scene, active elements, media signatures, and project canvas state, but its hash filters on `track.muted` and never checks `track.hidden`. Hiding a visual track can therefore reuse a formerly visible frame, while muting a media track can unnecessarily alter the visual cache. See [`use-frame-cache.ts`](../../../apps/web/src/hooks/timeline/use-frame-cache.ts).

### 11. AI semantic rules: 1 complete, 1 missing

**Complete:** QCut has scene-detection smart split and time-aligned AI speech/video insertion.

**Missing: a persisted semantic graph.** The system cannot express “this caption, SFX, and B-roll belong to scene A, but the user manually detached one relationship.” Without typed semantic edges, an AI scene move cannot both carry dependent media and respect manual edits.

## Confirmed High-Risk Defects

| Priority | Defect | Impact | Status |
| --- | --- | --- | --- |
| P0 | Locks are enforced only by some UI/commands | CLI, automation, and other Store callers can mutate locked tracks | ✅ Fixed (QTL-001) |
| P0 | Linked ripple can move every track | Unrelated or locked tracks can be shifted | ✅ Fixed (QTL-001 locked exclusion + QTL-003 domain semantics) |
| P0 | `replaceElementMedia()` writes a stale async `_tracks` snapshot | User edits made during import can be overwritten | ✅ Fixed (QTL-001) |
| P0 | Collision checks are outside the domain command layer | UI, CLI, and AI can produce different results for one operation | ✅ Fixed (QTL-002) |
| P1 | History stores tracks only | Selection, playhead, and cross-Store state can disagree after undo | ⬜ QTL-004 |
| P1 | Frame-cache hashing ignores `track.hidden` | A hidden track may briefly remain visible through a stale cached frame | ⬜ QTL-010 |
| P1 | Multi-select appends a selection twice | Selection counts and batch command inputs can contain duplicates | ⬜ QTL-004 (needs reproduction first) |
| P1 | Scene deletion does not clean its timeline storage | Orphan scene data accumulates over time | ⬜ QTL-010 |

## Recommended Repair Order

### P0: Establish consistent command semantics

#### QTL-001 Centralize command guards and lock enforcement ✅ Done (2026-08-04)

Goal: no entry point may mutate a locked track, and indirect ripple/link operations must preflight their complete target set.

What landed:

- `packages/editor-core/src/timeline/lock-contract.ts`: pure preflight (`preflightLockedTracks`, `findTrackIdsForGroup`, `excludeLockedTrackIds`, …); element ids resolve to their containing tracks.
- `apps/web/src/stores/timeline/timeline-lock-guard.ts`: thin store-layer wrapper that reports through `handleError` and blocks.
- Wired entry points: `timeline-store-crud.ts` (add/remove/move/trim/duration/startTime/transform/every update\*Element/group/ungroup/compound/multicam/toggleElementHidden), `timeline-element-ops.ts` (ripple move, all three splits, separateAudio, replace), `timeline-track-ops.ts` (removeTrack and every ripple-delete path), `timeline-media-timing-ops.ts` (including the linked-audio closure), `timeline-transition-ops.ts` (all four transition mutations — beyond the original list), `timeline-add-ops.ts` (the four effects commands), `timeline-store.ts` (`findOrCreateTrack` skips locked tracks), and `caption-style-operations.ts` (broad style scopes skip locked tracks).
- Bundled fix: `replaceElementMedia` re-reads the live timeline after import, re-verifies the element exists, and re-checks the lock instead of writing back the entry snapshot (the concurrent-edit regression test ships with the QTL-002 collision rework).
- Tests: [`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts) 26-case matrix + [`lock-contract.test.ts`](../../../packages/editor-core/src/__tests__/lock-contract.test.ts) 8 cases; the 95 pre-existing timeline tests stay green.

Acceptance result: add/move/delete/trim/split/replace/group/compound/ripple make no state or history change when blocked ✅; the cross-track policy is explicit — explicit targets fail atomically, derived sets (ripple shifts, "all tracks" defaults, broad style scopes) skip locked tracks ✅; track metadata (mute, hidden, height, rename, reorder, unlock) is explicitly not content and stays editable.

#### QTL-002 Build a shared Collision Engine ✅ Done (2026-08-04)

Goal: make `append | insert | overwrite | replace | stack` explicit command parameters shared by UI, CLI, and AI.

What landed:

- `packages/editor-core/src/timeline/collision-policy.ts`: pure interval math — `rangesOverlap` (half-open), `findRangeCollisions`, `classifyRangeCollision` (inside / ends-inside / starts-inside / spans), `planOverwrite`, `planInsertShift`.
- `apps/web/src/stores/timeline/timeline-collision-utils.ts`: the single place plans become element edits (`overwriteRangeInElements`, `insertGapInElements`); the range-deletion section of `deleteTimeRange` / `deleteSelectedElementsWithRipple` was refactored onto it, deleting the second copy of the trim/split math.
- `addElementToTrack` gained `collision: "reject" | "insert" | "overwrite"` (default reject); `moveElementToTrack` and `updateElementStartTime` (single and whole-group, rejected atomically without history pollution) joined the reject contract; `separateAudio` now stacks (skips locked/occupied audio lanes, creates one when needed).
- CLI chain verified: CLI → HTTP → main process → IPC → `claude-bridge` → **the same store commands**; the main process only validates shapes and duplicates no interval logic. The batch-add request gained a pass-through `collision` field (`electron/types/claude-api.ts`, `claude-timeline-operations.ts`, `claude-timeline-bridge-batch.ts`).
- `use-track-drop.ts` gained no new conditions: UI pre-checks stay as drag feedback; the store layer owns the contract.
- Tests: [`collision-policy.test.ts`](../../../packages/editor-core/src/__tests__/collision-policy.test.ts) (6 cases) + [`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts) (10 cases, including a replace concurrency regression built on a gated mock media import).

Acceptance result: UI and CLI invoke the same store command, so semantics are byte-equivalent ✅; ordinary add/move APIs cannot create illegal same-track overlap (default reject, no history pollution) ✅; async replacement rereads current timeline state and the concurrent-edit test passes ✅. The `stack` semantics stay in the lane-selection layer (`addMediaAtTime`, `separateAudio`) — a cross-track concern orthogonal to the single-track collision parameter.

#### QTL-003 Introduce Ripple Domains and typed Links ✅ Done (2026-08-04)

Goal: define main-track, current-track, selection, and dependency domains instead of inferring “all tracks” or overloading `groupId`.

What landed:

- `packages/editor-core/src/timeline/ripple-plan.ts` (types live next to the implementation rather than in types/timeline.ts): `TimelineLinkType` (`video-audio` / `group` derivable today; `caption-owner` / `effect-target` / `semantic-scene` reserved for QTL-011), `TimelineElementLink` (with a `detached` flag), `deriveTimelineLinks` (groupId + mediaId + audio-track type → separated-audio pair; other in-group relations → group), and `resolveRippleDomain` (seed tracks + one-hop link expansion; locked dependencies reported separately).
- `timeline-track-ops.ts`: the shift set of `removeElementFromTrackWithRipple` and `deleteSelectedElementsWithRipple` changed from "all tracks" to the ripple domain; a locked linked dependency → `handleError` + whole-command failure with zero history pollution.
- `updateMediaTiming` already honored the linked-audio closure; `aligned-generated-media`'s groupId relations enter the derived link graph automatically.
- Decision: `removeTrackWithRipple` / `rippleDeleteAcrossTracks` keep "all tracks minus locked" — they are caller-declared cross-track commands, not implicit linkage.
- Contract change: ripple deletion no longer shifts unrelated overlay tracks (the old behavior was the audited defect); two existing test expectations were updated with the contract.
- Tests: [`ripple-plan.test.ts`](../../../packages/editor-core/src/__tests__/ripple-plan.test.ts) (5 cases: link typing, one-hop expansion, locked-dependency reporting, detached links, seed-element scoping) + [`timeline-ripple-domain.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-domain.test.ts) (4 cases).

Acceptance result: deleting a main clip moves only the main track and explicitly linked dependencies (the separated-audio lane follows) ✅; unrelated overlays stay fixed ✅; locked dependencies block partial commits (whole failure, no history entry) ✅; one undo restores the complete operation ✅. Remaining: the persisted link graph and unlink state (QTL-011) and group-closure deletion (QTL-008 — deleting a video does not yet delete its orphaned audio partner).

#### QTL-004 Expand transaction history

Goal: history commands restore defined editor state rather than only tracks.

Relevant files:

- `packages/editor-core/src/commands/history.ts`
- `apps/web/src/stores/timeline/timeline-store.ts`
- `apps/web/src/stores/timeline/timeline-store-persistence.ts`
- `apps/web/src/stores/editor/playback-store.ts`
- `apps/web/src/stores/timeline/scene-store.ts`

Acceptance: batch delete, replacement, scene switch, and AI-aligned insertion each produce one history entry; undo/redo restores tracks, selection, selected transition, and playhead according to the command contract; async failure leaves no partial state.

### P1: Complete professional editing behavior

#### QTL-005 Separate main-track magnet, ordinary snapping, and linkage

Relevant files: `packages/editor-core/src/types/project.ts`, `apps/web/src/stores/timeline/types.ts`, `apps/web/src/stores/timeline/timeline-store.ts`, and `apps/web/src/components/editor/timeline/timeline-toolbar.tsx`.

Acceptance: all three switches persist independently; locked-main-track behavior is explicit; legacy projects receive deterministic migration defaults.

#### QTL-006 Extend snap candidates and priorities

Relevant files: `apps/web/src/hooks/timeline/use-timeline-snapping.ts`, `apps/web/src/components/editor/timeline/timeline-ruler.tsx`, `packages/editor-core/src/timeline/transitions.ts`, and every drag/trim hook.

Acceptance: clips, playhead, seams, bookmarks, and beats use one 8-10 px tolerance; ties have deterministic priority; Shift temporarily disables snapping; zoom levels are parameterized in tests.

#### QTL-007 Add Slide and Ripple Trim

Relevant files: `apps/web/src/lib/timeline/precision-edit.ts`, `apps/web/src/stores/timeline/timeline-precision-edit-ops.ts`, and `apps/web/src/hooks/timeline/use-timeline-precision-edit.ts`.

Acceptance: ordinary, reverse, retimed, and insufficient-handle fixtures have pure-function tests; every gesture creates exactly one history command.

#### QTL-008 Strengthen group and compound boundaries

Relevant files: `apps/web/src/stores/timeline/timeline-group-operations.ts`, `apps/web/src/stores/timeline/timeline-compound-operations.ts`, `packages/editor-core/src/types/timeline.ts`, and scene/timeline storage APIs.

Acceptance: group delete/trim/move share one closure; compound clips become child timelines with stable IDs and versions; local fps, markers, and cache namespace have explicit inheritance rules.

#### QTL-009 Add track profiles and lossless migration

Relevant files: `packages/editor-core/src/timeline/validation.ts`, `packages/editor-core/src/types/project.ts`, `packages/editor-core/src/jianying-draft/`, and project migration tests.

Acceptance: classic typed, free-layer typed, and free-layer mixed profiles round-trip; unknown profiles fail closed instead of silently dropping media.

#### QTL-010 Complete scene navigation and cache correctness

Relevant files: `apps/web/src/stores/timeline/scene-store.ts`, `apps/web/src/components/editor/timeline/timeline-toolbar.tsx`, and `apps/web/src/hooks/timeline/use-frame-cache.ts`.

Acceptance: scenes can be created, switched, and deleted through real UI; deletion removes the corresponding timeline DB; hidden/muted/scene/transition changes correctly hit or invalidate cache.

### P2: Establish AI and compatibility layers

#### QTL-011 Persist a semantic dependency graph

Goal: give scene, caption, SFX, BGM, B-roll, and AI output typed edges with user-overridable state.

Relevant files: `packages/editor-core/src/types/timeline.ts`, `apps/web/src/lib/timeline/aligned-generated-media.ts`, scene detection/smart split, and project serialization.

Acceptance: moving/deleting a semantic scene can preview its dependency closure; an unlinked edge stays unlinked after later AI operations; unsupported export links are reported rather than silently discarded.

#### QTL-012 Add transition-handle and replacement profiles

Relevant files: `packages/editor-core/src/timeline/transitions.ts`, `apps/web/src/stores/timeline/timeline-transition-ops.ts`, `apps/web/src/stores/timeline/timeline-element-ops.ts`, and preview/native-export tests.

Acceptance: `reject | clamp | extend-edge` is explicit; one preflight decides whether a transition survives replacement; preview and export use the same resolved window.

## Test Baseline

This audit ran the following eight focused test files:

```text
packages/editor-core/src/__tests__/composition-plan.test.ts
packages/editor-core/src/__tests__/transitions.test.ts
apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-transition-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-precision-edit-ops.test.ts
apps/web/src/stores/timeline/__tests__/timeline-group-operations.test.ts
apps/web/src/stores/timeline/__tests__/timeline-compound-operations.test.ts
apps/web/src/hooks/timeline/__tests__/use-frame-cache.test.tsx
```

Result: **8 files passed and all 54 tests passed.** This validates the existing covered foundations. It does not disprove the missing cross-entry-point, locking, concurrency, cache, and semantic-graph tests identified above.

## Short-Term Approaches to Avoid

- Do not keep adding conditions only to `use-track-drop.ts`; CLI and AI will still bypass them.
- Do not keep using `groupId` for grouping, detached audio, AI alignment, and main-track linkage.
- Do not equate main-track magnetism with the ripple toggle or ordinary snapping with main-track magnetism.
- Do not implement separate overlap/ripple math in every entry point.
- Do not silently approximate a JianYing profile merely to claim support. Fail closed with a precise reason when lossless representation is impossible.

## Definition of Done

These 19 items are not complete when a button merely appears. Every subtask should include a shared pure-function or command contract, common UI and CLI use, no partial state on lock/failure paths, one undo entry per operation, serialization round-trip, focused unit tests, and at least one real desktop timeline E2E.
