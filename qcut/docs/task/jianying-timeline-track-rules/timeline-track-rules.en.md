# Verified JianYing Timeline Track Rules

<!-- markdownlint-disable MD013 -->

**Status:** Research baseline, not a complete compatibility claim  
**Verified on:** 2026-08-04  
**Scope:** Locally readable JianYing drafts, the JianYing 5.9 plaintext shape, newer plaintext subdrafts, and public draft-tool implementations

## Conclusion

The stable core of the JianYing timeline is not a list of media files stored directly in lanes. It is a reference graph:

```text
project
  -> tracks[]
       -> segments[]
            -> material_id
            -> extra_material_refs[]
  -> materials.<kind>[]
```

The current evidence is sufficient to build a structured JianYing track import/export adapter for QCut. It is not sufficient to claim complete parity for drag behavior, main-track magnetism, linking, ripple edits, or newer render ordering. In particular, `attribute`, `flag`, and `render_index` must not be interpreted from their names alone.

## Evidence levels

| Level | Meaning |
| --- | --- |
| Verified | Present in local real drafts and corroborated by another implementation or repeated evidence |
| Strongly corroborated | Implemented and tested by a public tool, but not sufficiently covered by local samples |
| Unverified | Known only from a field, UI observation, or single sample; not a write contract |

This report does not treat third-party conventions as an official ByteDance specification. Public code is used only to cross-check local evidence.

## Local audit

The following directory was scanned read-only:

```text
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft
```

Candidates included `draft_content.json`, `draft_info.json`, `.load.bak`, and `.save.bak`. No draft was decrypted, overwritten, or modified.

| Metric | Result |
| --- | ---: |
| Candidate files | 392 |
| Parseable JSON files | 113 |
| Timelines containing complete `tracks` + `materials` | 12 |
| Tracks | 23 |
| Segments | 31 |
| Comparable same-track segment pairs | 8 |
| Same-track overlaps | 0 |
| Touching pairs | 4 |
| Gapped pairs | 4 |
| `extra_material_refs` | 115 |
| Resolved companion references | 115 |

Observed track types were 14 `video`, 4 `filter`, 4 `effect`, and 1 `sticker`. This distribution describes only the local sample; it is not the complete JianYing type set.

Additional findings:

- All 12 timelines had `config.maintrack_adsorb: true`.
- Every one of the 31 segments had `track_render_index` equal to its containing track array index.
- Only 16 of 31 segments had `render_index` equal to the track index. Other values included `10000`, `11000`, and `14000`, showing type-specific render namespaces.
- All 115 companion references resolved to an entry under `materials.*` in the same draft.
- Eighteen audio/video segments could be checked for speed consistency. Seventeen followed the constant-speed invariant. The exception used the named curve “Hero Moment” with a `mode: 1` speed material, so one scalar could not represent its sampling exactly.
- Two historical snapshots contained the same smoke transition. The outgoing segment owned the transition reference, the incoming segment did not repeat it, and their `target_timerange` values touched with a zero seam delta even though the transition material had `is_overlap: true`.

The temporary audit summary is stored at `/tmp/jianying-timeline-track-audit-20260804.json`. Raw drafts and proprietary assets are not committed.

## Real application and resource verification

This pass also inspected the locally installed JianYing Professional `11.2.0-beta5` (product version `11.1.12975`):

- Two controlled three-second, 30 fps red/blue videos were imported into a new isolated draft named `8月4日`; no existing user draft was modified.
- The real timeline exposes Undo, Redo, Split, Trim Left, Trim Right, Delete, Marker, and snapping controls.
- Existing project track headers expose lock, show/hide, and audio controls. These are track states and must not be disguised as clip properties.
- Bundled Chinese UI resources independently confirm Main Track Magnet, Auto Snapping, Main Track Linkage, Group/Ungroup, Create/Decompose Compound Clip, Free Layer, and Mixed Materials.
- Newer `draft_info.json` bodies remain encrypted. UI strings prove that a capability exists, but not which field persists it.

