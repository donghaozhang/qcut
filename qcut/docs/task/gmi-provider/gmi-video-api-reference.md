# GMI Cloud Video API Reference

> Fetched from GMI docs on 2026-04-10. Source: docs.gmicloud.ai

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/ie/requestqueue/apikey/models` | GET | List available models |
| `/api/v1/ie/requestqueue/apikey/models/{model-id}` | GET | Get model schema/parameters |
| `/api/v1/ie/requestqueue/apikey/requests` | POST | Submit video generation job |
| `/api/v1/ie/requestqueue/apikey/requests/{request_id}` | GET | Poll job status and retrieve results |

**Base URL:** `https://console.gmicloud.ai`

**Auth:** `Authorization: Bearer {GMI_API_KEY}` (optional: `X-Organization-ID: {GMI_ORG_ID}`)

## Available Video Models

From the models endpoint and playground:

| Model ID | Name | Modes |
|----------|------|-------|
| `Kling-Text2Video-V2.1-Master` | Kling V2.1 Master | Text-to-Video |
| `Kling-Image2Video-V2.1-Master` | Kling V2.1 Master | Image-to-Video |
| `Kling-Video-3O` (V3 Omni) | Kling V3 Omni | Text-to-Video, Image-to-Video, Video Editing, Multi-shot Storyboard, Element-driven |
| `Veo3` | Google Veo 3 | Text-to-Video, Image-to-Video |
| `Veo3-Fast` | Google Veo 3 Fast | Text-to-Video, Image-to-Video |
| `Luma-Ray2` | Luma Ray 2 | Text-to-Video |
| `Wan-AI_Wan2.1-T2V-14B` | Wan 2.1 T2V | Text-to-Video |

## Request Format

### Submit a Job

```bash
curl -X POST "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests" \
  -H "Authorization: Bearer $GMI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Veo3",
    "payload": {
      "prompt": "A cat walking on a beach at sunset",
      "durationSeconds": "8",
      "aspectRatio": "16:9",
      "negativePrompt": "blurry, low quality, distorted",
      "personGeneration": "allow_adult",
      "seed": null
    }
  }'
```

**Response:**
```json
{
  "request_id": "uuid",
  "model": "Veo3",
  "status": "dispatched",
  "created_at": 1234567890,
  "updated_at": 1234567890,
  "queued_at": 1234567890
}
```

### Poll Job Status

```bash
curl "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $GMI_API_KEY"
```

**Status values:** `created` → `queued` → `dispatched` → `processing` → `success` | `failed` | `cancelled`

**Completed response:**
```json
{
  "request_id": "uuid",
  "model": "Veo3",
  "status": "success",
  "payload": { "..." },
  "outcome": {
    "thumbnail_image_url": "https://...",
    "video_url": "https://..."
  },
  "created_at": 1234567890
}
```

## Model-Specific Parameters

### Veo3 / Veo3-Fast

```json
{
  "prompt": "string (required)",
  "durationSeconds": "string (e.g. '8')",
  "aspectRatio": "string (e.g. '16:9')",
  "negativePrompt": "string",
  "personGeneration": "string (e.g. 'allow_adult')",
  "seed": "number | null"
}
```

### Kling V3 Omni (Kling-Video-3O)

Unified model supporting multiple modes:
- Text-to-Video
- Image-to-Video
- Video Editing
- Multi-shot Storyboard
- Element-driven Generation

> **Note:** Exact parameter schema not available in public docs. Use the model schema endpoint to fetch: `GET /api/v1/ie/requestqueue/apikey/models/Kling-Video-3O`

### Wan 2.1 T2V

```json
{
  "prompt": "string (required)",
  "video_length": "number (seconds)",
  "negative_prompt": "string",
  "cfg_scale": "number (e.g. 7.5)",
  "seed": "number"
}
```

## File Input Methods

| Method | Usage | Best For |
|--------|-------|----------|
| Data URI | `data:image/png;base64,...` | Small files |
| Hosted URL | `https://...` | Publicly accessible images |
| Upload API | Returns reusable URL | Large files (limited SDK support) |

## Rate Limits

Video models use **RPH (Requests per Hour)** limits at the organization level.

| Tier | Purchase Amount | Activation |
|------|-----------------|------------|
| Tier 1 | $0 | Immediate |
| Tier 2 | $5 | 24 hours |
| Tier 3 | $50 | 24 hours |
| Tier 4 | $200 | 24 hours |
| Tier 5 | $1,000 | 24 hours |

> Specific RPH limits per video model were not listed in the docs. For LLM models, Tier 1 starts at 100K TPM.

## LLM Serverless Pricing (for reference)

| Model Tier | Input (per 1M tokens) | Output (per 1M tokens) |
|------------|----------------------|------------------------|
| Budget (Qwen3 32B, etc.) | $0.07–$0.10 | $0.28–$0.60 |
| Mid-Range (DeepSeek V3.2, Llama 70B) | $0.25–$0.27 | $0.75–$1.00 |
| Premium (GLM-4.6, Kimi-K2, GPT-5.4) | $0.60–$1.00 | $2.00–$3.00 |

## Video Pricing

> **Not documented** in public GMI docs as of 2026-04-10. Video pricing is likely usage-based per request. Check the GMI Cloud console billing page for current rates.

## Sources

- [Video API Reference](https://docs.gmicloud.ai/inference-engine/api-reference/video-api-reference)
- [Video SDK Reference](https://docs.gmicloud.ai/inference-engine/api-reference/video-sdk-reference)
- [Rate Limits](https://docs.gmicloud.ai/inference-engine/api-reference/rate-limit)
- [Pricing](https://docs.gmicloud.ai/inference-engine/billing/price)
