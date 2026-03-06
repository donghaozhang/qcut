# QAgent v5 — Implementation Plan

**Branch**: `qagent-v5`
**Status**: In progress — 4 items remaining

---

## Overview

QAgent v5 extends the governance layer built in the previous sprint. The workflow contract, hard gate logic, CLI governance commands, lifecycle policy integration, and prompt layer are complete. This plan covers the four remaining work items and four actionable operational suggestions.

### Goals

1. Make the Workpad the single source of truth across all trackers (GitHub, Linear, future).
2. Add an automatic reconciliation loop that detects and corrects drift between issue/session/PR state and policy gate results.
3. Surface gate-blocking reasons as first-class UI in the dashboard rather than buried in CLI output.
4. Provide per-project/per-severity escalation templates so each team can define their own notify/escalate/action playbook.

---

## Completed (reference only)

| Item | Location |
|------|----------|
| `WorkflowPolicy`, `PolicyMode`, blocker classes | `packages/core/src/workflow-contract.ts` |
| Hard gate logic (review / CI / approval / conflicts) | `packages/core/src/policy-gate.ts` |
| CLI governance commands (`policy check/explain`, `workflow lint`) | `packages/cli/src/commands/policy.ts` |
| Lifecycle integrated with policy evaluation | `packages/core/src/lifecycle-policy.ts`, `lifecycle-manager.ts` |
| Prompt layer integrated with workflow contract | `packages/core/src/orchestrator-prompt.ts` |

---

## Work Items

---

### W1 — Tracker-agnostic Workpad: single source of truth

**Priority**: P0
**Effort**: Medium (3–4 days)

#### Description

`syncSessionWorkpad` in `lifecycle-tracker.ts` writes a rich Markdown body to the tracker workpad (GitHub issue comment, Linear document, etc.). However, the shape of that body and the interface contract differ per tracker plugin. The `Tracker` interface currently exposes optional `upsertWorkpad` / `getWorkpad` methods with no shared schema, making it impossible to query workpad state uniformly across trackers. This item defines a canonical `WorkpadSnapshot` type, enforces it in the tracker interface, and migrates the existing GitHub tracker to use it.

#### Files to modify / create

| Action | Path |
|--------|------|
| Modify | `packages/core/src/types/plugin-types.ts` — add `WorkpadSnapshot` type; make `upsertWorkpad` / `getWorkpad` required on `Tracker` |
| Modify | `packages/core/src/lifecycle-tracker.ts` — `buildWorkpadBody` returns structured `WorkpadSnapshot`; `syncSessionWorkpad` uses typed result |
| Create | `packages/core/src/workpad-schema.ts` — canonical `WorkpadSnapshot` definition and `renderWorkpadBody(snapshot): string` helper |
| Modify | `packages/plugins/tracker-github/src/index.ts` — implement `upsertWorkpad` / `getWorkpad` against the new schema |
| Modify | `packages/plugins/tracker-linear/src/index.ts` — implement the same interface (stub or full, depending on Linear API) |
| Modify | `packages/core/src/__tests__/lifecycle-manager.test.ts` — add workpad snapshot assertion |

#### Implementation steps

1. Define `WorkpadSnapshot` in `packages/core/src/workpad-schema.ts`:
   ```ts
   export interface WorkpadSnapshot {
     envStamp: string;          // "session-id:branch@status"
     sessionId: string;
     status: SessionStatus;
     branch: string | null;
     issueId: string | null;
     prNumber: number | null;
     prUrl: string | null;
     agentSummary: string | null;
     trackerState: string | null;
     policyGate: WorkpadPolicyGate | null;   // structured, not rendered
     blockerBrief: WorkpadBlockerBrief | null;
     updatedAt: string;         // ISO timestamp
   }
   export interface WorkpadPolicyGate {
     mode: PolicyMode;
     passed: boolean;
     ciStatus: CIStatus | null;
     reviewDecision: string | null;
     violations: Array<{ code: string; message: string; blockerClass: string }>;
     failingChecks: string[];
   }
   export interface WorkpadBlockerBrief {
     what: string;
     whyBlocks: string;
     actionNeeded: string;
   }
   export function renderWorkpadBody(snapshot: WorkpadSnapshot): string { ... }
   ```
