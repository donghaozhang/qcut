# QCut Editor CLI — Agent Automation

Commands for AI agent workflows: accessibility snapshots, console capture, visual diffs, session persistence, and action policy.

See [editor-core.md](editor-core.md) for connection options, flags, and workflows.

---

## Accessibility Snapshots

Get a ref-based accessibility tree of the visible editor UI. Each interactive element gets a deterministic `@eN` ref that is stable across repeated snapshots.

### Take snapshot

```bash
# Full snapshot
bun run pipeline editor:snapshot --json

# Only actionable elements, limited depth
bun run pipeline editor:snapshot --interactive --depth 2 --json
```

| Flag | Type | Description |
|------|------|-------------|
| `--interactive` | boolean | Only include actionable UI elements |
| `--depth` | number | Maximum DOM traversal depth |

Returns `elements[]` with `ref`, `role`, `tagName`, `name`, `actionable`, `bounds`, and `children`.

### Click an element

```bash
bun run pipeline editor:snapshot:click --ref @e1 --json
```

Clicks the element tagged with the given ref from the latest snapshot.

### Fill a text input

```bash
bun run pipeline editor:snapshot:fill --ref @e2 --text "Updated title" --json
```

Fills a text input or contenteditable element by ref.

### Select a dropdown option

```bash
bun run pipeline editor:snapshot:select --ref @e3 --value "720p" --json
```

Selects an option from a `<select>`, combobox, or listbox by ref. Matches by option value or visible text.

### Toggle a checkbox or switch

```bash
# Check
bun run pipeline editor:snapshot:check --ref @e4 --checked --json

# Uncheck
bun run pipeline editor:snapshot:check --ref @e4 --no-checked --json
```

Toggles a checkbox, radio button, or switch role by ref.

### Snapshot command summary

| Command | Required flags | Description |
|---------|---------------|-------------|
| `editor:snapshot` | — | Get accessibility tree |
| `editor:snapshot:click` | `--ref` | Click element by ref |
| `editor:snapshot:fill` | `--ref`, `--text` | Fill text input by ref |
| `editor:snapshot:select` | `--ref`, `--value` | Select dropdown option by ref |
| `editor:snapshot:check` | `--ref`, `--checked` | Toggle checkbox/switch by ref |

---

## Console Capture

Read, filter, and stream console messages from the QCut renderer process.

### List messages

```bash
# Last 50 messages (default)
bun run pipeline editor:console --json

# Filter by level
bun run pipeline editor:console --level error --json

# Messages from last 30 seconds
bun run pipeline editor:console --since 30s --json

# Errors shortcut
bun run pipeline editor:errors --json
```

### Clear buffer

```bash
bun run pipeline editor:console --clear --json
```

### Stream real-time

```bash
bun run pipeline editor:console --stream
```

Streams live console entries via SSE until interrupted (Ctrl+C).

| Flag | Type | Description |
|------|------|-------------|
| `--level` | string | Filter: `log`, `warn`, `error`, `info`, `debug` |
| `--since` | string | Time window: `5s`, `30s`, `1m`, `5m` |
| `--clear` | boolean | Clear the console buffer |
| `--stream` | boolean | Real-time SSE stream |

### Console command summary

| Command | Description |
|---------|-------------|
| `editor:console` | List/filter/clear/stream console messages |
| `editor:errors` | Shortcut for `editor:console --level error` |

---

## Visual Diffs

Compare saved snapshots or screenshots to verify that actions had the expected effect.

### Snapshot diff

```bash
bun run pipeline editor:diff:snapshot --before before.json --after after.json --json
```

Compares two saved accessibility snapshot JSON files. Returns `added`, `removed`, `changed` counts and element-level details. Elements are matched semantically (by role + name) rather than by raw ref.

### Screenshot diff

```bash
# Default threshold (10)
bun run pipeline editor:diff:screenshot --before before.png --after after.png --json

# Custom sensitivity
bun run pipeline editor:diff:screenshot --before a.png --after b.png --threshold 20 --json
```

Pixel-level PNG comparison using sharp. Generates a diff image (changed pixels in red) saved alongside the before file.

| Flag | Type | Description |
|------|------|-------------|
| `--before` | string | Path to earlier snapshot/screenshot (required) |
| `--after` | string | Path to later snapshot/screenshot (required) |
| `--threshold` | number | Per-channel difference threshold 0-255 (default 10, screenshot only) |

