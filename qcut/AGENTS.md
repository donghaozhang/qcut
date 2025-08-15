# Repository Guidelines

## Project Structure & Modules
- Root: monorepo managed by `turbo` and `bun`.
- `apps/web`: Vite + React app (Next-style tooling), env files in `apps/web/.env*`, build outputs to `apps/web/dist`.
- `electron`: Main/Preload processes and FFmpeg resources; loads `apps/web/dist` in production.
- `packages/*`: Shared libraries (auth, db, utils) used by apps.
- `build/`: Icons and packaging assets; `docs/`: project docs; `.husky/`: git hooks.

## Build, Test, and Dev
- Install deps (root workspace): `bun install` (or `npm ci`).
- All apps dev: `npm run dev` → runs `turbo run dev` across workspaces.
- Web only: `cd apps/web && npm run dev` (served at `http://localhost:5174`).
- Electron (dev): `npm run electron:dev` (uses web dev server).
- Build web: `cd apps/web && npm run build` → outputs to `apps/web/dist`.
- Package desktop:
  - Quick dev build: `npm run build:exe`
  - Production installers: `npm run dist:win` or `npm run dist`

## Coding Style & Naming
- Language: TypeScript/JavaScript, React. Prefer 2‑space indent, single quotes.
- Lint/format: `npm run lint`, `npm run format` (Ultracite + Biome).
- Hooks: `.husky/pre-commit` formats the repo.
- Names: kebab‑case for files, PascalCase for components, camelCase for functions/vars.

## Testing Guidelines
- No formal test runner configured yet. For changes:
  - Web: verify flows in `apps/web` via Vite dev and built `dist`.
  - Electron: verify open/save dialogs, FFmpeg operations, and CSP/COEP behavior.
  - Prefer adding small, focused tests if introducing a runner (e.g., Vitest) per package.

## Commits & Pull Requests
- Commits: imperative, scoped messages (e.g., `feat(web): add timeline zoom`).
- PRs: clear description, linked issue(s), steps to verify, screenshots/GIFs for UI, and notes on migration/ENV changes.

## Security & Configuration
- Secrets: use `apps/web/.env.local`; never commit secrets.
- FFmpeg: large binaries live in `electron/resources/ffmpeg`; ensure paths remain consistent with `electron/main.js`.
- Packaging: Windows builds use NSIS; verify installer via `npm run dist:win`.
