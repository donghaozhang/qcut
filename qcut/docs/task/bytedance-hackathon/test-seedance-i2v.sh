#!/bin/bash
# Smoke test for Seedance 2.0 *image-to-video* (first-frame mode).
# Generates a synthetic non-face test image (face-detection refuses real faces),
# uploads it inline as base64, and animates it with a motion prompt.
# Output: i2v_output.mp4 in this folder.
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
pip install --quiet byteplus-python-sdk-v2 httpx typing_extensions pydantic anyio distro sniffio pillow

: "${SEEDANCE_2_0_API:?Set SEEDANCE_2_0_API to one of the hackathon keys (see api-keys.md)}"

python3 - <<'PYTHON'
from byteplussdkarkruntime import Ark
from PIL import Image, ImageDraw
import base64, io, os, time, httpx, sys

# ---------- 1. Build a non-face test image (1280x720, gradient + moon over hills) ----------
W, H = 1280, 720
img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):
    t = y / H
    r = int(8 + 18 * t)
    g = int(10 + 30 * t)
    b = int(40 + 80 * (1 - t))
    for x in range(W):
        px[x, y] = (r, g, b)
draw = ImageDraw.Draw(img)
# moon
moon_cx, moon_cy, moon_r = 980, 200, 90
draw.ellipse(
    (moon_cx - moon_r, moon_cy - moon_r, moon_cx + moon_r, moon_cy + moon_r),
    fill=(245, 240, 210),
)
# rolling hills (silhouette)
import math
hill = [(0, H)]
for x in range(0, W + 20, 20):
    y = int(H - 140 - 60 * math.sin(x / 180.0) - 30 * math.sin(x / 65.0))
    hill.append((x, y))
hill.append((W, H))
draw.polygon(hill, fill=(15, 25, 45))
# stars
import random
random.seed(7)
for _ in range(120):
    x, y = random.randint(0, W - 1), random.randint(0, 350)
    draw.ellipse((x, y, x + 2, y + 2), fill=(220, 220, 230))

buf = io.BytesIO()
img.save(buf, format="JPEG", quality=88)
img.save("i2v_input.jpg", format="JPEG", quality=88)
b64 = base64.b64encode(buf.getvalue()).decode()
data_uri = f"data:image/jpeg;base64,{b64}"
print(f"Test image ready: i2v_input.jpg ({len(buf.getvalue())//1024} KB)", flush=True)

# ---------- 2. Submit image-to-video task ----------
client = Ark(
    base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
    api_key=os.environ["SEEDANCE_2_0_API"],
)

print("Creating I2V task...", flush=True)
task = client.content_generation.tasks.create(
    model="dreamina-seedance-2-0-260128",
    content=[
        {"type": "text", "text": "slow camera push-in toward the moon while wisps of cloud drift across the night sky"},
        {
            "type": "image_url",
            "image_url": {"url": data_uri},
            "role": "first_frame",
        },
    ],
    ratio="16:9",
    duration=5,
)
print(f"Task: {task.id}", flush=True)

# ---------- 3. Poll until done ----------
deadline = time.time() + 360  # 6 min
while time.time() < deadline:
    r = client.content_generation.tasks.get(task_id=task.id)
    if r.status == "succeeded":
        url = r.content.video_url
        print(f"Done: {url}", flush=True)
        with httpx.stream("GET", url, follow_redirects=True) as resp:
            resp.raise_for_status()
            with open("i2v_output.mp4", "wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
        print("Saved: i2v_output.mp4", flush=True)
        sys.exit(0)
    if r.status in ("failed", "cancelled"):
        code = getattr(getattr(r, "error", None), "code", "?")
        msg = getattr(getattr(r, "error", None), "message", "?")
        print(f"Failed: {code} - {msg}", flush=True)
        sys.exit(1)
    print(f"  {r.status}...", flush=True)
    time.sleep(10)

print("Timed out after 6 min", flush=True)
sys.exit(2)
PYTHON