### Diff command summary

| Command | Required flags | Description |
|---------|---------------|-------------|
| `editor:diff:snapshot` | `--before`, `--after` | Tree diff of two snapshot JSON files |
| `editor:diff:screenshot` | `--before`, `--after` | Pixel diff of two PNG screenshots |

---

## Session Persistence

Save and restore named CLI sessions. Sessions store `projectId`, `lastPanel`, `lastTab`, and command history under `~/.local/share/qcut/sessions/`.

### Save session

```bash
bun run pipeline editor:session:save --session-name my-session --project-id <id> --panel moyin --tab characters --json
```

### Load session

```bash
bun run pipeline editor:session:load --session-name my-session --json
```

### List sessions

```bash
bun run pipeline editor:session:list --json
# → { "status": "ok", "data": { "sessions": [...], "count": 3 } }
```

### Delete session

```bash
bun run pipeline editor:session:delete --session-name my-session --json
```

### Resume a session

Use `--resume` with any command to hydrate options from a saved session and autosave after execution:

```bash
# One-shot with resume
bun run pipeline editor:timeline:export --resume my-session --json

# Interactive REPL with resume
bun run pipeline --session --resume my-session
```

### Session command summary

| Command | Required flags | Description |
|---------|---------------|-------------|
| `editor:session:save` | — | Save current context (uses `--session-name` or active resume session) |
| `editor:session:load` | `--session-name` | Load a saved session |
| `editor:session:list` | — | List all saved sessions |
| `editor:session:delete` | `--session-name` | Delete a saved session |

---

## Action Policy

Safety layer that categorizes commands into allow/confirm/deny buckets.

### Default behavior

- **allow**: Read-only commands run without confirmation
- **confirm**: Destructive commands (delete, batch-delete, auth mutations) require `--force` to proceed
- **deny**: Blocked commands cannot run even with `--force`

### Custom policy file

```bash
bun run pipeline editor:snapshot:click --ref @e1 --policy ./agent-policy.json --json
```

Policy JSON format:

```json
{
  "allow": ["editor:media:list", "editor:snapshot*"],
  "confirm": ["editor:project:delete", "editor:timeline:batch-delete"],
  "deny": []
}
```

### Flag-sensitive matching

Policy rules can target specific flag combinations:

```json
{
  "confirm": ["editor:auth:token --set", "editor:auth:token --reveal", "editor:console --clear"]
}
```

| Flag | Type | Description |
|------|------|-------------|
| `--policy` | string | Path to custom policy JSON file |
| `--force` | boolean | Bypass confirm-tier policy checks (deny-tier still blocked) |

---

## Typical Agent Workflow

```bash
# 1. Take a snapshot to discover UI elements
bun run pipeline editor:snapshot --interactive --json

# 2. Interact with elements by ref
bun run pipeline editor:snapshot:click --ref @e5 --json
bun run pipeline editor:snapshot:fill --ref @e8 --text "New title" --json

# 3. Verify the action succeeded — check for errors
bun run pipeline editor:console --level error --since 5s --json

# 4. Take a second snapshot and diff
bun run pipeline editor:snapshot --interactive --json > after.json
bun run pipeline editor:diff:snapshot --before before.json --after after.json --json

# 5. Save session for later resumption
bun run pipeline editor:session:save --session-name my-workflow --json
```

---

## Key Source Files

| Component | File |
|-----------|------|
| Snapshot CLI handlers | `electron/native-pipeline/cli/cli-handlers-snapshot.ts` |
| Console CLI handlers | `electron/native-pipeline/cli/cli-handlers-console.ts` |
| Diff CLI handlers | `electron/native-pipeline/cli/cli-handlers-diff.ts` |
| Session CLI handlers | `electron/native-pipeline/cli/cli-handlers-session.ts` |
| Session persistence | `electron/native-pipeline/cli/session-state.ts` |
| Action policy | `electron/native-pipeline/cli/action-policy.ts` |
| Snapshot DOM handler | `electron/claude/handlers/claude-snapshot-handler.ts` |
| Console capture handler | `electron/claude/handlers/claude-console-handler.ts` |
| Snapshot HTTP routes | `electron/claude/http/claude-http-snapshot-routes.ts` |
| Console HTTP routes | `electron/claude/http/claude-http-console-routes.ts` |
| Command registry | `electron/native-pipeline/cli/command-registry-editor-extra.ts` |
