#!/bin/bash
# Probe whether Seedance 2.0 accepts an `asset://` URI from the digital character /
# real-human asset library. Reports the API verdict.
#
# How to run:
#   1) Open Model Playground at:
#      https://console.byteplus.com/ark/region:ark+ap-southeast-1/experience/vision?modelId=seedance-2-0-260128&tab=GenVideo
#   2) Click the **Virtual character Library** tab below the input box.
#      (First visit: requires accepting the playground agreement, and may need a
#       beta-activation support ticket.)
#   3) Hover any character → View virtual character details → Copy asset ID icon.
#   4) export ASSET_URI="asset://<paste>" and re-run this script.
#
# If ASSET_URI is unset, the script tries the documentation's example URI:
#   asset://asset-20260222234430-mxpgh
# That asset is unlikely to belong to your account; the response tells us what
# kind of error the API returns for unknown vs. malformed asset IDs.
set -euo pipefail

cd "$(dirname "$0")"

VENV=".venv"
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

pip install --quiet --upgrade pip
pip install --quiet byteplus-python-sdk-v2 httpx typing_extensions pydantic anyio distro sniffio

: "${SEEDANCE_2_0_API:?Set SEEDANCE_2_0_API to one of the hackathon keys (see api-keys.md)}"

# Default to the URI shown verbatim in the BytePlus docs as an example.
export ASSET_URI="${ASSET_URI:-asset://asset-20260222234430-mxpgh}"

python3 - <<'PYTHON'
from byteplussdkarkruntime import Ark
import os, sys, time, httpx

asset_uri = os.environ["ASSET_URI"]
print(f"Asset URI: {asset_uri}", flush=True)

client = Ark(
    base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
    api_key=os.environ["SEEDANCE_2_0_API"],
)

print("Submitting first-frame task with asset URI...", flush=True)
try:
    task = client.content_generation.tasks.create(
        model="dreamina-seedance-2-0-260128",
        content=[
            {"type": "text", "text": "the character looks toward the camera and smiles, soft cinematic lighting"},
            {
                "type": "image_url",
                "image_url": {"url": asset_uri},
                "role": "first_frame",
            },
        ],
        ratio="16:9",
        duration=5,
    )
except Exception as e:
    print(f"REFUSED at submit: {type(e).__name__}: {e}", flush=True)
    sys.exit(0)

print(f"Task accepted at submit: {task.id}", flush=True)

deadline = time.time() + 360
final = None
while time.time() < deadline:
    r = client.content_generation.tasks.get(task_id=task.id)
    if r.status in ("succeeded", "failed", "cancelled"):
        final = r
        break
    print(f"  {r.status}...", flush=True)
    time.sleep(10)

if final is None:
    print("Timed out waiting for verdict", flush=True)
    sys.exit(2)

if final.status == "succeeded":
    url = final.content.video_url
    print(f"ACCEPTED — task succeeded: {url}", flush=True)
    with httpx.stream("GET", url, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open("avatar_output.mp4", "wb") as f:
            for chunk in resp.iter_bytes():
                f.write(chunk)
    print("Saved: avatar_output.mp4", flush=True)
    sys.exit(0)

err = getattr(final, "error", None)
code = getattr(err, "code", "?") if err else "?"
msg = getattr(err, "message", "?") if err else "?"
print(f"REFUSED at runtime: status={final.status} code={code} message={msg}", flush=True)
sys.exit(0)
PYTHON
