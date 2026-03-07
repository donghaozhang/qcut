# Generative Media Skills — Architecture Deep-Dive

> **Purpose**: Document the "rule-driven prompt compiler" architecture of `Generative-Media-Skills` so QCut contributors understand how creative intent becomes deterministic API calls — and can extend the system without breaking its guarantees.

---

## 1. System Overview

The Generative Media Skills toolkit is a **hybrid rule+LLM prompt compiler** that sits between a user's vague creative request ("cool city shot") and 100+ AI model endpoints (Veo3, Kling, Seedance, Flux, Suno, etc.).

```
User Intent ─► Library Skill (intent mapping) ─► Prompt Optimization Protocol ─► Core Script ─► schema_data.json ─► muapi.ai API
      │                  │                              │                            │                │
   "epic city"    SKILL.md lookup tables         Agent expands to             Shell script       Validates model,
                  map intent → director         technical director brief     sends HTTP request   endpoint, params
                  language (framing,                                         with polling
                  movement, lighting, lens)
```

### Why hybrid, not pure LLM or pure rules?

| Approach | Problem | Benefit |
|:---------|:--------|:--------|
| Pure LLM | Output variance, parameter drift (duration/aspect_ratio/camera motion misassigned), inconsistent results across runs | Flexible, handles novel creative intent |
| Pure Rules | Limited expression, breaks on complex intent, low creative ceiling, mechanical output | Stable, deterministic, auditable |
| **Hybrid (this system)** | — | Rules constrain the search space; LLM fills in the creative detail within those constraints |

The system achieves this by splitting responsibility:

- **Rules** own: model selection, endpoint resolution, parameter validation, intent-to-technique mapping tables, prompt structure templates
- **LLM** owns: expanding user intent into rich technical descriptions within the rule-defined template slots

---

## 2. Three-Stage Pipeline

### Stage 1: Intent → Director Language (Library SKILL.md)

Each library skill contains a **deterministic mapping table** that translates emotional/creative intent into concrete cinematographic or design parameters.

**Cinema Director example** (`library/motion/cinema-director/SKILL.md`):

| Creative Intent | Framing | Movement | Lighting |
|:----------------|:--------|:---------|:---------|
| Heroic Reveal | Low Angle / Wide | Crane Up / Orbit | Rim Lighting / High Contrast |
| Tense/Uneasy | Dutch Angle | Handheld Shake | Low Key / Harsh Shadows |
| Introspective | Close-Up | Slow Push In | Soft Rembrandt / Window Light |
| Majestic/Epic | Extreme Wide | Drone Flyover | Golden Hour / Volumetric |
| Melancholic | Profile / Medium | Slow Pull Out | Blue Hour / Desaturated |

**Seedance 2 Director Brief structure** (`library/motion/seedance-2/SKILL.md`):

| Component | Type | Example |
|:----------|:-----|:--------|
| Scene | Environment + Lighting | "Rain-soaked cyberpunk street, magenta neon reflections on wet asphalt." |
| Subject | Identity + Detail | "Woman in black trenchcoat, determined focus, cinematic skin textures." |
| Action | Fluid Interaction | "Walking forward through crowd, coat billowing in wind." |
| Camera | Movement + Lens | "Medium tracking shot, 35mm lens, slow dolly backward." |
| Style | Mood + Intent | "Cinematic epic, warm color grade, shallow DOF, rack focus." |

**Other library skills follow the same pattern:**

- **Logo Creator** → maps brand type to geometric primitives (Pictorial Mark, Abstract Mark, Lettermark, Emblem, Mascot)
- **UI Designer** → maps platform intent to Atomic Design tokens (Enterprise SaaS, Consumer App, E-commerce)
- **Nano-Banana** → maps to "Perfect Prompt Formula": Subject + Action + Context + Composition + Lighting + Style

### Stage 2: Prompt Optimization Protocol (Agent Instruction)

Every library SKILL.md includes a **Prompt Optimization Protocol** section — explicit instructions telling the AI agent how to expand vague user input into a technical directive.

The Cinema Director protocol requires the agent to apply four rules before calling the script:

