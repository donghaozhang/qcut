# Jianying Basic Audio Panel: Implementation and Local Probes

## Conclusion

QCut already had two useful probe layers, but no single probe covered the whole
Basic audio panel shown in the reference:

1. The draft probe inventories plaintext and opaque drafts and produces a
   path-redacted semantic diff for controlled before/after snapshots.
2. The export probe compares channel layout, sample rate, duration, loudness,
   true peak, silence intervals, and per-channel differences.
3. The new panel probe joins draft collections, active/default sample counts,
   and allowlisted Jianying binary markers into one path-free JSON report.

The installed application on `2026-08-30` is Jianying Professional for macOS
`11.3.0`, bundle id `com.lemon.lvpro`. The new probe normally completes in about `2-3s`
and found every configured static marker for all ten capability groups.

“All static markers found” means that this build contains the named models,
fields, and orchestration paths. It does not prove every UI mapping, algorithm
parameter, or offline execution path.

## Current Baseline

Read-only inventory:

| Item | Count |
| --- | ---: |
| Draft candidate files | 1340 |
| Parseable JSON files | 385 |
| Opaque files | 955 |
| Plaintext documents with a timeline | 29 |
| Projects currently marked `.locked` | 2 |

Audio-panel material collections:

| Collection | Objects | Active objects recognized by the probe |
| --- | ---: | ---: |
| `sound_channel_mappings` | 35 | 0 |
| `vocal_separations` | 35 | 0 |
| `audio_fades` | 0 | 0 |
| `loudnesses` | 0 | 0 |
| `audio_balances` | 0 | 0 |
| `realtime_denoises` | 0 | 0 |
| `vocal_beautifys` | 0 | 0 |
| `audio_pitch_shifts` | 0 | 0 |
| `audio_pannings` | 0 | 0 |
| `ai_translates` | 0 | 0 |
| `multi_language_refs` | 0 | 0 |

The plaintext set also contains 48 segments with `volume` and
`last_nonzero_volume`, all at defaults. The 35 channel mappings and 35 vocal
separations are default per-segment companions, not 35 user operations.

## Implementation Map

Evidence terms:

- `plaintext-observed`: present in a currently readable local draft.
- `static-strong`: Jianying 11.3.0 directly names the field, serializer, action,
  model, or task.
- `unresolved`: still needs a single-variable UI diff or export measurement.

| UI control | Persistence | Jianying 11.3.0 evidence | Execution model | Current status |
| --- | --- | --- | --- | --- |
| Volume | Segment `volume`; video segments also have `last_nonzero_volume` | `SegmentAudio/SegmentVideo::set_volume(double)` | Local timeline gain with audio keyframes | Defaults observed; dB-to-linear mapping unresolved |
| Fade in/out | `audio_fades[]`: `fade_in_duration`, `fade_out_duration`, `fade_type` | `MaterialAudioFade`, `AUDIO_FADE_IN/OUT_ACTION` | Local timeline envelope | Field and integer type are static-strong; unit and curve enum unresolved |
| Loudness normalization | New `loudnesses[]`; legacy `audio_balances[]` | `MaterialLoudness`, `LoudnessParam`, `LoudnessManager`, `KAudioLoudness` | Analyze average/peak, then apply a target; unfinished analysis may block export | Static-strong; no active draft sample |
| Audio denoise | `realtime_denoises[]` | `is_denoise`, `denoise_mode`, `denoise_rate`, SAMI metadata, `KAudioDenoise` | Real-time material plus model processing; business path also uses remote configuration | Packaged local model found; per-mode offline behavior unresolved |
| Vocal beautify | `vocal_beautifys[]` | `enable`, `production_path`, `time_range`, `voice_change_mode`, `ambient_sound_level`, `KAudioVocalBeautify` | Asynchronous algorithm producing derived audio, with SAMI/network paths | Static-strong; no active draft or export sample |
| Vocal separation | `vocal_separations[]` | `choice`, `removed_sounds`, `production_path`, `final_algorithm`, `time_range` | Asynchronous stem generation; unfinished work can block export | Default companions observed; active result unresolved |
| Pitch shift | `audio_pitch_shifts[]` | `enable_pitch_shift`, `semitones`, `cents`, `AudioPitchShiftViewModel` | Local audio processing with semitone and cent values stored separately | Static-strong; range, quantization, and duration behavior unresolved |
| Stereo panning | `audio_pannings[]` | `enable_panning`, `panning_value` | Local per-channel panning | Static-strong; value range and panning law unresolved |
| Channel configuration | `sound_channel_mappings[]` | `MaterialChannelConfig`: `audio_channel_mapping`, `is_config_open` | Input channel selection/routing metadata | Default companions observed; enum mapping unresolved |
| Audio translation | `ai_translates[]`, `multi_language_refs[]` | Source/target language, `production_path`, `mouth_shape_modify`; upload/web/download timing logs | Explicit asynchronous network task with optional detection, voiceprint, and mouth-shape stages | Static-strong; no active draft or downloaded result |

## Important Distinctions

### `audio_balances` is not current stereo panning

