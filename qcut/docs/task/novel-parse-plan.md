# Novel-to-Script Parser — Implementation Plan

## Overview

Add a "Novel → Structured Screenplay" feature to QCut, enabling users to paste raw novel/story text and automatically generate a structured screenplay with characters, locations, and shot-ready clips.

**Reference**: waoowaoo project (`story-to-script/orchestrator.ts`, `clip-matching.ts`)
**Branch**: `novel-parse`

---

## Architecture

```
Novel Text (string)
    │
    ▼
┌─────────────────────────────────────────────┐
│  novel-parser.ts (Main Orchestrator)        │
│                                             │
│  Step 1: analyzeCharacters ─┐ parallel      │
│          analyzeLocations ──┘               │
│                                             │
│  Step 2: splitClips                         │
│          └── clip-matching.ts (L1/L2/L3)    │
│                                             │
│  Step 3: convertToScreenplay (per clip,     │
│          parallel)                          │
│          └── json-repair.ts                 │
│                                             │
│  Output: NovelParseResult                   │
└─────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────┐  ┌──────────────────┐
│ GUI: Director Panel  │  │ CLI: editor:novel:parse │
│ "Import Novel" btn   │  │ --input --output │
└──────────────────────┘  └──────────────────┘
```

---

## New Files

| File | Purpose | Est. |
|------|---------|------|
| `apps/web/src/lib/moyin/script/novel-parser.ts` | Main orchestrator (3-step pipeline) | 1.5d |
| `apps/web/src/lib/moyin/script/clip-matching.ts` | 3-level text boundary matching | 1d |
| `apps/web/src/lib/moyin/script/json-repair.ts` | LLM JSON output repair (3-level) | 0.5d |
| `apps/web/src/lib/moyin/script/novel-prompts.ts` | Prompt templates (CN/EN) | 0.5d |
| `apps/web/src/lib/moyin/script/__tests__/novel-parser.test.ts` | Unit tests | 0.5d |
| `apps/web/src/lib/moyin/script/__tests__/clip-matching.test.ts` | Boundary matching tests | 0.5d |
| `electron/native-pipeline/cli/commands/novel-parse.ts` | CLI command handler | 0.5d |

**Total estimate: ~5-6 days**

---

## Key Types

```typescript
// novel-parser.ts

/** Input configuration */
export interface NovelParseConfig {
  /** Raw novel/story text */
  text: string;
  /** Language hint */
  language?: 'zh' | 'en' | 'auto';
  /** Max clips to generate (default: auto based on length) */
  maxClips?: number;
  /** Existing characters to preserve (from project) */
  existingCharacters?: string[];
  /** Existing locations to preserve */
  existingLocations?: string[];
  /** LLM adapter function */
  callLLM: LLMAdapter;
  /** Progress callback */
  onProgress?: (step: NovelParseStep, progress: number) => void;
  /** Step error callback */
  onStepError?: (step: NovelParseStep, error: string) => void;
}

export type NovelParseStep = 
  | 'analyze_characters'
  | 'analyze_locations' 
  | 'split_clips'
  | 'screenplay_conversion';

/** Language detection helper for auto mode */
export function detectLanguage(text: string): 'zh' | 'en';

/** Single extracted character */
export interface ExtractedCharacter {
  name: string;
  introduction: string;
  visualTraits?: string;
  gender?: string;
  age?: string;
}

/** Single extracted location */
export interface ExtractedLocation {
  name: string;
  description: string;
  time?: string; // day/night/dawn/dusk
  atmosphere?: string;
}

/** A clip with matched content from original text */
export interface NovelClip {
  id: string; // clip_1, clip_2, ...
  startText: string; // LLM-returned anchor
  endText: string;   // LLM-returned anchor
  content: string;   // Actual text sliced from novel
  summary: string;
  characters: string[];
  location: string | null;
  matchLevel: ClipMatchLevel; // L1/L2/L3
  matchConfidence: number;    // 0-1
}

/** Screenplay for one clip */
export interface ClipScreenplay {
  clipId: string;
  success: boolean;
  sceneCount: number;
  screenplay?: {
    scenes: Array<{
      location: string;
      time: string;
      action: string;
      dialogue: Array<{
        character: string;
        line: string;
        direction?: string;
      }>;
    }>;
  };
  error?: string;
}

/** Final output */
export interface NovelParseResult {
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  clips: NovelClip[];
  screenplays: ClipScreenplay[];
  summary: {
    characterCount: number;
    locationCount: number;
    clipCount: number;
    screenplaySuccessCount: number;
    screenplayFailedCount: number;
    totalScenes: number;
  };
}
```