1. **TECHNICAL INFUSION**: Transform "cool action" → `[Shot Type] + [Subject/Action] + [Environment] + [Lighting] + [Camera Movement] + [Lens Effect]`
2. **MOTION DYNAMICS**: Use cinematic verbs: Dolly In (intimacy), Crane Up (majestic), Orbit (heroic), Truck (parallel motion)
3. **LIGHTING RECIPES**: Apply specific illumination: Volumetric God Rays, Teal-and-Orange Grade, Cyberpunk Rim Lighting
4. **PHYSICS LOGIC**: Describe light relationships ("neon reflections shimmering on rain-slicked asphalt") to trigger model reasoning

The Seedance 2 protocol adds:

5. **Timecode Notation**: `[00:00-00:05s]` for multi-beat scenes
6. **Tag References**: `@image1`, `@video1` for multimodal referencing
7. **Token Ordering**: Composition tokens first, texture/micro-motion tokens last

This is the key hybrid point — the LLM does creative expansion, but the SKILL.md rules constrain _what_ it must expand and _how_.

### Stage 3: Core Scripts + Schema Validation

The expanded prompt is handed to a core shell script (`core/media/*.sh`) which:

1. **Reads `schema_data.json`** (18,700 lines) to validate the requested model exists
2. **Resolves the API endpoint** — model name → HTTP URL mapping
3. **Validates parameters** — checks if the model supports the requested `duration`, `aspect_ratio`, `resolution`, `audio`
4. **Sends the HTTP request** to muapi.ai with proper payload structure
5. **Handles async polling** — video generation is asynchronous; scripts poll `check-result.sh` until completion

**How generate-film.sh works internally:**

```bash
# 1. Parse intent via case statement (deterministic)
case $INTENT in
    "reveal")
        FRAMING="Extreme wide shot"
        MOVEMENT="Slow crane up and tilt down"
        LIGHTING="Golden hour, volumetric god rays"
        LENS="Deep focus, high clarity"
        ;;
    "epic")
        FRAMING="Low angle wide shot"
        MOVEMENT="Dolly in with circular orbit"
        LIGHTING="Dramatic rim lighting, high contrast"
        LENS="Anamorphic, 35mm film grain"
        ;;
esac

# 2. Assemble Director's Prompt (structured template)
DIRECTOR_PROMPT="[DIRECTOR_BRIEF]
SCENE: $SUBJECT
FRAMING: $FRAMING
CAMERA_MOTION: $MOVEMENT
LIGHTING_DESIGN: $LIGHTING
OPTICS: $LENS
[EXECUTE] High-fidelity cinematic footage..."

# 3. Delegate to core primitive
bash core/media/generate-video.sh \
  --prompt "$DIRECTOR_PROMPT" \
  --model "$MODEL" \
  --aspect-ratio "$ASPECT" \
  --duration "$DURATION"
```

---

## 3. Directory Structure

```
Generative-Media-Skills/
├── schema_data.json              # 18K-line model registry (endpoints, params, validation)
├── core/                         # Raw infrastructure primitives
│   ├── media/                    # Generation scripts
│   │   ├── SKILL.md              # Skill definition for core media
│   │   ├── generate-image.sh     # Text → image (default: flux-dev)
│   │   ├── generate-video.sh     # Text → video (default: minimax-pro)
│   │   ├── image-to-video.sh     # Image → video (default: kling-pro)
│   │   ├── create-music.sh       # Music/audio (Suno V5)
│   │   └── upload.sh             # File → CDN upload
│   ├── edit/                     # Editing/enhancement scripts
│   │   ├── SKILL.md
│   │   ├── edit-image.sh         # Prompt-based editing (Flux Kontext, GPT-4o, Midjourney)
│   │   ├── enhance-image.sh      # One-click ops (upscale, bg-remove, face-swap, colorize)
│   │   ├── lipsync.sh            # Video lip sync (Sync Labs, LatentSync, Creatify, Veed)
│   │   └── video-effects.sh      # Video effects (Wan AI, face-swap, dance, dress-change)
│   └── platform/                 # Setup and polling
│       ├── SKILL.md
│       ├── setup.sh              # Configure MUAPI_KEY
│       └── check-result.sh       # Poll async generation results
└── library/                      # Expert skills (intent translators)
    ├── motion/
    │   ├── cinema-director/
    │   │   ├── SKILL.md           # Intent mapping tables, prompt protocol
    │   │   └── scripts/
    │   │       └── generate-film.sh  # Wraps core/media/generate-video.sh
    │   └── seedance-2/
    │       ├── SKILL.md           # Director Brief structure, 3 modes (t2v/i2v/extend)
    │       └── scripts/
    │           └── generate-seedance.sh
    └── visual/
        ├── logo-creator/
        │   ├── SKILL.md           # Geometric primitive construction
        │   └── scripts/
        │       └── create-logo.sh
        ├── nano-banana/
        │   ├── SKILL.md           # Reasoning-driven image generation
        │   └── scripts/
        │       └── generate-nano-art.sh
        └── ui-design/
            ├── SKILL.md           # Atomic Design mockups
            └── scripts/
                └── generate-mockup.sh
```

