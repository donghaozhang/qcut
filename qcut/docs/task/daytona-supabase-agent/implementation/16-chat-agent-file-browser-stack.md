# Chat Agent File Browser Stack

Date: 2026-05-17

## Goal

Upgrade the Chat Agent file experience toward the stack we want long term:

- Custom sandbox File Browser for Daytona-specific session/path behavior.
- Uppy for file picking, queue UI, drag/drop, and upload feedback.
- Optional TreeView later if deep folder navigation becomes painful.

## Decision

Do not replace the current browser with a generic React file manager yet. The QCut website is currently a static HTML/JavaScript site, and the file browser is tightly coupled to:

- active Daytona session id
- full sandbox paths
- default QCut output path `/tmp/qcut-output`
- Codex-visible upload paths
- license-server auth and download routes

Adding a full React file manager would introduce a build/runtime split before we need it. The lower-risk path is to keep the custom file browser and add Uppy as a focused upload UI.

## Implement Now

Done:

1. Added Uppy Dashboard through the official browser CDN module:
   - CSS: `https://releases.transloadit.com/uppy/v5.2.1/uppy.min.css`
   - JS module: `https://releases.transloadit.com/uppy/v5.2.1/uppy.min.mjs`
2. Kept the native file input as a fallback when Uppy fails to load.
3. Routed the Upload button through the selected Uppy queue when available.
4. Preserved the existing multipart sandbox upload API.
5. Added upload progress/status text around upload start, completion, and errors.
6. Added stable `data-path`, `data-kind`, and action `aria-label` values to file rows so E2E tests can click a specific folder/file without relying on repeated `Open` labels.

Implementation files:

- `packages/nexusai-website/chat-agent.html`
- `packages/nexusai-website/js/agent-chat.js`
- `packages/nexusai-website/js/agent-chat.test.js`

## Defer

1. TreeView sidebar for large directory trees.
2. Create folder, rename, delete, and move operations.
3. File previews for images/audio/video.
4. True resumable uploads. Uppy can support that later, but the current license-server endpoint is a normal multipart upload endpoint.

## Verification Plan

Passed:

- `node --check packages/nexusai-website/js/agent-chat.js`
- `node --test packages/nexusai-website/js/agent-chat.test.js`
  - 28 tests passed.
- Local browser verification through `http://127.0.0.1:4174/chat-agent.html`:
  - Uppy Dashboard rendered.
  - Native fallback input was hidden after Uppy initialized.
  - Upload button remained outside Uppy and still points to the QCut sandbox upload flow.

Evidence:

- `output/playwright/chat-agent-file-browser-stack/01-uppy-dashboard-local.png`

Still needed before production release:

1. Push website and root repo changes.
2. Open production `chat-agent.html`.
3. Confirm Uppy panel renders in production.
4. Upload a proof text file into the current sandbox folder.
5. Confirm the file appears in the browser and downloads by full path.
