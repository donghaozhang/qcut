# Cover Collection Batches and Four-Stage Accounting

Date: 2026-09-06. Branch: `codex/cover-design`. PR: [#463](https://github.com/Quriosity-agent/qcut/pull/463).

## Progress and Blocker

**Zero new templates were acquired in this run. The full online catalog has not been collected.** Observation deduplication, category batches, dependency retries, independent backup, and stage reporting are implemented and exercised. The collector consumes explicit observations; it does not automate native catalog pagination.

Jianying's main window is dimmed and cover-entry clicks/window switching did not expose an actionable cover panel. Several application paths share `com.lemon.lvpro`; selecting the internal sub-application timed out twice. Jianying was not restarted or killed, and the project's committed cover was not changed. The user has been asked to bring Cover Design to the foreground on its Templates tab.

The local `Cache/template` contains eight definitions with `cover.cover_draft`, all already retained. No usable catalog for these covers was found in the inspected resource SDK tables. Ordinary subtitle templates and historical CEF previews were not treated as cover templates. No authentication data was copied or decrypted.

## Definitions

- **Discovered:** an explicit observation with package hash, preview hash, title and observed categories, not the full online population.
- **Cached:** the definition, preview and retained dependency files pass integrity checks. Missing references can still exist; `dependenciesComplete` is counted separately.
- **Applicable:** text-layout parsing and font/word-art preparation succeed. This is not full background composition or proof that every template renders correctly.
- **Verified:** a manual text-layout render/save/reopen receipt with matching content fingerprint, runtime and timestamp, plus hash-checked evidence files. The collector validates receipt integrity, not screenshot semantics or pixel parity.

| Category | Discovered | Cached | Text Layout Prepared | Verified |
| --- | ---: | ---: | ---: | ---: |
| Default / unique union | 8 | 8 | 7 | 3 |
| Recommended | 3 | 3 | 2 | 1 |
| Life | 3 | 3 | 2 | 1 |
| Games | 1 | 1 | 1 | 1 |
| Knowledge | 1 | 1 | 1 | 0 |
| Fashion | 1 | 1 | 1 | 0 |
| Film & TV | 1 | 1 | 1 | 1 |
| Food | 1 | 1 | 1 | 0 |

Recommended and Life contain the same three packages; category counts must not be summed as unique templates. Three packages have all explicit dependencies retained. Iceland is excluded from applicability because vertical text is unsupported. Weekend, S23 and HERO reuse actual same-day render/save/reopen evidence; this run did not rerender all three.

## Executed Batches

Five dependency-incomplete samples were retried with `--retry-missing --recover --batch-size 2`: Recommended 2, Recommended 1, Games 1 and Film 1. All four batches completed with independent SSD backup checks. The five old background filter packages remain unavailable; no same-name substitutions were fabricated.

Retrying an unchanged definition now retains verified owned dependencies if the original source is depleted. A changed definition cannot reuse them. New observed category memberships merge into existing cards without redownloading packages.

## Storage and Commands

- Owned root: `/Users/peter/Library/Application Support/QCut/PrivateAssets/JianyingCover`
- Backup root: `/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover`
- `collection-observations.json`: cumulative deduplicated observations.
- `collection-report.json`: current per-category stages, missing references, preparation failures and latest run's batches. It is a replaceable snapshot, not an append-only history.
- `collection-verifications.json` and `collection-evidence/<sha256>`: receipts and retained evidence on both drives, independently readable after external screenshots disappear.
- `catalog.json` and `objects/<sha256>` remain the UI's resource store. Proprietary assets and local manifests stay outside Git.

Incoming observations use the existing `CoverObservation` contract and `native-ui-and-template-content` evidence. Obtain them by normal native downloads and explicit card/definition matching. Conflicting titles or previews for the same package stop processing rather than guessing identity.

From the application root with dependencies installed:

```sh
bun build scripts/collect-jianying-covers.ts --target=node --outfile /tmp/qcut-collect-jianying-covers.mjs
node /tmp/qcut-collect-jianying-covers.mjs \
  --observations /absolute/path/new-observations.json \
  --batch-size 5 --recover \
  --application-resources /Applications/VideoFusion-macOS.app/Contents/Resources \
  --backup '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'
```

Use `--audit-only` to recheck the owned store without requiring the source directory. Existing packages are skipped unless `--retry-missing` is requested. Batch size is 1–25, each destination must retain 5 GB free, and an existing collector lock is never removed automatically. Confirm that the recorded process has stopped before handling a stale lock.

Use `--verification /absolute/path/receipts.json --evidence-root /absolute/path/screenshots` to import manual receipts. Imports merge with retained records, deduplicated by package and fingerprint, without replacing other templates' verification history. Subsequent runs load the owned receipts and evidence by default. Content changes invalidate matching verification counts.

## Validation and Remaining Work

22 related test files and 178 tests passed, including real CLI subprocess tests for batching, resume, duplicate observations, category merging, absent sources, locks, corrupt evidence and backup independence. CLI TypeScript checking with Node/Electron types, CLI bundling and Biome checks on six changed code files passed.

Native catalog enumeration, normal acquisition of additional definitions, and per-template render verification remain incomplete. No background collector or scheduled automation was left running.
