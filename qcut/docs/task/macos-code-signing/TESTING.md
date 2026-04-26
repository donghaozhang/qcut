# macOS Code Signing — Testing

Tests cover the parts of the implementation we own — the verifier
script, `package.json` shape, and `release.yml` shape. We deliberately
do **not** unit-test `codesign`, `spctl`, `xcrun stapler`, or Apple's
notary service — those are integration concerns covered by the dry-run
release step in [`IMPLEMENTATION.md §4`](IMPLEMENTATION.md#4-dry-run-release-on-clean-macos-vm).

## Test inventory

| # | Type | File path | What it covers |
|---|------|-----------|----------------|
| 1 | Unit | `qcut/scripts/__tests__/verify-macos-signature.test.ts` | Verifier behaviour: succeeds on valid output, fails on missing notarization, fails on team ID mismatch, no-ops on non-macOS. |
| 2 | Unit | `qcut/scripts/__tests__/package-json-mac-signing.test.ts` | `build.mac.identity` set, `build.mac.notarize.teamId` set, `hardenedRuntime: true` preserved. |
| 3 | Workflow guardrail | `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts` | `build-macos` "Build Electron application" step exposes the five Apple env vars and a verify step exists after build. |
| 4 | Manual / E2E | [`IMPLEMENTATION.md §4`](IMPLEMENTATION.md#4-dry-run-release-on-clean-macos-vm) | Clean macOS VM, signed/notarized app launches without Gatekeeper warnings. |

## Test 1 — Verifier unit tests

**Path:** `qcut/scripts/__tests__/verify-macos-signature.test.ts`

**Framework:** Vitest. Same pattern as the existing
`qcut/scripts/__tests__/check-boundaries.test.ts`. Mock
`child_process.execFileSync`.

### Cases

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-macos-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("no-ops on non-macOS hosts", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("../verify-macos-signature");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("throws when dist-electron is empty", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock fs.readdirSync to return []
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /No QCut.*\.dmg found/,
    );
  });

  it("throws when codesign exits non-zero", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock execFileSync to throw on codesign
    await expect(import("../verify-macos-signature")).rejects.toThrow();
  });

  it("throws when app is signed but not notarized", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "ABCDE12345");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock spctl output to include "accepted" but NOT "Notarized Developer ID"
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /not notarized/,
    );
  });

  it("throws when stapler reports failure", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock stapler output to NOT include "worked"
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /stapler validation failed/,
    );
  });

  it("throws on team ID mismatch", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "WRONGT3AM1");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock codesign -dvv to NOT include (WRONGT3AM1)
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /unexpected team/,
    );
  });

  it("succeeds when everything is valid", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "ABCDE12345");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock all four tool outputs to be valid
    await expect(import("../verify-macos-signature")).resolves.not.toThrow();
  });
});
```

> **Refactor note:** the production script runs at module top-level
> (matching `verify-packaged-*.ts` style). To make tests cleaner,
> consider wrapping the body in a `main()` and calling it at the bottom
> — same pattern as the Windows verifier. Either approach works; just
> be consistent across the two verifiers.

### How to run

```bash
cd qcut && bun run test scripts/__tests__/verify-macos-signature.test.ts
```

## Test 2 — `package.json` shape

**Path:** `qcut/scripts/__tests__/package-json-mac-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json macOS signing config", () => {
  it("sets identity for Developer ID Application", () => {
    expect(pkg.build.mac.identity).toMatch(/^Developer ID Application: /);
  });

  it("sets notarize.teamId from env", () => {
    expect(pkg.build.mac.notarize?.teamId).toBeTruthy();
  });

  it("keeps hardenedRuntime true", () => {
    expect(pkg.build.mac.hardenedRuntime).toBe(true);
  });

  it("keeps entitlements pointing to the existing plist", () => {
    expect(pkg.build.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(pkg.build.mac.entitlementsInherit).toBe("build/entitlements.mac.plist");
  });
});
```

## Test 3 — Workflow YAML guardrail

**Path:** `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(
  import.meta.dir, "..", "..", "..", ".github", "workflows", "release.yml",
);
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml build-macos signing", () => {
  const macJob = wf.jobs["build-macos"];
  const buildStep = macJob.steps.find(
    (s: any) => s.name === "Build Electron application",
  );

  for (const k of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ]) {
    it(`Build step exposes ${k}`, () => {
      expect(buildStep.env[k]).toBeDefined();
    });
  }

  it("has a 'Verify macOS signature and notarization' step after build", () => {
    const names = macJob.steps.map((s: any) => s.name);
    const buildIdx = names.indexOf("Build Electron application");
    const verifyIdx = names.indexOf("Verify macOS signature and notarization");
    expect(verifyIdx).toBeGreaterThan(buildIdx);
  });
});
```

> Add `js-yaml` and `@types/js-yaml` as dev dependencies if not already present (the Windows TESTING plan calls for the same).

## Test 4 — Manual VM E2E

See [`IMPLEMENTATION.md §4`](IMPLEMENTATION.md#4-dry-run-release-on-clean-macos-vm). Capture the result in PR description as a checklist:

- [ ] `.dmg` opens without "developer cannot be verified".
- [ ] App launches from `/Applications` without right-click → Open.
- [ ] `codesign --verify --deep --strict --verbose=2` exits 0.
- [ ] `spctl -a -t exec -vv` reports `accepted` with `source=Notarized Developer ID`.
- [ ] `xcrun stapler validate` reports `The validate action worked!`.
- [ ] Verified developer name in security prompt is "Quriosity Pty Ltd".

## What we do not test

- **`codesign`, `spctl`, `xcrun stapler` correctness** — Apple-supplied tools.
- **Apple notary service availability** — Apple-side outages out of our control. The release will fail loudly if notary is down; do not retry blindly.
- **App-Specific Password expiry** — no test catches this before release; the build itself fails loudly with notary auth errors. The remediation is documented in [`DOCUMENTATION.md`](DOCUMENTATION.md).
- **Cert expiry** — Apple's Developer ID Application certs are valid 5 years; we will rotate well before expiry.
