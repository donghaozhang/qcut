# Git Add, Commit & Push

Review all changes, stage them, create a commit with a clear message, and push to the remote.

## Steps

1. Run `git status` to see all modified/untracked files and `git diff` to review changes. Also run `git log --oneline -5` for recent commit style.
2. Analyze the changes and draft a concise conventional commit message (`type: description`).
3. Stage the relevant files with `git add` (prefer specific files over `git add -A`).
4. Commit using the conventional commit format. Do NOT include "Co-Authored-By" lines per project CLAUDE.md rules.
5. Push to the current remote branch with `git push`.
6. Report the commit hash and summary.

## Rules

- Follow CLAUDE.md: no "Co-Authored-By" attribution
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Do not stage `.env` files or secrets
- If there are no changes, report "Nothing to commit" and stop

## Linear Integration

Append a Linear magic word to the commit message when a Linear issue is active on the current branch. Use the format:

- `Part of QUR-XX` — for incremental work on an issue
- `Fixes QUR-XX` / `Closes QUR-XX` — when the commit fully resolves the issue

Check the branch name or recent commits for the issue ID (e.g. `QUR-10`). If no issue ID is found, omit the magic word.
