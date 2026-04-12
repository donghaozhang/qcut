# Task 10: Flow Command Contract Tests

Add regression tests that lock the flag contracts for the `qcut flow` family and prevent the bug class fixed in task 8 from recurring.

## Why

The bugs in task 8 (registry-create `--directory`, registry-show `--project-id`, idea2video `--duration`) all share a root cause: **the flag a handler reads does not match the flag the registry declares**, and no test catches this gap. Without a contract test, the same mistake will happen the next time someone adds a flow command.

## Relevant Files

| File | Role |
|------|------|
| **New**: `electron/__tests__/cli-flow-contracts.test.ts` | Flow-specific contract tests |
| `electron/native-pipeline/cli/command-registry.ts` | Flag declarations — tests read this |
| `electron/native-pipeline/cli/cli.ts` | `parseCliArgs()` — tests invoke this |
| `electron/native-pipeline/cli/command-groups.ts` | Flow group action → command name map |
| `electron/native-pipeline/cli/vimax-cli-handlers/*.ts` | Handlers — tests statically scan these for `options.X` reads |
| `electron/__tests__/cli-command-groups.test.ts` | Existing — ensure no overlap |

## Test Cases

### 1. Flow bugfix regressions (direct)

```ts
describe("flow registry-create wires --directory", () => {
  it("parses --directory into options.directory", () => {
    const opts = parseCliArgs(["flow","registry-create","--directory","./x"]);
    expect(opts.directory).toBe("./x");
  });
});

describe("flow registry-show wires --project-id", () => {
  it("parses --project-id into options.projectId", () => {
    const opts = parseCliArgs(["flow","registry-show","--project-id","abc"]);
    expect(opts.projectId).toBe("abc");
  });
});

describe("flow idea2video declares --duration", () => {
  it("lists --duration in the command registry", () => {
    const cmd = getCommand("vimax:idea2video");
    expect(cmd?.flags.some(f => f.name === "--duration")).toBe(true);
  });
});
```

### 2. Flow family coverage (structural)

```ts
describe("every flow group action maps to a registered command with a handler", () => {
  const flowGroup = COMMAND_GROUPS.find(g => g.name === "flow");
  for (const [action, commandName] of Object.entries(flowGroup!.actions)) {
    it(`flow ${action} → ${commandName} is fully wired`, () => {
      expect(getCommand(commandName), `missing registry entry`).toBeDefined();
      expect(HANDLER_MAP[commandName], `missing handler`).toBeDefined();
    });
  }
});
```

### 3. Flag-vs-handler contract (the important one)

Static scan of handler source files. For each flow handler, extract every `options.<identifier>` reference; assert a corresponding flag is declared in `command-registry.ts` (after camelCase ↔ kebab-case normalization).

```ts
describe("flow handlers only read declared flags", () => {
  const FLOW_HANDLER_FILES = [
    "electron/native-pipeline/cli/cli-runner/handler-pipeline.ts",
    "electron/native-pipeline/cli/vimax-cli-handlers/pipeline-handlers.ts",
    "electron/native-pipeline/cli/vimax-cli-handlers/script-handlers.ts",
    "electron/native-pipeline/cli/vimax-cli-handlers/character-handlers.ts",
    "electron/native-pipeline/cli/vimax-cli-handlers/registry-handlers.ts",
  ];

  // Shared options that all handlers may read without per-command declaration
  const GLOBAL_OPTIONS = new Set([
    "input", "output", "outputDir", "model", "provider",
    "quiet", "verbose", "dryRun", "apiKey",
  ]);

  for (const file of FLOW_HANDLER_FILES) {
    it(`${file}: every options.X read has a declared flag`, () => {
      const src = readFileSync(file, "utf8");
      const reads = new Set<string>();
      for (const m of src.matchAll(/\boptions\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
        reads.add(m[1]);
      }

      // Collect all flags declared for any flow command
      const declared = new Set<string>();
      const flowGroup = COMMAND_GROUPS.find(g => g.name === "flow")!;
      for (const commandName of Object.values(flowGroup.actions)) {
        const cmd = getCommand(commandName);
        if (!cmd) continue;
        for (const flag of cmd.flags) {
          // "--max-scenes" → "maxScenes"
          const camel = flag.name.replace(/^--/, "")
            .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          declared.add(camel);
        }
      }

      for (const read of reads) {
        if (GLOBAL_OPTIONS.has(read)) continue;
        expect(declared.has(read), `${file} reads options.${read} but no flow command declares it`).toBe(true);
      }
    });
  }
});
```

**Note**: this test has known false positives (e.g., handler reads an internal field not meant to be user-facing). Acceptable remediation: add it to `GLOBAL_OPTIONS` with a comment, or rename the field to not start with `options.`. The test is a prompt to decide, not a hard rule.

### 4. Help output sanity

```ts
describe("flow --help output matches registry", () => {
  it("lists every flow action in the help text", () => {
    const output = captureHelp(["flow", "--help"]);
    const flowGroup = COMMAND_GROUPS.find(g => g.name === "flow")!;
    for (const action of Object.keys(flowGroup.actions)) {
      expect(output).toContain(action);
    }
  });
});
```

## Order of Operations

1. Write tests for task 8 regressions **first** — they fail against current main.
2. Run task 8 fixes — regression tests go green.
3. Add structural + contract tests — they should pass after fixes.
4. Add help-output test last.

## Verification

- `bun run test -- --grep "flow"` — all flow tests pass.
- `bun run test` — full suite passes (no regressions in existing 70 tests from [06-tests.md](06-tests.md)).
- Intentionally break a declaration (remove `--duration` from registry) → structural test fails with a clear message identifying the gap.

## Risk

Low. Tests are purely additive. The static-scan test (#3) may flag pre-existing legitimate non-flag fields; each hit is a one-line addition to `GLOBAL_OPTIONS` with a comment explaining why it's not user-facing.

## Out of Scope

- Generalizing the contract test to all command groups (`gen`, `analyze`, etc.) — follow-up task, same pattern.
- Coverage metrics / fuzzing of flag combinations.
- Testing handler runtime behavior (that's each handler's own unit tests).
