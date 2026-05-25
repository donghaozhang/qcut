# Push Skill

Push current branch to origin and create/update the corresponding PR.

## Prerequisites

- `gh` CLI is authenticated.
- On the correct feature branch.

## Steps

1. Identify current branch and confirm remote state.
2. Run local validation before pushing:
   ```bash
   bun run biome:check
   bun run typecheck
   ```
3. Push branch to origin:
   ```bash
   git push -u origin HEAD
   ```
4. If push is rejected:
   - If non-fast-forward: run the `pull` skill first, then retry.
   - If auth/permissions error: stop and report the error.
   - Only use `--force-with-lease` when history was intentionally rewritten.
5. Ensure a PR exists for the branch:
   - No PR exists → create one.
   - PR exists and is open → update it.
   - PR is closed/merged → create new branch + PR.
6. Write a clear PR title that describes the change outcome.
7. Write PR body with:
   - **Summary**: what this PR does
   - **Changes**: bullet list of key changes
   - **Testing**: how it was validated
   - **Related Issues**: link to GitHub issue (e.g., `Closes #123`)

## Commands

```bash
branch=$(git branch --show-current)

# Push
git push -u origin HEAD

# Check if PR exists
pr_state=$(gh pr view --json state -q .state 2>/dev/null || true)

if [ -z "$pr_state" ]; then
  # Create PR
  gh pr create --title "<clear title>" --body "<body>"
elif [ "$pr_state" = "OPEN" ]; then
  # Update PR title/body if scope changed
  gh pr edit --title "<updated title>"
fi

# Show PR URL
gh pr view --json url -q .url
```

## QCut Specifics

- Always link the GitHub issue: `Closes #<issue-number>`
- Add label if relevant: `gh pr edit --add-label "feature"` or `"bugfix"`
- PR title format: `[QUR-XX] <description>` if using Linear, or `fix #123: <description>` for GitHub issues