2. Update `buildWorkpadBody` in `lifecycle-tracker.ts` to return `WorkpadSnapshot` (keep string rendering via `renderWorkpadBody`).
3. Update `Tracker` plugin interface: `upsertWorkpad(snapshot: WorkpadSnapshot, project): Promise<WorkpadRef>` and `getWorkpad(issueId, project): Promise<WorkpadRef | null>`.
4. Migrate `tracker-github` plugin: store `snapshot` as structured JSON in a hidden HTML comment inside the workpad body so it can be round-tripped on `getWorkpad`.
5. Add Linear plugin stub (noop if `upsertWorkpad` not feasible, with a clear error log).
6. Update `syncSessionWorkpad` to pass the snapshot directly.

#### Acceptance criteria

- `qagent policy check` produces the same violations regardless of whether the tracker is GitHub or Linear.
- `buildWorkpadBody` unit test passes with a mock tracker that returns `WorkpadSnapshot`.
- `WorkpadSnapshot` is exported from `@composio/ao-core`.
- TypeScript builds with zero errors.

---

### W2 — Reconciliation Loop: drift auto-correction

**Priority**: P0
**Effort**: Medium-large (4–6 days)

#### Description

The lifecycle manager polls sessions and transitions their status, but it does not detect *drift* — cases where the stored session status is inconsistent with the live state on GitHub/Linear. For example: a PR that was merged externally leaves the session stuck in `mergeable`; an issue that was closed in Linear is still `working`. The reconciliation loop is a secondary polling pass that runs after the main lifecycle tick, compares ground truth from the tracker/SCM with stored state, and auto-corrects or escalates.

#### Files to modify / create

| Action | Path |
|--------|------|
| Create | `packages/core/src/reconciliation-loop.ts` — `ReconciliationLoop` class |
| Modify | `packages/core/src/lifecycle-manager.ts` — integrate reconciliation pass after main tick |
| Modify | `packages/core/src/types/service-types.ts` — add `ReconciliationResult` and `DriftEvent` types |
| Modify | `packages/core/src/lifecycle-events.ts` — add `drift.detected` and `drift.corrected` event types |
| Create | `packages/core/src/__tests__/reconciliation-loop.test.ts` |

#### Implementation steps

1. Define drift checks in `reconciliation-loop.ts`:
   - **Issue state drift**: tracker says issue is closed/cancelled → session status is still `working` / `pr_open` → transition to `done` or `errored` and notify.
   - **PR state drift**: SCM says PR is merged → session status is not `merged` → correct to `merged`.
   - **PR state drift**: SCM says PR is closed (not merged) → session status is not terminal → transition to `errored`, notify human.
   - **Policy gate drift**: policy gate was `passed` last tick but PR state changed → re-evaluate and update workpad.
2. Add `DriftEvent` to `lifecycle-events.ts`:
   ```ts
   | "drift.detected"   // out-of-sync state found
   | "drift.corrected"  // auto-corrected without human
   | "drift.escalated"  // required human judgment
   ```
3. Implement `ReconciliationLoop`:
   ```ts
   export class ReconciliationLoop {
     async run(sessions: Session[], deps: ReconciliationDeps): Promise<ReconciliationResult[]>
   }
   ```
   - Each check is an independent async function that returns `DriftEvent | null`.
   - Errors in individual checks are caught and logged; they do not abort other checks.
4. Wire into `lifecycle-manager.ts` after the main polling tick. Run at a longer interval (default: 5× the main tick interval, configurable via `qagent.yaml` `reconciliationIntervalMs`).
5. Persist last-reconciled timestamp in session metadata (`reconciliationLastAt`).
6. Add `reconciliationIntervalMs` to `OrchestratorConfig` schema in `packages/core/src/types/config-types.ts`.

#### Acceptance criteria

- A session whose PR is externally merged transitions to `merged` within one reconciliation cycle without manual intervention.
- `drift.detected` and `drift.corrected` events appear in the event log.
- Each drift check has a unit test with a mocked SCM/Tracker.
- Reconciliation errors are isolated per check and do not crash the main loop.

---

### W3 — Dashboard governance visualization: gate-blocking reason as first-class UI

**Priority**: P1
**Effort**: Small-medium (2–3 days)

#### Description

Gate violations are currently only surfaced via `qagent policy explain <session>`. The dashboard (`Dashboard.tsx`, `SessionCard.tsx`) shows CI status and review state but has no dedicated "why is this gate blocked?" area. This item adds a `GateBlockerPanel` component that appears as a fixed callout on session cards when policy violations are present, and adds a `/api/sessions/[id]/policy` route that returns live gate state.

#### Files to modify / create

