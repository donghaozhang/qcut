# Implement Kling Create Element & Element-Driven Video Generation

> **Priority:** P1 | **Estimated Effort:** ~45 min (5 subtasks)
> **Depends on:** Existing GMI async submit+poll infrastructure

## Overview

Add support for `kling-create-element` to create reusable character/object elements, then reference them in `kling-v3-omni` video generation using `<<<element_N>>>` prompt syntax. This enables consistent character appearance across multiple video shots.

### What We Have

- `gmi_kling_v3_omni_t2v` and `gmi_kling_v3_omni_i2v` registered with `element_driven` feature flag
- `element_list` listed as optional parameter in i2v model registry
- GMI async submit+poll (`pollGmiQueue`) working for all GMI models
- Portrait system generates character images that can serve as element input

### What's Missing

1. No `kling-create-element` model/command — can't create elements
2. No local element storage to persist element IDs across runs
3. No way to pass `element_list` through CLI → payload → GMI API
4. No integration with ViMax portrait system for auto-element creation

---

## Subtask 1: Element Storage (~5 min)

Persist created elements locally so they can be reused across CLI sessions and video generations.

**Files:**
- `electron/native-pipeline/infra/element-store.ts` (NEW)

**Design:**

Store elements as JSON in `~/.qcut/elements.json` with file mode `0o600` (same as key-manager).

```typescript
interface StoredElement {
  elementId: string;
  name: string;
  description: string;
  referenceType: "image_refer" | "video_refer";
  createdAt: string;          // ISO timestamp
  sourceImages?: string[];    // local paths used to create
  sourceVideo?: string;       // local path used to create
  tags?: string[];
}

interface ElementStore {
  elements: Record<string, StoredElement>;  // keyed by elementId
}

// Public API
export function saveElement(element: StoredElement): void;
export function getElement(elementId: string): StoredElement | undefined;
export function listElements(): StoredElement[];
export function deleteElement(elementId: string): boolean;
export function findElementByName(name: string): StoredElement | undefined;
```

**Storage path:** `~/.qcut/elements.json` (follows `key-manager.ts` pattern at line 41–44)

**Tests:**
- `electron/__tests__/element-store.test.ts` (NEW) — CRUD operations, file persistence, concurrent access

---

## Subtask 2: Register `kling-create-element` Model (~5 min)

Register the create-element model in the registry so the pipeline executor can dispatch to it.

**Files:**
- `electron/native-pipeline/registry-data/text-to-video.ts` — Add new model registration (after line 518)

**Changes:**

```typescript
ModelRegistry.register({
  key: "gmi_kling_create_element",
  name: "Kling Create Element (GMI)",
  provider: "Kling (via GMI)",
  endpoint: "kling-create-element",
  categories: ["element_creation"],
  description: "Create reusable character/object elements for consistent video generation",
  pricing: { per_element: 0.10 },  // estimated, confirm with GMI
  defaults: {},
  features: ["image_refer", "video_refer"],
  costEstimate: 0.10,
  processingTime: 60,
  providerBackend: "gmi",
});
```

Also add `"element_creation"` to category types if needed:
- `electron/native-pipeline/registry-data/categories.ts` (if exists) or inline in registry types

**Tests:**
- `electron/__tests__/cli-commands-phase4.test.ts` — Add test for `gmi_kling_create_element` registration

---

## Subtask 3: CLI Command & Handler (~15 min)

Add `create-element` and `list-elements` CLI commands.

**Files:**
- `electron/native-pipeline/cli/command-registry.ts` — Add command definitions (after line 800)
- `electron/native-pipeline/cli/cli-handlers-media.ts` — Add handler functions
- `electron/native-pipeline/cli/cli-runner/runner.ts` — Add dispatch cases (after line 323)
- `electron/native-pipeline/cli/cli-runner/types.ts` — Add new options (after line 40)
- `electron/native-pipeline/cli/cli.ts` — Add CLI arg parsing (after line 102)
- `electron/native-pipeline/cli/cli-help.ts` — Add help text (after line 36)
- `electron/native-pipeline/cli/cli-output-formatters.ts` — Add output formatting (after line 108)

### Command Definitions

