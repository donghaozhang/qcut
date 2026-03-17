# NVIDIA Video Search & Summarization (VSS) — Overview

Reference analysis of [NVIDIA VSS Blueprint](https://github.com/NVIDIA/video-search-and-summarization) for QCut reuse evaluation.

## What It Does

AI-powered system for searching large video archives using natural language queries, extracting relevant clips, and generating summaries. Built on NVIDIA AIQ Toolkit.

## High-Level Data Flow

```
Video Upload
  → VST (Video Storage Toolkit) — stores video files
  → Cosmos Embed — generates 1024-dim embeddings per 5s chunk
  → Elasticsearch — indexes embeddings + metadata

User Query
  → LLM Query Decomposition (extract attributes)
  → Parallel: Embed Search (KNN) + Attribute Search (behavioral)
  → Fusion Reranking (weighted linear or RRF)
  → VST Clip Extraction (mp4 clips with timestamps)
  → Optional VLM Verification (Cosmos Reason2)
  → Results with thumbnails, clips, similarity scores
```

## Core Components

| Component | Purpose | Port |
|-----------|---------|------|
| VST | Video storage, clip extraction, snapshots | 30888 |
| Elasticsearch | Vector DB with nested embeddings | 9200 |
| Cosmos Embed | Multimodal embeddings (text/image/video) | 8017 |
| RTVI-CV | Computer vision / behavior analytics | 9000 |
| VSS Agent | LLM-powered orchestration (FastAPI) | 8000 |
| NIM LLM/VLM | Language + vision models | varies |

## Tech Stack

- **Backend**: FastAPI, NVIDIA AIQ Toolkit, Python (uv)
- **Vector Search**: Elasticsearch 8.17+ with KNN
- **Embeddings**: Cosmos Embed (768-dim text, 1024-dim image/video)
- **LLM**: NVIDIA Nemotron 9B-v2
- **VLM**: Cosmos Reason2 8B
- **Frontend**: Next.js + React (Turborepo monorepo)

## Documentation Index

| File | Topic |
|------|-------|
| [01-embedding-pipeline.md](01-embedding-pipeline.md) | Video ingestion and embedding generation |
| [02-search-architecture.md](02-search-architecture.md) | Search: embed, attribute, fusion |
| [03-clip-extraction.md](03-clip-extraction.md) | VST clip and snapshot extraction |
| [04-agent-orchestration.md](04-agent-orchestration.md) | Agent hierarchy and LangGraph workflows |
| [05-reuse-analysis.md](05-reuse-analysis.md) | **What QCut can reuse** |
| [06-embedding-options.md](06-embedding-options.md) | All embedding models compared + recommended tiered architecture |
| | |
| **Implementation Plan** | |
| [10-implementation-overview.md](10-implementation-overview.md) | Master plan: architecture, data flow, file structure |
| [11-subtask-embedding-provider.md](11-subtask-embedding-provider.md) | Subtask 1: Provider abstraction + Gemini Embedding 2 |
| [12-subtask-video-chunking.md](12-subtask-video-chunking.md) | Subtask 2: FFmpeg 5s video chunking |
| [13-subtask-vector-storage.md](13-subtask-vector-storage.md) | Subtask 3: JSON-based vector storage |
| [14-subtask-indexing-handler.md](14-subtask-indexing-handler.md) | Subtask 4: Indexing IPC handler (orchestrator) |
| [15-subtask-search-handler.md](15-subtask-search-handler.md) | Subtask 5: Search IPC handler + cosine KNN |
| [16-subtask-search-ui.md](16-subtask-search-ui.md) | Subtask 6: Search panel UI + Zustand store |
| [17-subtask-settings.md](17-subtask-settings.md) | Subtask 7: Provider config + settings |
| [18-subtask-tests.md](18-subtask-tests.md) | Subtask 8: All unit + E2E tests |
| | |
| [source-files/](source-files/) | Copied NVIDIA VSS source code and configs |