---

## 4. schema_data.json — The Model Registry

The schema is a JSON array where each entry defines a model:

```json
{
  "name": "seedance-v2.0-t2v",
  "category": "Text to Video",
  "variant": "Seedance 2.0",
  "family": "seedance",
  "description": "...",
  "input_schema": {
    "schemas": {
      "input_data": {
        "type": "object",
        "properties": {
          "prompt": { "type": "string" },
          "aspect_ratio": { "enum": ["16:9", "9:16", "4:3", "3:4"] },
          "duration": { "enum": [5, 10, 15] },
          "quality": { "enum": ["basic", "high"] }
        }
      }
    }
  }
}
```

Core scripts parse this at runtime with `jq` to:
- Validate model existence
- Resolve API endpoint
- Check parameter legality (is `duration=15` valid for this model?)
- Determine which fields the model accepts (some don't support `audio`, `aspect_ratio`, etc.)

---

## 5. Data Flow Examples

### Example A: "Make me an epic dragon video"

```
User: "Make me an epic dragon video"
  │
  ▼ Agent reads cinema-director/SKILL.md
  │
  ▼ Intent Mapping: "epic" → Low Angle Wide + Dolly In + Orbit + Rim Lighting + Anamorphic
  │
  ▼ Prompt Optimization Protocol: Agent expands →
  │   "[DIRECTOR_BRIEF]
  │    SCENE: A cybernetic dragon soaring over a volcanic landscape
  │    FRAMING: Low angle wide shot
  │    CAMERA_MOTION: Dolly in with circular orbit
  │    LIGHTING_DESIGN: Dramatic rim lighting, high contrast
  │    OPTICS: Anamorphic, 35mm film grain
  │    [EXECUTE] High-fidelity cinematic footage..."
  │
  ▼ generate-film.sh assembles prompt, calls core/media/generate-video.sh
  │
  ▼ generate-video.sh reads schema_data.json, validates model "veo3"
  │   - Confirms veo3 supports duration=5, aspect_ratio=16:9
  │   - Resolves API endpoint
  │
  ▼ HTTP POST to muapi.ai → returns request_id
  │
  ▼ Polls check-result.sh until video URL is returned
```

### Example B: "Animate this photo with Seedance" (i2v mode)

```
User: provides hero.jpg + "make it cinematic"
  │
  ▼ Agent reads seedance-2/SKILL.md
  │
  ▼ Mode: i2v (image-to-video)
  │
  ▼ Agent constructs Director Brief:
  │   [SCENE] Dramatic environment matching the source image
  │   [SUBJECT] Character from reference @image1
  │   [ACTION] Hero strides forward, coat billowing in slow motion
  │   [CAMERA] Medium tracking shot, 35mm, slow dolly backward
  │   [STYLE] Cinematic epic, warm grade, shallow DOF
  │
  ▼ generate-seedance.sh:
  │   1. Detects --file hero.jpg → runs upload.sh to get CDN URL
  │   2. Calls core/media/image-to-video.sh with model=seedance-v2.0-i2v
  │   3. Schema validates: i2v supports up to 9 images, duration=[5,10,15]
  │
  ▼ HTTP POST → async poll → video URL
```

---

## 6. Guardrails & Constraints

Each library skill defines explicit **negative constraints** to prevent common failure modes:

| Skill | Constraint | Why |
|:------|:-----------|:----|
| Cinema Director | No contradictory movements (Dolly In + Dolly Out) | Model produces jittery, incoherent camera motion |
| Cinema Director | No complex subject transformations in single shot | Models can't handle "man turns into bird" reliably |
| Seedance 2 | No keyword soup ("8k, masterpiece, trending") | Instructional model; keyword soup degrades quality |
| Seedance 2 | Describe one fluid motion, not sequences | Multi-action prompts cause temporal inconsistency |
| Logo Creator | Flat design only, no gradients/3D | Vector-style logos don't survive gradient artifacts |
| UI Designer | Pure UI mockups only (no hands, phones, desks) | Device realism constraint for clean mockups |
| All | Token ordering matters (composition first, texture last) | Model attention prioritizes early tokens |

---

## 7. Model Selection Guide

| Use Case | Recommended Model | Strength |
|:---------|:-----------------|:---------|
| Slow aesthetic shots | Veo3 | High visual quality, good for beauty/reveal |
| Complex character motion | Kling 3.0 Pro | Physics simulation, human movement |
| Fast action, cinematic | Luma | High-energy sequences |
| Director-level with audio | Seedance 2.0 | Native audio-visual sync, multi-image i2v |
| Image generation (default) | Flux Dev | Fast, high quality |
| Image editing | Flux Kontext Pro | Best prompt-based editing |
| Music generation | Suno V5 | Create, remix, extend, text/video-to-audio |

---

## 8. Integration Points with QCut

### Current touchpoints

| QCut Component | Generative Media Skills Usage |
|:---------------|:------------------------------|
| `apps/web/src/components/editor/media-panel/views/camera-selector/` | Camera/lens/aperture selector UI — builds prompts similar to cinema-director intent mapping |
| `apps/web/src/services/ai/fal-ai-service.ts` | Image generation service (currently uses fal.ai, could route through muapi) |
| `electron/native-pipeline/` | Native CLI pipeline — could invoke shell scripts directly |
| `apps/web/src/stores/editor/camera-selector-store.ts` | Camera body, lens, focal length, aperture data — mirrors cinema-director's optical vocabulary |
| PTY Terminal (`pty-terminal-view.tsx`) | Shell execution environment — can run scripts directly |

### Potential integration paths

1. **PTY Terminal direct execution**: Users can run library scripts directly in the embedded terminal
2. **Native Pipeline CLI wrapper**: `electron/native-pipeline/cli/cli.ts` could wrap the shell scripts with TypeScript type safety
3. **Camera Selector enhancement**: The existing camera selector could use cinema-director's intent mapping tables to generate richer prompts
4. **Schema-driven model picker**: `schema_data.json` could power a model selection UI in the media panel

---

## 9. Key Files Reference

| File | Purpose |
|:-----|:--------|
| `schema_data.json` | Model registry — 100+ models with endpoints, parameters, validation rules |
| `core/media/SKILL.md` | Core generation primitives documentation |
| `core/edit/SKILL.md` | Core editing primitives documentation |
| `core/platform/setup.sh` | API key configuration |
| `core/platform/check-result.sh` | Async result polling |
| `library/motion/cinema-director/SKILL.md` | Intent mapping tables + prompt optimization protocol |
| `library/motion/cinema-director/scripts/generate-film.sh` | Intent → director prompt → core/media/generate-video.sh |
| `library/motion/seedance-2/SKILL.md` | Director Brief structure, 3 modes, prompt templates |
| `library/motion/seedance-2/scripts/generate-seedance.sh` | Multi-mode video generation (t2v/i2v/extend) |
| `library/visual/logo-creator/SKILL.md` | Geometric primitive branding |
| `library/visual/nano-banana/SKILL.md` | Reasoning-driven image generation |
| `library/visual/ui-design/SKILL.md` | Atomic Design mockup generation |

---

## 10. Summary

The Generative Media Skills architecture is a **rule-driven prompt compiler** that achieves both stability and creative flexibility:

- **Rules** (SKILL.md tables, schema_data.json, shell case statements) guarantee deterministic parameter validation, correct API routing, and structured prompt templates
- **LLM** (Prompt Optimization Protocol) handles the creative expansion within those constraints
- **Shell scripts** serve as the execution boundary — they receive structured input and produce structured output (JSON, file URLs)

This separation means:
- Adding a new model = adding an entry to `schema_data.json`
- Adding a new creative style = adding a case to the shell script + a row to the SKILL.md mapping table
- Adding a new skill = creating a new `library/` directory with SKILL.md + wrapper script that delegates to core primitives
