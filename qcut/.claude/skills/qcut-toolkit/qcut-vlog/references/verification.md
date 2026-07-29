# Verification

## Baseline

Read `vlog-manifest.json`. Confirm the clean, portrait, optional background,
audio-extraction, transcription, subtitle, and verification stages completed or
were deliberately skipped.

Probe the source, editable master, and publishing output. Record duration,
dimensions, display aspect ratio, average and real frame rates, pixel format,
color primaries, transfer, matrix, audio codec, sample rate, and channel count.

Require:

- editable and hard-captioned baseline durations within `0.25s`;
- at least one SRT entry;
- intended portrait orientation and dimensions;
- no unexpected frame-rate normalization;
- explicit, consistent color tags;
- playable audio for the entire video.

## Visual Inspection

Extract or inspect frames at:

- the opening hook;
- immediately before, during, and after every sticker or B-roll cue;
- a caption-dense moment;
- a frame containing the speaker's hands or face near an overlay;
- the final two seconds.

Check framing, caption clipping, text correctness, sticker safe areas, B-roll crop,
credit placement, cutout edges, color changes, duplicated frames, black frames,
and frozen endings.

Inspect the video in motion at each boundary. Still frames cannot reveal cadence
problems, late effects, or jarring transitions.

## Audio Inspection

Listen to the opening, every cut, every SFX cue, B-roll boundaries, and the ending.
Speech must stay intelligible and continuous.

Measure integrated loudness, true or sample peak, and clipping where tooling
allows. Treat approximately `-1.5 dB` peak as a safe publishing target, not a
substitute for listening. If the visual timeline did not change and the audio was
packet-copied, compare stream or decoded audio hashes with the verified master.

Re-encode, remux, or concatenate only with an explicit reason. Reverify after
every operation that can touch audio timestamps.

## Publishing Package

Confirm:

- every downloaded asset appears in `sources.md`;
- page URL, owner, retrieval date, checksum, used segment, and license or
  permission status are explicit;
- titles and copy contain no unsupported claims;
- the cover is exactly 1080×1920 and readable as a small thumbnail;
- all Chinese cover text is exact;
- deliverables open from their reported paths.

Write `publish/verification-report.md` with the probes, inspected timestamps,
audio measurements, source-rights status, known limitations, and final artifact
paths. If anything is unresolved, state it rather than labeling the package final.

Decode the publishing video from beginning to end. A successful render command or
container probe does not prove that every frame and audio packet is decodable.
