# Refactor Plan: effects-store.ts

**File**: `apps/web/src/stores/ai/effects-store.ts`
**Current Lines**: 853
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1-23 | Zustand, sonner, types, utilities |
| mergeFFmpegEffectParameters | 25-86 | Parameter merging helper (~61 lines) |
| **EFFECT_PRESETS** | **88-434** | **35 preset definitions (~346 lines)** |
| EffectsStore interface | 436-492 | Store type definition (~57 lines) |
| Store implementation | 494-852 | Zustand store (~358 lines) |
| → Basic effect mgmt | 501-639 | apply/remove/update/toggle/clear/duplicate |
| → Reorder & reset | 641-693 | reorderEffects, resetEffectToDefaults |
| → Animation support | 695-732 | updateEffectAnimations |
| → Effect chaining | 734-813 | create/remove/update/toggle chains |
| → FFmpeg integration | 832-851 | getFFmpegFilterChain |

---

## Proposed Split

The EFFECT_PRESETS constant alone is 346 lines — extracting it immediately drops the main file well under 800.

```text
stores/ai/effects/
├── effects-store.ts            (~180 lines) Store definition + assembly
├── presets.ts                  (~380 lines) EFFECT_PRESETS constant
├── effect-parameters.ts        (~90 lines)  mergeFFmpegEffectParameters utility
├── effects-actions.ts          (~210 lines) Core CRUD operations
├── effect-chaining.ts          (~120 lines) Chain operations
└── index.ts                    (~20 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `effects-store.ts` (refactored) | 180 | EffectsStore interface, store creation, compose actions, selection/getters, animations, FFmpeg filter chain |
| `presets.ts` | 380 | EFFECT_PRESETS array with 35 presets |
| `effect-parameters.ts` | 90 | mergeFFmpegEffectParameters helper |
| `effects-actions.ts` | 210 | apply/remove/update/toggle/clear/duplicate/reorder/resetEffects |
| `effect-chaining.ts` | 120 | createChain, removeChain, updateChainBlendMode, toggleEffectInChain, moveEffectInChain, getProcessedEffects |
| `index.ts` | 20 | Barrel re-export |
| **Total** | **~1,000** | Includes import/export overhead |

## Quick Win

Even extracting just `presets.ts` (the EFFECT_PRESETS array) would reduce the main file from 853 → ~507 lines, immediately resolving the violation with minimal risk.

## Migration Steps

1. Extract `presets.ts` (standalone data, zero dependencies — **quick win**)
2. Extract `effect-parameters.ts` (standalone utility)
3. Extract `effects-actions.ts` (core CRUD, depends on presets)
4. Extract `effect-chaining.ts` (chaining operations)
5. Refactor `effects-store.ts` to compose all modules
6. Create barrel `index.ts`
7. Update imports: `@/stores/ai/effects-store` → `@/stores/ai/effects`
