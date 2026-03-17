# Embedding Options for QCut Video Search

## Strategy

QCut is a desktop app — users have varying hardware. Support a tiered approach:
- **Tier 1 (Default)**: Cloud API, no GPU required
- **Tier 2 (Power User)**: Local GPU self-hosted models via Docker or Python

---

## Self-Hosted (Local GPU)

### NVIDIA Cosmos Embed1
- **Modalities**: Video + Text (joint embedding space)
- **Variants**:
  | Variant | Resolution | Output Dim | GPU Req |
  |---------|-----------|-----------|---------|
  | 224p | 224x224 | 256 | Light |
  | 336p | 336x336 | 768 | Medium |
  | 448p | 448x448 | 768 | Heavy |
- **API**: OpenAI-compatible REST (Docker container)
- **Pros**: Best video-native embeddings, production-grade, no frame extraction needed
- **Cons**: Requires NVIDIA GPU + Docker, NIM container overhead
- **Links**: [HuggingFace](https://huggingface.co/collections/nvidia/cosmos-embed1), [Docs](https://docs.nvidia.com/nim/cosmos-embed1/1.0.0/introduction.html)

### Meta ImageBind
- **Modalities**: Video + Text + Audio + Depth + Thermal + IMU (6 total)
- **Output Dim**: 1024
- **API**: Python library (`pip install`)
- **Pros**: Open source, 6 modalities (audio search!), consumer GPU friendly, no Docker
- **Cons**: Research project, less production-hardened than Cosmos
- **Unique**: Can search by audio ("find the part where someone claps") — no other model does this
- **Link**: [GitHub](https://github.com/facebookresearch/ImageBind)

### OpenCLIP ViT-G/H
- **Modalities**: Image + Text (frame-by-frame for video)
- **Output Dim**: 1024
- **API**: Python library (`pip install open-clip-torch`)
- **Pros**: Most mature ecosystem, huge community, many fine-tuned variants
- **Cons**: No native video — must extract frames and embed individually
- **Link**: [GitHub](https://github.com/mlfoundations/open_clip)

### Google SigLIP
- **Modalities**: Image + Text
- **Output Dim**: 768–1152
- **API**: Python library (via HuggingFace transformers)
- **Pros**: Better accuracy than CLIP at smaller model sizes (sigmoid loss)
- **Cons**: No native video, Google research project
- **Link**: [HuggingFace](https://huggingface.co/google/siglip-so400m-patch14-384)

### Nomic Embed Vision
- **Modalities**: Image + Text
- **Output Dim**: 768
- **API**: Python library
- **Pros**: Lowest compute requirements, runs on consumer GPUs easily
- **Cons**: No native video, less accurate than larger models
- **Link**: [HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5)

---

## Cloud API (No GPU Required)

### Gemini Embedding 2 (NEW — March 2026)
- **Model ID**: `gemini-embedding-2-preview`
- **Modalities**: Text + Image + Video + Audio + PDF (all native, single unified space)
- **Output Dim**: 128–3072 (flexible via Matryoshka Representation Learning; recommended 768/1536/3072)
- **Input Limits**:
  | Modality | Limit |
  |----------|-------|
  | Text | 8,192 tokens, 100+ languages |
  | Images | Up to 6 per request (PNG, JPEG) |
  | Video | Up to 128 seconds (MP4, MOV — H264/H265/AV1/VP9) |
  | Audio | Up to 80 seconds (MP3, WAV) |
  | PDF | Up to 6 pages |
- **API**: Google Gemini API / Vertex AI (already have `GEMINI_API_KEY`)
- **Pros**:
  - **First cloud API with native video + audio + image + text embeddings in one model**
  - Zero GPU, zero Docker, zero self-hosting
  - Already have API key — zero setup cost
  - Flexible dimensions (use 768 for speed, 3072 for quality)
  - 100+ language support
  - 70% latency reduction reported vs separate pipelines
- **Cons**: Public preview (not GA yet), 128s video limit per request (need chunking for longer videos), data sent to Google
- **Example**:
  ```python
  from google import genai
  client = genai.Client()

  # Text embedding
  result = client.models.embed_content(
      model='gemini-embedding-2-preview',
      contents=['Find a red car driving fast']
  )

  # Video embedding (same API!)
  video_file = client.files.upload(file='clip.mp4')
  result = client.models.embed_content(
      model='gemini-embedding-2-preview',
      contents=[video_file]
  )
  ```
- **Links**: [Blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/), [API Docs](https://ai.google.dev/gemini-api/docs/embeddings)
- **Note**: Embedding space is incompatible with `gemini-embedding-001` — requires re-embedding existing data

### Twelve Labs Embed API
- **Modalities**: Video + Text + Audio (purpose-built for video search)
- **Pros**: Best cloud option for video search, handles chunking server-side
- **Cons**: Additional API key, paid service, sends video to third party
- **Link**: [twelve labs.io](https://twelvelabs.io/)

### Voyage AI
- **Modalities**: Text + Image
- **Pros**: High quality embeddings
- **Cons**: No native video, another API dependency

---

## Comparison Matrix

| Model | Video Native | Audio | Image | Local GPU | Cloud API | Ease of Setup | Quality |
|-------|:-----------:|:-----:|:-----:|:---------:|:---------:|:-------------:|:-------:|
| **Gemini Embed 2** | **Yes** | **Yes** | **Yes** | No | **Yes** | **Easiest** | **Best** |
| Cosmos Embed1 | Yes | No | No | Yes | No | Medium (Docker) | Great |
| ImageBind | Yes | **Yes** | Yes | Yes | No | Easy (pip) | Great |
| OpenCLIP | No (frames) | No | Yes | Yes | No | Easy (pip) | Great |
| SigLIP | No (frames) | No | Yes | Yes | No | Easy (pip) | Great |
| Nomic Vision | No (frames) | No | Yes | Yes | No | Easiest | Good |
| Twelve Labs | Yes | Yes | No | No | Yes | Easy (API key) | Best |

---

## Recommended QCut Implementation

### Default & Recommended: Gemini Embedding 2 (Tier 1)
- **This changes everything** — no GPU needed, native video + audio + image + text in one API call
- Already have `GEMINI_API_KEY` — zero additional setup
- Chunk video into ≤128s segments → embed each directly (no frame extraction needed)
- Audio search comes free (native audio embeddings)
- Flexible dimensions: use 768 for speed/storage, 3072 for max quality
- **This is now the clear default choice for QCut**

### Offline / Privacy: ImageBind (Tier 2)
- For users who don't want to send video to Google
- `pip install` — no Docker overhead
- Native video + audio embeddings, runs on consumer GPU
- 5s chunk → single embedding (same pattern as NVIDIA VSS)
- Runs on RTX 3060+ (6GB+ VRAM)

### Enterprise / Self-Hosted: Cosmos Embed1 (Tier 2 — Alternative)
- Docker container with OpenAI-compatible API
- Best quality for pure video-text search when self-hosting
- Requires NVIDIA GPU + Docker Desktop
- Good for users already running local AI infrastructure

### Architecture (Model-Agnostic)

```
User selects embedding provider in Settings
  ↓
EmbeddingProvider interface:
  - embedVideo(chunk: VideoChunk) → float[]
  - embedText(query: string) → float[]
  - embedImage?(frame: ImageBuffer) → float[]  // optional
  - embedAudio?(chunk: AudioChunk) → float[]   // optional
  ↓
Implementations:
  - GeminiEmbedding2Provider   (cloud, ALL modalities — RECOMMENDED)
  - ImageBindEmbeddingProvider (local GPU, video+audio+image+text)
  - CosmosEmbeddingProvider    (local GPU, video+text)
  - TwelveLabsProvider         (cloud, video-native)
```

This abstraction lets QCut swap embedding backends without changing the search pipeline. The chunking, indexing (SQLite + cosine), KNN search, and fusion reranking layers stay the same regardless of provider.

### Why Gemini Embedding 2 Changes the Plan

Previously the recommendation was a complex tiered system because no single cloud API did native video+audio embeddings. Gemini Embedding 2 eliminates that gap:

| Before (pre-March 2026) | After (Gemini Embedding 2) |
|--------------------------|---------------------------|
| Cloud: text-only embeddings, need frame extraction workarounds | Cloud: native video/audio/image/text in one call |
| Need local GPU for video-native embeddings | Cloud API handles video natively |
| ImageBind was the only audio-capable option | Gemini does audio too (80s native) |
| Multiple providers for full coverage | Single provider covers everything |
| Complex chunking: FFmpeg frames → describe → embed text | Simple chunking: FFmpeg split → embed video directly |

The only reason to still offer local GPU options is **privacy** (users who don't want to upload video to Google) and **offline use**.
