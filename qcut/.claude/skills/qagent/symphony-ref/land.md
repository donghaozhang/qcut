# Land Skill

Land a PR by monitoring CI, resolving conflicts, handling review feedback, and squash-merging when green.

## Goals

- Ensure the PR is conflict-free with main.
- Keep CI green and fix failures when they occur.
- Squash-merge the PR once checks pass.
- Do not yield until the PR is merged; keep the watcher loop running unless blocked.

## Preconditions

- `gh` CLI is authenticated.
- On the PR branch with a clean working tree.

## Steps

1. Locate the PR for the current branch.
2. Run local validation before any push:
   ```bash
   bun run biome:check
   bun run typecheck
   ```
3. If uncommitted changes exist, commit with the `commit` skill and push with the `push` skill.
4. Check mergeability and conflicts against main:
   ```bash
   mergeable=$(gh pr view --json mergeable -q .mergeable)
   ```
5. If conflicts exist:
   - Use the `pull` skill to fetch/merge `origin/main` and resolve conflicts.
   - Use the `push` skill to publish the updated branch.
6. Watch checks until complete:
   ```bash
   gh pr checks --watch
   ```
7. If checks fail:
   - Pull logs: `gh run view <run-id> --log`
   - Fix the issue locally.
   - Commit, push, re-run checks.
8. Handle review feedback:
   - **Bot reviews** (CodeRabbit etc.): address actionable items or reply with justification.
   - **Human reviews**: always address before merging.
   - Reply to each comment with intended action before pushing code changes.
9. When all checks are green and review feedback is addressed:
   ```bash
   pr_title=$(gh pr view --json title -q .title)
   pr_body=$(gh pr view --json body -q .body)
   gh pr merge --squash --subject "$pr_title" --body "$pr_body"
   ```

## Review Handling

For each review comment, choose one mode:
- **Accept**: implement the fix, reply with what you changed.
- **Clarify**: ask for more context if ambiguous.
- **Push back**: acknowledge + rationale + offer alternative.

Always respond with intended action before pushing code changes.

## Failure Handling

- Use judgment to identify flaky failures (e.g., timeout on only one platform) — may proceed without fixing.
- If CI pushes an auto-fix commit, pull locally, add a real commit, force-push to retrigger CI.
- Do not enable auto-merge.
- Do not use `--force`; only `--force-with-lease` when history was rewritten.

## Scope

- PR title and description should reflect the full scope, not just the most recent fix.
- If review feedback expands scope, decide whether to include or defer.
- Out-of-scope improvements → create a new issue, don't expand current PR.
