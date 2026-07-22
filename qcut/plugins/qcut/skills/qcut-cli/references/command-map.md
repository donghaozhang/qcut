# QCut CLI Command Map

## Command groups

| Group | Use it for | Examples |
| --- | --- | --- |
| `gen` | Images, videos, speech, music, avatars, grids | `gen image`, `gen video`, `gen tts` |
| `analyze` | Transcription, media analysis, translation, search | `analyze transcribe`, `analyze video` |
| `edit` | AutoClip, upscale, cutout, filters, audio cleanup | `edit autoclip`, `edit upscale-video` |
| `flow` | YAML and ViMax production workflows | `flow run`, `flow script2video` |
| `system` | Models, auth status, keys, setup, project utilities | `system models`, `system doctor` |

Use structured help at every level:

```bash
qcut --help --json
qcut gen image --help --json
qcut gen image --help model --json
```

## Reliable workflows

### Transcribe, then AutoClip

```bash
qcut analyze transcribe -i input.mp4 --srt --json
qcut edit autoclip -i input.mp4 -s input.srt --dry-run --json
qcut edit autoclip -i input.mp4 -s input.srt --json
```

Review the dry-run selection before cutting.

### Generate an image with an explicit frame shape

```bash
qcut gen image -t "..." --ratio 1:1 --json
qcut gen image -t "..." --ratio 9:16 --json
qcut gen image -t "..." --ratio 16:9 --json
qcut gen image -t "..." --width 2000 --height 1152 --json
```

Do not pass a model unless the user requests one or the default is unsupported.

### Discover capabilities before generation

```bash
qcut system doctor --json
qcut system models --json
qcut gen video --help --json
```

### Output handling

Use an explicit output directory when the user cares where files land. Verify
the output file rather than treating a successful job response as proof that a
download completed.