The isolated draft verified application version, project creation, media import, and control availability. Drag outcomes marked “controlled UI test required” below were not inferred from import alone.

## Product behavior rule matrix

### Track types and responsibilities

| Type | Accepted content | Verified behavior | Still unknown |
| --- | --- | --- | --- |
| Main video | Video, images, and embedded source audio | Cannot be empty; Main Track Magnet exists independently | How the current format persists main-track identity |
| Secondary video / overlay | Video and images | Can participate in Main Track Linkage; current resources allow transitions on video tracks | When ordinary drops automatically create a secondary track |
| Audio | Music, SFX, detached source audio, TTS | Track mute/unmute and track volume exist | Multichannel and compound-clip mix precedence |
| Text | Titles, ordinary text, captions | Text can be selected for Main Track Linkage | Whether titles and captions share one persisted track type |
| Sticker | Stickers and visual overlays | Can participate in Main Track Linkage | Default layer when mixed with video |
| Effect | Time-ranged effects | May be a track or a companion material | Global, track, and clip-scoped conflict precedence |
| Filter | Time-ranged filters | May be a track or a companion material | Ordering and blending of simultaneous filters |
| Adjustment | Color/adjustment layers | Can participate in Main Track Linkage | Whether it may mix with ordinary media |
| Compound | A child timeline referenced by `materials.drafts[]` | Can be created and decomposed; multiple timelines are registered | Nesting depth, local fps, and proxy invalidation |

The pinned public implementation additionally enumerates `video`, `audio`, `effect`, `filter`, `sticker`, and `text`, with `adjust` as an import-compatible type. QCut must not drop types merely because a local sample did not happen to contain them.

Track capabilities are project-profile dependent. Bundled resources state that Free Layer cannot be disabled after it is enabled and saved. Mixed Materials permits different material types on one track, requires Free Layer, and also cannot be disabled after activation. Import therefore needs at least these profiles:

```text
classic typed tracks
free layer + typed tracks
free layer + mixed material tracks
```

### Track operations

| Operation | JianYing evidence | Required QCut contract |
| --- | --- | --- |
| Add | Public code appends at the foreground end; dragging media can produce tracks | Create a stable UUID and explicit layer index; never silently reorder by type |
| Reorder | `tracks[]` and `track_render_index` participate in layering | One undoable command updates structural order and export indexes |
| Lock | UI/resources expose lock/unlock; a locked main track blocks magnet toggles | Block move, trim, delete, insertion, and indirect ripple changes |
| Hide | UI/resources expose hide/show | Affect visual composition only; preserve timing and materials |
| Mute | Audio tracks expose mute/unmute and track volume | Affect audio mixing; do not rewrite each clip volume to zero |
| Delete | Tracks own segment lists | Deleting a non-empty track is one atomic command and cannot leave orphan materials |

The bit semantics of `attribute`, `flag`, and `track_attribute` are unresolved. Preserve unknown values on read and generate them only through a version profile; never interpret every nonzero `attribute` as mute.

### Layering and rendering

1. At a visual time, resolve tracks from background to foreground, then resolve the active segment inside each track.
2. `tracks[]` is the strongest structural layer evidence; `track_render_index` assists export; `render_index` also contains type-specific namespaces and cannot alone determine occlusion.
3. Segment visibility starts with `visible`, and base opacity with `clip.alpha`. Track hiding should short-circuit the track instead of rewriting every segment.
4. Normal mode should use source-over composition. Blend Mode exists in the application, but exact color space, premultiplied-alpha, and HDR ordering still require frame comparisons.
5. Audio does not participate in visual layering. Every unmuted audio source enters the mix bus before clip volume, track volume, fades, and channel mapping are applied.
6. QCut shows foreground tracks above background tracks, while its composition plan executes background-to-foreground. Import/export must perform one explicit conversion rather than letting modules guess independently.

### Insert, overwrite, replace, and auto-track creation

Because confirmed draft files contain no same-track overlap, a drop into occupied time must choose a collision policy first:

| Mode | Target interval | New source | Moves later content |
| --- | --- | --- | --- |
| Insert | Split or establish a boundary, then place the clip | Preserve source duration | Only with ripple/main magnet enabled |
| Overwrite | Remove the covered portions of target clips | Preserve new clip duration | No |
| Replace clip | Preserve the target slot, replace its primary material | Fit/trim to target duration by default | No |
| Stack/new track | Keep the target track unchanged; create on an adjacent visual track | Preserve source duration | No |
| Append | Place at track end or the final main-track seam | Preserve source duration | No |

JianYing resources confirm an explicit Replace Clip operation and warn that replacing video with an image loses audio. The default result of an ordinary overlap drop is still unverified. QCut must expose the policy as a command parameter rather than hide it in incidental pointer geometry.

Recommended default: a main-track seam drop inserts; a drop over occupied main-track time previews overwrite and requires an explicit choice; a drop in empty space above the main track creates a secondary track; only an explicit Replace command replaces.

### Ripple and Main Track Magnet

Main Track Magnet and ordinary snapping are separate settings:

```text
config.maintrack_adsorb
draft_biz_config.timeline_settings.<timelineId>.adsorb_enabled
```

Bundled resources also establish that a locked main track prevents enabling or disabling Main Track Magnet, and that quick trim keeps clips linked when magnetism is enabled. Official CapCut desktop guidance describes Track Magnet as preventing main-track gaps and Auto Snapping as edit-point alignment.

QCut's concrete contract should be:

- `ripple=false`: move, delete, and trim affect only selected clips and leave time empty.
- `ripple=true`: compute the edit delta and shift only later clips in the same ripple domain.
- Main Track Magnet defines the main-track ripple domain; it does not move every secondary track.
- Main Track Linkage, not magnetism, decides which dependent tracks follow.
- A locked track cannot be changed indirectly. Fail the transaction or explicitly skip it; never commit a partial state.

### Trim modes

Verified JianYing operations include edge-handle trims, Trim Left, Trim Right, Split, and ordinary duration changes. No independent Slip, Slide, or professional Ripple Trim tool has yet been confirmed in resources or plaintext drafts.

| Mode | Changes `target_timerange` | Changes `source_timerange` | Moves neighbors |
| --- | --- | --- | --- |
| Normal left trim | start and duration | source start and duration | No |
| Normal right trim | duration | source duration | No |
| Ripple trim | Same as normal trim | Same as normal trim | Yes, later clips |
| Slip | No | source start/end | No |
| Slide | start | both neighbor boundaries | Yes, immediate neighbors only |

QCut may support all modes, but command and UI names must be explicit. Export must also enforce `source_duration ~= target_duration * speed`; curve speed requires integration rather than the constant-speed trim formula.

### Snapping

Auto Snapping should change only the interactive landing time, not project semantics. Candidate targets are playhead, clip boundaries, transition seams, timeline markers, and beats. Plaintext drafts contain `time_marks` and `materials.beats`, but the local arrays are empty and do not prove that every target is currently supported.

QCut should use a screen-pixel tolerance rather than fixed time: 8 px by default, with Shift temporarily disabling snapping. For equal distances, use selected edge, playhead, same-track edge, other-track edge, marker, then beat. Recompute pixels-to-time after zoom changes.

### Main Track Linkage and media relationships

Bundled resources provide the most concrete linkage contract: when linkage is enabled, users can independently select adjustment, effect, filter, audio, SFX, sticker, text, TTS, and overlay clips; selected types follow main-track moves and deletion. Therefore:

- Linkage is a typed dependency relation, not grouping and not Main Track Magnet.
- Embedded source audio belongs to the video material. Detached audio needs an explicit relation ID to follow.
- Captions, SFX, and effects follow only when a time/semantic relation exists; overlap alone must not capture everything.
- Deleting a main clip first computes the dependency closure; undo restores the entire transaction.
- Current plaintext samples do not expose the newer linkage preference field. Empty `group_id` values do not mean “unlinked.”

### Groups, compound clips, and nesting

These concepts must remain distinct:

| Concept | Collapses time | Creates child timeline | Typical behavior |
| --- | --- | --- | --- |
| Multi-selection | No | No | One operation targets many clips; disappears when deselected |
| Group | No | No | Move/transform together; can ungroup |
| Compound clip | Yes | Yes | Creates an editable child timeline and can be decomposed |

All 489 plaintext segments in the broader recursive field sweep had an empty `group_id`. Nonempty `group_id` values occurred on text materials as an automatic template group or `tse_subtitle`. That field therefore cannot yet be treated as the UI group identifier. Compound clips do have direct structural evidence in `materials.drafts[]`, `subdraft/**/draft_content.json`, and `Timelines/project.json`.

### Transitions

- A transition belongs to the seam between adjacent same-track video clips and is referenced by the outgoing segment.
- `is_overlap` means dual-input rendering; target time ranges need not overlap.
- Current resources say transitions can be added to video tracks. Older strings limited them to the main track, while a release note records later secondary-track support.
- When source handles are insufficient, JianYing duplicates edge frames so transition creation does not change clip duration.
- Deleting either side, separating the clips, or changing tracks must delete or invalidate the seam transition.
- If trimming shortens available handles, QCut must use a profile-defined clamp, edge duplication, or rejection. It must not silently change clip duration.
- Replacement may preserve a transition only when track, seam, duration, and handle invariants remain valid.

### Undo and redo

The real UI exposes both Undo and Redo. `.backup/timeline_backup_manifest.json` is crash recovery/autosave infrastructure, not the visible per-command undo log; `attachment_editing.json.paste_segment_list` is not an undo stack either.

Each QCut command should record one atomic before/after patch spanning tracks, segments, material registry, relationships, transitions, and selection. Async AI work should use separate “create task” and “commit result” commands. Undoing a committed result removes local references but does not delete a remote task. A failed command must not alter the redo stack.

### Navigation, markers, and cache

- `timeline_layout.json` records the active timeline and open timeline IDs; local projects contain one, two, or three timelines.
- `materials.time_marks` and `materials.beats` are candidate marker/beat stores. Navigation, snapping, and export must share one timebase.
- Playhead, horizontal scroll, and zoom are view state and should not dirty project content. Every observed content-body `zoom_info_params` value was null.
- `performance_opt_info.json` and proxy/cache UI belong to the performance layer. Bundled resources explicitly say proxy mode can lower preview resolution without affecting export resolution.
- Cache keys should include source identity, mtime/hash, source range, speed, effect chain, color space, and output specification; changing any component invalidates the entry.

### AI semantic rules

Local sidecar files already show a model above raw clips:

- `attachment_action_scene.json` associates `segment_id` with `segment_scene`, feature, and operation data.
- `attachment_script_video.json` connects script sentences, caption segments, source ranges, and target ranges.
- AI packaging entries in `attachment_pc_common.json` associate keywords, B-roll, and time spans through `segment_id`.

QCut should represent semantic relationships as a separate graph rather than overload `groupId`. A scene node owns video, dialogue, captions, SFX, BGM ducking, and effect references. Moving a scene compiles the graph into ordinary timeline commands. Once a user removes an edge, a later AI reflow must not silently recreate it.

## Controlled UI test matrix

Each experiment should use two three-second videos, one independent audio clip, one caption, and one effect. Change one switch at a time and capture before/after drafts and screenshots.

| ID | Action | Required observation |
| --- | --- | --- |
| T01 | Drop video on an empty timeline | Main-track position and type/flag/index fields |
| T02 | Drop into the middle of a main-track clip | Default insert, overwrite, replace, or reject behavior |
| T03 | Drop above/below the main track | Auto-created track direction and layer |
| T04 | Delete a middle clip with Main Track Magnet on/off | Gap closing and exact time delta |
| T05 | Drag with Auto Snapping on/off | Playhead, edge, marker, beat targets and pixel threshold |
| T06 | Lock/hide/mute a track | Editing blocks, preview/export differences, persisted field |
| T07 | Left/right and shortcut trims | Source/target range, neighbor, and relationship changes |
| T08 | Toggle each Main Track Linkage type | Which objects follow move, delete, and trim |
| T09 | Group and ungroup | IDs, cross-track move, partial delete, and undo state |
| T10 | Create/decompose compound clip | Child timeline, local time, audio, and transition expansion |
| T11 | Add transition, trim, and delete either side | Ownership, clamp/edge duplication, and cleanup |
| T12 | Undo/redo all prior operations | Exact project, selection, playhead, cache, and material consistency |

