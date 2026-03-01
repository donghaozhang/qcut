# Refactor Plan: claude-timeline-bridge-helpers.ts

**File**: `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts`
**Current Lines**: 862
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Header & imports | 1-28 | Stores, types, constants |
| Core timing helpers | 30-98 | getEffectiveDuration, calculateTimelineDuration, findTrackByElementId, isClaudeMediaElementType, getElementStartTime |
| Duration utilities | 99-127 | getElementDuration with fallback logic |
| Media resolution | 128-281 | findMediaItemForElement, decodeBase64UrlUtf8, syncProjectMediaIfNeeded, resolveMediaItemForElement (~154 lines) |
| Add media element | 283-330 | addClaudeMediaElement |
| Add text element | 332-374 | addClaudeTextElement |
| Add markdown element | 376-454 | addClaudeMarkdownElement with constants |
| **Add Remotion element** | **456-704** | **bundleAndRegisterComponent, importRemotionFolder, addClaudeRemotionElement (~248 lines)** |
| Export formatting | 706-786 | formatTracksForExport, formatElementForExport |
| Timeline application | 788-861 | applyTimelineToStore |

---

## Proposed Split

```
lib/claude-bridge/
├── claude-timeline-bridge-helpers.ts   → replaced by index.ts barrel
├── helpers/
│   ├── element-timing.ts              (~100 lines) Duration/timing calculations
│   ├── media-resolution.ts            (~150 lines) Media finding & sync
│   ├── element-builders.ts            (~190 lines) Media/text/markdown element creation
│   ├── remotion-integration.ts        (~240 lines) Remotion bundling & import
│   ├── timeline-export.ts             (~120 lines) Export formatting + apply
│   └── index.ts                       (~30 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `element-timing.ts` | 100 | TimelineStoreState type, getEffectiveDuration, calculateTimelineDuration, getElementStartTime, getElementDuration, duration constants |
| `media-resolution.ts` | 150 | findMediaItemForElement, decodeBase64UrlUtf8, getSourceNameFromDeterministicSourceId, syncProjectMediaIfNeeded, resolveMediaItemForElement, findTrackByElementId, isClaudeMediaElementType |
| `element-builders.ts` | 190 | addClaudeMediaElement, addClaudeTextElement, addClaudeMarkdownElement, DEFAULT_MARKDOWN_* constants |
| `remotion-integration.ts` | 240 | bundleAndRegisterComponent, importRemotionFolder, addClaudeRemotionElement |
| `timeline-export.ts` | 120 | formatTracksForExport, formatElementForExport, applyTimelineToStore |
| `index.ts` (barrel) | 30 | Re-export all public functions |
| **Total** | **~830** | Includes import/export overhead |

## Dependency Chain

```
element-timing.ts → (standalone)
media-resolution.ts → element-timing.ts
element-builders.ts → element-timing.ts, media-resolution.ts
remotion-integration.ts → (uses timeline store directly)
timeline-export.ts → element-timing.ts, element-builders.ts, remotion-integration.ts
```

## Migration Steps

1. Extract `element-timing.ts` (foundation, no dependencies)
2. Extract `media-resolution.ts` (depends on timing)
3. Extract `element-builders.ts` (depends on timing + media)
4. Extract `remotion-integration.ts` (standalone but uses timeline store)
5. Extract `timeline-export.ts` (orchestration, depends on all above)
6. Create barrel `index.ts`
7. Update `claude-timeline-bridge.ts` imports to use new barrel
