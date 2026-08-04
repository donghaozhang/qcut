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
| QTL-004 Transaction history | ✅ Done | 2026-08-04 | History snapshots carry tracks + selection + selected transition + playhead; fixes the redo round-trip bug; the CLI transaction bridge upgraded to full snapshots |
| QTL-005 Separate magnet / snapping / linkage | ✅ Done | 2026-08-04 | Three independent per-project toggles (`TProject.timeline`); magnet = main-track deletions close their gap; linkage = whether ripple pulls linked tracks |
| QTL-006 Extend snap candidates and priorities | ✅ Done | 2026-08-04 | Seam/bookmark candidates + deterministic tie-break + Shift bypass + one 10px tolerance constant + zoom-parameterized tests |
| QTL-007 Add Slide and Ripple Trim | ✅ Done | 2026-08-04 | `calculateSlideEdit` / `calculateRippleTrim` pure math + `slideElement` / `rippleTrimElement` commands + a slide edit-mode gesture |
| QTL-008 Strengthen group and compound boundaries | 🔶 Partial | 2026-08-04 | Group-closure deletion landed (whole user group, separated-audio pairs keep single deletion, locked members reject); compound-as-child-timeline still follows QTL-011 |
| QTL-010 Scene navigation and cache correctness | ✅ Done | 2026-08-04 | Scenes create/switch/delete for real (deletion cleans its timeline storage); the frame cache filters on `hidden` and ignores `muted` |
| QTL-012 Transition-handle and replacement profiles | 🔶 Partial | 2026-08-04 | Replacement profile landed: the target slot is preserved (new media trimmed to fill it), too-short media rejected, seams/transitions untouched; `reject\|clamp` explicit, `extend-edge` awaits renderer/export support |
| QTL-009 / QTL-011 | ⬜ Not started | | Track-profile lossless migration and the persisted semantic graph (compound child timelines and unlink persistence depend on it) |

## Conclusion

This audit decomposes the JianYing research baseline into **50 independently testable timeline rules** and checks each rule against QCut's current code and tests:

| Status | Count | Share |
| --- | ---: | ---: |
| Complete | 45 | 90% |
| Partial | 2 | 4% |
| Missing | 3 | 6% |
| **Requires repair or implementation** | **5** | **10%** |

The audit baseline identified 19 of 50 rules needing changes; with QTL-001 through QTL-008 (partial), QTL-010, and QTL-012 (partial) done, **QCut still needs code changes for 5 of the 50 timeline rules** — two partial (the blend-mode golden-frame contract and the transition-handle extend-edge policy) plus three missing (track profiles, the persisted typed dependency graph, the semantic graph).

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
| Insert, overwrite, and replace | 5 | 5 | 0 | 0 | 0 |
| Ripple and main-track magnetism | 5 | 5 | 0 | 0 | 0 |
| Trim modes | 5 | 5 | 0 | 0 | 0 |
| Snapping | 5 | 5 | 0 | 0 | 0 |
| Links, groups, and compounds | 5 | 4 | 0 | 1 | 1 |
| Transitions | 5 | 4 | 1 | 0 | 1 |
| Undo and redo | 3 | 3 | 0 | 0 | 0 |
| Navigation and cache | 3 | 3 | 0 | 0 | 0 |
| AI semantics | 2 | 1 | 0 | 1 | 1 |
| **Total** | **50** | **45** | **2** | **3** | **5** |

## Detailed 50-Rule Assessment

### 1. Track types and operations: 6 complete, 0 partial, 1 missing

**Complete:** Explicit track types, explicit `isMain`, stable `order`, add/reorder, visibility, and mute/solo. The core contracts live in [`timeline.ts`](../../../packages/editor-core/src/types/timeline.ts) and [`track-utils.ts`](../../../packages/editor-core/src/timeline/track-utils.ts).

