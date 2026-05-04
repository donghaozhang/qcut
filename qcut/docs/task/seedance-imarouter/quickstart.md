# Quickstart — Seedance via IMA Router

## 1. Set your API key

```bash
export IMAROUTER_API_KEY="sk-..."
```

(Or persist it in `~/.qcut/.env` as `IMAROUTER_API_KEY=...`.)

## 2. Run the script

Text-to-video (default):

```bash
node docs/task/seedance-imarouter/seedance-generate.mjs \
  --prompt "Time-lapse of a city at dawn, warm cinematic colors." \
  --model seedance-2.0-fast \
  --duration 5 \
  --resolution 720p \
  --out ./out.mp4
```

Image-to-video:

```bash
node docs/task/seedance-imarouter/seedance-generate.mjs \
  --prompt "Camera pans over the steaming cup" \
  --model seedance-2.0 \
  --image https://file.fashionlabs.cn/doc_image/r2v_tea_pic1.jpg \
  --duration 10 \
  --aspect-ratio 16:9 \
  --audio \
  --out ./tea.mp4
```

Submit only (skip polling, just print the task id):

```bash
node docs/task/seedance-imarouter/seedance-generate.mjs --prompt "..." --submit-only
```

Poll an existing task:

```bash
node docs/task/seedance-imarouter/seedance-generate.mjs --task-id task_2026...
```

## 3. Flags

| Flag                | Default               | Notes                                        |
| ------------------- | --------------------- | -------------------------------------------- |
| `--prompt <text>`   | —                     | Required for text-to-video                   |
| `--model <id>`      | `seedance-2.0-fast`   | See README for valid IDs                     |
| `--duration <sec>`  | `5`                   | 5–15 typical                                 |
| `--resolution <p>`  | `720p`                | `480p` / `720p` / `1080p`                    |
| `--aspect-ratio`    | (none)                | e.g. `16:9`, `9:16`                          |
| `--size WxH`        | (none)                | Overrides `resolution`                       |
| `--image <url>`     | (repeatable)          | 1–14 URLs                                    |
| `--ref-video <url>` | (repeatable)          | Max 3                                        |
| `--ref-audio <url>` | (repeatable)          | Max 1                                        |
| `--role-mode`       | `reference`           | `reference` or `frame`                       |
| `--audio`           | off                   | Toggle on background audio                   |
| `--out <path>`      | (none)                | Download finished video to this path         |
| `--submit-only`     | off                   | Submit and print task id, don't poll         |
| `--task-id <id>`    | —                     | Skip submission, just poll this task id      |
| `--poll-interval`   | `5` (seconds)         | Seconds between status checks                |
| `--timeout`         | `600` (seconds)       | Give up after this long                      |

## Exit codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| 0    | Completed successfully           |
| 1    | API or network error             |
| 2    | Job failed (`status: failed`)    |
| 3    | Timed out before completion      |
