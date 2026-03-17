# Reuse Analysis — What QCut Can Adopt

## Summary

The NVIDIA VSS system is enterprise-grade with heavy NVIDIA-specific dependencies (NIM, Cosmos, RTVI-CV, VST). Most of the infrastructure layer is **not directly reusable**, but the **patterns, algorithms, and architecture** are highly valuable for QCut's video search feature.

---

## Directly Reusable

### 1. Search Result Data Models
**File**: `source-files/vss.py`
- `EmbedSearchResultItem` schema (video_name, start/end time, similarity_score, screenshot_url)
- `SearchResult` with fusion scores
- QCut can adopt these Pydantic models almost directly, adapting to TypeScript/Zod

### 2. KNN Query Structure for Elasticsearch
**File**: `source-files/embed_search.py` → `_build_es_query()`
- Nested KNN query with `k=500, num_candidates=1000` pattern
- Post-filtering with wildcard/regex on video source
- Score normalization: `similarity = 2 * es_score - 1`
- **Reuse**: If QCut uses any vector DB, this query pattern transfers directly

### 3. Fusion Reranking Algorithm
**File**: `source-files/search.py` → `_fuse_results()`
- Weighted linear fusion (attr=0.55, embed=0.35) — simple and effective
- Reciprocal Rank Fusion (RRF) with k=60
- **Reuse**: These algorithms are model-agnostic. QCut can use them to combine multiple search signals (text match + visual similarity + audio match)

### 4. Clip Extraction Pattern (Timestamp-Based)
**File**: `source-files/video_clip.py`
- Two timestamp modes (offset seconds vs ISO 8601)
- Timeline-based offset → ISO conversion
- **Reuse**: QCut already has FFmpeg clip extraction. The timestamp handling and overlay config pattern can be adopted for search-result-to-clip workflows.

### 5. Screenshot/Thumbnail Generation Pattern
**File**: `source-files/snapshot.py`
- Single-frame extraction at arbitrary timestamp
- URL-based snapshot API design
- **Reuse**: QCut can implement similar snapshot extraction via FFmpeg for search result thumbnails

---

## Partially Reusable (Pattern-Level)

### 6. Embedding Chunking Strategy
**Pattern from**: `source-files/cosmos_embed.py`
- 5-second video chunks → individual embeddings
- Each chunk independently searchable with its own timestamp
- **QCut adaptation**: Use a cheaper embedding model (e.g., CLIP, OpenAI embeddings) with the same chunking approach. 5s chunks seem like a good default for video search granularity.

### 7. Query Decomposition via LLM
**Pattern from**: `source-files/search.py`
- Natural language → structured attributes extraction
- Enables parallel search across different indexes
- **QCut adaptation**: Use Gemini/Claude to extract search intent from user queries. Example: "red car driving fast" → { visual: "red car", action: "driving", speed: "fast" }

### 8. Agent Streaming Architecture
**Pattern**: Search results stream as chunks to UI in real-time
- **QCut adaptation**: Already has streaming patterns (Claude chat). Can apply same pattern for search results appearing incrementally.

---

## Not Reusable (NVIDIA-Specific)

| Component | Why Not | QCut Alternative |
|-----------|---------|-----------------|
| Cosmos Embed | NVIDIA-specific, requires NIM | CLIP, OpenAI embeddings, Gemini embeddings |
| VST (Video Storage Toolkit) | NVIDIA proprietary video server | FFmpeg + local filesystem (already have this) |
| RTVI-CV | NVIDIA computer vision pipeline | Not needed initially; could use Gemini Vision |
| NAT (AIQ Toolkit) | NVIDIA agent framework | QCut already has its own agent system |
| NIM LLM/VLM | NVIDIA model serving | Already using Gemini, Claude, OpenRouter |
| Elasticsearch | Overkill for desktop app | SQLite with vector extension, or in-memory |

---

## Recommended QCut Implementation Plan

### Phase 1: Basic Video Search (MVP)
1. **Chunking**: Split project videos into 5s segments using FFmpeg
2. **Embedding**: Generate CLIP or Gemini embeddings per chunk
3. **Storage**: Store embeddings in SQLite (with `sqlite-vss` or flat cosine search)
4. **Search**: KNN search with cosine similarity (adapt `embed_search.py` query logic)
5. **Results**: Return timestamps + thumbnail snapshots (FFmpeg frame extraction)

### Phase 2: Clip Extraction
1. **Clip generation**: FFmpeg subclip from search result timestamps (already have this)
2. **Thumbnail grid**: Generate snapshot at midpoint of each result
3. **Score display**: Show similarity scores in UI

### Phase 3: Multi-Signal Fusion
1. **Text search**: Search subtitle/transcript text alongside visual embeddings
2. **Fusion**: Implement weighted linear fusion from VSS (`_fuse_results`)
3. **Audio search**: Optionally embed audio segments

### Phase 4: Smart Search (Optional)
1. **Query decomposition**: LLM extracts visual + text + temporal attributes
2. **Parallel search**: Visual embed + transcript text + metadata
3. **VLM verification**: Use Gemini Vision to verify clip relevance

---

## Copied Source Files Reference

| File | What It Contains | Reuse Level |
|------|-----------------|-------------|
| `embed_search.py` | KNN query builder, result processing, score normalization | **High** — query patterns, score math |
| `search.py` | Fusion reranking, query decomposition, search orchestration | **High** — fusion algorithms |
| `attribute_search.py` | Behavioral/object search in ES | **Low** — NVIDIA-specific |
| `video_clip.py` | VST clip extraction with timestamp conversion | **Medium** — timestamp handling pattern |
| `snapshot.py` | Frame snapshot URL generation | **Medium** — thumbnail pattern |
| `timeline.py` | Video timeline (duration) from VST | **Low** — QCut uses FFmpeg |
| `cosmos_embed.py` | Cosmos embedding client | **Low** — API-specific, but interface pattern reusable |
| `vss.py` | Pydantic data models | **High** — adapt to Zod/TypeScript |
| `configs/config.yml` | Agent + tool configuration | **Low** — NVIDIA AIQ framework specific |