**Complete (QTL-001, landed 2026-08-04): track locking.** The lock contract is now enforced by the pure preflight in [`lock-contract.ts`](../../../packages/editor-core/src/timeline/lock-contract.ts), wired through [`timeline-lock-guard.ts`](../../../apps/web/src/stores/timeline/timeline-lock-guard.ts) into every Store content command (crud, element, track, media-timing, transition, effects, compound, group). Policy: a command whose explicit target hits a locked track fails closed — no state change, no history entry; derived sets (ripple shift domains, "all tracks" defaults, broad caption-style scopes) skip locked tracks; track metadata (mute, hidden, height, rename, reorder, and the unlock toggle itself) is not content and stays editable. See the matrix test [`timeline-lock-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-lock-contract.test.ts) (26 cases) and the editor-core unit test (8 cases).

**Missing: project-level track profiles.** Compatibility is fixed to typed tracks. QCut cannot express `classic`, `free-layer`, and `mixed-material` modes or losslessly represent a JianYing project after Free Layer and Mixed Materials are enabled. See [`validation.ts`](../../../packages/editor-core/src/timeline/validation.ts).

Additional migration risk: if every existing track has `order` and a main track is missing, `ensureMainTrack()` assigns the new main track the final order value. A regression test must confirm that it cannot land below audio tracks.

### 2. Layering and rendering: 4 complete, 1 partial

**Complete:** QCut has a canonical composition plan. Tracks are stored in top-to-bottom UI order and drawn bottom-to-top; hidden tracks and elements can be removed from visual composition; audio is mixed separately; media has opacity. See [`composition-plan.ts`](../../../packages/editor-core/src/timeline/composition-plan.ts).

**Partial: blend modes.** `MediaBlendMode` currently exposes six modes: `normal`, `multiply`, `screen`, `overlay`, `darken`, and `lighten`. More importantly, preview, native export, and draft export still need a shared golden-frame contract before more mode names are added.

### 3. Insert, overwrite, and replace: 5 complete, 0 partial, 0 missing

**Complete: automatic stacking.** `addMediaAtTime()` finds a free track of the same type and creates another track when every lane is occupied. See [`timeline-add-ops.ts`](../../../apps/web/src/stores/timeline/timeline-add-ops.ts). `separateAudio` now stacks too: detached audio lands on the first unlocked audio lane that is free at the clip's range, otherwise a fresh lane.

**Complete (QTL-002, landed 2026-08-04): the no-overlap invariant.** `addElementToTrack()`, `moveElementToTrack()`, and `updateElementStartTime()` (including whole-group moves) reject overlap-creating calls at the store layer with no state or history change. UI drag pre-checks remain as interaction feedback, but the contract lives in the store commands — the CLI (claude-bridge → the same store commands) and AI entry points inherit it automatically. Interval math lives in [`collision-policy.ts`](../../../packages/editor-core/src/timeline/collision-policy.ts); see [`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts).

**Complete (QTL-001/002/012 together, landed 2026-08-04): replacement.** `replaceElementMedia()` now meets the full contract: lock checks (entry + post-import recheck) and the stale-snapshot write-back were fixed in QTL-001; the concurrent-edit regression test landed with QTL-002; QTL-012 added the replacement profile — **the target time slot is preserved** (the new media is trimmed at its tail, rate-aware, to fill the slot; seams and transitions do not move), media shorter than the slot is explicitly rejected, and untimed media (images) keeps its timing. Tests cover transition survival and the too-short rejection. See [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts).

**Complete (QTL-002): an explicit Insert command.** `addElementToTrack(trackId, data, { collision: "insert" })` splits the occupant at the drop point with manual-split semantics and shifts everything at or after the point right by the inserted duration.

**Complete (QTL-002): an explicit Overwrite command.** `addElementToTrack(trackId, data, { collision: "overwrite" })` clears the target range (remove / trim / split at both edges) while keeping downstream positions. The range-clearing trim/split math is one shared implementation with `deleteTimeRange` and ripple range deletion ([`timeline-collision-utils.ts`](../../../apps/web/src/stores/timeline/timeline-collision-utils.ts)). The CLI batch-add API passes `collision` through verbatim.

### 4. Ripple and main-track magnetism: 4 complete, 0 partial, 1 missing