## Verified data rules

### 1. Project timebase

- `fps` defines the project frame rate.
- Draft time ranges use microseconds.
- Project duration, segment boundaries, and transition durations may be quantized to whole frames.
- Seam comparisons should use a frame-aware tolerance or version profile rather than exact floating-point seconds.

### 2. Tracks and segments

A track contains at least:

```json
{
  "id": "track-uuid",
  "type": "video",
  "attribute": 0,
  "flag": 0,
  "segments": []
}
```

A segment expresses identity and timing through fields resembling:

```json
{
  "id": "segment-uuid",
  "material_id": "primary-material-uuid",
  "target_timerange": { "start": 0, "duration": 5000000 },
  "source_timerange": { "start": 0, "duration": 5000000 },
  "extra_material_refs": []
}
```

`target_timerange` is timeline placement; `source_timerange` is source-media sampling. Text, stickers, and generated segment families may omit the source range or assign it different semantics, so adapters must dispatch by track and material type.

### 3. No same-track overlap

None of the eight comparable local same-track pairs overlapped. The pinned pyJianYingDraft implementation also models ranges as half-open intervals and raises `SegmentOverlap` when adding an overlapping segment.

QCut-generated drafts should therefore preserve this conservative invariant:

```text
previous.target.start + previous.target.duration
  <= next.target.start
```

This does not prove which UI policy JianYing chooses in every case: overwrite, insert, or automatic track creation still requires controlled interaction experiments.

### 4. Material references

- `material_id` points to the primary video, audio, text, sticker, or other material.
- `extra_material_refs` points to companion materials such as speed, animation, canvas, mask, transition, or audio processing.
- Deleting a segment may remove orphaned materials only after proving that no other segment references them.
- Segment duplication must define which materials are shareable and which instances require new UUIDs.

### 5. Constant and curve speed

The constant-speed baseline is:

```text
source_duration ~= target_duration * speed
```

Frame quantization introduces small error. Curve speed cannot be represented by the segment's top-level `speed` alone. The adapter must resolve `materials.speeds[]`, inspect `mode` and `curve_speed.speed_points`, then integrate or resample the curve.

### 6. Track order and render order

The public implementation treats `tracks[]` as the complete back-to-front track order and appends a new track at the foreground end. Twenty-four focused tests at the pinned commit passed locally, covering append, insertion, ordering, same-track overlap, and half-open range behavior.

The local sample adds important constraints:

- `track_render_index` consistently followed the track array index in this sample.
- `render_index` was not a plain track index; material families used distinct numeric ranges.
- `render_index_track_mode_on` was `true` in two JianYing 5.9 snapshots and `false` in ten newer subdrafts.
- `free_render_index_mode_on` was `false` in all 12 timelines.

An exporter must therefore not sort only by `render_index`, nor assume array order alone is sufficient forever. A versioned profile should emit track order, `track_render_index`, and family-specific `render_index` together.

### 7. Main-track magnetism

`config.maintrack_adsorb` is verified and is interpreted by the public implementation as main-track magnetism. Controlled local experiments have not yet established:

- which `video` track each version selects as the main track;
- whether main-track identity is determined entirely by order;
- how insert, delete, trim, and speed changes move other segments after toggling it;
- whether UI linking and general snapping have independent persisted fields.

“The first video track is always main” must not be hard-coded across versions.

### 8. Transition ownership

A transition is a seam object, not an ordinary independent segment:

```text
materials.transitions[]
        ^
        | transition UUID
outgoing_segment.extra_material_refs[]
incoming segment = same track, next segment
```

