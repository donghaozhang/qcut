# Moyin (Director Panel) Workflow

> Interactive screenplay → storyboard → videos workflow inside the QCut
> editor. For the headless CLI pipeline, see `WORKFLOW-novel2movie-en.md`.
> 中文版：[WORKFLOW-moyin-zh.md](./WORKFLOW-moyin-zh.md)

## 1. Enter the Director panel

Inside the QCut editor, open the media panel and switch to the
**Director** tab. The panel has three columns:

- **Left**: Script Editor (Import / Create / Novel tabs) + Configuration
- **Middle**: Structure — characters, scenes, episodes, shots
- **Right**: Property inspector for the selected item

## 2. Provide the script

Pick one of the three input tabs:

| Tab | What you give it | What the app does |
| --- | --- | --- |
| **Import** | Paste an existing screenplay | Parses it as-is |
| **Create** | A short idea + genre + duration | Generates a screenplay first, then parses |
| **Novel** | Prose / novel text | Converts to screenplay form, then parses |

## 3. Configure the Parse Model

In the CONFIGURATION section below the script textarea, the
**Parse Model** dropdown defaults to **GMI · GLM-5.1** (the QCut
license-server proxy currently has the GMI key but not OpenRouter; GMI is
the reliably working path).

Other options:

- GMI · Gemini 3.1 Flash Lite (cheaper, faster)
- GMI · Gemini 3.1 Pro (smarter, slower)
- Gemini Flash / Pro (routes via OpenRouter — currently 503 until the
  Worker env is updated)
- MiniMax / Kimi / Claude (same caveat)

The **Image Provider** and **Video Provider** selectors below control
the storyboard generation backend — FAL (Flux Pro + WAN v2.1) or GMI
(Seedream + Veo 3.1 Lite).

## 4. Click Parse Script

Behind the scenes the Director runs a **6-step pipeline**. Every step
routes through `callLLM` using the selected Parse Model; the left-panel
progress bar updates live, and the middle panel starts showing data as
soon as step 1 completes — later steps only enrich what's already there.

### 1. Initial parse

**Code**: `electron/moyin-handler.ts` → `PARSE_SYSTEM_PROMPT`
**Params**: `temperature: 0.7`, `maxTokens: 16384` (long screenplays
produce big JSON; the former 4K cap got truncated, which then failed
`JSON.parse` at position 1).

The LLM receives the full screenplay and returns structured JSON:

- `title`, `logline`, `genre`, `language`, `targetDuration`
- `characters[]` — each with `id` (e.g. `char_1`), `name`, `gender`,
  `age`, `role` (lead / supporting / antagonist), `appearance`
- `scenes[]` — each with `id` (e.g. `scene_1`), `location`, `time`,
  `atmosphere`, short description
- `episodes[]` — each with `id` (`ep_1`, `ep_2`, …) and the list of
  scene IDs it contains

The main process does defensive cleanup: strips markdown fences, finds
the outermost JSON object with a string-aware brace walker, removes
trailing commas. On `JSON.parse` failure it dumps the first 400
characters of the raw response to electron-log so regressions are
diagnosable from production logs.

### 2. Title calibration

**Code**: `apps/web/src/stores/moyin/moyin-calibration.ts::calibrateTitleLLM`
**Params**: `temperature: 0.5`, `maxTokens: 256`.

Feeds the LLM the current title, logline, genre, and the first 500
chars of the script, asking it to return `{title, logline}`. The system
prompt explicitly says *"keep the original if it's already strong"* —
it doesn't change titles every run. The refined logline is a single
compelling sentence.

### 3. Synopsis generation

**Code**: `generateSynopsisLLM`
**Params**: `temperature: 0.7` (more creative), `maxTokens: 512`.

Input: title, genre, logline, names of the first 5 main characters,
scene count, and the first 800 chars of the script. Output is a 2-3
sentence plain-text synopsis (no JSON wrapping), written straight to
`scriptData.synopsis`.

### 4. Shot calibration

**Code**: `apps/web/src/stores/moyin/moyin-generation.ts::generateShotsForEpisodeAction`
**Params**: `temperature: 0.5`, `maxTokens: 8192`. **Called once per
episode** — a 3-episode script triggers 3 LLM calls.

