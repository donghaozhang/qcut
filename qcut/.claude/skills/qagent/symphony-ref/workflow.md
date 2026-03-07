# QAgent Workflow — Adapted from OpenAI Symphony

This document defines the agent workflow for autonomous issue execution in QCut.

## Status Map

```
Todo → In Progress → Human Review → Merging → Done
                         ↓
                      Rework → 重新开始
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

1. Find or create a single persistent **Workpad** comment on the issue:
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
7. Merge latest `origin/main` into branch, resolve conflicts, rerun checks.
8. Update workpad with final checklist status and validation notes.
9. Run PR feedback sweep: check all review comments are addressed.
10. Only then move issue to Human Review.

## Post-PR CI Watch

After creating or updating the PR, do NOT exit immediately. Wait for CI:

1. Run `gh pr checks <PR-number> --watch --fail-fast` to wait for CI results.
2. If any check fails:
   - Read failure logs: `gh run view <run-id> --log-failed`
   - Fix the code, commit, and push.
   - Re-run `gh pr checks --watch --fail-fast`.
3. If all checks pass, proceed to the PR feedback sweep.
4. If CI takes longer than 10 minutes, proceed to PR feedback sweep anyway — the lifecycle manager will handle late CI failures.

This step is critical: never exit with failing CI if you can fix it.

## Step 3: Human Review → Merge

1. In Human Review, do not code or change content.
2. Poll for review updates (GitHub PR comments).
3. If review feedback requires changes → move to Rework.
4. If approved → follow the `land` skill to merge.
5. After merge → move issue to Done.

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
  - ✅ Plan checklist fully complete in workpad
  - ✅ Acceptance criteria complete
  - ✅ Validation/tests green
  - ✅ PR feedback sweep complete
  - ✅ PR checks green, branch pushed, PR linked

---

*Adapted from [OpenAI Symphony](https://github.com/openai/symphony) WORKFLOW.md and SPEC.md*
*Modified for QCut + GitHub Issues + Claude Code workflow*
