# QAgent Workflow — Adapted from OpenAI Symphony

This document defines the agent workflow for autonomous issue execution in QCut.

## Status Map

```
Todo → In Progress → Human Review → Merging → Done
                         ↓              ↑
                      Rework       Merge & Release
```

- **Todo**: queued; immediately transition to In Progress before active work.
- **In Progress**: implementation actively underway.
- **Human Review**: PR is attached and validated; waiting on human approval.
- **Merging**: approved by human; execute the land skill flow.
- **Rework**: reviewer requested changes; re-plan + re-implement.
- **Done**: terminal state; no further action.

## Default Posture

1. Start by determining the issue's current status, then follow the matching flow.
2. Maintain a **Workpad** (persistent comment on the issue) as source of truth for progress.
3. Spend extra effort up front on **planning and verification design** before implementation.
4. **Reproduce first**: always confirm the current behavior/issue before changing code.
5. Keep issue metadata current (status, checklist, acceptance criteria, links).
6. When out-of-scope improvements are discovered, **file a separate issue** instead of expanding scope.
7. Operate autonomously end-to-end unless blocked by missing requirements or permissions.

## Step 0: Route by Current State

1. Read the issue's current state.
2. Route:
   - **Todo** → move to In Progress, create workpad, start execution.
   - **In Progress** → continue from workpad.
   - **Human Review** → wait and poll for review updates.
   - **Merging** → follow the `land` skill.
   - **Rework** → re-plan and re-implement.
   - **Done** → do nothing.

## Step 1: Kickoff (Todo → In Progress)

**MANDATORY**: You MUST create a Workpad comment before starting any implementation.

1. Find or create a single persistent **Workpad** comment on the issue using `gh issue comment <number> --body "..."`:
   ```markdown
   ## Agent Workpad

   ### Plan
   - [ ] 1. Parent task
     - [ ] 1.1 Child task
     - [ ] 1.2 Child task
   - [ ] 2. Parent task

   ### Acceptance Criteria
   - [ ] Criterion 1
   - [ ] Criterion 2

   ### Validation
   - [ ] targeted tests: `<command>`

   ### Notes
   - <progress note>

   ### Confusions
   - <only include when something was confusing>
   ```
2. Write/update a hierarchical plan in the workpad.
3. Add explicit acceptance criteria and TODOs in checklist form.
4. Run a self-review of the plan and refine it.
5. Capture a concrete reproduction signal before implementing.
6. Run the `pull` skill to sync with latest `origin/main`.

Do NOT skip the workpad — it is required for all tasks regardless of complexity.

## Step 2: Execution (In Progress → Human Review)

1. Determine current repo state (`branch`, `git status`, `HEAD`).
2. Implement against the plan, keeping the workpad current:
   - Check off completed items.
   - Add newly discovered items.
   - Update immediately after each meaningful milestone.
3. Run validation/tests:
   ```bash
   bun run biome:check
   bun run typecheck
   # QCut-specific tests as needed
   ```
4. Re-check all acceptance criteria and close gaps.
5. Before every `git push`: run validation, confirm it passes, then commit and push.
6. Create/update PR with `gh pr create` or `gh pr edit`.
7. **MANDATORY — CI Watch**: Do NOT proceed until CI is checked.
   - Run `gh pr checks <PR-number> --watch --fail-fast` to wait for CI results.
   - If any check fails: read failure logs (`gh run view <run-id> --log-failed`), fix the code, commit, push, and re-run `gh pr checks --watch --fail-fast`.
   - If all checks pass, continue to step 8.
   - If CI takes longer than 10 minutes, continue to step 8 — the lifecycle manager will handle late CI failures.
   - **Never exit the session with failing CI if you can fix it.**
8. Merge latest `origin/main` into branch, resolve conflicts, rerun checks.
9. Update workpad with final checklist status and validation notes.
10. Run PR feedback sweep: check all review comments are addressed.
11. When CI is green and all checks pass → proceed to **Step 5: Merge & Release**.

## Step 3: Human Review → Merge

1. In Human Review, do not code or change content.
2. Poll for review updates (GitHub PR comments).
3. If review feedback requires changes → move to Rework.
4. If approved → follow the `land` skill to merge.
5. After merge → move issue to Done.

## Step 5: Merge & Release (CI Green → Done)

When all CI checks pass and no human review is required (or already approved):

1. Merge the current PR to the default branch (squash merge). Keep the feature branch.
2. Switch to the default branch and pull latest.
3. If the PR is linked to a GitHub issue, close the issue.
4. Trigger the GitHub Release workflow: `gh workflow run release.yml`.
5. Monitor the release: `gh run watch <run-id> --exit-status`.
6. If the release fails, diagnose and fix the issue.
7. Update the workpad with merge and release status.
8. Move issue to Done.
9. Clean up: delete the worktree by running `git -C <source-repo-path> worktree remove <worktree-path>` (must run from outside the worktree).

## Step 4: Rework

1. Treat Rework as a **full approach reset**, not incremental patching.
2. Re-read the full issue body and all human comments.
3. Close the existing PR.
4. Remove the existing workpad comment.
5. Create a fresh branch from `origin/main`.
6. Start over from Step 1.

## PR Feedback Sweep Protocol

Before moving to Human Review:
1. Gather feedback from all channels:
   - Top-level PR comments: `gh pr view --comments`
   - Inline review comments: `gh api repos/{owner}/{repo}/pulls/{pr}/comments`
   - Review summaries: `gh pr view --json reviews`
2. Treat every actionable reviewer comment as blocking until:
   - Code/test/docs updated to address it, OR
   - Explicit, justified pushback reply posted.
3. Update workpad to include each feedback item and resolution status.
4. Re-run validation after changes and push updates.
5. Repeat until no outstanding actionable comments remain.

## Guardrails

- Never run agent work in the source repo directly; use worktrees.
- Do not edit the issue body for planning; use the workpad comment only.
- Use exactly one persistent workpad comment per issue.
- Temporary proof edits are allowed for local verification but must be reverted before commit.
- Do not move to Human Review unless the completion bar is met:
  - ✅ Workpad comment created on the issue
  - ✅ Plan checklist fully complete in workpad
  - ✅ Acceptance criteria complete
  - ✅ Validation/tests green
  - ✅ CI checks watched via `gh pr checks --watch` (waited or confirmed green)
  - ✅ PR feedback sweep complete
  - ✅ PR checks green, branch pushed, PR linked

---

*Adapted from [OpenAI Symphony](https://github.com/openai/symphony) WORKFLOW.md and SPEC.md*
*Modified for QCut + GitHub Issues + Claude Code workflow*