| Action | Path |
|--------|------|
| Create | `packages/web/src/components/GateBlockerPanel.tsx` — inline violation list |
| Modify | `packages/web/src/components/SessionCard.tsx` — render `GateBlockerPanel` when violations present |
| Modify | `packages/web/src/components/SessionDetail.tsx` — render full violation detail with mode badge |
| Create | `packages/web/src/app/api/sessions/[id]/policy/route.ts` — live policy gate evaluation |
| Modify | `packages/web/src/lib/types.ts` — add `DashboardPolicyGate` type |
| Modify | `packages/web/src/lib/serialize.ts` — include policy gate summary in serialized session |
| Create | `packages/web/src/__tests__/gate-blocker-panel.test.tsx` |

#### Implementation steps

1. Add `DashboardPolicyGate` to `packages/web/src/lib/types.ts`:
   ```ts
   export interface DashboardPolicyGate {
     passed: boolean;
     mode: "advisory" | "enforced";
     violations: Array<{ code: string; message: string }>;
     checkedAt: string; // ISO
   }
   ```
2. Add `/api/sessions/[id]/policy` route: loads config, finds session, calls `evaluatePolicyGate` via core, returns `DashboardPolicyGate` JSON. Mirrors the pattern in `/api/sessions/[id]/route.ts`.
3. Implement `GateBlockerPanel`:
   - Shows only when `violations.length > 0`.
   - Mode badge: `advisory` (yellow) / `enforced` (red).
   - Lists each violation `code` + `message` in a compact list.
   - "Refresh" button that re-fetches `/api/sessions/[id]/policy`.
4. In `SessionCard.tsx`, add `GateBlockerPanel` below the existing CI/PR status strip. Gate state is fetched on mount (one API call per card, cached for 30 s).
5. In `SessionDetail.tsx`, show full violation detail including `blockerClass`, `details`, and failing required checks.
6. Serialize a summary (passed/failed + violation count) into the SSE snapshot so the dashboard can show a gate indicator dot without per-card API calls.

#### Acceptance criteria

- A session with an enforced gate failure shows a red "Gate Blocked" callout on its card with the reason.
- A session with advisory-mode violations shows a yellow callout.
- Sessions with no violations show no callout (no DOM element rendered).
- The `/api/sessions/[id]/policy` route returns 404 for unknown sessions and 200 with gate data for known ones.
- Component renders correctly in the test with mocked violations.

---

### W4 — Blocker escalation strategy templating

**Priority**: P1
**Effort**: Medium (3–4 days)

#### Description

`WorkflowBlockedPolicy` in `workflow-contract.ts` has `escalation: "notify" | "block"` and a list of `classes`. This is a coarse knob. Teams need per-severity, per-project templates that define: what notification to send, who to target, and what automated action (if any) to take. This item introduces `EscalationTemplate` — defined in `qagent.yaml` or `.qagent/WORKFLOW.md` front matter — and a template engine that renders and dispatches them.

#### Files to modify / create

| Action | Path |
|--------|------|
| Create | `packages/core/src/escalation-template.ts` — `EscalationTemplate` type, `renderEscalationMessage`, `resolveEscalationTemplate` |
| Modify | `packages/core/src/workflow-contract.ts` — extend `WorkflowBlockedPolicy` with optional `templates` array |
| Modify | `packages/core/src/lifecycle-reactions.ts` — call `resolveEscalationTemplate` before notifying human |
| Modify | `packages/core/src/types/config-types.ts` — add `escalationTemplates` to `ProjectConfig` |
| Modify | `packages/cli/src/commands/policy.ts` — add `policy escalate <session>` subcommand for manual trigger |
| Create | `packages/core/src/__tests__/escalation-template.test.ts` |

#### Implementation steps

1. Define `EscalationTemplate` in `escalation-template.ts`:
   ```ts
   export interface EscalationTemplate {
     id: string;
     severity: "warning" | "action" | "urgent";        // matches EventPriority
     blockerClasses?: PolicyBlockerClass[];              // match subset; omit = all
     messageTemplate: string;                           // Handlebars-lite: {{sessionId}}, {{violation}}, etc.
     notifyChannels?: string[];                         // Notifier plugin names
     autoAction?: "resend_prompt" | "kill" | "none";   // automated response
   }
   ```
2. Add `templates?: EscalationTemplate[]` to `WorkflowBlockedPolicy`.
3. Parse templates from WORKFLOW.md front matter in `parseWorkflowPolicy` (under `blocked_policy.templates`).
4. Implement `resolveEscalationTemplate({ violations, templates }): EscalationTemplate | null` — finds the most specific match (blockerClass + severity).
5. Implement `renderEscalationMessage({ template, context }): string` — simple `{{key}}` substitution, no external dependency.
6. In `lifecycle-reactions.ts`, before calling `notifyHuman`, call `resolveEscalationTemplate`. If a template matches, use its `messageTemplate` and `notifyChannels`. Fall back to current behavior if no template.
7. Add `policy escalate <session>` CLI subcommand: evaluates gate, resolves template, logs what would be dispatched (dry-run by default, `--execute` to actually send).