In 11.3.0, `MaterialAudioBalance` owns `enable_balance`,
`average_loudness`, `peak_loudness`, and `target_loudness`. It is a legacy
loudness model. `MaterialAudioPanning` owns `enable_panning` and
`panning_value`, matching the current Stereo Balance control. Treating both
collections as left/right panning would merge unrelated versioned semantics.

### Loudness normalization is not a volume slider

Jianying stores the target, measured average/peak values, and time range. The
binary constrains `target_loudness` to `[-70, 0] LUFS` and includes manager,
write-result, and wait-for-algorithm paths. QCut should model analysis results,
enabled state, and target separately from ordinary gain.

### Denoise has a packaged local model, but this does not prove full offline use

The installed application contains:

```text
Contents/Resources/audiosami/unet_denoise_44k_music_model_v1.0.model
```

Its size is `264172` bytes. The runtime also contains remote tool descriptor
and SAMI markers. The supported conclusion is that a local model-backed path
exists; an offline A/B test is still required for every mode.

### Beautify, separation, and translation create derived results

These features contain `production_path` or equivalent output ownership.
Jianying's export blocker checks `vocal_beautify`, `vocal_separation`,
`ai_translate`, and `loudness` completion. Audio translation additionally logs
detach, audio upload, language detection, voiceprint comparison, web task,
download, and mouth-shape timing. It is not a local real-time filter.

## Available Probes

Run the combined panel probe:

```bash
bun research/jianying-basic-audio-probe/probe-report.ts
```

Override the application or draft root when needed:

```bash
bun research/jianying-basic-audio-probe/probe-report.ts \
  --app "/Applications/VideoFusion-macOS.app" \
  --draft-root "$HOME/Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
```

The report omits project and filesystem paths, never modifies a Jianying
project, separates total objects from active objects, and treats missing static
markers as `partial` or `missing` rather than assuming support.

Inventory and diff a controlled draft:

```bash
bun .agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/inspect-draft.ts inventory

bun .agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/inspect-draft.ts diff \
  --before "/private-evidence/A-001/before/draft_content.json" \
  --after "/private-evidence/A-001/after/draft_content.json"
```

Compare exported audio:

```bash
bun scripts/capcut-e2e/audio-comparison.ts \
  --left "/private-evidence/jianying.mov" \
  --right "/private-evidence/qcut.mov" \
  --output "/private-evidence/comparison" \
  --json
```

This compares stream layout, sample rate, duration, EBU R128 integrated
loudness, LRA, true peak, silence intervals, and per-channel differences.
`audio-tone-evidence.ts` can measure calibration-tone frequencies in selected
windows, but it is currently an E2E module rather than a standalone CLI.

## Remaining Controlled Experiments

Both visible lab projects are currently `.locked`, and their current draft
bodies are opaque. This investigation did not copy, mutate, or attempt to
decrypt them. Create a fresh `QCut-JY-Lab-YYYYMMDD-Audio` project containing
only generated stereo calibration media, then change one variable per case:

| ID | Single operation | Draft evidence | Export evidence |
| --- | --- | --- | --- |
| A-001 | Change volume from `0.0dB` to `-6.0dB` | Exact `volume` value | RMS/peak ratio and dB mapping |
| A-002 | Set `1.2s` fade-in and `0.7s` fade-out | Duration unit and `fade_type` | Envelope endpoints and curve |
| A-003 | Enable loudness normalization | Target/average/peak and task state | LUFS convergence and true peak |
| A-004 | Enable each denoise mode | Mode/rate/path | Noise floor, speech damage, offline behavior |
| A-005 | Enable vocal beautify and change intensity | Output path, mode, time range | Derived file and spectrum change |
| A-006 | Keep vocal and accompaniment separately | Choice, removed sounds, output paths | Stem leakage |
| A-007 | Apply `+3` semitones plus fine tuning | Semitones/cents | Frequency ratio and duration preservation |
| A-008 | Set full left, center, and full right | Panning value | Channel gains and panning law |
| A-009 | Toggle each channel configuration | Mapping enum | Stereo/mono input routing |
| A-010 | Chinese-to-English without mouth modification | Languages, task, output path | Network stages and derived audio |

Each case must begin from the same clean baseline. Capture snapshots only after
the project is closed or autosave is idle. If the body remains opaque, retain
UI/export evidence and wait for Jianying to produce a plaintext backup or
subdraft. Do not decrypt or copy a `.locked` project.

## Direct QCut Implications

1. Implement the deterministic local layer first: volume, fade, pitch,
   panning, and channel mapping.
2. Split loudness into analysis and application and retain measured values.
3. Give denoise explicit mode/rate/model provenance and report local versus
   network resource requirements separately.
4. Give beautify, separation, and translation asynchronous state, cancellation,
   caching, derived-file lifecycle, and export blocking.
5. Preserve unknown audio materials during import. QCut still declares loss for
   `audio_fades`, so current interoperability is not complete.

Until A-001 through A-010 are complete, we can confirm architecture and field
entry points, but not exact UI mappings, algorithm parameters, or perceptual
parity with Jianying.
