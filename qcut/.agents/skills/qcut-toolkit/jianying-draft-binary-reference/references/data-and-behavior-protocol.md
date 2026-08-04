# Jianying data and behavior research protocol

## Objective

Build Jianying interoperability from two separate evidence chains:

1. plaintext draft structure proves what was persisted;
2. controlled UI experiments prove what the editor did.

Do not infer UI behavior from fields alone, and do not infer persisted fields
from UI labels alone. A compatibility claim needs both when both are available.

## Safety boundary

Use a dedicated project named with the pattern `QCut-JY-Lab-YYYYMMDD`. It may
contain only generated calibration media. Never use an existing personal
project. Never copy a project while `.locked` is present or while files are
changing. Keep raw drafts, hashes, captures, exports, and databases in a local
ignored evidence directory outside the QCut repository.

The repository may contain only:

- original test code and synthetic fixtures;
- anonymized field paths, counts, formulas, and hashes;
- behavior conclusions with app/profile version and confidence;
- QCut-owned calibration media when its provenance is documented.

## Read-only data inventory

Run the skill CLI from its installed directory:

```bash
SKILL_DIR="/absolute/path/to/jianying-draft-binary-reference"

bun "$SKILL_DIR/scripts/inspect-draft.ts" inventory
bun "$SKILL_DIR/scripts/inspect-draft.ts" inspect \
  --file "/absolute/path/to/plaintext/draft_content.json"
```

Paths are omitted by default. `--include-paths` is for private local diagnosis
only and its output must not be committed. Inventory classifies current drafts,
backups, and subdrafts; reports opaque payloads without treating them as
corruption; counts tracks, segments, materials, and unresolved references; and
ignores no source files based on project name.

## Before/after semantic diff

Only compare snapshots from the same dedicated project and the same timeline.
Close the project or wait for autosave to become idle before each snapshot.
If the current body is opaque, prefer a Jianying-created plaintext backup or
subdraft. Do not decrypt the body to make an experiment pass.

```bash
bun "$SKILL_DIR/scripts/inspect-draft.ts" diff \
  --before "/evidence/D-003/before/draft_content.json" \
  --after "/evidence/D-003/after/draft_content.json"
```

The diff is identity-aware for tracks, segments, and material collections. It
reports ordering and nested field changes while hashing project names, text,
media paths, and other free-form strings. It ignores only top-level
`update_time` when calculating the semantic hash. A changed nested timestamp
remains visible.

## Data-layer experiment matrix

Every case starts from a newly duplicated lab baseline and changes one variable.
Do not reuse a project after an unrelated exploratory click.

| ID | Single operation | Required evidence | Main question |
| --- | --- | --- | --- |
| D-001 | Create empty 30 fps project | project sidecars and inventory | minimum project skeleton and version profile |
| D-002 | Add one 3 s video to the main track | before/after diff | main-track identity, video material, speed and canvas refs |
| D-003 | Add a second video above the main track | before/after diff | automatic track creation and layer order |
| D-004 | Add one text element | before/after diff | text track/material ownership, styling payload and timing |
| D-005 | Add one independent audio clip | before/after diff | audio track/material ownership and mixing defaults |
| D-006 | Add a transition between adjacent videos | diff plus five progress captures | outgoing ownership, duration quantization and handles |
| D-007 | Toggle main-track magnet only | config diff | exact persisted field and scope |
| D-008 | Toggle automatic snapping only | sidecar/config diff | project content versus UI preference ownership |
| D-009 | Toggle linked movement for one material type | config diff | typed linkage profile and default state |
| D-010 | Create and enter a compound clip | root/subdraft diff | timeline registration and nested draft ownership |

Record fields that remain unchanged as evidence too. For example, if applying
a transition adds one material and one outgoing reference while both target
ranges remain adjacent, that unchanged adjacency is part of the contract.

## Black-box behavior matrix

Use asymmetric calibration clips with visible frame numbers and independent
audio tones. Capture the timeline before and after, exact timecode, enabled
toggles, and an export when rendering or source sampling is in question.

| ID | Operation | Variables held fixed | Observe |
| --- | --- | --- | --- |
| B-001 | Drop at an empty main-track seam | snapping off, magnet off | append versus insert and resulting ranges |
| B-002 | Drop inside an occupied main-track clip | snapping off, magnet off | overwrite, insert, replace, reject, or new track |
| B-003 | Drop above an occupied clip | snapping off, magnet off | automatic overlay track and layer order |
| B-004 | Delete a middle main-track clip | compare magnet off/on | gap preservation versus closure |
| B-005 | Move a main-track clip | compare linked movement off/on | which typed dependants follow |
| B-006 | Trim left and right edges | compare magnet off/on | source/target range changes and downstream movement |
| B-007 | Drag near edge, playhead, marker and transition seam | fixed zoom levels | snap target priority and pixel tolerance |
| B-008 | Delete either side of a transition | fixed transition duration | removal, invalidation, or reassignment |
| B-009 | Shorten source handles below transition duration | fixed seam | clamp, repeated edge frames, rejection, or duration change |
| B-010 | Undo and redo each operation | no unrelated edits | complete restoration of tracks, refs, selection and playhead |