#### Acceptance criteria

- A WORKFLOW.md with `blocked_policy.templates` parses without error (round-trip test).
- `resolveEscalationTemplate` returns the correct template for a given blockerClass + severity.
- `renderEscalationMessage` substitutes all `{{key}}` tokens correctly and leaves unknown tokens as-is.
- `policy escalate <session> --dry-run` prints the resolved template message without sending.
- TypeScript builds with zero errors; no `any` introduced.

---

## Actionable Operational Suggestions

These are configuration/process changes, not code. They should be done alongside or after the code items above.

| # | Suggestion | Action | When |
|---|-----------|--------|------|
| S1 | Enable `policyMode: enforced` for pilot projects | In `qagent.yaml`, set `policyMode: enforced` per project under `projects.<id>.policyMode`. Start with one low-risk project. | After W1 + W2 |
| S2 | Integrate `qagent policy check` into CI / pre-merge | Add a CI job step: `qagent policy check <project-id>` — exits 2 on enforced failures. Wire to branch protection rules. | After W1 |
| S3 | Add "Gate Blocking Reason" fixed area to dashboard | Covered by W3. Requires W1 (typed snapshot) to be merged first. | After W3 |
| S4 | Unify session progress artifacts (GitHub issue comment templates) | Start with GitHub: add a `WORKFLOW.md` template to each pilot project repo at `.qagent/WORKFLOW.md`. Use `blocked_policy.templates` from W4. | After W4 |

---

## Dependencies

```
W1 (Workpad schema)
  └── W2 (Reconciliation loop)   — needs typed WorkpadSnapshot for drift reporting
  └── W3 (Dashboard gate UI)     — snapshot feeds SSE; typed gate for API route
  └── W4 (Escalation templates)  — templates parsed from workflow contract; W1 adds context vars

W2 depends on W1 (structured snapshot for drift workpad updates)
W3 depends on W1 (DashboardPolicyGate shape aligned with WorkpadPolicyGate)
W4 is independent of W2, W3 but should share WorkpadBlockerBrief context from W1
```

### Hard dependencies (must complete before starting)

| Item | Depends on |
|------|-----------|
| W2 | W1 complete (WorkpadSnapshot exported from core) |
| W3 | W1 complete (typed gate summary available in serialize.ts) |

### Soft dependencies (can start in parallel, integrate at merge)

| Item | Soft dep |
|------|---------|
| W4 | W1 (shares context vars), W3 (dashboard shows escalation status) |

---

## Suggested Implementation Order

```
Sprint 1
  W1 — Workpad schema  (P0, unblocks everything)

Sprint 2 (parallel tracks)
  W2 — Reconciliation loop       (P0)
  W3 — Dashboard gate UI         (P1)

Sprint 3
  W4 — Escalation templating     (P1)
  S1, S2 — Operational rollout   (after W1 + W2 green)
  S3 — Dashboard fixed area live (after W3 merged)
  S4 — GitHub comment templates  (after W4 merged)
```

---

## Key File Reference

```
packages/qagent/packages/core/src/
  workflow-contract.ts          — WorkflowPolicy, WorkflowContract, PolicyMode
  policy-gate.ts                — evaluatePolicyGate, PolicyGateResult, PolicyGateViolation
  lifecycle-manager.ts          — main polling loop, state machine
  lifecycle-policy.ts           — evaluateSessionPolicyGate, SessionPolicyEvaluation
  lifecycle-tracker.ts          — syncSessionWorkpad, buildWorkpadBody, syncIssueStateRouting
  lifecycle-reactions.ts        — notifyHuman, executeReaction
  types/plugin-types.ts         — Tracker, SCM, Notifier interfaces
  types/session-types.ts        — Session, SessionStatus, SessionMetadata
  types/config-types.ts         — OrchestratorConfig, ProjectConfig

packages/qagent/packages/cli/src/commands/
  policy.ts                     — policy check / explain / workflow lint

packages/qagent/packages/web/src/
  components/Dashboard.tsx      — main dashboard, SSE consumer
  components/SessionCard.tsx    — per-session card
  components/SessionDetail.tsx  — detail view
  lib/types.ts                  — DashboardSession, DashboardPR, etc.
  lib/serialize.ts              — serialization from core Session to web types
  app/api/sessions/[id]/route.ts — session API pattern to follow
```
