# Quickstart — Seedance 2.0 Smoke Test

Verified working on macOS (Python 3.14) on 2026-05-02.

## Run

```bash
export SEEDANCE_2_0_API="<your-key>"   # see api-keys.md (gitignored)
./test-seedance.sh
```

The script:

1. Creates `.venv/` in this folder (idempotent).
2. Installs `byteplus-python-sdk-v2`, `httpx`, `typing_extensions`, `pydantic`, `anyio`, `distro`, `sniffio`.
3. Submits a 5s 16:9 text-to-video task (`cat walk on the moon`).
4. Polls every 10s until `succeeded` (5-min deadline).
5. Streams the result MP4 into `cat_moon.mp4` in this folder.

Expected runtime: ~2 minutes (task accept → ~11 × `running…` → download).

## Why the extra deps?

`byteplus-python-sdk-v2` ships a broken `install_requires` — its modules import `typing_extensions`, `pydantic`, `anyio`, `distro`, and `sniffio` but the wheel does not declare them. The original gist's `pip3 install byteplus-python-sdk-v2 httpx` will `ModuleNotFoundError` on a clean Python. `test-seedance.sh` installs them explicitly. Worth flagging upstream.

## Endpoint

| Field | Value |
|---|---|
| Base URL | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| Model ID | `dreamina-seedance-2-0-260128` |
| Auth | `Authorization: Bearer <key>` (handled by SDK) |

## Result envelope

```python
task = client.content_generation.tasks.create(...)
# task.id → "cgt-20260503024954-slw8k"

r = client.content_generation.tasks.get(task_id=task.id)
# r.status ∈ {"queued", "running", "succeeded", "failed", "cancelled"}
# r.content.video_url  (TOS pre-signed URL, 24h expiry)
# r.error.code, r.error.message  (only on failed/cancelled)
```

The download URL is a TOS (BytePlus object storage) pre-signed link valid for `X-Tos-Expires=86400` (24 hours). Pull the bytes promptly.
