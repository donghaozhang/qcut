# Windows Code Signing — Testing

Tests cover the parts we own — the verifier script, the local signing
script, the `package.json` shape, and the `release.yml` shape.

We deliberately do **not** unit-test `signtool.exe`, Certum's SimplySign
service, or Microsoft's SmartScreen — those are integration concerns
covered by the dry-run release in
[`IMPLEMENTATION.md §6`](IMPLEMENTATION.md#6-dry-run-release-on-clean-windows-vm).

## Test inventory

| # | Type | File path | What it covers |
|---|------|-----------|----------------|
| 1 | Unit | `qcut/scripts/__tests__/verify-windows-signature.test.ts` | Verifier exits 0 on valid signtool output, non-zero on missing artifact, non-zero on publisher mismatch, no-op on non-Windows. |
| 2 | Unit | `qcut/scripts/__tests__/sign-windows-release.test.ts` | Sign script: throws when `QCUT_WIN_CERT_THUMBPRINT` not set, throws when no installer found, calls `signtool sign` with correct args, regenerates `latest.yml` with new SHA512. |
| 3 | Unit | `qcut/scripts/__tests__/package-json-signing.test.ts` | `qcut/package.json` `build.win` has `verifyUpdateCodeSignature: true`, `forceCodeSigning: false`, no `azureSignOptions`, and `dist:win:release` script does not contain `forceCodeSigning=false` overrides. |
| 4 | Workflow guardrail | `qcut/scripts/__tests__/release-workflow-signing.test.ts` | `release.yml` Windows job: build step does not contain `forceCodeSigning=false`; artifact name is `windows-build-unsigned`; the aggregated release-publish step does NOT auto-attach `windows-build-unsigned` `.exe` to the Release. |
| 5 | Manual / E2E | [`IMPLEMENTATION.md §6`](IMPLEMENTATION.md#6-dry-run-release-on-clean-windows-vm) | Clean Windows VM: signed installer shows "Verified publisher: Quriosity Pty Ltd" on UAC. |

## Test 1 — Verifier unit tests

**Path:** `qcut/scripts/__tests__/verify-windows-signature.test.ts`

**Framework:** Vitest. Same pattern as existing
`qcut/scripts/__tests__/check-boundaries.test.ts`. Mock
`child_process.execFileSync` and `fs`.

### Cases

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-windows-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("no-ops on non-Windows hosts", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("../verify-windows-signature");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("throws when dist-electron has no QCut*Setup*.exe", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock fs.readdirSync to return []
    await expect(import("../verify-windows-signature")).rejects.toThrow(/No QCut.*Setup.*\.exe found/);
  });

  it("throws when signtool exits non-zero", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync to throw
    await expect(import("../verify-windows-signature")).rejects.toThrow();
  });

  it("throws when expected publisher missing from signtool output", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync to return output without "Quriosity Pty Ltd"
    await expect(import("../verify-windows-signature")).rejects.toThrow(/unexpected publisher/i);
  });

  it("succeeds on signed artifact with matching publisher", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync to return output containing "Quriosity Pty Ltd"
    await expect(import("../verify-windows-signature")).resolves.not.toThrow();
  });
});
```

### How to run

```bash
cd qcut && bun run test scripts/__tests__/verify-windows-signature.test.ts
```

## Test 2 — Sign script unit tests

**Path:** `qcut/scripts/__tests__/sign-windows-release.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("sign-windows-release", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("throws when QCUT_WIN_CERT_THUMBPRINT not set", async () => {
    await expect(import("../sign-windows-release")).rejects.toThrow(/QCUT_WIN_CERT_THUMBPRINT/);
  });

  it("throws when no QCut*Setup*.exe is present", async () => {
    vi.stubEnv("QCUT_WIN_CERT_THUMBPRINT", "ABC123");
    // mock fs.readdirSync to return []
    await expect(import("../sign-windows-release")).rejects.toThrow(/No QCut.*Setup.*\.exe found/);
  });

  it("calls signtool sign with timestamp authority and SHA-256 algorithms", async () => {
    vi.stubEnv("QCUT_WIN_CERT_THUMBPRINT", "ABC123");
    // mock fs and child_process so signtool is called
    // assert execFileSync called with ["sign", "/tr", ..., "/td", "sha256", "/fd", "sha256", "/sha1", "ABC123", ...]
    expect(/* recorded args */).toContain("sha256");
  });

  it("regenerates latest.yml SHA512 after signing", async () => {
    // mock latest.yml present, signtool succeeds
    // assert writeFileSync called with new sha512
  });
});
```

## Test 3 — `package.json` shape guardrail

**Path:** `qcut/scripts/__tests__/package-json-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json Windows signing config", () => {
  it("verifyUpdateCodeSignature is true", () => {
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(true);
  });

  it("forceCodeSigning is false (we sign manually after build)", () => {
    expect(pkg.build.win.forceCodeSigning).toBe(false);
  });

  it("does not configure azureSignOptions (Azure path ruled out)", () => {
    expect((pkg.build.win as any).azureSignOptions).toBeUndefined();
  });

  it("dist:win:release script does not have signing-disable overrides (those are in package.json now)", () => {
    expect(pkg.scripts["dist:win:release"]).not.toMatch(/forceCodeSigning=false/);
    expect(pkg.scripts["dist:win:release"]).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("scripts include sign:win and verify:win-signature entries", () => {
    expect(pkg.scripts["sign:win"]).toBeDefined();
    expect(pkg.scripts["verify:win-signature"]).toBeDefined();
  });
});
```

## Test 4 — Workflow YAML guardrail

**Path:** `qcut/scripts/__tests__/release-workflow-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(import.meta.dir, "..", "..", "..", ".github", "workflows", "release.yml");
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml Windows signing flow", () => {
  const winJob = wf.jobs["build-windows"];

  it("Build step does not disable signing in CLI flags", () => {
    const step = winJob.steps.find((s: any) => /Build Electron application/.test(s.name));
    expect(step.run).not.toMatch(/forceCodeSigning=false/);
    expect(step.run).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("Artifact upload uses windows-build-unsigned name", () => {
    const upload = winJob.steps.find((s: any) => s.uses?.startsWith("actions/upload-artifact"));
    expect(upload.with.name).toBe("windows-build-unsigned");
  });

  it("Release publish job does not auto-attach unsigned Windows .exe to Release", () => {
    // Inspect wf.jobs.release files spec
    const releaseJob = wf.jobs["release"];
    const publishStep = releaseJob.steps.find((s: any) => s.uses?.includes("softprops/action-gh-release") || /release/i.test(s.name ?? ""));
    if (publishStep && publishStep.with?.files) {
      // The pattern matching unsigned Windows exes should not be present.
      // Maintainer manually uploads signed .exe per release operator runbook.
      expect(publishStep.with.files).not.toMatch(/windows-build-unsigned/);
    }
  });
});
```

> If `js-yaml` and `@types/js-yaml` are not yet in dev dependencies, add them: `bun add -d js-yaml @types/js-yaml`.

## Test 5 — Manual VM E2E

See [`IMPLEMENTATION.md §6`](IMPLEMENTATION.md#6-dry-run-release-on-clean-windows-vm). Capture the result in PR description as a checklist:

- [ ] CI built `windows-build-unsigned` successfully.
- [ ] `bun run sign:win` succeeded with phone approval.
- [ ] `bun run verify:win-signature` exits 0.
- [ ] Manual upload to GitHub Release succeeded.
- [ ] On clean VM: SmartScreen "More info" panel shows "Quriosity Pty Ltd".
- [ ] On clean VM: UAC dialog is **blue** with "Verified publisher: Quriosity Pty Ltd".
- [ ] `Get-AuthenticodeSignature` reports `Status: Valid`.

## What we do not test

- **`signtool.exe` correctness** — Microsoft-supplied tool.
- **Certum SimplySign service availability** — vendor-side outages out of our control. Manual signing fails loudly with `signtool` errors when SimplySign is down; do not retry blindly.
- **SmartScreen reputation timing** — SmartScreen is non-deterministic and depends on Microsoft reputation aggregation. Track via release feedback.
- **Cert chain expiration** — `verifyUpdateCodeSignature: true` will cause future updates to fail loudly if the chain breaks; we prefer loud production failure to brittle CI tests of cert validity windows.
