# Verification Checklist

Use this checklist before calling the WZRD port complete.

## Image

- The image builds from a clean checkout.
- `qcut-smoke` or the WZRD equivalent passes.
- `which qcut` resolves in the sandbox.
- `which codex` resolves in the sandbox.
- `codex --version` works.
- `qcut system doctor --json --skip-health` returns a parseable envelope.
- The image contains the native CLI skill docs Codex is instructed to read.
- Production uses an immutable image digest, not a mutable tag alone.

## Secret handling

- Provider keys are never sent to the browser.
- Provider keys are allow-listed before writing any env file.
- The sandbox env file is mode `0600`.
- The entrypoint rewrites the env file on each start instead of appending.
- `CODEX_AUTH_JSON`, if supported, is validated before writing.
- Expired Codex tokens are rejected or replaced by API-key login.
- WZRD does not query `auth.users` directly from clients or Edge Functions.

## Job execution

- Job command validation rejects shell metacharacters.
- Codex jobs require a non-empty prompt.
- Prompt size is capped.
- The worker can claim exactly one queued job atomically.
- Job state moves through queued, running, and a terminal state.
- Worker restart does not strand queued jobs permanently.
- Long-running jobs have a timeout.
- Final files land in `/tmp/qcut-output` or the chosen WZRD output root.
- Temporary tools and caches do not land in the output root.

## Session lifecycle

- Creating a session stores user id, provider, image tag, status, and expiry.
- Sending a follow-up prompt reuses the active session when intended.
- Expired sessions cannot accept new jobs.
- Idle cleanup ends old sessions and deletes the Daytona sandbox.
- User-triggered end marks the session stopping/ended and deletes the sandbox.
- A missing provider sandbox creates a replacement or returns a clear error.

## Files and artifacts

- Upload filenames reject path separators, null bytes, `.`, and `..`.
- Upload size is capped.
- Sandbox paths must be absolute and reject `.` / `..` segments.
- Directory downloads are archived safely.
- Output artifacts are copied to `project-assets/{userId}/qcut-agent/{sessionId}/...` or an equivalent WZRD path.
- Artifact rows store content kind, byte size, storage path, and useful metadata.
- Text preview caps are enforced even when byte metadata is missing.

## Interactive terminal, if added

- Relay tokens are short-lived.
- Relay verifies token signatures before opening a PTY.
- Relay fetches session state and rejects inactive sessions.
- Only one browser attachment is allowed for a PTY session.
- PTY cwd is the expected workspace.
- `CODEX_HOME` is session-scoped.
- The startup command creates input, output, and tools directories.
- Disconnect cleans up the PTY without accidentally ending a newer attachment.

## Product integration

- Generated media appears in the WZRD asset library.
- The chat UI shows progress, errors, and final artifacts.
- Credit deduction, if enabled, happens before expensive sandbox work.
- Failed sandbox creation does not leave a paid-but-unusable session without a refund path.
- A real end-to-end prompt can generate at least one image or video and display/download it from WZRD.

## Useful QCut commands

From `qcut/`:

```bash
bun run build:cli-image
bun --cwd packages/agent-worker test
bun --cwd packages/license-server test
bun --cwd packages/qcut-relay test
```

For a WZRD port, mirror these with:

- Image build/smoke.
- Worker unit tests.
- Edge Function route tests.
- A real Daytona sandbox smoke.
- A browser E2E that confirms a final artifact is visible in the app.

