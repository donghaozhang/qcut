# iPad v6 — scope TBD

**Status**: 🟡 Draft — scope not yet defined
**Branch**: `ipad-v6`
**PR**: opens against `master`

This branch was created on 2026-04-26 as a working space for the next round
of iPad-related work, building on top of the now-complete CLI automation
infrastructure (see [`docs/task/platform/ios-cli-automation.md`](../platform/ios-cli-automation.md)).

## Setup verified (2026-04-26)

- Device: iPad Air 13-inch (M2), iPadOS 26.3.1
- App: `com.qcut.videoeditor` reinstalled via `xcrun devicectl` after re-trust
- CLI: `qcut://state` round-trip via `xcrun devicectl device process launch
  --payload-url` confirmed to return JSON with all 6 stores attached.
- Build pipeline: `npx -y @capacitor/cli@8 sync ios` → `xcodebuild` →
  `devicectl install`.

> ⚠️ `@capacitor/cli` is not pinned in `apps/web/package.json` and `bunx`
> currently fails to resolve it (`could not determine executable to run for
> package cap`), so the sync step has to fall back to `npx -y
> @capacitor/cli@8` as a one-off. **This is a real gap, not a stylistic one
> — without pinning, every contributor running this branch is exposed to
> whatever Capacitor 8.x patch ships next.** A small follow-up should
> `bun add -d @capacitor/cli@<exact-version>` (matching the iOS-side
> `capacitor-swift-pm 8.2.0`) and then standardize the docs on `bunx`
> across the board.

## Candidate workstreams (pick one or more)

The reference doc flagged two unfinished items at the bottom — either is a
sensible scope for this PR:

1. **Console-bridge user-agent detection** — `apps/web/src/lib/debug/ios-console-bridge.ts`
   currently keys on `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1`.
   The doc's "Remaining Work" notes that `__qcutLogs` is **not capturing on
   physical iPad** in the current build. Investigate whether the Capacitor
   WebView reports a different platform string and adjust the gate so
   `qcut://console` returns the captured ring buffer on real hardware.

2. **End-to-end `import-and-export` on physical device** — the
   `qcut://cli.import-and-export` command exists but the doc says it has
   "not yet [been] verified on physical device". Run it, capture failures,
   add the missing pieces (e.g. file-picker autoclick, share-sheet
   handling), and tick off Task 7's Files-app integration on a real iPad.

3. **Something else entirely** — fill in here once the scope is decided.

## Non-goals

- No Swift CLI changes that would re-touch `QCutViewController.swift` —
  it was just verified end-to-end and shouldn't be churned without reason.
- No Xcode project file changes (`project.pbxproj`) — keep the PR
  diff readable.
