# PR 01 — `qcut system doctor`

> **Phase**: 1 · **Depends on**: nothing · **Estimated LOC**: ~80

## Goal

A new CLI command `qcut system doctor` that reports environment health as JSON. It must support `--json` (machine-readable) and `--skip-health` (do not call out to providers). It is the **spawn probe** referenced from every sandbox/worker layer downstream — if this command returns 0 with `status: "ok"`, the container is usable.

## Depends on

Nothing. Land first.

## Files

| Path | Action | Purpose |
|------|--------|---------|
| `electron/native-pipeline/cli/command-registry-system.ts` | modify | Register the `doctor` handler under the `system` group |
| `electron/native-pipeline/cli/handlers/system-doctor.ts` | new | Implementation: collect checks, return envelope |
| `electron/native-pipeline/cli/handlers/system-doctor.test.ts` | new | Unit tests for the doctor logic |

## Implementation

### Step 1 — Doctor handler

`electron/native-pipeline/cli/handlers/system-doctor.ts`:

```ts
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadKeysFromFile } from "../../infra/key-manager.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
}

export interface DoctorReport {
  status: "ok" | "fail";
  checks: DoctorCheck[];
  keys_loaded: number;
  cli_version: string;
  bun_version: string | null;
  ffmpeg_version: string | null;
  env_file: string;
}

export async function runDoctor(opts: { skipHealth: boolean }): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  const bun = safeVersion("bun", ["--version"]);
  checks.push(bun ? ok("bun", bun) : fail("bun", "not on PATH"));

  const ffmpeg = safeVersion("ffmpeg", ["-version"]);
  checks.push(ffmpeg ? ok("ffmpeg", ffmpeg) : fail("ffmpeg", "not on PATH"));

  const envPath = join(homedir(), ".qcut", ".env");
  let keysLoaded = 0;
  if (existsSync(envPath)) {
    const mode = statSync(envPath).mode & 0o777;
    if (mode !== 0o600) {
      checks.push({
        name: "env_file_mode",
        status: "warn",
        detail: `expected 0600, got ${mode.toString(8)}`,
      });
    } else {
      checks.push(ok("env_file_mode", "0600"));
    }
    keysLoaded = Object.keys(await loadKeysFromFile(envPath)).length;
    checks.push(
      keysLoaded > 0
        ? ok("env_file_keys", `${keysLoaded} loaded`)
        : fail("env_file_keys", "no keys"),
    );
  } else {
    checks.push(fail("env_file", `${envPath} not found`));
  }

  if (!opts.skipHealth) {
    // Provider pings would go here. Out of scope for PR 01.
    checks.push({ name: "provider_pings", status: "warn", detail: "skipped (not yet wired)" });
  }

  const failed = checks.some((c) => c.status === "fail");
  return {
    status: failed ? "fail" : "ok",
    checks,
    keys_loaded: keysLoaded,
    cli_version: process.env.QCUT_VERSION ?? "dev",
    bun_version: bun,
    ffmpeg_version: ffmpeg,
    env_file: envPath,
  };
}

function safeVersion(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    if (r.status !== 0) return null;
    return r.stdout.split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

function ok(name: string, detail?: string): DoctorCheck {
  return { name, status: "ok", detail };
}
function fail(name: string, detail: string): DoctorCheck {
  return { name, status: "fail", detail };
}
```

### Step 2 — Register the command

In `electron/native-pipeline/cli/command-registry-system.ts`, add:

```ts
import { runDoctor } from "./handlers/system-doctor.js";
import { JsonOkEnvelope, JsonErrorEnvelope } from "./json-output.js";
import { ExitCode } from "../output/errors.js";

// ...inside the `system` group registration:
registry.register({
  command: "system doctor",
  describe: "Report container/environment health as JSON",
  flags: [
    { name: "--json", type: "boolean", default: true },
    { name: "--skip-health", type: "boolean", default: false },
  ],
  handler: async (args, ctx) => {
    const report = await runDoctor({ skipHealth: Boolean(args["skip-health"]) });
    if (args.json !== false) {
      console.log(JSON.stringify(report));
    } else {
      // Human-readable fallback
      for (const c of report.checks) {
        console.log(`${c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
      }
    }
    return report.status === "ok" ? ExitCode.SUCCESS : ExitCode.API_KEY_MISSING;
  },
});
```

The exit code on failure is `4` (API_KEY_MISSING) — that's what the worker/spawn-probe in downstream PRs uses to decide "this container is unhealthy."

### Step 3 — Wire into the help index

If there's a `qcut --help` index or examples file (see `cli/help-text.ts` or similar), add one line: `system doctor — environment health (--json | --skip-health)`.

## Tests

`electron/native-pipeline/cli/handlers/system-doctor.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runDoctor } from "./system-doctor.js";

describe("runDoctor", () => {
  it("returns ok when env file is present mode 0600 with keys", async () => {
    // ...mock fs + key-manager
    const r = await runDoctor({ skipHealth: true });
    expect(r.status).toBe("ok");
    expect(r.keys_loaded).toBeGreaterThan(0);
  });

  it("returns fail when env file missing", async () => {
    // ...mock existsSync to return false
    const r = await runDoctor({ skipHealth: true });
    expect(r.status).toBe("fail");
    expect(r.checks.find((c) => c.name === "env_file")?.status).toBe("fail");
  });

  it("warns when env file mode is not 0600", async () => {
    // ...mock statSync to return mode 0o644
    const r = await runDoctor({ skipHealth: true });
    expect(r.checks.find((c) => c.name === "env_file_mode")?.status).toBe("warn");
  });

  it("flags missing ffmpeg as fail", async () => {
    vi.mock("node:child_process", () => ({
      spawnSync: () => ({ status: 1, stdout: "", stderr: "" }),
    }));
    const r = await runDoctor({ skipHealth: true });
    expect(r.checks.find((c) => c.name === "ffmpeg")?.status).toBe("fail");
  });
});
```

Run: `bun run test electron/native-pipeline/cli/handlers/system-doctor.test.ts`.

## Verification (manual smoke)

```bash
bun run build
bun electron/native-pipeline/cli/cli.ts system doctor --json --skip-health
```

Expected output (one JSON object on stdout, exit code 0):

```json
{
  "status": "ok",
  "checks": [
    { "name": "bun", "status": "ok", "detail": "1.3.10" },
    { "name": "ffmpeg", "status": "ok", "detail": "ffmpeg version 6.1.1 ..." },
    { "name": "env_file_mode", "status": "ok", "detail": "0600" },
    { "name": "env_file_keys", "status": "ok", "detail": "8 loaded" }
  ],
  "keys_loaded": 8,
  "cli_version": "dev",
  "bun_version": "1.3.10",
  "ffmpeg_version": "ffmpeg version 6.1.1 ...",
  "env_file": "/Users/peter/.qcut/.env"
}
```

If `--skip-health` is omitted, the `provider_pings` check is included (warn for this PR — actual pings land in a later PR if we decide to expand doctor).

## Out of scope for this PR

- Calling out to providers (FAL / Gemini / Anthropic / etc.). The current `--skip-health` always wins; lifting that gate is a separate PR.
- A human-readable `--no-json` mode. The fallback printer above is enough; we don't need pretty-printing yet.
- Combining with `qcut system check-keys`. Doctor is a *superset*; we may deprecate `check-keys` later but not in this PR.

## See also

- [`../core-plan/architecture.md`](../core-plan/architecture.md) — exit code table (`4` = API_KEY_MISSING, what we return on failure)
- [`../web-sandbox/verification.md`](../web-sandbox/verification.md) — Layer 2 spawn probe that calls this command
- `electron/native-pipeline/infra/key-manager.ts` — existing `~/.qcut/.env` loader we reuse
