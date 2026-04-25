# Windows Code Signing — Testing

Tests must cover the parts of the implementation we own (the verifier
script, the workflow shape, the `package.json` shape). We deliberately do
**not** unit-test `signtool.exe` itself, SignPath's service, or
Microsoft's signing service — those are integration concerns covered by
the dry-run release step in
[`IMPLEMENTATION.md §5`](IMPLEMENTATION.md#5-dry-run-release--manual-verification-shared).

> **Path-aware:** Tests 2 and 3 below validate the `package.json` and
> `release.yml` shapes. Their *expected* shape differs between Path A
> (SignPath) and Path B (Azure). Once Subtask 1 lands, write the tests
> against the shape of the chosen path. The skeletons below show the
> Path B variants because they were authored first; Path A variants
> assert the inverse (e.g. `azureSignOptions` should NOT exist; the
> SignPath GitHub Action step SHOULD exist).

## Test inventory

| # | Type | File path | What it covers |
|---|------|-----------|----------------|
| 1 | Unit | `qcut/scripts/__tests__/verify-windows-signature.test.ts` | Verifier exits 0 on valid signtool output, non-zero on missing artifact, non-zero on publisher mismatch, no-op on non-Windows. |
| 2 | Unit | `qcut/scripts/__tests__/package-json-signing.test.ts` | `qcut/package.json` `build.win` has `forceCodeSigning`, `verifyUpdateCodeSignature`, `signAndEditExecutable` all `true`, and includes `azureSignOptions` with all four required fields. |
| 3 | Lint | `.github/workflows/release.yml` (validated via existing CI lint, plus a new assertion test) | Workflow's Windows build step does **not** contain `forceCodeSigning=false` and the env block exposes the seven Azure secrets. |
| 4 | Manual / E2E | `qcut/docs/task/windows-code-signing/IMPLEMENTATION.md §5` | Signed installer launches on clean Windows VM with a verified publisher name. |

## Test 1 — Verifier unit tests

**Path:** `qcut/scripts/__tests__/verify-windows-signature.test.ts`

**Framework:** Vitest (matches existing scripts test convention — see
`qcut/scripts/__tests__/` if present, otherwise create alongside).

### Cases

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-windows-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("no-ops on macOS/Linux", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "darwin" });
    const mod = await import("../verify-windows-signature");
    // expect no throw, expect log warning
  });

  it("throws when dist-electron is empty", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock fs.existsSync / readdirSync to return []
    await expect(import("../verify-windows-signature")).rejects.toThrow(
      /No QCut.*Setup.*\.exe found/,
    );
  });

  it("throws when signtool exits non-zero", async () => {
    // mock execFileSync to throw
    Object.defineProperty(process, "platform", { value: "win32" });
    await expect(import("../verify-windows-signature")).rejects.toThrow();
  });

  it("throws when expected publisher missing from signtool output", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    // mock execFileSync to return output without publisher
    await expect(import("../verify-windows-signature")).rejects.toThrow(
      /unexpected publisher/i,
    );
  });

  it("succeeds on signed artifact with matching publisher", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    // mock execFileSync to return output containing "Quriosity Pty Ltd"
    await expect(import("../verify-windows-signature")).resolves.not.toThrow();
  });
});
```

> **Note:** because the verifier runs at module top-level (matching
> existing `verify-packaged-*.ts` style), the script may need a tiny
> refactor to expose a `main()` function — do that as part of subtask 5.
> Keeps the script ergonomic from the CLI *and* testable.

### How to run

```bash
cd qcut && bun run test scripts/__tests__/verify-windows-signature.test.ts
```

## Test 2 — `package.json` shape

**Path:** `qcut/scripts/__tests__/package-json-signing.test.ts`

This is a guardrail test — cheap to run, prevents accidental regressions
(e.g. someone re-adding `forceCodeSigning: false` during a merge).

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json Windows signing config", () => {
  it("has all signing flags enabled", () => {
    expect(pkg.build.win.forceCodeSigning).toBe(true);
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(true);
    expect(pkg.build.win.signAndEditExecutable).toBe(true);
  });

  it("has azureSignOptions with all four required fields", () => {
    const opts = pkg.build.win.azureSignOptions;
    expect(opts).toBeDefined();
    expect(opts.publisherName).toBeTruthy();
    expect(opts.endpoint).toBeTruthy();
    expect(opts.certificateProfileName).toBeTruthy();
    expect(opts.codeSigningAccountName).toBeTruthy();
  });

  it("dist:win:release script does not disable signing", () => {
    expect(pkg.scripts["dist:win:release"]).not.toMatch(
      /forceCodeSigning=false/,
    );
    expect(pkg.scripts["dist:win:release"]).not.toMatch(
      /verifyUpdateCodeSignature=false/,
    );
  });
});
```

### How to run

Same Vitest invocation as Test 1.

## Test 3 — Workflow YAML guardrail

**Path:** `qcut/scripts/__tests__/release-workflow-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(
  import.meta.dir,
  "..", "..", "..", ".github", "workflows", "release.yml",
);
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml Windows job", () => {
  const winJob = wf.jobs["build-windows"];

  it("Build Electron application step does not disable signing", () => {
    const step = winJob.steps.find(
      (s: any) => s.name === "Build Electron application",
    );
    expect(step.run).not.toMatch(/forceCodeSigning=false/);
    expect(step.run).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("Build Electron application step exposes Azure secrets", () => {
    const step = winJob.steps.find(
      (s: any) => s.name === "Build Electron application",
    );
    for (const k of [
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_TRUSTED_SIGNING_ENDPOINT",
      "AZURE_TRUSTED_SIGNING_ACCOUNT",
      "AZURE_CERTIFICATE_PROFILE",
      "WINDOWS_PUBLISHER_NAME",
    ]) {
      expect(step.env[k]).toBeDefined();
    }
  });

  it("has a 'Verify Windows signature' step after build", () => {
    const names = winJob.steps.map((s: any) => s.name);
    const buildIdx = names.indexOf("Build Electron application");
    const verifyIdx = names.indexOf("Verify Windows signature");
    expect(verifyIdx).toBeGreaterThan(buildIdx);
  });
});
```

> Add `js-yaml` and `@types/js-yaml` as dev dependencies if not already
> present; check with `cd qcut && bun pm ls js-yaml`.

### How to run

Same Vitest invocation. This test runs on every dev machine and CI — it
does **not** require Windows.

## Test 4 — Manual E2E (clean VM)

Documented in [`IMPLEMENTATION.md §5`](IMPLEMENTATION.md#5-dry-run-release--manual-verification).
Capture the result in the PR description as a checklist:

- [ ] `Publisher: Quriosity Pty Ltd` (or actual publisher) shown in NSIS.
- [ ] `Get-AuthenticodeSignature` → `Status: Valid`.
- [ ] `signtool verify /pa /v` → exit 0.
- [ ] App launches and reaches the editor route after install.

## What we do not test

- **`signtool.exe` correctness** — we trust Microsoft's signing tool.
- **Azure Trusted Signing service availability** — out of our control.
- **SmartScreen warning timing** — depends on Microsoft reputation
  rollup, not deterministic. Track via release feedback, not unit tests.
- **Cert chain expiration** — `verifyUpdateCodeSignature: true` will
  cause future updates to fail loudly if the chain breaks; we prefer
  loud production failure to brittle CI tests of cert validity windows.