```typescript
// clip-matching.ts

export type ClipMatchLevel = 'L1' | 'L2' | 'L3';

export interface ClipBoundaryMatch {
  startIndex: number;
  endIndex: number;
  level: ClipMatchLevel;
  confidence: number; // L1=1.0, L2=0.97, L3=0.9+
}

export interface ClipContentMatcher {
  matchBoundary: (
    startText: string,
    endText: string,
    fromIndex: number
  ) => ClipBoundaryMatch | null;
}

export function createClipContentMatcher(content: string): ClipContentMatcher;
```

---

## Pipeline Details

### Step 1: Character + Location Analysis (Parallel)

```typescript
export async function analyzeCharacters(
  text: string,
  existingCharacters: string[],
  callLLM: LLMAdapter,
  language: string
): Promise<ExtractedCharacter[]>

export async function analyzeLocations(
  text: string,
  existingLocations: string[],
  callLLM: LLMAdapter,
  language: string
): Promise<ExtractedLocation[]>
```

- Both run via `Promise.all()` for parallel execution
- Reuse existing character names from project (merge, don't replace)
- Output: character list + location list for Step 2 prompt enrichment
- maxOutputTokens: 2200

### Step 2: Clip Splitting + Boundary Validation

```typescript
export async function splitNovelIntoClips(
  text: string,
  characters: string[],
  locations: string[],
  callLLM: LLMAdapter,
  language: string,
  maxAttempts?: number // default 2
): Promise<NovelClip[]>
```

**LLM returns:**
```json
[
  {
    "start": "张三推开酒馆的门",
    "end": "他放下了酒杯",
    "summary": "张三在酒馆与老友重逢",
    "characters": ["张三", "李四"],
    "location": "酒馆"
  }
]
```

**Boundary matching (clip-matching.ts):**
```
L1: tryExactRawMatch(content, start, end, fromIndex)
    → content.indexOf(start) + content.indexOf(end)
    → confidence: 1.0

L2: tryExactNormalizedMatch(normalized, startQuery, endQuery, fromIndex)
    → Normalize: fullwidth→halfwidth, CN punct→EN punct, lowercase, strip whitespace
    → Match on normalized text, map back to raw indices
    → confidence: 0.97

L3: tryApproximateNormalizedMatch(normalized, startQuery, endQuery, fromIndex)
    → Levenshtein edit distance
    → Anchor-based candidate search (start/mid/end of query)
    → Length variation ±20%
    → confidence threshold: 0.90
```

**Critical**: Sequential matching with `searchFrom` cursor — each clip starts after previous clip ends. If any boundary fails, retry entire Step 2 (max 2 attempts).

### Step 3: Screenplay Conversion (Parallel per clip)

```typescript
export async function convertClipToScreenplay(
  clip: NovelClip,
  characters: string[],
  locations: string[],
  callLLM: LLMAdapter,
  language: string
): Promise<ClipScreenplay>
```

- All clips processed via `Promise.all()`
- Each clip → LLM → structured screenplay JSON
- Uses `repairJSON()` from json-repair.ts for output parsing
- maxOutputTokens: 2200
- Individual clip failure doesn't block others

### Main Orchestrator

```typescript
export async function parseNovel(config: NovelParseConfig): Promise<NovelParseResult> {
  const { text, language = 'auto', callLLM, onProgress } = config;
  
  // Detect language if auto
  const lang = language === 'auto' ? detectLanguage(text) : language;
  
  // Step 1: Parallel character + location analysis
  onProgress?.('analyze_characters', 0);
  const [characters, locations] = await Promise.all([
    analyzeCharacters(text, config.existingCharacters ?? [], callLLM, lang),
    analyzeLocations(text, config.existingLocations ?? [], callLLM, lang),
  ]);
  onProgress?.('analyze_characters', 100);
  
  // Step 2: Split into clips with boundary validation
  onProgress?.('split_clips', 0);
  const clips = await splitNovelIntoClips(
    text,
    characters.map(c => c.name),
    locations.map(l => l.name),
    callLLM,
    lang
  );
  onProgress?.('split_clips', 100);
  
  // Step 3: Convert each clip to screenplay (parallel)
  onProgress?.('screenplay_conversion', 0);
  const screenplays = await Promise.all(
    clips.map((clip, i) =>
      convertClipToScreenplay(clip, characters.map(c => c.name), locations.map(l => l.name), callLLM, lang)
        .then(result => {
          onProgress?.('screenplay_conversion', ((i + 1) / clips.length) * 100);
          return result;
        })
    )
  );
  
  return {
    characters,
    locations,
    clips,
    screenplays,
    summary: {
      characterCount: characters.length,
      locationCount: locations.length,
      clipCount: clips.length,
      screenplaySuccessCount: screenplays.filter(s => s.success).length,
      screenplayFailedCount: screenplays.filter(s => !s.success).length,
      totalScenes: screenplays.reduce((sum, s) => sum + s.sceneCount, 0),
    },
  };
}
```

---

## JSON Repair (json-repair.ts)

```typescript
/**
 * 3-level JSON repair for LLM outputs:
 * Level 1: Direct JSON.parse
 * Level 2: Escape control characters (\n, \t, \r inside strings)
 * Level 3: Fix unescaped Chinese quotes ("" → "")
 *          LLMs often convert Chinese curly quotes to ASCII double quotes
 *          inside JSON string values without escaping them
 */
export function repairAndParseJSON<T>(text: string): T;
export function repairAndParseJSONArray<T>(text: string): T[];

// Internal helpers
function stripMarkdownCodeFence(text: string): string;
function escapeControlCharsInJsonStrings(input: string): string;
function fixUnescapedQuotesInJson(input: string): string;
```

---

## Prompt Templates (novel-prompts.ts)

```typescript
export function getCharacterAnalysisPrompt(language: string): string;
export function getLocationAnalysisPrompt(language: string): string;
export function getClipSplitPrompt(language: string): string;
export function getScreenplayConversionPrompt(language: string): string;
```

Each template has `{input}`, `{characters_lib_name}`, `{locations_lib_name}`, `{characters_introduction}` placeholders.

Boundary constraint suffix appended to clip split prompt:
```
[Boundary Constraints]
1. The "start" and "end" anchors must come from the original text and be locatable.
2. Allow punctuation/whitespace differences, but do not rewrite key entities or events.
3. If anchors cannot be located reliably, return [] directly.
```

---

## CLI Integration

### Command Registration

In `command-registry-editor.ts`, add:

```typescript
{
  name: 'editor:novel:parse',
  description: 'Parse novel text into structured screenplay',
  flags: [
    { name: 'input', type: 'string', description: 'Path to novel text file', required: true },
    { name: 'output', type: 'string', description: 'Output JSON path (default: stdout)' },
    { name: 'language', type: 'string', description: 'Language hint (zh/en/auto)', default: 'auto', enum: ['zh', 'en', 'auto'] },
    { name: 'max-clips', type: 'number', description: 'Maximum clips to generate' },
    { name: 'json', type: 'boolean', description: 'JSON output format' },
  ]
}
```

### CLI Handler

```typescript
// electron/native-pipeline/cli/commands/novel-parse.ts

export async function handleNovelParse(flags: Record<string, unknown>): Promise<void> {
  const inputPath = flags['input'] as string;
  const outputPath = flags['output'] as string | undefined;
  const language = (flags['language'] as string) || 'auto';
  const maxClips = flags['max-clips'] as number | undefined;
  
  // Read input file
  const text = await fs.readFile(inputPath, 'utf-8');
  
  // Create LLM adapter (uses QCut's configured LLM provider)
  const callLLM = createCLILLMAdapter();
  
  // Run pipeline
  const result = await parseNovel({
    text,
    language: language as 'zh' | 'en' | 'auto',
    maxClips,
    callLLM,
    onProgress: (step, progress) => {
      if (!flags['json']) {
        process.stderr.write(`\r[${step}] ${progress.toFixed(0)}%`);
      }
    },
  });
  
  // Output
  const output = JSON.stringify(result, null, 2);
  if (outputPath) {
    await fs.writeFile(outputPath, output, 'utf-8');
    emitJsonResult('editor:novel:parse', {
      success: true,
      data: { message: `Wrote ${outputPath}`, summary: result.summary },
    });
  } else {
    emitJsonResult('editor:novel:parse', { success: true, data: result });
  }
}
```

### Usage Examples

```bash
# Parse a Chinese novel
qcut editor:novel:parse --input novel.txt --output screenplay.json --language zh

# Auto-detect language, JSON to stdout
qcut editor:novel:parse --input story.txt --json

# Limit to 20 clips
qcut editor:novel:parse --input novel.txt --max-clips 20 --output out.json
```

---

## GUI Integration (Director Panel)

### Entry Point
Add "Import Novel" button alongside existing "New Script" in Director Panel.

### Flow
1. User clicks "Import Novel" → file picker or text paste dialog
2. Show progress: "Analyzing characters... (Step 1/3)"
3. After Step 1: Show extracted characters + locations for review/edit
4. User confirms → proceed to clip splitting
5. After Step 2: Show clip list with summaries
6. User confirms → generate screenplays
7. After Step 3: Load into Director Panel as normal screenplay

### State Management
```typescript
// Use existing moyin store pattern
interface NovelImportState {
  status: 'idle' | 'analyzing' | 'splitting' | 'converting' | 'done' | 'error';
  progress: number;
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  clips: NovelClip[];
  result: NovelParseResult | null;
  error: string | null;
}
```

---

## Integration Points with Existing QCut Code

| Existing Code | Integration |
|---------------|-------------|
| `script-parser.ts` → `LLMAdapter` type | Reuse directly in novel-parser.ts |
| `script-parser.ts` → `detectInputType()` | Add 'novel' as new type, route to novel-parser |
| `ai-character-finder.ts` | Use ExtractedCharacter → ScriptCharacter conversion |
| `ai-scene-finder.ts` | Use ExtractedLocation → ScriptScene conversion |
| `llm-adapter.ts` → `callFeatureAPI()` | Use as LLM backend for GUI mode |
| `character-bible.ts` | Import extracted characters into project bible |
| `director-presets/` | Apply presets to generated screenplay shots |
| `command-registry-editor.ts` | Register editor:novel:parse command |
| `json-output.ts` → `emitJsonResult` | CLI output formatting |

---

## Context Window Handling

```typescript
function estimateTokens(text: string): number {
  // Rough estimate: 1 Chinese char ≈ 1.5 tokens, 1 non-Chinese char ≈ 0.4 tokens
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.4);
}

function checkContextWindow(text: string, modelLimit: number = 128000): {
  fits: boolean;
  estimatedTokens: number;
  suggestedChunks: number;
} {
  const tokens = estimateTokens(text);
  const available = modelLimit - 5000; // Reserve for prompts + output
  return {
    fits: tokens <= available,
    estimatedTokens: tokens,
    suggestedChunks: Math.ceil(tokens / available),
  };
}
```

If text exceeds context window:
1. Show warning to user
2. Suggest splitting into chapters/episodes first
3. Future: auto-chunk by chapter markers (第X章, Chapter X)

---

## Error Handling Strategy

| Error | Handling |
|-------|----------|
| LLM returns invalid JSON | 3-level JSON repair |
| Boundary matching fails | Retry Step 2 (max 2 attempts) |
| Context window exceeded | Warn user, suggest chunking |
| Single clip screenplay fails | Continue other clips, mark as failed |
| LLM timeout / rate limit | Exponential backoff retry (max 3) |
| Empty novel text | Validate input, return error |

---

## Testing Plan

### clip-matching.test.ts
- L1: exact match Chinese text
- L1: exact match English text
- L2: fullwidth → halfwidth normalization
- L2: Chinese punctuation → English mapping
- L3: Levenshtein fuzzy match (90% threshold)
- L3: anchor-based candidate search
- Sequential matching with searchFrom cursor
- Edge: empty text, overlapping anchors, no match

### novel-parser.test.ts
- Mock LLM adapter
- Full pipeline with sample Chinese novel excerpt
- Full pipeline with sample English story
- Character merge with existing project characters
- Clip splitting with boundary validation
- Screenplay conversion with JSON repair
- Error handling: LLM failure, boundary mismatch

---

## Migration Path from waoowaoo

| waoowaoo File | QCut Equivalent | Changes Needed |
|---------------|-----------------|----------------|
| `story-to-script/orchestrator.ts` | `novel-parser.ts` | Replace runStep callback with LLMAdapter, remove BullMQ/worker deps |
| `story-to-script/clip-matching.ts` | `clip-matching.ts` | Direct port, no deps to change |
| `JSON repair in orchestrator.ts` | `json-repair.ts` | Extract to standalone module |
| Prompt templates (in DB/config) | `novel-prompts.ts` | Hardcode as template strings |

---

## Implementation Order

1. **clip-matching.ts** + tests (foundation, no LLM needed)
2. **json-repair.ts** + tests (standalone utility)
3. **novel-prompts.ts** (prompt templates)
4. **novel-parser.ts** + tests (main orchestrator)
5. **CLI command** (editor:novel:parse)
6. **GUI integration** (Director Panel "Import Novel")

Each step is independently testable and committable.
