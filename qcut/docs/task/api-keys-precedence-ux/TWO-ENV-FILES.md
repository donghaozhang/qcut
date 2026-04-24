# Why does QCut write API keys to two different env files?

Companion to [IMPLEMENTATION.md](./IMPLEMENTATION.md) and [PLAN.md](./PLAN.md). Explains the two file-based credential stores the precedence chain points at — `~/.config/video-ai-studio/credentials.env` and `~/.qcut/.env` — why they're separate, and who reads each one.

- **TL;DR:** they belong to two independent command-line tools (`aicp` and the QCut native pipeline CLI). Each tool stands on its own with its own hard-coded credential path. When the user clicks **Save API Keys** in the GUI, the Electron save handler *syncs* keys to both files so whichever CLI the user later invokes finds the key — it is not that QCut stores the same key twice for no reason.

---

## 1. The two tools behind the two files

| Tier | File | Owner | Binary | Kind of tool |
|---|---|---|---|---|
| 3 (aicp-cli) | `~/.config/video-ai-studio/credentials.env` *(macOS / Linux)* · `%APPDATA%\video-ai-studio\credentials.env` *(Windows)* | **AICP** (AI Content Pipeline) | `electron/resources/bin/aicp/<platform>/aicp` (bundled Python) | Upstream project — predates QCut, ships alongside the Electron app |
| 4 (qcut-env) | `~/.qcut/.env` | **QCut native pipeline CLI** | `electron/native-pipeline/cli/cli.ts` (or the compiled `qcut` binary) | QCut-owned TypeScript CLI, run as `bun run pipeline` or the `qcut` binary |

Both files are plain dotenv (`KEY=VALUE`, mode `0600`) — the only difference is where each tool goes looking.

### 1.1 AICP — why it has its own credential file

- AICP is a separate project we **embed**, not build. It's the `aicp` Python binary shipped under `electron/resources/bin/aicp/`. Users (and skills, e.g. `qcut-toolkit/ai-content-pipeline`) can invoke it directly: `aicp set-key FAL_KEY`, `aicp gen image ...`.
- Its credential path (`~/.config/video-ai-studio/...`) is **hard-coded in the AICP binary**. QCut cannot override it without forking AICP.
- AICP only understands a small key set — the keys mapped in `AICP_REVERSE_MAP` in `electron/api-key-handler.ts`: **FAL / Gemini / OpenRouter**. Anthropic, ElevenLabs, GMI, etc. are unknown to AICP.
- Documented reference: `resources/default-skills/ai-content-pipeline/Skill.md` ("stored at `~/.config/video-ai-studio/credentials.env`").

### 1.2 QCut native pipeline — why it has its own credential file

- The QCut native pipeline CLI lives at `electron/native-pipeline/cli/cli.ts` and shares code with the Electron main process. It's used for everything AICP doesn't cover: Moyin script analysis, transcription, YouTube upload, `qcut-shot` scene planning, and more.
- Its key manager is `electron/native-pipeline/infra/key-manager.ts:41-44`:
  ```ts
  function getEnvFilePath(configDirOverride?: string): string {
      if (configDirOverride) return path.join(configDirOverride, ".env");
      return path.join(os.homedir(), ".qcut", ".env");
  }
  ```
- Supports **15** keys (`KEY_NAMES` in `key-manager.ts:14-30`): FAL, Freesound, Gemini, Google AI, OpenRouter, Anthropic, ElevenLabs, OpenAI, Runway, HeyGen, D-ID, Synthesia, ARK, GMI, and `QCUT_AUTH_TOKEN`.
- Documented in `resources/default-skills/native-cli/SKILL.md:256` ("Keys stored in `~/.qcut/.env`").

### 1.3 Why they weren't merged

Three structural reasons:

1. **Different vocabularies.** AICP knows 3 keys; the native pipeline knows 15. Collapsing to one file means one of the two CLIs starts ignoring fields it never asked for (harmless but noisy) or the CLI that owns the file becomes responsible for every future provider AICP adds.
2. **Standalone operation.** Both CLIs are intentionally runnable without QCut's GUI open. A fresh user can run `aicp set-key` or `qcut set-key` from a terminal and have their keys persisted — each tool reads from the location *its own* users expect. Unifying would break one of those flows on upgrade.
3. **AICP is external.** QCut vendors the AICP binary but does not maintain AICP. The AICP path is a contract we cannot unilaterally change.

The safe choice was to leave each CLI with its own credential file and have QCut's GUI save handler write to both, so the user only has to type the key once.

---

## 2. How QCut's Electron save handler bridges them

Entry point: `electron/api-key-handler.ts`, `api-keys:set` IPC handler.

```text
user types keys + clicks Save
              │
              ▼
      ipcMain.handle("api-keys:set", …)
              │
   ┌──────────┼─────────────────────────────────┐
   ▼          ▼                                 ▼
tier 2:     tier 3 sync:                       tier 4 sync:
api-keys.json  syncToAicpCredentials(keys)      syncToQcutEnv(keys)
(safeStorage)  → writes FAL/GEMINI/OPENROUTER   → writes all 8 editable
               to ~/.config/video-ai-studio/      keys to ~/.qcut/.env
               credentials.env                    via key-manager setKey()
```