**Complete:** Same-track ripple move, same-track ripple delete, and explicit range delete have Store operations and tests. See [`timeline-element-ops.ts`](../../../apps/web/src/stores/timeline/timeline-element-ops.ts), [`timeline-track-ops.ts`](../../../apps/web/src/stores/timeline/timeline-track-ops.ts), and [`timeline-ripple-ops.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts).

**Complete (QTL-003, landed 2026-08-04): linked cross-track ripple.** `removeElementFromTrackWithRipple()` and `deleteSelectedElementsWithRipple()` now shift a ripple domain: the edited track plus tracks holding elements explicitly linked to it ([`ripple-plan.ts`](../../../packages/editor-core/src/timeline/ripple-plan.ts) derives typed `video-audio` / `group` links from groupIds). Unrelated tracks hold their positions; a locked linked dependency blocks the whole command (no half-applied commit), while a locked unrelated track is simply outside the domain. `removeTrackWithRipple()` and `rippleDeleteAcrossTracks()` remain explicit cross-track commands (all tracks minus locked) by design. See [`timeline-ripple-domain.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-ripple-domain.test.ts).

**Complete (QTL-005, landed 2026-08-04): independent main-track magnetism.** Three independent toggles: `snappingEnabled` (ordinary snapping), `mainTrackMagnetEnabled` (the magnet — main-track deletions close their gap even outside ripple mode), and `linkedRippleEnabled` (whether ripple follows typed links to other tracks). Persisted per project on `TProject.timeline` ([`types/project.ts`](../../../packages/editor-core/src/types/project.ts)); legacy projects get deterministic defaults from `resolveProjectTimelineSettings` (snapping on / magnet off / linkage on); a locked main track wins over the magnet (the whole delete is rejected). The toolbar exposes all three independently. See [`timeline-behavior-toggles.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-behavior-toggles.test.ts).

### 5. Trim modes: 5 complete, 0 missing

**Complete:** Ordinary edge trim, split, Slip, and Roll exist. Slip/Roll check reverse playback, source handles, minimum duration, and locked tracks, and they have atomic undo tests. See [`precision-edit.ts`](../../../apps/web/src/lib/timeline/precision-edit.ts) and [`timeline-precision-edit-ops.ts`](../../../apps/web/src/stores/timeline/timeline-precision-edit-ops.ts).

**Complete (QTL-007, landed 2026-08-04): Slide and explicit Ripple Trim.** `calculateSlideEdit` (duration-preserving move; the left neighbor's out-point and right neighbor's in-point absorb it, with seam-adjacency checks and handle/minimum-duration clamps, reverse- and rate-aware) and `calculateRippleTrim` (start-anchored one-edge duration change; the caller shifts downstream by the applied delta) share the slip/roll edge-trim math. The store commands `slideElement` / `rippleTrimElement` are explicitly named and CLI-callable; the latter follows the QTL-003 ripple domain and the QTL-005 linked-ripple toggle. The UI gains a slide edit mode (fourth toolbar mode) reusing the slip pointer-gesture machinery (one history entry per gesture, Escape cancels). Ripple trim stays a command-level entry (ordinary trim handles unchanged). See [`timeline-slide-ripple-trim.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-slide-ripple-trim.test.ts).

### 6. Snapping: 5 complete, 0 missing

**Complete:** Clip starts/ends, the playhead, and frame/audio-beat boundaries participate in drag paths. The core hook is [`use-timeline-snapping.ts`](../../../apps/web/src/hooks/timeline/use-timeline-snapping.ts).

**Complete (QTL-006, landed 2026-08-04): bookmark and transition-seam candidates.** The engine's candidate types are now `element-start/end`, `transition-seam` (the toElement boundary; seams involving the dragged element are excluded), `playhead`, and `bookmark` (project bookmarks). Collection and resolution are pure functions (`collectTimelineSnapPoints` / `resolveTimelineSnap`); the hook is a subscribing wrapper.