`is_overlap: true` describes a two-input sampling/rendering contract. It does not require overlapping `target_timerange` values. Applied duration may be frame-quantized and constrained by source handles on both sides.

See the existing [transition format evidence](../../../.agents/skills/qcut-toolkit/jianying-transition-reference/references/formats.md).

### 9. Effects, filters, and keyframes

- Effects and filters may exist as timed track segments or as companion materials attached to another segment.
- Global, track-family, and segment-specific scope must come from material fields, not inferred only from lane position.
- `common_keyframes` belong to a segment; the public implementation interprets keyframe time relative to the segment start.
- One local timeline contained three `common_keyframes` groups, which is not enough to verify every property, interpolation mode, or conflict priority.

### 10. Multiple timelines and compound content

`timeline_layout.json` records the active timeline and one or more timeline IDs. Local projects contained one, two, and three registered timelines. `subdraft/**/draft_content.json` together with `materials.drafts[]` confirms that compound or nested timelines use separate content bodies.

Only registration and reference structure are confirmed. Deep nesting, decomposing compounds, local timebases, and render-cache behavior remain incomplete.

## Fields that must not be hard-coded

| Field | Current conclusion |
| --- | --- |
| `track.attribute` | A public tool writes mute here, but local samples contain value `2`; verify by version |
| `track.flag` | A local secondary video track uses value `2`; meaning is unresolved |
| `segment.track_attribute` | Often follows the track attribute, but is not a safe single source of truth |
| `segment.render_index` | Family-specific render index, not the track array index |
| `segment.track_render_index` | Equaled track index locally, but still requires a cross-version profile |
| `render_index_track_mode_on` | Differs between 5.9 and newer subdraft samples |
| `mixed_track_mode_on` | `false` in newer subdrafts and absent in 5.9 samples; semantics unresolved |

## Mapping to QCut

| JianYing concept | Current QCut model | Assessment |
| --- | --- | --- |
| Track order | `TimelineTrack.order` | Sound foundation; export profile required |
| Main track | `TimelineTrack.isMain` | More explicit in QCut; cannot be copied to one JianYing field |
| Timeline range | `startTime` + effective duration | Mappable with seconds/microseconds and frame boundaries |
| Source range | `trimStart`, `trimEnd`, `playbackRate` | Needs one canonical converter |
| Visual stacking | `buildCompositionPlan()` | QCut UI is top-to-bottom; composition is bottom-to-top |
| Transition seam | `TimelineTrack.transitions[]` | Close to JianYing's seam model |
| Companion materials | Element fields plus effects/animation/mask | Requires a material registry during export |
| Curve speed | `speedKeyframes` | Exact JianYing curve conversion is not yet specified |

Core files:

- `packages/editor-core/src/types/timeline.ts`
- `packages/editor-core/src/timeline/track-utils.ts`
- `packages/editor-core/src/timeline/composition-plan.ts`
- `packages/editor-core/src/timeline/transitions.ts`
- `apps/web/src/stores/timeline/element-operations.ts`
- `apps/web/src/stores/timeline/track-operations.ts`
- `packages/editor-core/src/jianying-draft/`
- `packages/jianying-draft-export/src/`

## Recommended implementation subtasks

### 1. Define versioned track contracts

Relevant files:

- `packages/editor-core/src/jianying-draft/types.ts`
- `packages/editor-core/src/jianying-draft/time.ts`
- New: `packages/editor-core/src/jianying-draft/track-mapping.ts`

Define tracks, segments, time ranges, render-index policy, and unknown-field preservation. JianYing 5.9 and CapCut 8.1.1 must not share an unversioned profile.

### 2. Implement a material registry

Relevant files:

- `packages/editor-core/src/jianying-draft/build.ts`
- `packages/editor-core/src/jianying-draft/media-mapping.ts`
- `packages/editor-core/src/jianying-draft/validation.ts`

Register primary and companion materials centrally. Detect dangling references, duplicate IDs, cross-segment sharing, and orphaned materials.

### 3. Complete track and stacking mapping

Relevant files:

