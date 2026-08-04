---
name: jianying-draft-binary-reference
description: Trace which Jianying (剪映专业版) processes, app binaries, and dynamic libraries read, deserialize, encrypt, save, or render local draft and timeline files. Use for 剪映草稿二进制, draft_info.json encryption, crypto_key_store.dat, libvideoeditor, libVECreator, libvecryptor, locating the draft parser, or investigating Jianying draft interoperability without modifying projects.
---

# Jianying Draft Binary Reference

Use this skill to map draft-file ownership, not to bypass encryption. Read
[binary-map.md](references/binary-map.md) before making ownership claims.
Read [data-and-behavior-protocol.md](references/data-and-behavior-protocol.md)
before collecting plaintext draft diffs or running Jianying UI experiments.
The reference records the known files, binaries, evidence, commands, and
confidence boundaries for the locally observed Jianying build.

## Data-first inspection

Inventory existing plaintext evidence before opening Jianying:

```bash
SKILL_DIR="/absolute/path/to/jianying-draft-binary-reference"
bun "$SKILL_DIR/scripts/inspect-draft.ts" inventory
bun "$SKILL_DIR/scripts/inspect-draft.ts" diff \
  --before "/absolute/path/to/before.json" \
  --after "/absolute/path/to/after.json"
```

The CLI is read-only, omits paths by default, applies keyed HMAC-SHA-256 to
free-form strings in diff output, and rejects opaque payloads for semantic
comparison. Set `QCUT_JIANYING_EVIDENCE_KEY` only when separate CLI processes
must produce comparable private digests, and never store that key with the
evidence. Treat its output
as structural evidence, then corroborate interaction semantics with a
single-variable UI experiment.

## Workflow

1. Record the Jianying app version and canonical project root.
2. Check for `.locked` before inspecting a project. Treat a locked project as
   live and do not copy, rename, write, or repair anything inside it.
3. Inventory draft sidecars and classify each payload as JSON, opaque text, or
   binary. Do not infer a role from an extension alone.
4. Map the main process and `--lvve-service` process to their loaded libraries.
5. Search only candidate binaries for draft filenames, parser symbols,
   key-store types, and load/save telemetry.
6. Separate runtime observations, static evidence, and architectural inference
   in the report. Never upgrade an inference to a confirmed fact.
7. If exact runtime ownership matters, ask before using privileged tracing and
   test with a disposable project. Do not patch, inject into, or alter Jianying.

## Reporting Contract

Report each claim with:

- app version and inspected path;
- process or binary and proposed responsibility;
- exact supporting filename, symbol, string, loaded-library, or file-access event;
- evidence tier: `runtime-observed`, `static-strong`, `architecture-only`, or
  `unresolved`;
- alternative explanations and the next read-only check;
- whether the result is stable enough to inform QCut interoperability code.

## Boundaries

- Never commit or upload Jianying binaries, drafts, databases, cached packages,
  key stores, decrypted payloads, or proprietary assets.
- Never edit files below the Jianying project root or application bundle.
- Keep evidence in an ignored scratch directory outside the QCut repository.
- Prefer Jianying-created plaintext subdrafts and backups over decryption work.
- Reimplement observed behavior in original QCut code; do not copy proprietary
  implementation material.
- A library being loaded does not prove it handled a particular draft operation.
