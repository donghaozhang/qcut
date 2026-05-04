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
| `--upload <url>`    | (repeatable)          | Pre-upload via `/v1/assets/create` and use the resulting `asset://...` |
| `--asset-timeout`   | `120` (seconds)       | Max time to wait for asset review            |
| `--group-name`      | `seedance-cli`        | Name used when auto-creating an asset group  |
| `--reset-group`     | off                   | Force a fresh asset group (ignores cached id)|

## Asset upload flow (`--upload`)

For real-people / portrait references, route the image through `/v1/assets/create` so it goes through the platform's pre-review (the same review that may reject inline URLs with `Error 601400`).

```bash
node docs/task/seedance-imarouter/seedance-generate.mjs \
  --prompt "Subject smiles, gentle head turn, soft natural light" \
  --model seedance-2.0 \
  --upload "https://your-host.example.com/portrait.jpg" \
  --duration 5 \
  --aspect-ratio 16:9 \
  --out docs/task/seedance-imarouter/test-upload.mp4
```

What happens:

1. Creates an asset group on first run, caches its id in `.env` as `IMAROUTER_GROUP_ID_OVERSEAS` or `IMAROUTER_GROUP_ID_CN` (channel-aware).
2. `POST /v1/assets/create` with the right `model` for your channel (`seedance-upload` for overseas, `ima-pro-upload-cn` for `-cn` models).
3. Polls `POST /v1/assets/get` until `Status` reads as approved (or rejects fast, surfacing the reason).
4. Submits the video job with `images: ["asset://asset-..."]`.

Channel safety: the script picks `uploadModel` from the video model — never mix domestic/overseas, which would create a usable `asset://...` that the video job can't consume.

## Exit codes

| Code | Meaning                          |
| ---- | -------------------------------- |
| 0    | Completed successfully           |
| 1    | API or network error             |
| 2    | Job failed (`status: failed`)    |
| 3    | Timed out before completion      |