- `packages/editor-core/src/timeline/track-utils.ts`
- `packages/editor-core/src/timeline/composition-plan.ts`
- `packages/editor-core/src/jianying-draft/capcut-8-1-profile.ts`
- New: `packages/editor-core/src/jianying-draft/track-render-index.ts`

Generate `tracks[]`, `track_render_index`, and `render_index` from a profile. Lock stacking with mixed-track fixtures rather than single-video fixtures.

### 4. Align source timing and speed

Relevant files:

- `packages/editor-core/src/jianying-draft/time.ts`
- New: `packages/editor-core/src/jianying-draft/speed-mapping.ts`
- `packages/editor-core/src/types/timeline.ts`

Cover constant speed, curve speed, reverse, freeze frame, trim, and FPS quantization separately. Curve tests must verify integrated source consumption.

### 5. Keep transitions as seam objects

Relevant files:

- `packages/editor-core/src/jianying-draft/transition-build.ts`
- `packages/editor-core/src/jianying-draft/transition-mapping.ts`
- `packages/editor-core/src/jianying-draft/transition-validation.ts`
- `packages/editor-core/src/timeline/transitions.ts`

Validate unique outgoing ownership, the next same-track segment, touching seams, source handles, and frame quantization. Do not reduce a transition to a normal clip filter.

### 6. Build an interaction behavior matrix

Relevant files:

- `apps/web/src/stores/timeline/element-operations.ts`
- `apps/web/src/stores/timeline/track-operations.ts`
- `apps/web/src/stores/timeline/__tests__/timeline-ripple-ops.test.ts`
- `apps/web/src/components/editor/timeline/`

In an isolated test account or VM, capture before/after drafts while changing one variable at a time: main-track magnetism, general snapping, linking, insert, overwrite, delete, speed change, and cross-track drag.

### 7. Add real export regressions

Relevant files:

- `packages/editor-core/src/__tests__/jianying-draft-*.test.ts`
- `packages/jianying-draft-export/src/__tests__/`
- `scripts/capcut-e2e/`
- `docs/task/jianying-draft-export.md`

Require generation, post-write reread, real open, save, reopen, and export. Visual stacking, audio mixing, transition seams, and source sampling all need an oracle. No write test may run against Peter's real draft account.

## Definition of done

- Each target version has an independent profile and provenance-pinned minimal fixtures.
- Validators cover same-track overlap, reference integrity, UUID uniqueness, time ranges, and frame quantization.
- Preview and export share one stacking and transition plan.
- Constant and curve speed are tested separately.
- Unknown `attribute`, `flag`, or render modes fail closed or are preserved; they are never silently rewritten.
- Compatibility is promoted to “verified” only after real open, save, reopen, and export regression.
- JianYing databases, drafts, cached packages, shaders, media, and other proprietary assets are never committed or redistributed.

## References

- [Pinned pyJianYingDraft research commit](https://github.com/GuanYixuan/pyJianYingDraft/tree/c3318066d964744e2bfc66f75c71745fe8cea52a)
- [Track implementation](https://github.com/GuanYixuan/pyJianYingDraft/blob/c3318066d964744e2bfc66f75c71745fe8cea52a/pyJianYingDraft/track.py)
- [Track insertion implementation](https://github.com/GuanYixuan/pyJianYingDraft/blob/c3318066d964744e2bfc66f75c71745fe8cea52a/pyJianYingDraft/_script_file_tracks.py)
- [capcut-cli track and segment schema](https://github.com/renezander030/capcut-cli/blob/f3295934c716dcbe7d1781cc3bf49d5a88d6bdd2/docs/draft-schema/01-tracks-and-segments.md)
- [Official CapCut desktop guide: Track Magnet, Auto Snapping, proxies, and shortcuts](https://www.capcut.com/resource/pc-professional-video-editor)
- [QCut JianYing / CapCut draft export status](../jianying-draft-export.md)

Local capability names were read from `/Applications/VideoFusion-macOS.app/Contents/Resources/po/zh-Hans.po`. This document paraphrases behavior; it does not commit that proprietary resource or any extraction.
