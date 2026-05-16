# QCut System Keys CLI Plan

## Goal

Add a clear QCut CLI surface for checking which provider keys are configured, which are missing, and which command families each key unlocks.

This is mainly for Daytona Chat Agent and sandbox debugging: Codex should be able to run one safe command before a paid or provider-backed task and decide whether image, video, audio, LLM, auth, or upload features can work.

## Current State

The CLI already has the lower-level secret commands:

- `qcut system check-keys --json`
- `qcut system get-key --name <KEY> --reveal`
- `qcut system set-key --name <KEY> --value <VALUE>`
- `qcut system delete-key --name <KEY>`
- `qcut system doctor --json --skip-health`

`check-keys` is useful, but the name reads like an internal diagnostic. For a user or an agent, the obvious command should be closer to:

```bash
qcut system keys
```

## Proposed Commands

Keep `check-keys` for backward compatibility, then add `keys` as the user-facing command:

```bash
qcut system keys
qcut system keys --json
qcut system keys --configured
qcut system keys --missing
qcut system keys --category image
qcut system keys --category video
qcut system keys --category audio
qcut system keys --category llm
qcut system keys --category auth
```

`qcut system check-keys` should call the same handler as `qcut system keys`.

## Output Contract

Human output should be scannable:

```text
QCut keys

Configured
  OK  QCUT_AUTH_TOKEN     env       heiF****verm   auth
  OK  FAL_KEY             env       da51****bf5b   image, video
  OK  ELEVENLABS_API_KEY  secret    sk_1****8ab2   audio

Missing
  --  OPENAI_API_KEY      image, llm
  --  REPLICATE_API_TOKEN image, video
```

JSON output should be stable enough for Chat Agent automation:

```json
{
  "summary": {
    "configured": 3,
    "missing": 2,
    "total": 5
  },
  "keys": [
    {
      "name": "FAL_KEY",
      "configured": true,
      "source": "env",
      "masked": "da51****bf5b",
      "requiredFor": ["image", "video"]
    },
    {
      "name": "OPENAI_API_KEY",
      "configured": false,
      "source": "none",
      "masked": null,
      "requiredFor": ["image", "llm"]
    }
  ],
  "recommendedNext": [
    "Set OPENAI_API_KEY to enable OpenAI image and LLM-backed commands."
  ]
}
```

## Safety Rules

- Default output must never reveal raw secret values.
- Do not add `qcut system keys --reveal`.
- Keep raw reveal limited to the existing single-key command:

```bash
qcut system get-key --name FAL_KEY --reveal
```

- Redact secrets in logs and test snapshots.
- Chat Agent artifacts should not include raw key material.
- If a future UI exposes this command, show only configured/missing state and masked values.

## Daytona Chat Agent Flow

Before a provider-backed task, Codex can run:

```bash
qcut system keys --json
```

Then it can choose behavior:

- If `FAL_KEY` is configured, image jobs using FAL-backed models can run.
- If `RUNWAY_API_KEY` or the matching video provider key is configured, video generation can run.
- If a required key is missing, Codex should tell the user which key is missing instead of attempting a doomed paid command.
- If `QCUT_AUTH_TOKEN` is missing, Codex should stop early and explain that QCut account auth is not available.

## Implementation Notes

Likely files:

- `electron/native-pipeline/cli/command-groups.ts` — expose `keys` under the `system` group.
- `electron/native-pipeline/cli/command-registry.ts` — route `system keys` to the existing key-check handler.
- `electron/native-pipeline/cli/cli-handlers-admin.ts` — normalize key summary data and filters.
- `electron/native-pipeline/cli/cli-output-formatters.ts` — format the human table.
- CLI tests near the existing system/admin command tests.

Prefer sharing one handler between `keys` and `check-keys` to avoid drift.

## Test Plan

Run with real local configuration:

```bash
bun electron/native-pipeline/cli/cli.ts system keys
bun electron/native-pipeline/cli/cli.ts system keys --json
bun electron/native-pipeline/cli/cli.ts system keys --missing --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --json
bun electron/native-pipeline/cli/cli.ts system check-keys --json
```

Expected behavior:

- `system keys` and `system check-keys` report the same underlying state.
- `--missing` returns only missing keys.
- `--configured` returns only configured keys.
- Default human output is readable in the Daytona terminal.
- JSON output is parseable by Chat Agent scripts.
- No raw key value appears unless the user explicitly calls `get-key --reveal`.

## Acceptance Criteria

- `qcut system keys` exists and is documented.
- Existing `qcut system check-keys` remains compatible.
- Chat Agent can call `qcut system keys --json` and branch on configured/missing providers.
- Tests cover configured, missing, filtered, JSON, and masked human output.
- No bulk reveal path exists.

## Next Subtask

Update the Chat Agent runtime prompt so Codex checks `qcut system keys --json` before paid provider work.

## Implementation Status - 2026-05-16

Implemented.

Changed files:

- `electron/native-pipeline/cli/cli-key-report.ts` - shared key report builder, capability categories, filters, and recommended next steps.
- `electron/native-pipeline/cli/cli-handlers-admin.ts` - `check-keys` now returns the shared report shape and supports filters.
- `electron/native-pipeline/cli/command-groups.ts` - added `qcut system keys`.
- `electron/native-pipeline/cli/command-registry.ts` - documented `keys` and added filter flags to `keys` / `check-keys`.
- `electron/native-pipeline/cli/cli-runner/handler-map.ts` - routes `keys` and `check-keys` to the same handler.
- `electron/native-pipeline/cli/cli-output-formatters.ts` - added the human-readable configured/missing table.
- `electron/native-pipeline/cli/__tests__/cli-key-report.test.ts` - unit coverage for summary, capability categories, filters, and validation.

Verified commands:

```bash
bunx vitest run electron/native-pipeline/cli/__tests__/cli-key-report.test.ts electron/native-pipeline/cli/__tests__/cli-handlers-system-doctor.test.ts
bunx tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node electron/native-pipeline/cli/cli-key-report.ts
bun electron/native-pipeline/cli/cli.ts system keys
bun electron/native-pipeline/cli/cli.ts system keys --json
bun electron/native-pipeline/cli/cli.ts system keys --missing --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --json
bun electron/native-pipeline/cli/cli.ts system keys --category image --json
bun electron/native-pipeline/cli/cli.ts system check-keys --json
bun electron/native-pipeline/cli/cli.ts keys --json
bun electron/native-pipeline/cli/cli.ts system keys --configured --missing --json
bun electron/native-pipeline/cli/cli.ts system --help
bun electron/native-pipeline/cli/cli.ts system keys --help --json
```

Observed local key summary:

- `7` configured
- `9` missing
- `16` total
- `--missing` returned only missing keys.
- `--configured` returned only configured keys.
- `--category image` returned image-capable keys only.
- `system check-keys --json` stayed compatible and now includes the same summary / `requiredFor` data.
- Conflicting `--configured --missing` exits with an error.

Type-check note:

- The narrow `cli-key-report.ts` type check passes.
- A broader ad hoc CLI type-check still hits pre-existing unrelated errors in `cli-handlers-replicate.ts`, `vimax-cli-handlers/kling-element-orchestrator.ts`, and `infra/api-caller.ts`.
