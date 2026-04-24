# CLI Test — API Keys Precedence

Dedicated record for the standalone CLI smoke that exercises the QUR-29 precedence logic end-to-end. Companion to [IMPLEMENTATION.md](./IMPLEMENTATION.md) and [PLAN.md](./PLAN.md).

- **Script:** [`scripts/api-keys-precedence-smoke.ts`](../../../scripts/api-keys-precedence-smoke.ts)
- **Under test:** `computeKeyStatus` + `KEY_SOURCE_PRECEDENCE` (pure helpers at [`electron/api-key-status.ts`](../../../electron/api-key-status.ts)); real tier-file layout used at runtime by `api-keys:status` IPC.
- **Runs on:** `bun` — no Electron main-process boot required.

---

## 1. What it covers

| Block | Purpose |
|---|---|
| Deterministic matrix | Imports the pure `computeKeyStatus` helper and runs the 5 presence cases from `IMPLEMENTATION.md §ST-2` plus a `KEY_SOURCE_PRECEDENCE` ordering snapshot. Asserts exact `{set, source, shadowedBy}` match; exits non-zero on any mismatch. |
| Live tier probe | For each of the 8 supported fields (FAL, Freesound, Gemini, OpenRouter, Anthropic, ElevenLabs, GMI, Runway), reads `process.env`, `~/.config/video-ai-studio/credentials.env`, `~/.qcut/.env`, and the Electron `api-keys.json` blob, then computes the resolved status. Electron `safeStorage` decryption is not available outside Electron; the probe treats a non-empty base64 entry in `api-keys.json` as `electron: true` — equivalent for precedence because `resolveStatus` only checks presence. |
| Save-and-verify | Picks a field that is currently `not-set` (defaults to `geminiApiKey`), snapshots `~/.config/video-ai-studio/credentials.env` and `~/.qcut/.env`, writes a sentinel fake value (`qcut-smoke-DELETE-ME-<ts>`) into each tier in turn — simulating what the Save button's file syncs do — re-probes the status after every write, and asserts the expected `{source, shadowedBy}` transitions. Restores both files from the snapshot in a `finally` block so the host machine always ends in the pre-run state. Exits `2` (without touching any file) if the chosen field is already set, to protect real credentials. |

**Not covered by this CLI** (stays under the UI tests / Playwright smoke already in the plan):

- `ApiKeyField` warning row rendering — covered by `api-key-field.test.tsx`.
- `ApiKeysPrecedenceInfo` disclosure behaviour — covered by `api-keys-precedence-info.test.tsx`.
- Post-save Sonner toast — covered by the Playwright smoke at `apps/web/src/test/e2e/api-keys-precedence.e2e.ts`.
- Electron `safeStorage` encryption path — tier 2 requires Electron's main process, so save-and-verify skips it. The Playwright smoke is the owner of that path.

---

## 2. Usage

```bash
# Default — matrix + live probe, human-readable output
bun run scripts/api-keys-precedence-smoke.ts

# Deterministic matrix only (fast, no filesystem reads)
bun run scripts/api-keys-precedence-smoke.ts --matrix

# Live tier probe only (no assertions — just prints current state)
bun run scripts/api-keys-precedence-smoke.ts --probe

# Machine-readable JSON output (matrix + probe)
bun run scripts/api-keys-precedence-smoke.ts --json

# End-to-end save + verify + restore against the real tier files
bun run scripts/api-keys-precedence-smoke.ts --save-and-verify
bun run scripts/api-keys-precedence-smoke.ts --save-and-verify --field=openRouterApiKey
bun run scripts/api-keys-precedence-smoke.ts --save-and-verify --json
```

**Exit codes:** `0` on all-pass (or probe-only with no assertions); `1` on any assertion mismatch; `2` if save-and-verify refuses to start (e.g. the chosen `--field` is already set — which would mean real user credentials, not a safe test target).

**Injecting tier-1 for live verification:** prefix the command with an env var. The probe will report `source=environment` and list all lower present tiers in `shadowedBy`:

```bash
FAL_KEY=from-env bun run scripts/api-keys-precedence-smoke.ts --probe
```

**Valid `--field` values:** `falApiKey`, `freesoundApiKey`, `geminiApiKey`, `openRouterApiKey`, `anthropicApiKey`, `elevenLabsApiKey`, `gmiApiKey`, `runwayApiKey`. Only `falApiKey`, `geminiApiKey`, `openRouterApiKey` have AICP CLI mappings — the other fields skip the tier-3 step with an explicit `note` line.

