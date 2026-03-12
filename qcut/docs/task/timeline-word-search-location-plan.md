# Timeline Word Search → Video Location Plan

## 1) Problem
QCut users can edit timelines with captions/transcripts, but cannot quickly search for a spoken word/phrase and jump to the exact location in the timeline/video.

This causes slow navigation for:
- finding quotes/highlights
- trimming around spoken keywords
- reviewing long-form content

## 2) Goals
1. Search words/phrases and return matched locations (time ranges + timeline context).
2. One-click jump from search result to timeline/playhead.
3. Work on large projects with acceptable latency.
4. Support fuzzy matching and basic normalization (case, punctuation).

## 3) Non-Goals (V1)
- Full semantic search / vector retrieval.
- Multilingual phonetic matching beyond existing transcript quality.
- OCR search across visual text in video frames.

## 4) User Experience (V1)

### Entry points
- Timeline toolbar: `Search in Timeline`
- Command palette / CLI command for automation

### Search flow
1. User enters query (e.g. "product launch").
2. System returns grouped matches:
   - timestamp (start/end)
   - snippet context
   - track/clip id
   - confidence score (if available)
3. User clicks a result:
   - playhead seeks to start time
   - matched region highlighted in timeline
   - optional auto-preview 2–3s around match

### Filters (V1.1 optional)
- Track scope
- Time range
- Exact match toggle

## 5) Architecture

## 5.1 Data sources
Primary order:
1. Existing transcript/caption store (word-level if available)
2. Segment-level captions
3. Fallback: trigger/queue transcription if missing

## 5.2 New module
Create a search service layer (renderer/domain side):
- `timeline-search-service`
- responsibilities:
  - normalize query/text
  - index transcript segments
  - execute exact/fuzzy match
  - map results to timeline location objects

## 5.3 Result object contract
```ts
TimelineSearchResult {
  projectId: string
  clipId?: string
  trackId?: string
  startTime: number
  endTime: number
  snippet: string
  matchedText: string
  score?: number
  source: "word" | "segment"
}
```

## 6) Data Flow
1. UI sends search request → search service.
2. Service reads transcript/index data from stores.
3. Service returns ordered results (by time or score).
4. UI renders list + handles jump action.
5. Jump action updates timeline/playback stores.

## 7) API / CLI Proposals

## 7.1 Internal API
- `searchTimelineWords(query, options): TimelineSearchResult[]`
- `jumpToTimelineResult(resultId | result)`

## 7.2 CLI (for agent workflows)
- `editor:timeline:search-words --query "..." [--json] [--track ...] [--from ...] [--to ...]`
- output JSON includes array of result contracts above.

## 7.3 Claude bridge (optional)
- Expose read-only search endpoint for agent-assisted navigation:
  - `timeline.searchWords`

## 8) Implementation Plan (Phased)

### Phase A — Foundations (1–2 days)
- Confirm transcript sources and schemas.
- Add result types and option types.
- Build normalization utilities.

### Phase B — Search Engine (2–3 days)
- Implement exact + fuzzy search.
- Implement scoring/sorting.
- Add unit tests for edge cases.

### Phase C — UI Integration (2–3 days)
- Add search input + result panel in timeline UI.
- Add click-to-seek + highlight behavior.
- Add empty/loading/error states.

### Phase D — CLI/Agent Integration (1–2 days)
- Add command handler + JSON output.
- Add minimal docs/examples.

### Phase E — Hardening (1–2 days)
- Performance pass on long transcripts.
- Debounce/cancel in-flight searches.
- QA on representative projects.

## 9) Risks & Mitigations

1. **Transcript not available / incomplete**
   - Mitigation: clear state + guided action to transcribe.

2. **Performance degradation on long projects**
   - Mitigation: cache/index per project, incremental indexing.

3. **Result mismatch due to punctuation/case**
   - Mitigation: robust normalization and exact-toggle fallback.

4. **Ambiguous repeated phrases**
   - Mitigation: show context snippet + nearby words/time.

## 10) Test Plan

### Unit tests
- normalization
- exact/fuzzy matching
- ranking/sorting
- boundary time mapping

### Integration tests
- search on project with transcript
- click result updates playhead and selection
- no transcript fallback path

### E2E (critical)
- User types query, sees results, jumps to right timeline location.
- JSON CLI returns stable schema.

## 11) Acceptance Criteria
- Given a project with transcript, searching a word returns correct timeline locations.
- Clicking a result seeks playhead within tolerance (<= 100ms from expected start).
- Search response under 300ms for typical project and under 1s for large project baseline.
- CLI command returns valid JSON and non-zero results for known fixtures.

## 12) Rollout
- Feature flag: `timelineWordSearch`
- Internal dogfood first
- Enable by default after stability + telemetry review

## 13) Metrics
- Search success rate (query -> click -> seek)
- Median search latency
- Zero-result rate
- Error rate (missing transcript / runtime errors)

## 14) Open Questions
1. Should V1 include phrase proximity matching across caption segments?
2. Do we need language-specific tokenization now or defer to V2?
3. Should search results auto-play preview by default?