```typescript
// command-registry.ts
"create-element": {
  name: "create-element",
  description: "Create a reusable character/object element for Kling V3 Omni",
  category: "generation",
  flags: [
    f("--name", "string", "Element name (max 20 chars)", { required: true }),
    f("--description", "string", "Element description (max 100 chars)", { required: true }),
    f("--frontal-image", "string", "Frontal reference image path/URL", { required: true }),
    f("--refer-images", "string[]", "Additional reference images (1-3)"),
    f("--refer-video", "string", "Reference video path/URL (alternative to images)"),
    f("--tags", "string[]", "Tags: character, animal, item, costume, scene, effect"),
  ],
  examples: [
    'qcut-pipeline create-element --name "Detective" --description "Female detective in trench coat" --frontal-image front.jpg --refer-images side.jpg back.jpg',
  ],
},
"list-elements": {
  name: "list-elements",
  description: "List stored Kling elements",
  category: "generation",
  flags: [],
  examples: ["qcut-pipeline list-elements"],
},
"delete-element": {
  name: "delete-element",
  description: "Delete a stored element by ID",
  category: "generation",
  flags: [
    f("--element-id", "string", "Element ID to delete", { required: true }),
  ],
  examples: ["qcut-pipeline delete-element --element-id abc123"],
},
```

### Handler

```typescript
// cli-handlers-media.ts
export async function handleCreateElement(
  options: CLIRunOptions,
  onProgress: ProgressFn,
  executor: PipelineExecutor,
  signal: AbortSignal
): Promise<CLIResult> {
  // 1. Validate inputs (name ≤ 20 chars, description ≤ 100 chars)
  // 2. Resolve image/video URLs (upload local files if needed)
  // 3. Build payload for kling-create-element
  // 4. Submit via callModelApi (GMI async path)
  // 5. Poll until success
  // 6. Extract element_id from outcome
  // 7. Save to element store
  // 8. Return { success: true, data: { elementId, name } }
}
```

### CLIRunOptions additions

```typescript
// types.ts — add after line 40
elementId?: string;
elementName?: string;
elementDescription?: string;
frontalImage?: string;
referImages?: string[];
referVideo?: string;
elementTags?: string[];
```

**Tests:**
- `electron/__tests__/cli-create-element.test.ts` (NEW) — Test command parsing, handler validation, mock API calls

---

## Subtask 4: Wire `element_list` into Video Generation (~10 min)

Pass element references through to `kling-v3-omni` payloads.

**Files:**
- `electron/native-pipeline/cli/cli-runner/types.ts` — Already has `elementId` from subtask 3
- `electron/native-pipeline/cli/command-registry.ts` — Add `--element-ids` flag to `create-video` (line 230)
- `electron/native-pipeline/execution/step-executors.ts` — Wire element_list into payload (after line 250)
- `electron/native-pipeline/cli/cli-handlers-media.ts` — Parse element IDs in generate handler

### Command Changes

Add to `create-video` flags:

```typescript
f("--element-ids", "string[]", "Element IDs for Kling V3 Omni (comma-separated)"),
```

### Step Executor Changes

```typescript
// step-executors.ts — in executeTextToVideo, after prompt setup
if (payload.element_ids && provider === "gmi") {
  const elementIds = payload.element_ids as string[];
  payload.element_list = elementIds.map(id => ({ element_id: id }));
  delete payload.element_ids;
}
```

### Prompt Syntax

Users include `<<<element_N>>>` in their prompt text. N corresponds to position in `element_list`. The prompt is passed through as-is — Kling V3 Omni handles the substitution server-side.

```bash
# CLI usage
bun run pipeline create-video \
  -t "<<<element_1>>> walking through a park" \
  -m gmi_kling_v3_omni_t2v \
  --element-ids abc123
```

**Tests:**
- `electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts` — Test element_list payload construction
- `electron/__tests__/cli-commands-phase4.test.ts` — Test element-ids flag parsing

---

## Subtask 5: ViMax Portrait → Element Integration (~10 min)

Auto-create Kling elements from ViMax character portraits for consistent characters across video shots.

**Files:**
- `electron/native-pipeline/vimax/agents/character-portraits.ts` — Add element creation after portrait generation (after line 214)
- `electron/native-pipeline/vimax/types/character.ts` — Add `element_id` field to portrait types

### Design

After portrait generation, optionally create a Kling element from the generated portraits:

```typescript
// character-portraits.ts — in process() method, after all views generated
if (this.config.create_elements && portrait.front_view) {
  const element = await this._createKlingElement(character, portrait);
  portrait.element_id = element.elementId;
}
```

The `_createKlingElement` method:
1. Uses `front_view` as `frontal_image`
2. Uses `side_view`, `three_quarter_view` as `refer_images`
3. Submits to `kling-create-element` via `callModelApi`
4. Saves to element store
5. Returns stored element

