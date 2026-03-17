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
| [source-files/](source-files/) | Copied source code and configs |
