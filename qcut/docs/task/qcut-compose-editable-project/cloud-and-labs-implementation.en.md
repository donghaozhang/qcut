# Compose Cloud Jobs and Lab Integration

Updated: 2026-09-06. Branch: `timeline-fixed-prfix`.

## Implemented Paths

- FAL now has a dedicated queue adapter for submission, status, result retrieval and cancellation requests. Its remote request ID is persisted.
- QCut now uses authenticated HTTP endpoints, a PostgreSQL queue and a separate Bun worker. The worker uses OpenRouter for planning; QCut is no longer an in-process provider alias.
- Snapshot capture analyzes local beats and scene boundaries. Optional visual analysis adds frame descriptions, objects, mood and composition to shot labels.
- Caption presets, built-in text templates/presets, verified Font Lab references and native text style/animation bindings reach editable timeline elements.
- The Broker adds filters, fonts, text templates, fancy words, text animations and saved generated images/videos to its candidate pool.

Catalog discovery is not render verification. Preview-only text and unavailable filters are excluded. Capabilities and licensing remain explicit. Private asset packages are neither committed nor uploaded for planning.

## Deployment Required

**This change does not deploy infrastructure or migrate production.**

1. Apply `packages/db/migrations/0010_compose_jobs.sql` through the normal migration process. Schema, journal and snapshot are included. Use a trusted service database role; RLS is enabled with no public policies.
2. Configure the separate worker with `DATABASE_URL`, `OPENROUTER_API_KEY` and optionally `QCUT_COMPOSE_MODEL`.
3. Run `bun run scripts/compose-worker.ts` from the repository under a process supervisor. Multiple workers may share the queue.
4. Point the API and worker at the same database, then enable the API with `QCUT_COMPOSE_ENABLED=true`. It is disabled by default.
5. Sign in from QCut. Optionally set `QCUT_COMPOSE_API_URL` to the deployed API. HTTPS is required except for loopback development.

Endpoints: authenticated `POST /api/compose/jobs`, `GET /api/compose/jobs/:id`, `GET /api/compose/jobs/:id/result`, and `POST /api/compose/jobs/:id/cancel`. Reads and cancellation are scoped to the authenticated owner. Repeated submission of the same job ID/input is idempotent; mismatched input is rejected.

Claims use `FOR UPDATE SKIP LOCKED`, a five-minute lease and at most three attempts. Planning has a 120-second timeout. Expired leases can be reclaimed; late workers cannot overwrite cancellation or another lease's result. Model invocation is at-least-once: a crash after submission can incur another model charge. Exactly-once billing is not promised.

Initial admission limits are three active jobs and twenty new jobs per rolling day per user, with a 2 MiB request limit. This is gated initial capacity control, not subscription-credit settlement. Terminal records are retained; production operators must choose a retention policy.

## Usage and Recovery

```bash
qcut compose snapshot --output snapshot.json --json
# Optional provider-backed visual analysis; may consume credits.
qcut compose snapshot --analysis-type visual --output visual-snapshot.json --json
qcut compose plan --snapshot snapshot.json --provider qcut --intent full-compose --output patch.json --json
qcut compose plan --snapshot snapshot.json --provider fal --intent full-compose --output fal-patch.json --json
qcut compose plan --job-id SAVED_JOB_ID --output resumed-patch.json --json
```

FAL uses `FAL_KEY`; the default routed model is `google/gemini-2.5-flash`. Complete recovery records live under `~/.qcut/compose/jobs/`, configurable with `QCUT_COMPOSE_JOB_DIR`, with mode 0600, atomic replacement and inter-process locking. The output directory's job JSON is only a status report.

Resume retains the original snapshot, intent and provider. Do not pass replacement `--snapshot` or `--intent`. Exhausting the polling limit does not cancel the remote job. Direct OpenRouter and local adapters remain non-durable and do not support this recovery path.

An ambiguous FAL submission stays uploading and is not automatically submitted again. An operator must find the request ID in FAL and repair remoteTaskId/status in the backed-up recovery record, preserving other fields. A FAL cancellation acknowledgement confirms a request, not necessarily stopped execution or avoided charges.

Primary references: [FAL Router API](https://fal.ai/models/openrouter/router/api), [FAL Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue). The adapter ignores arbitrary response-provided URLs when sending authenticated follow-up requests.

## Analysis and Rendering Boundaries

- Local beat/scene analysis is the default. Vision is opt-in, capped at twenty timestamps per source, and supplies shot labels to planning.
- Analysis is reused per media ID and mapped through source trims and constant playback rate. Muted instances contribute no beats. Reverse and variable-speed clips are skipped with warnings.
- Analysis failures produce warnings, not invented labels. An unlabeled fallback shot represents a clip boundary, not a verified scene cut.
- Caption presets are default, cinematic, bold, minimal, karaoke and news. Plain captions stay caption elements; rich captions become editable text with language and content preserved.
- Built-in text templates and overlay presets use the existing editor registries. Unknown IDs fail. Native font/template/fancy-word/animation identities must resolve locally; unavailable bindings are not silently flattened.
- A text element uses one native template or fancy-word style. Jianying animations require a native runtime template, not an arbitrary plain template. Existing cache/runtime dependencies still apply.
- Generated candidates are saved, nonempty images/videos in the active project. This does not launch generation or enumerate generated audio. File size/mtime version the identity; application re-resolves and rejects replaced files or mismatched media kinds.

## Verification

217 Compose/timeline tests, 272 server tests and 31 editor-core protocol tests passed (520 total), along with Electron, Web and license-server TypeScript checks and the Bun CLI startup smoke test. Isolated PGlite/PostgreSQL tests execute the real migration and exercise quotas, idempotency, ownership, leases, cancellation and retry limits.

Provider requests are mocked: no paid live FAL/OpenRouter planning was exercised. This change was not tested through desktop apply/reopen/playback/export for the new text styles. It does not establish pixel parity with Jianying or prove that production cloud service has been deployed.
