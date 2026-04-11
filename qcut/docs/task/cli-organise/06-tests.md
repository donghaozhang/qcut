# Task 6: Tests

Add unit tests for the new routing, alias, and help systems. Verify backward compatibility.

## Why

The refactor touches command resolution, which is the critical path for every CLI invocation. Tests lock down the contract: old commands still work, new group commands resolve correctly, deprecation warnings fire when expected.

## Relevant Files

| File | Role |
|------|------|
| **New**: `electron/__tests__/cli-command-groups.test.ts` | Group resolution tests |
| **New**: `electron/__tests__/cli-aliases.test.ts` | Alias & deprecation tests |
| **New**: `electron/__tests__/cli-handler-map.test.ts` | Handler map coverage tests |
| `electron/__tests__/` | Existing test directory |

## Test Cases

### cli-command-groups.test.ts

```typescript
describe("resolveCommandGroup", () => {
  it("resolves 'gen image' to 'generate-image'", () => {
    const result = resolveCommandGroup(["gen", "image"]);
    expect(result).toEqual({ command: "generate-image", remainingArgs: [] });
  });

  it("resolves 'flow idea2video' to 'vimax:idea2video'", () => {
    const result = resolveCommandGroup(["flow", "idea2video"]);
    expect(result).toEqual({ command: "vimax:idea2video", remainingArgs: [] });
  });

  it("passes remaining args through", () => {
    const result = resolveCommandGroup(["gen", "image", "--prompt", "cat"]);
    expect(result).toEqual({
      command: "generate-image",
      remainingArgs: ["--prompt", "cat"],
    });
  });

  it("returns null for unknown group", () => {
    expect(resolveCommandGroup(["unknown", "action"])).toBeNull();
  });

  it("returns null for known group with unknown action", () => {
    expect(resolveCommandGroup(["gen", "unknown"])).toBeNull();
  });

  it("returns null for single arg (no action)", () => {
    expect(resolveCommandGroup(["gen"])).toBeNull();
  });

  // Verify every group action maps to a valid command in COMMANDS_REGISTRY
  it("all group actions map to registered commands", () => {
    for (const group of COMMAND_GROUPS) {
      for (const [action, command] of Object.entries(group.actions)) {
        const cmd = getCommand(command);
        expect(cmd, `${group.name} ${action} → ${command}`).toBeDefined();
      }
    }
  });
});
```

### cli-aliases.test.ts

```typescript
describe("warnIfDeprecated", () => {
  it("warns for flat command not resolved via group", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfDeprecated("generate-image", false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("DEPRECATED"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("gen image"));
    spy.mockRestore();
  });

  it("does not warn for group-resolved command", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfDeprecated("generate-image", true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not warn for unknown command", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfDeprecated("some-unknown-cmd", false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not warn in quiet mode", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnIfDeprecated("generate-image", false, true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

### cli-handler-map.test.ts

```typescript
describe("HANDLER_MAP", () => {
  it("has a handler for every command in COMMANDS_REGISTRY (excluding editor:*)", () => {
    for (const commandName of Object.keys(COMMANDS_REGISTRY)) {
      if (commandName.startsWith("editor:")) continue;
      expect(HANDLER_MAP[commandName], `Missing handler for ${commandName}`).toBeDefined();
      expect(typeof HANDLER_MAP[commandName]).toBe("function");
    }
  });

  it("has no orphan handlers (handler without registry entry)", () => {
    for (const commandName of Object.keys(HANDLER_MAP)) {
      expect(
        COMMANDS_REGISTRY[commandName],
        `Orphan handler for ${commandName}`,
      ).toBeDefined();
    }
  });
});
```

## Verification

- `bun run test` — all new + existing tests pass
- `bun run test -- --grep "command-groups"` — group tests pass
- `bun run test -- --grep "aliases"` — alias tests pass
- `bun run test -- --grep "handler-map"` — handler map coverage tests pass

## Risk

None. Tests are purely additive and validate the refactor correctness.
