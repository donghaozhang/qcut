# Search Architecture — Embed, Attribute, and Fusion

## Three Search Paths

**Source**: `tools/search.py` → `execute_core_search()`

| Path | When | Flow |
|------|------|------|
| **Embed-Only** | No attributes extracted OR no behavioral data | Query → Cosmos embedding → KNN → Results |
| **Attribute-Only** | Attributes exist, embed confidence < threshold | Query → RTVI-CV attribute search → Results |
| **Fusion** (default) | Attributes + embed confidence ≥ threshold | Query → Embed + Attribute (parallel) → Fusion → Results |

## Embed Search (KNN)

**Source**: `tools/embed_search.py`

### Query Construction

```json
{
  "query": {
    "bool": {
      "must": [{
        "nested": {
          "path": "llm.visionEmbeddings",
          "query": {
            "knn": {
              "field": "llm.visionEmbeddings.vector",
              "query_vector": [0.1, 0.2, ...],
              "k": 500,
              "num_candidates": 1000
            }
          },
          "inner_hits": { "size": 1 }
        }
      }],
      "filter": [
        // Optional: video source filter (wildcard + regex)
        // Optional: description filter
        // Optional: timestamp range filter
      ]
    }
  },
  "size": 500
}
```

### Score Normalization

ES score (0-1) → Cosine similarity (-1 to 1):
```python
similarity = round(2 * hit["_score"] - 1, 2)
```

### Result Processing (`_process_search_hit`)

For each hit:
1. Extract UUID from sensor.stream_id → sensor.info.path → sensor.id
2. Resolve video filename
3. Generate screenshot URL via VST snapshot API
4. Filter out previously-seen results

**Output per result**:
```python
class EmbedSearchResultItem(BaseModel):
    video_name: str
    description: str
    start_time: str       # ISO 8601
    end_time: str         # ISO 8601
    sensor_id: str        # UUID
    screenshot_url: str   # VST snapshot URL
    similarity_score: float  # [-1, 1]
```

## Attribute Search

**Source**: `tools/attribute_search.py`

Searches behavioral metadata from RTVI-CV (object detection, pose, clothing color, etc.):

```
ES Index: mdx-behavior-{date}
Document: {
  sensor.id, object.id, object.type,
  object.embedding, behavior.clothing_color,
  behavior.pose, timestamp
}
```

Steps:
1. Query RTVI-CV for attribute embeddings
2. Cosine similarity search in behavioral ES index
3. Optional frame-level bbox lookup
4. Combine across attributes

## Fusion Reranking

**Source**: `tools/search.py` → `_fuse_results()`

Three methods:

### 1. Weighted Linear (default)
```
final_score = 0.55 * attribute_score + 0.35 * embed_score + 0.1 * other
```

### 2. Reciprocal Rank Fusion (RRF)
```
score = 1/(k + rank_embed) + w * embed_similarity
```
Default k=60.

### 3. RRF with Attribute Rank
```
score = 1/(k + rank_embed) + w * (1/(k + rank_attr))
```

## Query Decomposition (Agent Mode)

When `agent_mode=True`, an LLM extracts structured attributes from natural language:

```
Input:  "Find people wearing red hard hats"
Output: {
  "has_action": true,
  "attributes": [
    {"key": "person_type", "value": "person"},
    {"key": "clothing", "value": "red hard hat"}
  ]
}
```

This enables the parallel embed + attribute search paths.