**Complete (QTL-006): candidate priority and temporary disable.** Equal-distance ties break deterministically: element edges > seams > playhead > bookmarks, then the earlier time. Holding Shift bypasses snapping during in-track drags (MouseEvent.shiftKey) and HTML5 drops (DragEvent.shiftKey). The tolerance is one shared constant, `TIMELINE_CONSTANTS.SNAP_THRESHOLD_PX` (10 px); beat alignment stays a BPM grid quantizer pre-pass in the audio drop path (an infinite grid is not a finite candidate set) gated by the same snapping switch. Zoom-parameterized tests: [`timeline-snapping.test.ts`](../../../apps/web/src/hooks/timeline/__tests__/timeline-snapping.test.ts).

### 7. Links, groups, and compound clips: 4 complete, 0 partial, 1 missing

**Complete:** Group/ungroup, group selection/movement, and detached-audio timing synchronization exist. See [`timeline-group-operations.ts`](../../../apps/web/src/stores/timeline/timeline-group-operations.ts), [`timeline-media-timing-ops.ts`](../../../apps/web/src/stores/timeline/timeline-media-timing-ops.ts), and [`aligned-generated-media.ts`](../../../apps/web/src/lib/timeline/aligned-generated-media.ts).

**Complete (QTL-008, landed 2026-08-04): atomic group behavior.** Deletion now has a group closure: deleting any member deletes the whole group as one command (cross-track members, selection cleanup, empty-track pruning, one undo); any locked member track rejects the whole deletion (the QTL-001 closure guard). Whole-group movement already had its closure (`moveTimelineElementGroup`, with QTL-002 collision rejection). Explicit policy: a pure separated-audio pair (same mediaId, one side on an audio track) is a timing link, not a user group — deleting the video keeps the detached audio (`isSeparatedAudioPairGroup`), matching JianYing; trim stays single-clip (also JianYing behavior). See [`timeline-group-closure.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-group-closure.test.ts).

**Missing: a typed dependency graph (partially advanced).** QTL-003 introduced typed links derived from groupIds (`video-audio`, `group`; see `ripple-plan.ts`) that already power ripple domains, but persisted `caption-owner` / `effect-target` / `semantic-scene` links, pre-delete/move dependency closures, and persisted one-sided unlink state remain missing (QTL-008 / QTL-011).

Compound clips can be created and decomposed, but the current representation is a `MediaElement.compound.clips[]` container, not a navigable child timeline with its own fps, markers, and cache version. This should evolve after typed links exist rather than adding more meaning to `groupId`.

### 8. Transitions: 4 complete, 1 partial

**Complete:** Same-track adjacent video eligibility, add/update/remove, duration clamps, neighboring-transition handle limits, and stale-transition cleanup share a core implementation. Every `updateTracksAndSave()` reconciles transitions. See [`transitions.ts`](../../../packages/editor-core/src/timeline/transitions.ts), [`timeline-transition-ops.ts`](../../../apps/web/src/stores/timeline/timeline-transition-ops.ts), and [`timeline-store-autosave.ts`](../../../apps/web/src/stores/timeline/timeline-store-autosave.ts).

**Partial: insufficient handles and replacement policy.** The replacement half landed with QTL-012: media replacement explicitly preserves the target slot, recomputes trims, and transitions survive (see section 3). The handle half remains clamp-or-reject (explicit, but only two tiers); the JianYing-style `extend-edge` frame-hold profile needs synchronized preview and native-export support first. The existing transition invariants are a good base and should not be rewritten; they need a policy layer.

### 9. Undo and redo: 3 complete, 0 partial

**Complete:** Track arrays support undo/redo, and transition and precision edits restore as one history operation.

**Complete (QTL-004, landed 2026-08-04): history snapshot scope.** `history` and `redoStack` now store full editing-context snapshots ([`timeline-history.ts`](../../../apps/web/src/stores/timeline/timeline-history.ts): tracks + selection + selected transition + playhead), restored together by undo/redo. This also fixed a real round-trip bug: the old `redo()` popped the redo stack without re-pushing history, so undo after redo skipped a step. The CLI transaction bridge (`claude-transaction-bridge.ts`, grouped transactions as one entry) was upgraded to full snapshots. The audited "multi-select appends twice" claim does not reproduce in current code (the multi branch toggles); a selection-invariant test now pins that. See [`timeline-history-transaction.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-history-transaction.test.ts). Scene switching remains non-undoable (loading a scene clears history) — scene lifecycle is QTL-010.

