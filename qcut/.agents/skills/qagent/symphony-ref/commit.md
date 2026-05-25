# Commit Skill

## Goals

- Produce a commit that reflects the actual code changes and the session context.
- Follow conventional commit format (type prefix, short subject, wrapped body).
- Include both summary and rationale in the body.

## Steps

1. Read session history to identify scope, intent, and rationale.
2. Inspect the working tree and staged changes (`git status`, `git diff`, `git diff --staged`).
3. Stage intended changes (`git add -A`) after confirming scope.
4. Sanity-check newly added files; if anything looks random or likely ignored (build artifacts, logs, temp files), flag it before committing.
5. If staging includes unrelated files, fix the index first.
6. Choose a conventional type and optional scope:
   - `feat(scope):` — new feature
   - `fix(scope):` — bug fix
   - `refactor(scope):` — code restructure
   - `chore(scope):` — build/config/tooling
   - `docs(scope):` — documentation
   - `test(scope):` — tests
7. Write a subject line in imperative mood, <= 72 characters, no trailing period.
8. Write a body that includes:
   - **Summary** of key changes (what changed)
   - **Rationale** and trade-offs (why it changed)
   - **Tests** or validation run (or explicit note if not run)
9. Wrap body lines at 72 characters.
10. Create the commit using `git commit -F <tmpfile>` (avoid `-m` with `\n`).
11. Commit only when the message matches the staged changes.

## Template

```
<type>(<scope>): <short summary>

Summary:
- <what changed>
- <what changed>

Rationale:
- <why>
- <why>

Tests:
- <command or "not run (reason)">
```

## QCut Specifics

- Use `bun run biome:check` before committing to ensure lint passes.
- For Electron/renderer changes, note which process (main/renderer/preload) is affected in the scope.
- For native CLI changes, use scope `native-cli`.
