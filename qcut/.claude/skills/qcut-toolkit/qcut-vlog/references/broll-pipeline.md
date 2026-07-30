# B-roll Research and Composition

## Plan From the Narration

Read the corrected transcript and mark only moments where an external visual adds
meaning. Build a cue sheet with:

| Field | Meaning |
|---|---|
| Start / end | Intended timeline window |
| Exact phrase | The narration being supported |
| Visual job | Explain, prove, locate, change scale, or land a joke |
| Search terms | Product, event, person, place, or concept |
| Candidate source | Page URL and owner |
| Rights state | Cleared, restricted, pending, or reference-only |
| Edit treatment | Crop, credit, color conversion, and transition |

Start with three or four cues. Add more only when the video genuinely needs them.
For a short talking-head video, roughly 10–15% B-roll coverage usually preserves
the speaker as the center of the piece.

## Research in Rights Order

Prefer sources in this order:

1. user-owned footage;
2. official product pages, press kits, or creator-owned demonstrations;
3. public-domain government media;
4. clearly licensed stock or Creative Commons material;
5. social posts with explicit permission;
6. permission-pending social posts as reference-only candidates.

An accessible video is not automatically reusable. Do not treat an X, TikTok,
YouTube, or reposted clip as cleared merely because it can be downloaded. For
technical claims, use primary sources and ensure the visual actually depicts the
thing named in the narration.

## Archive Before Editing

Preserve every downloaded original unchanged. Use deterministic filenames and
never overwrite a previous download. For each candidate, record:

- human-readable asset ID and title;
- page URL and direct media URL;
- owner, uploader, and original author when different;
- retrieval date;
- stated license and attribution text;
- permission state and commercial-use limits;
- local path, file size, and SHA-256 checksum;
- selected source time range and final timeline range;
- whether source audio must be discarded;
- any unresolved risk.

Save the relevant page text, metadata, or snapshot beside the asset so the source
can still be audited if the page changes. Keep rejected candidates in the manifest
with a short rejection reason when they influenced the edit.

## Prepare Media

Probe the editable master and every selected clip before conversion. Record
duration, dimensions, frame rate, pixel format, color primaries, transfer,
matrix, and audio streams.

Use QCut's bundled FFmpeg 8 when color-managed conversion is required. Confirm the
binary with `ffmpeg -version`; do not silently fall back to an older system build
that lacks the same `zscale` behavior.

Run the skill's mandatory preflight before preparing B-roll:

```bash
bun "$QCUT_VLOG_ROOT/scripts/preflight.ts"
```

The check fails when the resolved FFmpeg major version is below 8. Fix the
toolchain with `QCUT_VLOG_REPO` or `QCUT_VLOG_FFMPEG_BIN` instead of bypassing the
failure.

Convert the pixels into the base video's color space. Do not merely attach new
color tags. When the base is BT.2020 HLG and the insert is SDR BT.709, use an
explicit transfer, primaries, and matrix conversion, then inspect the result for
gray blacks, neon saturation, gamma jumps, and clipped highlights.

For horizontal or square media in a 9:16 timeline, prefer a sharp foreground over
a softened background derived from the same clip. Do not crop away the evidence
or subject that made the clip useful.

## Compose Without Breaking the Master

Use the caption-free editable video for the visual timeline. Never build on an
already hard-captioned export.

Use the verified full-length Sticker/SFX mix as the audio master when the narration
timeline has not changed. Mute every B-roll source audio stream by default. If an
insert covers a sticker, omit that sticker visually; keep its SFX only when the
sound still has a clear narrative function.

Preserve the base cadence. Do not globally force `fps=30` or add an output `-r`
merely because the inserts are 30 fps. Normalize only B-roll branches when needed,
then make their exact segment duration match the cue. Count frames and check
timestamps at every concatenation boundary.

Render compatible visual segments, concatenate them, and attach or packet-copy the
verified audio where the container permits. Burn the corrected subtitles only
after the complete visual timeline is locked.

Add a compact source credit for every external insert. Keep it readable, inside
safe margins, and away from subtitles. A credit does not cure an unclear license.

## Accept or Remove

Inspect immediately before, during, and after every insert in still frames and in
motion. Confirm:

- the visual lands on the intended phrase;
- no black, frozen, duplicated, or missing frames appear;
- cadence and color remain continuous;
- the crop preserves the meaningful subject;
- the credit is correct and readable;
- source audio is absent;
- speech and SFX remain continuous;
- subtitle timing still matches after final burn-in.

Compare with the clean baseline. Remove an insert when it merely fills space,
competes with the speaker, adds rights uncertainty without enough value, or makes
the sentence harder to understand.
