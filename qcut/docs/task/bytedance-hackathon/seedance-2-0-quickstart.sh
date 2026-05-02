#!/bin/bash
set -e

# byteplus-python-sdk-v2 has broken declared deps; install the missing
# transitive imports (typing_extensions, pydantic, anyio, distro, sniffio)
# explicitly so this works on a clean Python.
pip3 install byteplus-python-sdk-v2 httpx typing_extensions pydantic anyio distro sniffio -q

python3 - <<'PYTHON'
from byteplussdkarkruntime import Ark
import os, sys, time, httpx

api_key = os.environ.get("SEEDANCE_2_0_API")
if not api_key:
    api_key = input("Enter your Seedance API key: ").strip()

client = Ark(
    base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
    api_key=api_key,
)

task = client.content_generation.tasks.create(
    model="dreamina-seedance-2-0-260128",
    content=[{"type": "text", "text": "cat walk on the moon"}],
    ratio="16:9",
    duration=5,
)
print(f"Task: {task.id}")

deadline = time.time() + 360  # 6 min
while time.time() < deadline:
    r = client.content_generation.tasks.get(task_id=task.id)
    if r.status == "succeeded":
        url = r.content.video_url
        print(f"Done: {url}")
        with httpx.stream("GET", url, follow_redirects=True) as resp:
            resp.raise_for_status()
            with open("cat_moon.mp4", "wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
        print("Saved: cat_moon.mp4")
        sys.exit(0)
    if r.status in ("failed", "cancelled"):
        code = getattr(getattr(r, "error", None), "code", "?")
        msg = getattr(getattr(r, "error", None), "message", "?")
        print(f"Failed: {code} - {msg}")
        sys.exit(1)
    print(f"  {r.status}...")
    time.sleep(10)

print("Timed out after 6 min")
sys.exit(2)
PYTHON
