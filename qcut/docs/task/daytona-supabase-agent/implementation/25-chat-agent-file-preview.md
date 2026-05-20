# Chat Agent sandbox file preview

Date: 2026-05-20
Branch: `cli-image-v7`

## Goal

Make the Daytona sandbox file browser usable as a lightweight artifact explorer, not only a download list. Users should be able to inspect generated images and common text artifacts before downloading them.

## Scope

- Image previews for `.png`, `.jpg`, `.jpeg`, `.webp`, and `.gif`.
- Text previews for `.md`, `.markdown`, `.json`, `.txt`, `.log`, `.csv`, `.yaml`, and `.yml`.
- Folder navigation and existing download behavior must keep working.
- No new server route unless the existing sandbox download route cannot support previews.

## Implementation Plan

1. Reuse the existing authenticated sandbox download path for preview fetches.
2. Add file type detection helpers in the Chat Agent runtime.
3. Add image thumbnails in the sandbox grid for previewable images.
4. Add a modal preview surface:
   - image modal for bitmap files;
   - text modal for markdown, JSON, and plain text;
   - JSON pretty formatting when parsing succeeds;
   - clear fallback for files that are too large or not previewable.
5. Add `Preview` to the right-click menu for previewable files.
6. Add focused Node tests for path reuse, preview type detection, JSON formatting, and large-text limits.
7. Run the website tests.
8. Run a real Daytona web E2E that creates an image and text/JSON artifacts, previews them, and confirms downloads still work.

## Notes

The server already classifies sandbox files as `image`, `json`, or `log`, and exposes full filesystem downloads through:

```text
/api/agent/sessions/:sessionId/files/download?path=/tmp/qcut-output/file
```

Preview should use that route rather than adding a parallel read route, so auth and path validation remain centralized.

## Implementation

Changed `packages/nexusai-website`:

- `js/agent-chat/01-runtime-api.js`
  - added shared artifact download request construction;
  - added preview type detection for images, JSON, and text-like files;
  - added text preview size limit and JSON pretty formatting;
  - added preview loading through the same authenticated blob request used by downloads.
  - added standalone blob-backed preview tabs for image/text artifacts, so new-tab previews do not depend on a naked download URL carrying auth.
- `js/agent-chat/02-ui-files.js`
  - image tiles now show thumbnails when the file is previewable;
  - clicking previewable files opens a modal instead of doing nothing;
  - right-click menu includes `Preview`, `Open preview in new tab`, `Download to local`, `Copy path`, and `Copy filename` for files;
  - folder right-click menu includes `Open folder`, `Download folder to local`, `Copy path`, and `Copy folder name`;
  - image, JSON, markdown, and raw text previews render in a modal.
- `chat-agent.html`
  - added preview modal, thumbnail, and context-menu separator styling.
- `js/agent-chat.download.test.js`
  - added coverage for preview routing, kind detection, JSON formatting, large text blocking, copy path resolution, escaped standalone preview HTML, and new-tab preview blob routing.

## Verification

Local focused tests:

```bash
node --test \
  packages/nexusai-website/js/agent-chat.download.test.js \
  packages/nexusai-website/js/agent-chat.api.test.js \
  packages/nexusai-website/js/agent-chat.prompt.test.js
```

Result: 42 tests passed.

Real Daytona web E2E:

- URL: `https://quriosity.com.au/chat-agent.html?preview-e2e=1779243490186`
- Frontend under test: local `chat-agent.html` and local `js/agent-chat/*` routed into the production origin.
- Backend under test: production license server and real Daytona Codex terminal.
- Output folder: `output/playwright/sandbox-file-preview-e2e-2026-05-20T02-18-10-186Z`

Passed steps:

1. Loaded production origin with local preview UI.
2. Connected to a real Daytona Codex terminal.
3. Created `.md`, `.json`, and `.png` artifacts under `/tmp/qcut-output`.
4. Opened markdown preview modal.
5. Opened JSON preview modal and verified pretty JSON text.
6. Opened image preview modal; small images render on a visible checker/preview surface.
7. Downloaded the JSON artifact and verified the marker remained in the file.

Real Daytona context-menu E2E:

- URL: `https://quriosity.com.au/chat-agent.html?context-menu-e2e=1779243923761`
- Frontend under test: local `chat-agent.html` and local `js/agent-chat/*` routed into the production origin.
- Backend under test: production license server and real Daytona Codex terminal.
- Output folder: `output/playwright/sandbox-context-menu-e2e-2026-05-20T02-25-23-761Z`

Passed steps:

1. Loaded production origin with local context-menu UI.
2. Connected to a real Daytona Codex terminal.
3. Created `.md`, `.json`, and folder artifacts under `/tmp/qcut-output`.
4. Right-clicked a file and verified `Preview`, `Open preview in new tab`, `Download to local`, `Copy path`, and `Copy filename`.
5. Used `Copy path` and verified clipboard/status contained `/tmp/qcut-output/...`.
6. Used `Open preview in new tab` and verified the new tab contained the artifact marker.
7. Used context-menu `Download to local` and verified the downloaded JSON marker.
8. Right-clicked a folder and verified `Open folder`, `Download folder to local`, `Copy path`, and `Copy folder name`.