Key detail: **the shot budget is derived from `targetDuration`**, with
each AI video clip averaging ~10s. A 5-minute screenplay → ~30 shots;
the system prompt explicitly tells the LLM *"total shot count must be
approximately N shots"*.

Each shot includes:

- `id` (`shot_001`), `sceneRefId`, `index`
- `actionSummary` — what happens in this shot
- `shotSize` — `MS` / `CU` / `WS` etc. (medium / close-up / wide)
- `cameraMovement` — `pan` / `tilt` / `static` etc.
- `characterIds[]`, `characterVariations` (per-shot character overrides)
- Initial `imageStatus: idle` / `videoStatus: idle`, progress 0

### 5. Character calibration

**Code**: `enhanceCharactersLLM`, **tries two paths**.

**Preferred path — character-calibrator**:
`apps/web/src/lib/moyin/script/character-calibrator.ts` takes the
per-episode scripts and the project background (both derived by
`getCalibrationContext` from the raw script + scriptData) for richer
context-aware calibration. On failure it logs a warning and falls back
to the legacy path below.

**Legacy path** (**Params**: `temperature: 0.5`, `maxTokens: 4096`):
Input is the project title, genre, and a summary of every character's
`{id, name, role, gender, age, appearance}`. The LLM fills in:

- `visualPromptEn` — a detailed English prompt for image generation
  (face, hair, build, clothing, distinguishing features)
- `appearance` — a concise one-line summary
- `identityAnchors` (the critical piece for cross-shot consistency):
  - `boneStructure` (e.g. "oval face, high cheekbones")
  - `eyeShape` (e.g. "almond-shaped, deep-set")
  - `noseShape`, `lipShape`
  - `hairStyle` (e.g. "shoulder-length wavy black hair")
  - `skinTexture` (e.g. "smooth, sun-kissed")
  - `uniqueMarks[]` (e.g. "scar on left cheek", "beauty mark")

These identity anchors get spliced into storyboard prompts downstream,
which is what prevents the same character from looking like different
people across shots.

### 6. Scene calibration

**Code**: `enhanceScenesLLM`, mirrors the character-calibration
structure exactly.

**Preferred path — scene-calibrator**:
`apps/web/src/lib/moyin/script/scene-calibrator.ts`, context-aware with
project background + per-episode scripts.

**Legacy path** (**Params**: `temperature: 0.5`, `maxTokens: 4096`):
The LLM fills in a full art-direction record per scene:

- `visualPrompt` / `visualPromptEn` — Chinese + English visual prompts
- `lightingDesign` (e.g. "cold moonlight + warm interior tungsten")
- `architectureStyle` (e.g. "Ming-dynasty garden", "Bauhaus")
- `colorPalette` (comma-separated, e.g. "warm amber, deep blue, soft white")
- `keyProps` (parsed into a string array)
- `spatialLayout` (spatial arrangement description)
- `eraDetails` (historical / temporal details)

This data feeds image generation to keep different shots within the
same scene visually consistent in color and atmosphere.

## 5. Review + edit

- **Characters tab**: click a character to edit name, appearance, role,
  visual prompt, identity anchors
- **Scenes tab**: edit location, time, atmosphere, visual prompt
- **Shots tab**: per-shot camera, characters, image/video prompts

Everything autosaves to `localStorage` on a 1-second debounce, scoped
to the current project ID. Leaving the panel and coming back restores
state exactly.

## 6. Generate images + videos

Select one or more shots, then click **Generate Image** (or Generate
Video for already-imaged shots). The selected `Image Provider` /
`Video Provider` decides the backend.

Persistence: generated URLs are saved per-shot; reloading the project
keeps the imagery.

## 7. Export / send to timeline

When ready, export the storyboard data as JSON (for archival) or push
shots + media to the QCut timeline for final editing. The calibrated
script data feeds into the main editor's track system.

## Alternative: fully automated via CLI

Every step above can be driven from the CLI (useful for QA /
regression / batch):

```bash
bun run pipeline editor:moyin:set-script --text '<script>' --json
bun run pipeline editor:moyin:parse --model gmi-glm-5.1 --json
bun run pipeline editor:moyin:status --json
bun run pipeline editor:moyin:export --json
```

Requires Electron to be running. See `E2E-TEST.md` §C1 for the full
recipe.
