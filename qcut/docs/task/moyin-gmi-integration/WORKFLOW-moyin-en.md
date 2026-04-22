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

Behind the scenes the Director runs a **6-step pipeline**:

1. **Initial parse** — extract characters, scenes, episodes as
   structured JSON (single LLM call)
2. **Title calibration** — refine the title + logline
3. **Synopsis generation** — 2-3 sentence synopsis
4. **Shot calibration** — per episode, generate shot breakdown with
   camera language (size, movement, characters)
5. **Character calibration** — enrich characters with visual identity
   anchors (bone structure, eye shape, clothing etc.) via the
   character-calibrator
6. **Scene calibration** — enrich scenes with art direction (lighting,
   color palette, spatial layout) via the scene-calibrator

The left panel shows progress of each step live. You see partial
results in the middle panel as soon as step 1 completes; later steps
just enrich what's already there.

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
