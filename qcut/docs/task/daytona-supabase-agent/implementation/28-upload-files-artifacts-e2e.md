# Upload Files to Artifacts E2E

Date: 2026-05-21

Goal: verify that uploaded image, text, and video files can appear in the Chat Agent `Sandbox files` / artifacts panel.

## Result

Passed on the production page:

```text
https://quriosity.com.au/chat-agent.html
```

The page connected to a real Daytona terminal session and uploaded three local test files through the website upload UI.

## Test Files

Run id:

```text
1779389330
```

Local input files:

```text
output/playwright/upload-artifacts-e2e-1779389330/input/upload-text-1779389330.txt
output/playwright/upload-artifacts-e2e-1779389330/input/upload-image-1779389330.png
output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

## Real UI Steps

1. Opened `https://quriosity.com.au/chat-agent.html`.
2. Confirmed terminal starts as `disconnected`.
3. Clicked `Connect`.
4. Waited until the Daytona terminal status became `connected`.
5. Used the page upload input with:
   - `upload-text-1779389330.txt`
   - `upload-image-1779389330.png`
   - `upload-video-1779389330.mp4`
6. Clicked `Upload selected files`.
7. Waited for the `Sandbox files` panel to show all three uploaded filenames.
8. Verified each tile's DOM kind and path.

## Evidence

Upload status from the page:

```text
Uploaded to /tmp/qcut-output: upload-text-1779389330.txt, upload-image-1779389330.png, upload-video-1779389330.mp4
```

Artifacts panel text:

```text
upload-image-1779389330.png
76 bytes
upload-text-1779389330.txt
42 bytes
upload-video-1779389330.mp4
5.7 KB
```

DOM verification:

```json
[
  {
    "name": "upload-text-1779389330.txt",
    "kind": "log",
    "path": "/tmp/qcut-output/upload-text-1779389330.txt"
  },
  {
    "name": "upload-image-1779389330.png",
    "kind": "image",
    "path": "/tmp/qcut-output/upload-image-1779389330.png"
  },
  {
    "name": "upload-video-1779389330.mp4",
    "kind": "video",
    "path": "/tmp/qcut-output/upload-video-1779389330.mp4"
  }
]
```

Screenshot evidence:

```text
output/playwright/upload-artifacts-e2e-1779389330/06-uploaded-artifacts.png
```

Machine-readable result:

```text
output/playwright/upload-artifacts-e2e-1779389330/result.json
```

## Notes

- The upload target was the current sandbox path, which defaults to `/tmp/qcut-output`.
- Uploaded text files are classified as `log`; this is expected because the artifact kind enum uses `log` for text-like files.
- Uploaded images are classified as `image`.
- Uploaded videos are classified as `video`.
- No code fix was needed for this goal.

