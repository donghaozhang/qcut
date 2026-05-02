#!/bin/bash
# Smoke test for Seedance 2.0 API.
# Runs from this folder so the output lands here.
# Uses a venv to avoid polluting the system Python install.
set -euo pipefail

cd "$(dirname "$0")"

VENV=".venv"
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

pip install --quiet --upgrade pip
# byteplus-python-sdk-v2 ships with broken declared deps; install them explicitly.
pip install --quiet byteplus-python-sdk-v2 httpx typing_extensions pydantic anyio distro sniffio

: "${SEEDANCE_2_0_API:?Set SEEDANCE_2_0_API to one of the hackathon keys (see api-keys.md)}"

python3 - <<'PYTHON'
from byteplussdkarkruntime import Ark
import os, time, httpx, sys

client = Ark(
    base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
    api_key=os.environ["SEEDANCE_2_0_API"],
)

print("Creating task...", flush=True)
task = client.content_generation.tasks.create(
    model="dreamina-seedance-2-0-260128",
    content=[{"type": "text", "text": "cat walk on the moon"}],
    ratio="16:9",
    duration=5,
)
print(f"Task: {task.id}", flush=True)

deadline = time.time() + 300  # 5 min
while time.time() < deadline:
    r = client.content_generation.tasks.get(task_id=task.id)
    if r.status == "succeeded":
        url = r.content.video_url
        print(f"Done: {url}", flush=True)
        with httpx.stream("GET", url, follow_redirects=True) as resp:
            resp.raise_for_status()
            with open("cat_moon.mp4", "wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
        print("Saved: cat_moon.mp4", flush=True)
        sys.exit(0)
    if r.status in ("failed", "cancelled"):
        print(f"Failed: {r.error.code} - {r.error.message}", flush=True)
        sys.exit(1)
    print(f"  {r.status}...", flush=True)
    time.sleep(10)

print("Timed out after 5 min", flush=True)
sys.exit(2)
PYTHON