### 10. Navigation and cache: 3 complete, 0 partial

**Complete: bookmarks.** Project bookmarks render and seek the playhead when clicked (and are snap candidates since QTL-006).

**Complete (QTL-010, landed 2026-08-04): scene navigation.** The toolbar's scene button no longer says “coming soon” — both entries open the real `ScenesView` panel; the panel gains a "New scene" button (create then switch); scene deletion now cleans the deleted scene's timeline storage (`storageService.deleteProjectTimeline` accepts a `sceneId`; a cleanup failure warns without aborting).

**Complete (QTL-010): frame-cache identity.** The visual frame hash now filters on `track.hidden` (a hidden track leaves the render, so the cache must miss) and ignores `track.muted` (an audio-only property — the old code was wrong in both directions). Regression test: [`use-frame-cache.test.tsx`](../../../apps/web/src/hooks/timeline/__tests__/use-frame-cache.test.tsx).

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
| P1 | History stores tracks only | Selection, playhead, and cross-Store state can disagree after undo | ✅ Fixed (QTL-004, incl. the redo round-trip bug) |
| P1 | Frame-cache hashing ignores `track.hidden` | A hidden track may briefly remain visible through a stale cached frame | ✅ Fixed (QTL-010; both directions: hidden joins, muted leaves) |
| P1 | Multi-select appends a selection twice | Selection counts and batch command inputs can contain duplicates | ✅ Not reproducible (toggle semantics today); pinned by an invariant test (QTL-004) |
| P1 | Scene deletion does not clean its timeline storage | Orphan scene data accumulates over time | ✅ Fixed (QTL-010) |

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

#### QTL-004 Expand transaction history ✅ Done (2026-08-04)

Goal: history commands restore defined editor state rather than only tracks.

What landed:

- `apps/web/src/stores/timeline/timeline-history.ts`: `TimelineHistorySnapshot` (tracks + selectedElements + selectedTransition + playheadTime) plus capture/playhead-restore helpers; the playback store is accessed lazily to avoid a module cycle.
- `pushHistory`/`undo` in `timeline-store.ts` and `redo` in `timeline-store-persistence.ts` use full-snapshot semantics; **fixed the round-trip bug where `redo()` never re-pushed the departing state onto history** (undo→redo→undo used to skip a step).
- `claude-transaction-bridge.ts`: grouped CLI transactions capture a full snapshot at Begin, commit pushes it, rollback restores from it — multi-step CLI transactions stay one history entry.
- Decisions: the generic `packages/editor-core/src/commands/history.ts` stack was not adopted (the store's inline twin stacks fit better; the generic module stays available); scene switching remains non-undoable (loading clears history, QTL-010); playhead restoration follows "undo returns you to the edit site".
- Collateral fix surfaced by the QTL-002 contract: sticker Duplicate now stacks onto a free/new sticker lane (a same-lane same-range copy violates the no-overlap invariant), reusing `insertTrackAt`'s history entry to stay one undo.
- Tests: [`timeline-history-transaction.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-history-transaction.test.ts) (4 cases: undo/redo restore selection and playhead, round-trip regression, one entry per batch, multi-select invariant); two existing tests updated with the snapshot shape / sticker behavior.

Acceptance result: batch delete, replacement, CLI transactions, and AI-aligned insertion each produce one history entry ✅; undo/redo restores tracks, selection, selected transition, and playhead per the command contract ✅; async failure leaves no partial state (replace pushes history only after success; covered by the QTL-002 concurrency test) ✅; single-entry scene switching moves to QTL-010 (scene lifecycle).

### P1: Complete professional editing behavior

#### QTL-005 Separate main-track magnet, ordinary snapping, and linkage ✅ Done (2026-08-04)

What landed:

- `packages/editor-core/src/types/project.ts`: `ProjectTimelineSettings` (three switches) + `DEFAULT_PROJECT_TIMELINE_SETTINGS` + `resolveProjectTimelineSettings` (deterministic legacy defaults: snapping on, magnet off, linkage on); persisted as `TProject.timeline?`.
- `timeline-store`: `mainTrackMagnetEnabled` / `linkedRippleEnabled` state and toggles; all three toggles (including the existing `toggleSnapping`) persist through `updateProjectTimelineSettings`; `applyProjectTimelineSettings` runs on `loadProject`.
- Semantics: magnet forces `removeElementFromTrack` on the main track through the ripple path (gap closes, QTL-003 domain semantics apply); linkage gates the ripple domain's link expansion (off = edited track only); `rippleEditingEnabled` remains its own "ripple mode" concept, never conflated with the magnet.
- Locked main track + magnet: the QTL-001 lock guard runs first and rejects the whole delete — the lock wins, explicitly tested.
- Toolbar: magnet (FoldHorizontal) and linked-ripple (Link2) buttons beside snapping/ripple, each with a data-testid.
- Tests: [`timeline-behavior-toggles.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-behavior-toggles.test.ts) (6 cases: default resolution, magnet on main/non-main/locked, linkage-off audio independence, persistence onto the project).

Acceptance result: all three switches persist independently (per project, via `saveProject`) ✅; locked-main-track behavior is explicit (lock wins, whole command rejected) ✅; legacy projects receive deterministic migration defaults that preserve existing behavior ✅.

#### QTL-006 Extend snap candidates and priorities ✅ Done (2026-08-04)

What landed:

- `use-timeline-snapping.ts` reworked around pure functions: `collectTimelineSnapPoints` (element edges + transition seams + playhead + project bookmarks; the dragged element and its seams excluded) and `resolveTimelineSnap` (distance first, then edge > seam > playhead > bookmark, then the earlier time). The hook keeps its old API and subscribes to project bookmarks.
- One tolerance: `TIMELINE_CONSTANTS.SNAP_THRESHOLD_PX = 10`, used by the in-track drag path and the drop path (no more literals).
- Shift bypass: in-track drags read MouseEvent.shiftKey; drops thread DragEvent.shiftKey through a ref; the touch path explicitly resets it.
- Decision: BPM beat alignment stays a grid-quantizer pre-pass in the audio drop path (an infinite grid does not fit the candidate model), gated by the same snapping toggle.
- Tests: [`timeline-snapping.test.ts`](../../../apps/web/src/hooks/timeline/__tests__/timeline-snapping.test.ts) (candidate collection, exclusion semantics, tolerance parameterized over zoom 0.25/1/4, three tie-break groups, closest-wins).

Acceptance result: clips, playhead, seams, and bookmarks share one 10 px tolerance (beats are a same-gated grid quantizer) ✅; ties have deterministic priority ✅; Shift temporarily disables snapping ✅; zoom levels are parameterized in tests ✅.

#### QTL-007 Add Slide and Ripple Trim ✅ Done (2026-08-04)

What landed:

- `precision-edit.ts`: `calculateSlideEdit` (three clips: the middle moves with duration preserved while neighbor trims absorb it; positive/negative directions clamp on left-handle/right-minimum and left-minimum/right-handle respectively; reverse/rate mapping reuses `timelineEdgeTrim`/`setTimelineEdgeTrim`) and `calculateRippleTrim` (`durationDelta` semantics: positive consumes the edge handle to lengthen, negative shortens down to 0.1s; startTime anchored).
- `timeline-precision-edit-ops.ts`: `slideElement` (finds the adjacent same-track media neighbors) and `rippleTrimElement` (downstream shifts follow the QTL-003 ripple domain; a locked linked dependency rejects the whole command; honors the QTL-005 linked-ripple toggle).
- UI: a fourth edit mode `slide` (ArrowRightLeft); `use-timeline-precision-edit` gains the slide gesture (same pointer-capture / single-history / Escape-rollback pattern as slip); `timeline-element` switches pointer handling and cursor in slide mode. Ripple trim remains a command-level entry point (ordinary trim handles unchanged).
- Tests: [`timeline-slide-ripple-trim.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-slide-ripple-trim.test.ts) (9 cases: slide normal/clamped/reversed+retimed/non-adjacent; ripple trim both-edge clamps and reverse-rate mapping; store commands single-history, domain shifting, linkage-off and locked-dependency behavior).

Acceptance result: ordinary, reverse, retimed, and insufficient-handle fixtures have pure-function tests ✅; every gesture creates exactly one history command (the slip/roll one-shot pushHistory pattern) ✅.

#### QTL-008 Strengthen group and compound boundaries 🔶 Partial (2026-08-04)

Landed (the group-closure half):

- Deletion closure: `removeElementFromTrack` deletes a grouped element's whole group as one command (cross-track members, selection cleanup, empty-track pruning, one undo); the ripple entry routes grouped elements to the same closure; any locked member track rejects the whole deletion.
- Semantic split: `isSeparatedAudioPairGroup` identifies a two-member same-mediaId group with one side on an audio track as a detached-audio timing link — deleting the video keeps the audio (JianYing behavior), making `groupId`'s double duty explicit.
- Policy: move closure existed (QTL-002 added whole-group collision rejection); trim stays single-clip (JianYing-consistent).
- Tests: [`timeline-group-closure.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-group-closure.test.ts) (4 cases).

Not landed (the compound half): compound clips remain a `MediaElement.compound.clips[]` container, not a navigable child timeline with stable versions / local fps / markers / cache namespace — per this document's own judgment, that evolves after the QTL-011 typed graph.

#### QTL-009 Add track profiles and lossless migration

Relevant files: `packages/editor-core/src/timeline/validation.ts`, `packages/editor-core/src/types/project.ts`, `packages/editor-core/src/jianying-draft/`, and project migration tests.

Acceptance: classic typed, free-layer typed, and free-layer mixed profiles round-trip; unknown profiles fail closed instead of silently dropping media.

#### QTL-010 Complete scene navigation and cache correctness ✅ Done (2026-08-04)

What landed:

- The toolbar scene SplitButton opens the real `ScenesView` panel instead of a coming-soon toast (same panel as the existing Layers entry); `ScenesView` gains a "New scene" button (create, then switch).
- `storageService.deleteProjectTimeline` accepts an optional `sceneId` (the adapter was already scene-aware); `deleteScene` cleans the deleted scene's timeline storage after saving the project, warning without aborting on cleanup failure.
- The frame-cache hash filters on `track.hidden` and ignores `track.muted` (the old code was wrong both ways: muting invalidated valid visual frames while hiding could hit stale ones); a regression test pins both directions.

Acceptance result: scenes create/switch/delete through real UI ✅; deletion removes the corresponding timeline storage ✅; hidden/muted changes hit or invalidate cache correctly (scene/transition were already hash dimensions) ✅.

### P2: Establish AI and compatibility layers

#### QTL-011 Persist a semantic dependency graph

Goal: give scene, caption, SFX, BGM, B-roll, and AI output typed edges with user-overridable state.

Relevant files: `packages/editor-core/src/types/timeline.ts`, `apps/web/src/lib/timeline/aligned-generated-media.ts`, scene detection/smart split, and project serialization.

Acceptance: moving/deleting a semantic scene can preview its dependency closure; an unlinked edge stays unlinked after later AI operations; unsupported export links are reported rather than silently discarded.

#### QTL-012 Add transition-handle and replacement profiles 🔶 Partial (2026-08-04)

Landed (the replacement half):

- `replaceElementMedia` preserves the target time slot: the required source duration is computed from the existing playbackRate and the new media's `trimEnd` absorbs the excess; media shorter than the slot returns an explicit error (JianYing's rejection semantics); untimed media (images) keeps its timing. Seams do not move, so reconcile naturally keeps transitions — "does the transition survive replacement" is decided by the same slot preflight ✅.
- Tests: transition survival across replacement, slot trim values, and the too-short rejection ([`timeline-collision-contract.test.ts`](../../../apps/web/src/stores/timeline/__tests__/timeline-collision-contract.test.ts)).

Not landed (the handle half): the `extend-edge` frame-hold profile — it needs preview and native export to share one resolved window with edge-frame holds; the policy today stays at the explicit `reject | clamp` tiers.

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
