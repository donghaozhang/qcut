# Embedding Pipeline — Video Ingestion & Indexing

## Ingestion Flow

```
PUT /api/v1/videos-for-search/{filename}
  → Stream validation (Content-Type: video/mp4 or video/x-matroska)
  → 8KB chunk streaming to VST
  → Get timeline (start/end times)
  → Generate embeddings via Cosmos Embed
  → Store in Elasticsearch
```

### Key: `api/video_search_ingest.py` → `stream_video_to_vst()`

1. **Upload** — PUT to VST storage, get `sensorId` (UUID) + filename
2. **Timeline** — fetch ISO 8601 start/end from VST
3. **Embedding** — POST `/v1/generate_video_embeddings` to RTVI Embed
   - Video chunked at **5-second intervals**
   - Each chunk → 1024-dim Cosmos embedding vector
4. **Index** — embeddings stored as nested objects in Elasticsearch

## Elasticsearch Document Structure

```json
{
  "sensor": {
    "id": "8fce43a6-...",
    "description": "warehouse",
    "info": {
      "url": "s3://bucket/video.mp4",
      "path": "/tmp/assets/..."
    },
    "stream_id": "8fce43a6-..."
  },
  "timestamp": "2025-01-01T00:00:00Z",
  "end": "2025-01-01T00:05:00Z",
  "llm": {
    "visionEmbeddings": [
      {
        "vector": [0.1, 0.2, ...],   // 1024-dim
        "timestamp": "2025-01-01T00:00:05Z"
      }
    ],
    "queries": [
      { "response": "{...metadata...}" }
    ]
  }
}
```

## Cosmos Embed Client

**Source**: `embed/cosmos_embed.py`

Three embedding modes:

| Method | Endpoint | Output Dim | Input |
|--------|----------|-----------|-------|
| `get_text_embedding()` | `/v1/generate_text_embeddings` | 768 | Plain text |
| `get_image_embedding()` | `/v1/generate_image_embeddings` | 1024 | data URI or URL |
| `get_video_embedding()` | `/v1/generate_video_embeddings` | 1024 | presigned URL |

All use model `nvidia/cosmos-embed1`.

## Chunk Duration

Default: **5 seconds** per chunk. Each chunk gets its own embedding vector and timestamp, enabling sub-clip level search precision.
