# QAgent Spawn postCreate Path Mismatch

**Status:** Open
**Found during:** End-to-end workflow test (issue #212 / QUR-14)
**Date:** 2026-03-07

---

## Problem

`qagent spawn qcut 212` fails with:

```
error: Bun could not find a package.json file to install from
```

### Root Cause

The worktree plugin runs `postCreate` commands with `cwd: info.path` — the **worktree root**. But qcut is a monorepo where `package.json` lives inside the `qcut/` subdirectory, not at the git repo root.

```
~/.worktrees/qcut/qcut-feat-xxx/     ← worktree root (cwd for postCreate)
├── README.md
├── codecov.yml
└── qcut/                             ← package.json is HERE
    ├── package.json
    ├── qagent.yaml
    └── ...
```

The `postCreate: ["bun install"]` in `qagent.yaml` runs at the worktree root where there's no `package.json`.

### File

- **Config:** `qagent.yaml` line 35
- **Plugin:** `packages/qagent/packages/plugins/workspace-worktree/src/index.ts:351`

### Fix Options

**Quick fix (config):** Change postCreate to navigate into the subdirectory first:

```yaml
postCreate:
  - "cd qcut && bun install"
```

**Better fix (code):** The worktree plugin should resolve `project.path` relative to the worktree and use that as cwd for postCreate:

```typescript
// workspace-worktree/src/index.ts — postCreate section
const postCreateCwd = project.path && project.path !== "."
  ? join(info.path, project.path)
  : info.path;

for (const command of project.postCreate) {
  await execFileAsync("sh", ["-c", command], { cwd: postCreateCwd });
}
```

**Also consider:** The `project.path: .` config means "relative to qagent.yaml", but the worktree is created from the git root. These two reference frames are different when qagent.yaml isn't at the repo root.

### Error 2: Symlink Loop (ELOOP)

After fixing postCreate, spawn fails with:

```
ELOOP: too many symbolic links encountered, open '.../.claude/metadata-updater.sh'
```

The `symlinks: [.claude]` config creates a symlink from worktree `.claude` → source `.claude`, but because `project.path: .` resolves relative to qagent.yaml (inside `qcut/`), while the worktree root is the git root, the symlink target and source resolve incorrectly, creating a loop.

**Fix options:**

1. Change `symlinks` to use the correct relative path: `symlinks: [qcut/.claude]`
2. Or fix the worktree plugin to resolve symlink paths relative to `project.path` within the worktree

### Additional Note

The `qagent.yaml` config search (`findConfig`) walks up from cwd, so `qagent spawn` must run from inside `qcut/`, not the repo root. This is correct but worth documenting.

### Core Issue

Both errors stem from the same root cause: **`project.path: .` means "current directory" (where qagent.yaml lives), but worktrees are created from the git root**. The worktree plugin doesn't account for the offset between the git root and the project subdirectory. All path-dependent operations (postCreate cwd, symlink resolution) break when qagent.yaml isn't at the git root.
