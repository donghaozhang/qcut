# win-hermes editor command test results

## Context
- Branch: `win-Hermes`
- Repo root: `/mnt/c/<repo>/qcut`
- CLI invocation used: `bun run qcut ...`
- QCut app state during test: desktop app was already running
- Native CLI version: `1.0.0`

## What I tested
I focused on safe editor commands first: health/auth/session inspection, console/snapshot access, project discovery, project read APIs, and simple UI navigation.

## Summary
- Successful commands: 9
- Failed commands: 3
- Notable partial behavior: `editor:snapshot` returned `ok` but no elements

## Results

| Command | Result | Notes |
|---|---|---|
| `qcut --version` | ✅ success | Returned `1.0.0` |
| `editor:health --status-only --json` | ✅ success | Reported `status: ok`, app version `2026.04.26.2`, API version `1.1.0` |
| `editor:auth:token --json` | ✅ success | Returned masked token and `authenticated: true` |
| `editor:session:list --json` | ✅ success | Returned empty session list, `count: 0` |
| `editor:console --json` | ❌ failed | Error: console routes require `QCUT_API_TOKEN` bearer auth |
| `editor:errors --json` | ❌ failed | Same `QCUT_API_TOKEN` requirement |
| `editor:snapshot --interactive --depth 2 --json` | ✅ success with empty data | Returned `elements: []`, `actionable: 0` |
| `editor:navigator:projects --json` | ✅ success | Found 1 project |
| `editor:project:info --json` (without `--project-id`) | ❌ failed | Error: `Missing --project-id` |
| `editor:navigator:open --project-id 0989584f-9492-4e0f-be00-0e76e2292239 --json` | ✅ success | Navigated to project |
| `editor:ui:switch-panel --panel video-edit --json` | ✅ success | Switched panel successfully |
| `editor:project:info --project-id 0989584f-9492-4e0f-be00-0e76e2292239 --json` | ✅ success | Returned project metadata, counts, settings |
| `editor:project:info --project-id 0989584f-9492-4e0f-be00-0e76e2292239 --full --json` | ✅ success | Returned full project state envelope |
| `editor:media:list --project-id 0989584f-9492-4e0f-be00-0e76e2292239 --json` | ✅ success | Returned empty media list |
| `editor:timeline:export --project-id 0989584f-9492-4e0f-be00-0e76e2292239 --json` | ✅ success | Returned 1 track with 1 element |
| `editor:snapshot --interactive --depth 3 --json` (after open/switch) | ✅ success with empty data | Still returned no accessible interactive elements |

## Key outputs

### Project discovery
`editor:navigator:projects --json` returned one project:
- `id`: `0989584f-9492-4e0f-be00-0e76e2292239`
- `name`: `New Project`

### Project read APIs
`editor:project:info --project-id ... --json` returned:
- name: `New Project`
- resolution: `1920x1080`
- fps: `30`
- track count: `1`
- element count: `1`
- total duration: `4.062993`

### Timeline export
`editor:timeline:export --project-id ... --json` returned:
- `1` track
- `1` element
- element source name starting with `AI: One-shot ultra-wide-angle stro...`

## Failure analysis

### 1. Console commands are gated by API token
These commands failed:
- `editor:console --json`
- `editor:errors --json`

Exact failure reason:
> `Console routes require QCUT_API_TOKEN to be configured and sent as a bearer token.`

Interpretation: the editor is up, but these routes need extra auth beyond the default CLI call path I used.

### 2. Project info requires explicit project id
This failed as expected when called without required args:
- `editor:project:info --json`

Exact failure reason:
> `Missing --project-id`

Interpretation: this command is working correctly; it is enforcing required input.

### 3. Snapshot command succeeded but returned no elements
Both interactive snapshot runs returned `ok` but with:
- `elements: []`
- `summary.total: 0`
- `summary.actionable: 0`

Interpretation: the snapshot route is reachable, but the current editor state / accessibility bridge did not expose actionable elements at the time of testing.

## Overall conclusion
The `editor:*` CLI surface is partially verified and mostly working for:
- health checks
- auth inspection
- session inspection
- project discovery
- project navigation
- panel switching
- project state export
- timeline export

The two areas that still need follow-up are:
1. console/error routes requiring `QCUT_API_TOKEN`
2. snapshot route returning an empty accessibility tree even after opening a project and switching to `video-edit`

## Useful next checks
If we want to continue debugging editor automation, the next best tests are:
1. find where `QCUT_API_TOKEN` should be sourced for CLI console routes
2. try a non-interactive/full snapshot mode
3. inspect the source files mapped by `native-cli/references/reference-source-files.md` for snapshot and console handlers