Why three destinations on one click:

- **Tier 2** (`api-keys.json` in userData, encrypted via Electron `safeStorage`) is the authoritative source for the GUI itself.
- **Tier 3** sync exists so a user who opens a terminal and runs the bundled `aicp` binary immediately finds FAL/Gemini/OpenRouter. Without this sync, "saved in the GUI" would mean nothing to AICP.
- **Tier 4** sync exists so a user who runs `bun run pipeline …` or the compiled `qcut` binary finds any of the 8 keys. Without this sync, the native pipeline would need its own setup step.

The sync code never **clears** a file unless the user explicitly emptied that field in the GUI. Keys added directly via `aicp set-key` or `qcut set-key` (outside the GUI) are preserved across restarts — the GUI only manages the fields it owns.

See:

- `syncToAicpCredentials(…)` — `electron/api-key-handler.ts:211-251` (reads existing credentials, preserves non-QCut-managed entries, rewrites QCut-managed ones).
- `syncToQcutEnv(…)` — `electron/api-key-handler.ts:259-274` (delegates to `key-manager.setKey(envName, value)` per field; deletes on explicit empty).

---

## 3. How the precedence chain sees these two files

The four-tier resolution chain (`electron/api-key-status.ts`):

| # | Source | `KeySource` literal | Where |
|---|---|---|---|
| 1 | Shell environment | `environment` | `process.env.*` |
| 2 | Electron keystore | `electron` | `userData/api-keys.json` (encrypted) |
| 3 | **AICP CLI credentials** | `aicp-cli` | `~/.config/video-ai-studio/credentials.env` |
| 4 | **QCut native CLI env** | `qcut-env` | `~/.qcut/.env` |

The two files sit at tiers **3 and 4**. Tier 3 outranks tier 4 because AICP's credential store historically came first and is the one external tools were already writing into when the 4-tier chain was introduced (see `docs/completed/ai-pipeline/robust-fal-key-cli-implementation.md`, 2026-02-15 — the earlier 3-tier chain preceded the `qcut-env` addition). Keeping that order means no behaviour change for users who already had AICP credentials set.

For a field set in **both** tier 3 and tier 4 (easy to reproduce after any GUI save), the status resolver reports:

```
source: aicp-cli
shadowedBy: [qcut-env]
```

which is harmless — the value in both files is the same because QCut's save handler wrote them together.

---

## 4. User-facing implications

- **Saving in the GUI is enough for every QCut surface.** Electron + AICP + native CLI all see the key because of the triple-write.
- **The "Fallback value" chip and shadow warning only fire when tier 2 is set** but the active tier is higher (`environment`). Having a value in tier 3 and tier 4 alongside a tier-2 value does not trigger the warning — those lower tiers are inactive by design (§ PLAN.md §6 Q1).
- **Setting a key only via `aicp set-key` leaves tier 4 empty.** The native pipeline will then fall back to tier 3, which is fine but does mean the `qcut-env` row in the status probe shows no value. Symmetric for `qcut set-key`.
- **Clearing a field in the GUI deletes from tier 4** (native env) via `removeFromQcutEnv`, but the tier 3 sync only rewrites QCut-managed entries — it does not delete a value the user placed there manually for a *different* key. That asymmetry is intentional and documented in the sync code; see `api-key-handler.ts:259-274`.

---

## 5. Quick how-do-I answers

### "Where is key X actually stored?"

Run the smoke script from `scripts/api-keys-precedence-smoke.ts --probe`. It prints, per field, which of the four tiers currently holds a value — including which of the two file-based tiers.

### "I only want to populate one file — which one?"

Depends on which CLI you run:

- Running the bundled **`aicp`** binary from a skill or terminal → you need tier 3 (`~/.config/video-ai-studio/credentials.env`). The QCut GUI save handler writes this automatically; `aicp set-key FAL_KEY` writes it manually.
- Running **QCut's native pipeline** (`bun run pipeline`, the `qcut` binary, or any script under `electron/native-pipeline/`) → you need tier 4 (`~/.qcut/.env`). The GUI save handler writes this; `qcut set-key FAL_KEY=…` (and `bun run pipeline keys set …`) writes it manually.
- Running **the Electron app UI only** → you only need tier 2 (encrypted in userData). But the GUI save handler still mirrors into both file tiers so future terminal invocations just work.

### "Can we collapse the two files into one?"

Not cleanly, for the three reasons in §1.3. A future refactor could switch AICP to read from `~/.qcut/.env` if we own enough of AICP to change its credential path, but today that's out of scope. The current design treats the duplication as a deliberate compatibility surface, not a bug.

---

## 6. See also

- `electron/api-key-handler.ts` — save-time sync to both files (`syncToAicpCredentials`, `syncToQcutEnv`).
- `electron/api-key-status.ts` — precedence chain definition.
- `electron/native-pipeline/infra/key-manager.ts` — `~/.qcut/.env` reader/writer.
- `resources/default-skills/ai-content-pipeline/Skill.md` — AICP usage, credential path.
- `resources/default-skills/native-cli/SKILL.md` — native pipeline CLI, key storage.
- `docs/completed/ai-pipeline/robust-fal-key-cli-implementation.md` — original 3-tier plan that later grew into today's 4-tier chain.
