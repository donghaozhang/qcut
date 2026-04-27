# win-hermes build results

## Summary
- Branch: `win-Hermes`
- Working directory: `qcut/`
- Build command requested: `bun run build`
- Bun used: `C:\Users\yanie\.bun\bin\bun.exe`
- Started (UTC): `2026-04-27T01:55:34Z`
- Finished (UTC): `2026-04-27T01:56:55Z`
- Result: ❌ failed
- Exit status: `2`

## Failure point
The web build completed, but the Electron TypeScript build failed afterward.

```text
video-search/gemini-embedding-provider.ts(20,40): error TS2307: Cannot find module '@google/genai' or its corresponding type declarations.
```

## Notable observations
- `bun` was not available on the WSL PATH, so the build was run with Windows Bun directly.
- Initial attempt with plain `bun run build` failed immediately with:

```text
/usr/bin/bash: line 3: bun: command not found
```

- The subsequent run with Windows Bun successfully executed the setup and web build steps.
- Vite emitted several warnings during the web build, including:
  - route test files under `apps/web/src/routes/...` not exporting `Route`
  - module type warnings for `apps/web/postcss.config.ts`
  - multiple dynamic-import/static-import chunking warnings
  - oversized chunk warnings after minification

## Successful stages before failure
- `bun run setup-ffmpeg`
- `bun run stage-ffmpeg-binaries`
- `bun run sync-skills`
- `turbo run build` for the web app
- Vite production build completed with:

```text
✓ built in 40.50s
```

## Full log location
- `/tmp/win-hermes-build.log`

## Suggested next fix
Install or expose the missing dependency used by Electron build:
- `@google/genai`

Then rerun:

```bash
/mnt/c/Users/yanie/.bun/bin/bun.exe run build
```