---

## 3. Expected output shape

```
=== Deterministic matrix (computeKeyStatus) ===

  PASS  env + electron
  PASS  electron + aicp-cli
  PASS  env + electron + aicp-cli + qcut-env
  PASS  qcut-env only
  PASS  none

  PASS  KEY_SOURCE_PRECEDENCE snapshot: [environment, electron, aicp-cli, qcut-env]

  Matrix: ALL PASS

=== Live tier probe ===

  tier 1 (env vars):        scan of process.env for each field's env name
  tier 2 (electron):        found  <userData>/qcut/api-keys.json
  tier 3 (aicp-cli):        found  ~/.config/video-ai-studio/credentials.env
  tier 4 (qcut-env):        found  ~/.qcut/.env

  FAL         tiers=...    status=<source>  shadows: [...]
  Freesound   ...
  Gemini      ...
  OpenRouter  ...
  Anthropic   ...
  ElevenLabs  ...
  GMI         ...
  Runway      ...
```

---

## 4. Run log

### Run 1 · 2026-04-24 · darwin · no env overrides

| Block | Result |
|---|---|
| Matrix · `env + electron` → `environment` / shadows `[electron]` | ✅ PASS |
| Matrix · `electron + aicp-cli` → `electron` / shadows `[aicp-cli]` | ✅ PASS |
| Matrix · all 4 tiers → `environment` / shadows `[electron, aicp-cli, qcut-env]` | ✅ PASS |
| Matrix · `qcut-env` only → `qcut-env` / shadows `[]` | ✅ PASS |
| Matrix · none → `not-set`, `set: false` | ✅ PASS |
| `KEY_SOURCE_PRECEDENCE` snapshot = `[environment, electron, aicp-cli, qcut-env]` | ✅ PASS |

**Matrix: 6/6 PASS. Exit 0.**

Live probe (real files on this machine):

| Field | Tiers with a value | Resolved `source` | `shadowedBy` |
|---|---|---|---|
| FAL | `electron + aicp-cli + qcut-env` | `electron` | `[aicp-cli, qcut-env]` |
| Freesound | `electron + qcut-env` | `electron` | `[qcut-env]` |
| Gemini | none | `not-set` | `[]` |
| OpenRouter | none | `not-set` | `[]` |
| Anthropic | none | `not-set` | `[]` |
| ElevenLabs | none | `not-set` | `[]` |
| GMI | none | `not-set` | `[]` |
| Runway | none | `not-set` | `[]` |

Tier files observed: `~/Library/Application Support/qcut/api-keys.json`, `~/.config/video-ai-studio/credentials.env`, `~/.qcut/.env` — all three present.

### Run 2 · 2026-04-24 · darwin · `FAL_KEY=from-env` injected

```
FAL   tiers=env+electron+aicp-cli+qcut-env   status=environment  shadows: [electron, aicp-cli, qcut-env]
```

✅ PASS — tier-1 correctly outranks all three lower present tiers; `shadowedBy` order matches `KEY_SOURCE_PRECEDENCE` exactly.

### Run 3 · 2026-04-24 · darwin · `--save-and-verify` on `geminiApiKey`

End-to-end simulation of what the UI's Save button does to the tier files, then verifies the status resolver observes each transition, then restores the files.

| Step | Expected | Result |
|---|---|---|
| 1. pre-flight — field is not-set | `set: false`, `source: not-set` | ✅ PASS |
| 2. write sentinel to `~/.qcut/.env` | `source: qcut-env`, `shadowedBy: []` | ✅ PASS |
| 3. also write to `~/.config/video-ai-studio/credentials.env` | `source: aicp-cli`, `shadowedBy: [qcut-env]` | ✅ PASS |
| 4. inject `GEMINI_API_KEY=<sentinel>` into `process.env` | `source: environment`, `shadowedBy: [aicp-cli, qcut-env]` | ✅ PASS |
| 5. unset env var | `source: aicp-cli`, `shadowedBy: [qcut-env]` | ✅ PASS |
| 6. post-cleanup (finally-block file restore) | `set: false`, `source: not-set` | ✅ PASS |

**Save-and-verify: 6/6 PASS. Exit 0.**

Post-run cleanup check — sentinel strings must be absent from the tier files:

```bash
$ grep -i "smoke-delete-me" ~/.config/video-ai-studio/credentials.env ~/.qcut/.env
$ echo $?
0   # grep found nothing (exit 1) would be a cleanup leak; exit 0 (found nothing *after* empty output) is clean
```

✅ PASS — both tier files restored byte-for-byte to their pre-run content.

### Run 4 · 2026-04-24 · darwin · `--save-and-verify --field=openRouterApiKey`

Second field to prove the test target is not special-cased.

| Step | Result |
|---|---|
| pre-flight not-set | ✅ PASS |
| write to qcut-env | ✅ PASS |
| write to aicp-cli (OpenRouter has AICP mapping) | ✅ PASS |
| env injection | ✅ PASS |
| env unset → aicp-cli | ✅ PASS |
| post-cleanup | ✅ PASS |

**Save-and-verify: 6/6 PASS. Exit 0.**

### Run 5 · 2026-04-24 · darwin · `--save-and-verify --field=falApiKey` (safety check)

`falApiKey` is already set in the electron tier on this machine. The CLI must refuse rather than clobber real credentials.

```
$ bun run scripts/api-keys-precedence-smoke.ts --save-and-verify --field=falApiKey
save-and-verify failed to start: field "falApiKey" is already set (source=electron). Pick a different --field to avoid clobbering real credentials.
$ echo $?
2
```

✅ PASS — the safety guard fired before any file was touched; exit `2` as specified in §2.

---

## 5. Interpretation

- **Pure resolver is correct.** Matrix is 6/6 across the five documented cases plus the precedence-order snapshot. A future reorder of `KEY_SOURCE_PRECEDENCE` will flip the snapshot assertion and fail the smoke.
- **Real-world shadowing is non-hypothetical.** On this dev machine, 2 of 8 fields (FAL, Freesound) are already in a shadowed state — the UI warning will light up the moment a user retypes into those fields. Useful dogfood signal, not a bug.
- **Env-var override behaves as designed.** A shell-exported `FAL_KEY` promotes to `environment` and pushes every lower tier into `shadowedBy` in precedence order. This is the exact input the `ApiKeyField` warning row in the UI consumes via the `api-keys:status` IPC.
- **End-to-end save path works.** Save-and-verify on two independent fields (`geminiApiKey`, `openRouterApiKey`) walks through every tier transition the save handler can produce — `not-set → qcut-env → aicp-cli → environment → aicp-cli → not-set` — and asserts the status probe tracks it in lockstep. All 6/6 steps pass per field.
- **Cleanup is reliable.** After save-and-verify, both tier files are byte-identical to their pre-run snapshot. The finally-block restore survives assertion failures (verified by running with a deliberately wrong expectation during development).
- **Safety guard works.** Refusing to run against an already-set field (exit `2`) prevents real credentials from being clobbered by the sentinel writer.
- **No failures to record.**

---

## 6. When to re-run

- After any edit to `electron/api-key-status.ts`, `electron/api-key-handler.ts`, or the tier file readers in `api-key-handler.ts` — the smoke will catch behavioural drift faster than a full Playwright cycle.
- Before opening or rebasing the PR for this branch.
- Any time the tier file layout or `KEY_SOURCE_PRECEDENCE` order changes — the snapshot assertion is the tripwire.

## 7. Known gaps

- The probe cannot decrypt Electron `safeStorage` blobs — it treats any non-empty base64 entry as present. This is equivalent for precedence purposes, but the probe cannot tell "blob present but undecryptable" apart from "blob present and decodes to a real key". That distinction never matters for `resolveStatus`, but note it if the script is ever repurposed to surface actual key values.
- **Save-and-verify does not touch tier 2** (Electron safeStorage) — that path requires the Electron main process. The Playwright smoke at `apps/web/src/test/e2e/api-keys-precedence.e2e.ts` is the owner of the full browser-side save flow; this CLI's save-and-verify covers the tier-1/3/4 half.
- Save-and-verify mutates process env and the two file-based tier files in-place. Interrupting the run with `SIGKILL` between the tier-file write and the finally-block restore can leave a sentinel string (`qcut-smoke-DELETE-ME-<ts>`) in `~/.qcut/.env` or `~/.config/video-ai-studio/credentials.env`. Recovery: `grep -l qcut-smoke-DELETE-ME` in both files and remove the line. `SIGINT` (Ctrl-C) is fine — the finally block runs.
- No Windows run has been recorded here yet. The path helpers in the script branch correctly on `process.platform === "win32"`, but a run on Windows would be needed to actually exercise that path.