Run binary toggles as paired cases from the same baseline. Do not toggle several
settings and attempt to attribute the result afterward.

## Evidence bundle

Each experiment directory outside the repository should contain:

```text
<case-id>/
  manifest.json
  before/                    # private raw snapshot, when safe and plaintext
  after/                     # private raw snapshot, when safe and plaintext
  semantic-diff.json         # anonymized CLI output
  timeline-before.png
  timeline-after.png
  export.mp4                 # only when behavior depends on rendering/sampling
  notes.md                   # exact action, controls, app version, anomalies
```

The manifest records app short version, bundle version, project/timeline IDs as
hashes, source media hashes, FPS, canvas, operation, toggle states, timestamps,
and hashes of every evidence file. Screenshots must avoid unrelated projects or
personal media.

## Confidence and stop rules

- `confirmed-structure`: repeated plaintext field relationship across at least
  two independent snapshots or one snapshot plus a known implementation.
- `confirmed-behavior`: repeated controlled UI result with before/after capture.
- `profile-specific`: confirmed only for one Jianying version and platform.
- `inferred`: plausible but missing either the data or behavior side.
- `unresolved`: conflicting, encrypted, or contaminated evidence.

Stop and discard the case when the project was not idle, more than one variable
changed, undo history was already contaminated, the selected clip is uncertain,
the UI auto-played during frame capture, or the source app/version changed.

## Current local baseline

The 2026-08-04 read-only sample contains plaintext full-timeline documents in
backups and subdrafts alongside opaque current drafts. It covers video, filter,
effect, sticker, transitions, and nested drafts, but does not provide enough
independent text/audio-track samples to declare those mappings complete. The
currently open lab project is locked and its current body is opaque, so use it
for UI-only behavior capture unless Jianying itself emits a stable plaintext
backup or subdraft.

The reusable inventory CLI observed:

| Source | JSON | Opaque | Full timeline |
| --- | ---: | ---: | ---: |
| current draft | 0 | 72 | 0 |
| backup | 124 | 253 | 2 |
| subdraft | 10 | 0 | 10 |
| total | 134 | 325 | 12 |

These counts are a dated local snapshot, not a format guarantee. Backup counts
grow during normal editing and must be regenerated before a new report.

### B-001 observed result

On Jianying `11.2.0-beta5` (`CFBundleShortVersionString=11.1.12975`), the
isolated calibration project started with an empty timeline and two generated
three-second red/blue clips in its media bin. Activating the red clip's add
control produced one main video track with one clip spanning `0–3s`.

After autosave became idle:

- `draft_info.json`, `draft_meta_info.json`, and `draft_biz_config.json` changed;
- `timeline_layout.json` did not change;
- the backup file count remained unchanged;
- the current draft body remained opaque.

Confidence is `confirmed-behavior` and `profile-specific` for empty-timeline
insertion. Exact field ownership remains `unresolved`; do not infer the new
track or segment schema from changed file hashes.

### B-002 observed result

With the red clip occupying `0–3s`, the playhead at `0s`, and the current
default toggle state unchanged, activating the blue clip's add control inserted
blue at `0–3s` and shifted red to `3–6s`. It did not overwrite red and did not
create an overlay track.

This confirms an insert-at-playhead contract for the media-bin add control in
this profile. It does not prove that drag-and-drop into an occupied clip uses
the same policy. Record add-control, seam drop, body drop, and overlay drop as
separate commands in QCut parity tests.

### B-004 observed result

Deleting the selected blue main-track clip at `0–3s` moved red from `3–6s` to
`0–3s`; no gap remained. Undo restored both clips and their order. This is
`confirmed-behavior` for the current default toggle state, but the owning
setting is still unresolved. Repeat from the same two-clip baseline with only
main-track magnet toggled off before assigning the behavior to that control.

### B-006 and B-009 observed result

Applying the standard `叠化` card to the adjacent blue/red seam produced a
`0.5s` transition. Both clips consumed their complete three-second sources, so
no unused source handles were available. Jianying displayed a warning that it
would create the transition by repeating frames on both sides in order to keep
segment durations unchanged. After confirmation:

- the two clips remained adjacent and the project duration remained `6s`;
- the transition marker straddled the seam and was labeled as repeated-frame;
- the transition property panel reported `0.5s`;
- autosave added a backup candidate, but no new plaintext timeline appeared.

This is direct profile-specific evidence for the repeated-edge-frame fallback
when source handles are insufficient. It does not reveal the encrypted
transition material instance or prove behavior for non-dissolve packages.
