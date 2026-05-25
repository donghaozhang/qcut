# Pull Skill

Sync current branch with latest `origin/main` and resolve merge conflicts.

## Workflow

1. Verify git status is clean or commit/stash changes before merging.
2. Enable rerere locally:
   ```bash
   git config rerere.enabled true
   git config rerere.autoupdate true
   ```
3. Fetch latest refs:
   ```bash
   git fetch origin
   ```
4. Sync remote feature branch first:
   ```bash
   git pull --ff-only origin $(git branch --show-current)
   ```
5. Merge main with better conflict context:
   ```bash
   git -c merge.conflictstyle=zdiff3 merge origin/main
   ```
6. If conflicts appear, resolve them, then:
   ```bash
   git add <files>
   git merge --continue
   ```
7. Verify with project checks.
8. Summarize the merge: call out challenging conflicts and how they were resolved.

## Conflict Resolution Guidance

- **Inspect before editing**: Use `git status`, `git diff`, and `git diff --merge` to understand both sides.
- With `zdiff3`, conflict markers include base section — use it to understand what each side changed.
- **Summarize intent** of both changes before choosing a resolution.
- **Minimal, intention-preserving edits**: keep behavior consistent with the branch's purpose.
- Resolve **one file at a time** and test after each batch.
- Use `ours/theirs` only when certain one side should win entirely.
- For **generated files** (lockfiles etc.): resolve source conflicts first, then regenerate.
- For **import conflicts**: accept both sides temporarily, then lint to remove unused ones.
- After resolving, ensure no markers remain: `git diff --check`

## When To Ask The User

Only ask when:
- Correct resolution depends on product intent not inferable from code/tests.
- Conflict crosses a user-visible API/contract where choosing wrong breaks consumers.
- Two mutually exclusive designs with equal technical merit.
- Merge introduces data loss or irreversible side effects.

Otherwise, proceed with best-effort decision and document rationale.