### ViMax Pipeline Integration

The storyboard generator can then reference elements:

```typescript
// In storyboard prompt generation:
// Replace character name with <<<element_N>>> when element_id is available
if (character.element_id) {
  prompt = prompt.replace(character.name, `<<<element_${elementIndex}>>>`);
  elementList.push({ element_id: character.element_id });
}
```

### Config Addition

```typescript
// PortraitsGeneratorConfig
interface PortraitsGeneratorConfig {
  // ... existing
  create_elements?: boolean;    // default: false
  element_model?: string;       // default: "gmi_kling_create_element"
}
```

### CLI Flag

Add `--create-elements` to `vimax:novel2movie` and `vimax:idea2video`:

```bash
bun run pipeline vimax:novel2movie \
  --novel story.txt \
  --create-elements \
  --image-model gmi_gemini_31_flash_image \
  --llm-model gpt-5.4
```

**Tests:**
- `electron/__tests__/vimax-portraits-elements.test.ts` (NEW) — Test element creation from portraits, element ID persistence

---

## Architecture Diagram

```text
CLI: create-element
  │
  ├─ Parse flags (name, description, frontal-image, refer-images)
  ├─ Upload local images if needed
  │
  └─ callModelApi({
       endpoint: "kling-create-element",
       provider: "gmi",
       payload: { element_name, element_description, reference_type, frontal_image, refer_images }
     })
       │
       ├─ Submit: POST /requests { model: "kling-create-element", payload }
       ├─ Poll: GET /requests/{id} until success
       └─ outcome → extract element_id
             │
             └─ saveElement(elementId, name, ...) → ~/.qcut/elements.json

CLI: create-video --element-ids abc123
  │
  ├─ Resolve element IDs from store
  ├─ Build payload with element_list: [{ element_id: "abc123" }]
  │
  └─ callModelApi({
       endpoint: "kling-v3-omni",
       provider: "gmi",
       payload: { prompt: "<<<element_1>>> walks...", element_list, mode, duration }
     })

ViMax: novel2movie --create-elements
  │
  ├─ Extract characters → Generate portraits
  ├─ For each character with portraits:
  │   └─ create-element (frontal + side views)
  │       → element_id stored in portrait registry
  │
  └─ Storyboard generation:
      ├─ Replace character names with <<<element_N>>>
      ├─ Attach element_list to video payload
      └─ Generate videos with consistent characters
```

## File Summary

| File | Action | Subtask |
|------|--------|---------|
| `electron/native-pipeline/infra/element-store.ts` | NEW | 1 |
| `electron/__tests__/element-store.test.ts` | NEW | 1 |
| `electron/native-pipeline/registry-data/text-to-video.ts` | EDIT (add model) | 2 |
| `electron/native-pipeline/cli/command-registry.ts` | EDIT (add commands) | 3 |
| `electron/native-pipeline/cli/cli-handlers-media.ts` | EDIT (add handlers) | 3 |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | EDIT (add dispatch) | 3 |
| `electron/native-pipeline/cli/cli-runner/types.ts` | EDIT (add options) | 3 |
| `electron/native-pipeline/cli/cli.ts` | EDIT (add arg parsing) | 3 |
| `electron/native-pipeline/cli/cli-help.ts` | EDIT (add help text) | 3 |
| `electron/native-pipeline/cli/cli-output-formatters.ts` | EDIT (add formatters) | 3 |
| `electron/__tests__/cli-create-element.test.ts` | NEW | 3 |
| `electron/native-pipeline/execution/step-executors.ts` | EDIT (wire element_list) | 4 |
| `electron/native-pipeline/infra/__tests__/api-caller-gmi.test.ts` | EDIT (add tests) | 4 |
| `electron/native-pipeline/vimax/agents/character-portraits.ts` | EDIT (add element creation) | 5 |
| `electron/native-pipeline/vimax/types/character.ts` | EDIT (add element_id) | 5 |
| `electron/__tests__/vimax-portraits-elements.test.ts` | NEW | 5 |

## Open Questions

1. **Element pricing** — GMI doesn't document `kling-create-element` pricing. Estimated $0.10/element.
2. **Element expiry** — Do GMI elements expire? Need to handle re-creation if element_id becomes invalid.
3. **Inline elements** — Should we support inline image/video elements (auto-created per request) as an alternative to pre-created elements? This avoids element management but costs more.
4. **Multi-shot + elements** — The `multi_prompt` storyboard feature combined with elements is the killer use case for novel2movie. Each shot references the same character elements.
