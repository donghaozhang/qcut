# Kling V3 Omni & Create Element Integration Guide

> Source: GMI Cloud playground docs, 2026-04-10

## Pricing

**Available Serverless** — Run queries immediately, pay only for usage: **$0.084 per second** (video length based pricing)

| Mode | Video Input | Sound | Price/second |
|------|------------|-------|-------------|
| Standard (std) | No | Off | $0.084 |
| Standard (std) | No | On | $0.112 |
| Standard (std) | Yes | Off | $0.126 |
| Professional (pro) | No | Off | $0.112 |
| Professional (pro) | No | On | $0.14 |
| Professional (pro) | Yes | Off | $0.168 |

When `video_list` is provided, `sound` must be `"off"`.

## Overview

| Model | Model ID | Purpose |
|-------|----------|---------|
| Kling V3 Omni | `kling-v3-omni` | Unified video generation: text-to-video, image-to-video, video editing, multi-shot storyboards, element-driven generation |
| Kling Create Element | `kling-create-element` | Create reusable character/object elements from images or videos for consistent appearances across generations |

These two models work together: create elements with `kling-create-element`, then reference them in `kling-v3-omni` video generation using `element_id` and the `<<<element_1>>>` prompt syntax.

---

## Kling V3 Omni (`kling-v3-omni`)

### Capabilities

- **Text-to-Video**: Generate videos purely from text prompts
- **Image-to-Video**: Use start frame and/or end frame images to guide generation
- **Video Editing**: Edit an existing video (`refer_type: "base"`)
- **Feature Reference**: Use a video as a style/motion reference (`refer_type: "feature"`)
- **Element-Driven**: Reference custom elements for consistent characters/objects
- **Multi-Shot Storyboards**: Create multi-shot videos with per-shot prompts and durations
- **Native Audio**: Optional simultaneous audio generation (`sound: "on"`)

### Core Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Conditional | — | Text prompt (max 2500 chars). Supports `<<<element_1>>>`, `<<<image_1>>>`, `<<<video_1>>>` references. Required when `multi_shot` is false. |
| `mode` | enum | No | `"pro"` | `"std"` (720P, cost-effective) or `"pro"` (1080P, higher quality) |
| `duration` | string | No | `"5"` | Video length in seconds: `"3"` through `"15"`. Ignored when using video editing (`refer_type: "base"`). |
| `aspect_ratio` | enum | No | — | `"16:9"`, `"9:16"`, or `"1:1"`. Required when not using first-frame reference or video editing. |
| `sound` | enum | No | `"off"` | `"on"` or `"off"`. Must be `"off"` when `video_list` is provided. |

### Image & Video Input Parameters

#### `image_list` (json, optional)

Reference image list. Images can serve as start/end frames or as element/scene/style references.

- Types: `"first_frame"`, `"end_frame"` (end frame requires a first frame)
- Formats: `.jpg/.jpeg/.png`, max 10MB, min 300px, aspect ratio 1:2.5–2.5:1

```json
"image_list": [
    {
        "image_url": "https://storage.example.com/start.jpg",
        "type": "first_frame"
    },
    {
        "image_url": "https://storage.example.com/end.jpg",
        "type": "end_frame"
    }
]
```

#### `video_list` (json, optional)

Reference video. When `video_list` is provided, `sound` must be `"off"`.

- `refer_type`: `"base"` (video editing) or `"feature"` (style/motion reference)
- `keep_original_sound`: `"yes"` or `"no"`
- Formats: `.mp4/.mov`, 3–10s, 720–2160px, 24–60fps, max 200MB

```json
"video_list": [
    {
        "video_url": "https://storage.example.com/clip.mp4",
        "refer_type": "base",
        "keep_original_sound": "yes"
    }
]
```

#### `element_list` (json, optional)

Reference elements. Supports three formats that can be mixed in the same list:

**Mode 1 — Existing elements (by ID):**

```json
"element_list": [
    {
        "element_id": "123456"
    }
]
```

**Mode 2 — Inline image elements (auto-created):**

```json
"element_list": [
    {
        "frontal_image": "https://storage.example.com/front.jpg",
        "refer_images": [
            "https://storage.example.com/side.jpg",
            "https://storage.example.com/closeup.jpg"
        ]
    }
]
```

**Mode 3 — Inline video elements (auto-created):**

```json
"element_list": [
    {
        "refer_videos": [
            "https://storage.example.com/character-clip.mp4"
        ]
    }
]
```

Optional fields for inline elements: `element_name`, `element_description`, `tag_list`, `element_voice_id`. If `element_name` or `element_description` are omitted, they are auto-generated.

### Multi-Shot Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `multi_shot` | boolean | No | `true` to enable multi-shot mode. When true, `prompt` is ignored; use `multi_prompt` instead. |
| `shot_type` | enum | No | `"customize"`. Required when `multi_shot` is true. |

#### `multi_prompt` (json, optional)

Per-shot storyboard info. Up to 6 shots, each prompt max 512 chars. Shot durations must sum to total duration.

```json
"multi_prompt": [
    {
        "index": 1,
        "prompt": "Wide establishing shot of a medieval castle at sunrise",
        "duration": "5"
    },
    {
        "index": 2,
        "prompt": "Close-up of a knight drawing a sword",
        "duration": "5"
    }
]
```

### Other Parameters

#### `watermark_info` (json, optional)

```json
"watermark_info": {
    "enabled": true
}
```

### Limits on Combined References

| Scenario | Max images + elements |
|----------|----------------------|
| No reference video | 7 |
| With reference video | 4 (video elements not supported) |
| With first/last frame video | 3 elements |
| More than 2 images | End frame not supported |

---

## Submit Request Examples

All examples use `POST /requests` with:

```json
{
    "model": "kling-v3-omni",
    "payload": { ... }
}
```

### 1. Text-to-Video (Basic)

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "A golden retriever running through a sunlit meadow in slow motion, cinematic lighting",
        "mode": "pro",
        "duration": "5",
        "aspect_ratio": "16:9",
        "sound": "off"
    }
}
```

### 2. Text-to-Video with Native Audio

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "A street musician playing acoustic guitar in a busy European square, ambient city sounds and guitar melody",
        "mode": "std",
        "duration": "10",
        "aspect_ratio": "9:16",
        "sound": "on"
    }
}
```

### 3. Image-to-Video (First Frame Only)

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "Camera slowly zooms out to reveal the full landscape, clouds drifting across the sky",
        "mode": "pro",
        "duration": "8",
        "sound": "off",
        "image_list": [
            {
                "image_url": "https://storage.example.com/landscape.jpg",
                "type": "first_frame"
            }
        ]
    }
}
```

### 4. Image-to-Video (First Frame + End Frame)

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "Smooth transition from day to night over a city skyline, lights gradually turning on",
        "mode": "pro",
        "duration": "5",
        "sound": "off",
        "image_list": [
            {
                "image_url": "https://storage.example.com/skyline-day.jpg",
                "type": "first_frame"
            },
            {
                "image_url": "https://storage.example.com/skyline-night.jpg",
                "type": "end_frame"
            }
        ]
    }
}
```

### 5. Video Editing (`refer_type: "base"`)

Output duration matches the input video. Sound must be `"off"`.

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "Add falling snow and a cool blue color grading to the scene",
        "mode": "pro",
        "aspect_ratio": "16:9",
        "sound": "off",
        "video_list": [
            {
                "video_url": "https://storage.example.com/original-clip.mp4",
                "refer_type": "base",
                "keep_original_sound": "yes"
            }
        ]
    }
}
```

### 6. Feature Reference Video

Use a video as a style/motion reference (not for editing).

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "A dancer performing the same choreography in a futuristic neon environment",
        "mode": "pro",
        "duration": "5",
        "aspect_ratio": "16:9",
        "sound": "off",
        "video_list": [
            {
                "video_url": "https://storage.example.com/dance-reference.mp4",
                "refer_type": "feature",
                "keep_original_sound": "no"
            }
        ]
    }
}
```

### 7. Element-Driven Generation

Reference a custom element using `<<<element_N>>>` syntax where N corresponds to the order in `element_list`.

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> walking through a neon-lit cyberpunk city at night, rain reflecting on the street",
        "mode": "pro",
        "duration": "8",
        "aspect_ratio": "16:9",
        "sound": "on",
        "element_list": [
            {
                "element_id": "123456"
            }
        ]
    }
}
```

### 8. Multiple Elements

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> and <<<element_2>>> sitting across from each other at a cafe, talking and laughing",
        "mode": "pro",
        "duration": "10",
        "aspect_ratio": "16:9",
        "sound": "on",
        "element_list": [
            {
                "element_id": "123456"
            },
            {
                "element_id": "789012"
            }
        ]
    }
}
```

### 9. Element + First Frame Image

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> standing in front of the building, then turns and walks inside",
        "mode": "pro",
        "duration": "6",
        "sound": "off",
        "image_list": [
            {
                "image_url": "https://storage.example.com/building-entrance.jpg",
                "type": "first_frame"
            }
        ],
        "element_list": [
            {
                "element_id": "123456"
            }
        ]
    }
}
```

### 10. Element + Feature Reference Video

Combined images + elements must not exceed 4 when a video is present.

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> performing the same dance moves as the reference video on a rooftop",
        "mode": "std",
        "duration": "5",
        "aspect_ratio": "1:1",
        "sound": "off",
        "video_list": [
            {
                "video_url": "https://storage.example.com/dance-reference.mp4",
                "refer_type": "feature",
                "keep_original_sound": "no"
            }
        ],
        "element_list": [
            {
                "element_id": "123456"
            }
        ]
    }
}
```

### 11. Multi-Shot Storyboard

Shot durations must sum to total `duration`.

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "mode": "pro",
        "duration": "15",
        "aspect_ratio": "16:9",
        "sound": "off",
        "multi_shot": true,
        "shot_type": "customize",
        "multi_prompt": [
            {
                "index": 1,
                "prompt": "Wide establishing shot of a medieval castle at sunrise",
                "duration": "5"
            },
            {
                "index": 2,
                "prompt": "Close-up of a knight drawing a sword from its scabbard",
                "duration": "4"
            },
            {
                "index": 3,
                "prompt": "The knight charges on horseback across an open field",
                "duration": "6"
            }
        ]
    }
}
```

### 12. Multi-Shot with Elements

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "mode": "pro",
        "duration": "10",
        "aspect_ratio": "16:9",
        "sound": "on",
        "multi_shot": true,
        "shot_type": "customize",
        "multi_prompt": [
            {
                "index": 1,
                "prompt": "<<<element_1>>> walking into a coffee shop, looking around",
                "duration": "5"
            },
            {
                "index": 2,
                "prompt": "<<<element_1>>> sitting down at a window table, smiling",
                "duration": "5"
            }
        ],
        "element_list": [
            {
                "element_id": "123456"
            }
        ]
    }
}
```

### 13. Inline Image Element (Auto-Created)

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> walking through a garden at sunset",
        "mode": "pro",
        "duration": "5",
        "aspect_ratio": "16:9",
        "sound": "off",
        "element_list": [
            {
                "element_name": "My Character",
                "element_description": "Woman in a blue dress with long hair",
                "frontal_image": "https://storage.example.com/character-front.jpg",
                "refer_images": [
                    "https://storage.example.com/character-side.jpg",
                    "https://storage.example.com/character-back.jpg"
                ]
            }
        ]
    }
}
```

### 14. Inline Video Element (Auto-Created)

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> giving a speech on stage",
        "mode": "pro",
        "duration": "8",
        "aspect_ratio": "16:9",
        "sound": "on",
        "element_list": [
            {
                "element_name": "Speaker",
                "refer_videos": [
                    "https://storage.example.com/speaker-clip.mp4"
                ]
            }
        ]
    }
}
```

### 15. Mixed Existing and Inline Elements

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> and <<<element_2>>> meeting at a train station",
        "mode": "pro",
        "duration": "10",
        "aspect_ratio": "16:9",
        "sound": "off",
        "element_list": [
            {
                "element_id": "123456"
            },
            {
                "frontal_image": "https://storage.example.com/new-character-front.jpg",
                "refer_images": [
                    "https://storage.example.com/new-character-side.jpg"
                ]
            }
        ]
    }
}
```

### 16. Watermark Enabled

```json
{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "Aerial drone shot of a tropical island surrounded by turquoise water",
        "mode": "std",
        "duration": "5",
        "aspect_ratio": "16:9",
        "sound": "off",
        "watermark_info": {
            "enabled": true
        }
    }
}
```

---

## Kling Create Element (`kling-create-element`)

### Overview

Create reusable custom elements (characters, animals, items, costumes, scenes, effects) that can be referenced in Kling V3 Omni video generation. Elements maintain consistent appearance across multiple generations.

| Method | `reference_type` | Input | Notes |
|--------|-----------------|-------|-------|
| Multi-Image Element | `"image_refer"` | 1 frontal image + 1–3 additional reference images | Broader availability across models |
| Video Character Element | `"video_refer"` | 1 reference video (3–8s) | Audio with human voice triggers voice customization |

### Core Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element_name` | string | Yes | Element name, max 20 characters |
| `element_description` | string | Yes | Element description, max 100 characters |
| `reference_type` | enum | Yes | `"image_refer"` or `"video_refer"` |

### Image Reference Parameters (`reference_type: "image_refer"`)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `frontal_image` | image | Yes | Frontal reference image URL. `.jpg/.jpeg/.png`, max 10MB, min 300px, aspect ratio 1:2.5–2.5:1 |
| `refer_images` | image[] | Yes | 1–3 additional reference images from different angles. Same format constraints |

### Video Reference Parameters (`reference_type: "video_refer"`)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `refer_video` | video | Yes | Reference video URL. `.mp4/.mov`, 1080P, 3–8 seconds, 16:9 or 9:16, max 200MB. Audio with human voice triggers voice customization |

### Optional Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `element_voice_id` | string | No | Bind an existing voice from the voice library. Only for video-customized elements |

#### `tag_list` (json, optional)

| Tag ID | Name |
|--------|------|
| `o_101` | Hottest |
| `o_102` | Character |
| `o_103` | Animal |
| `o_104` | Item |
| `o_105` | Costume |
| `o_106` | Scene |
| `o_107` | Effect |
| `o_108` | Others |

```json
"tag_list": [
    { "tag_id": "o_102" },
    { "tag_id": "o_105" }
]
```

### Create Element Examples

#### 1. Image Reference — Character

```json
{
    "model": "kling-create-element",
    "payload": {
        "element_name": "Detective Sarah",
        "element_description": "Female detective in a brown trench coat with short black hair",
        "reference_type": "image_refer",
        "frontal_image": "https://storage.example.com/sarah-front.jpg",
        "refer_images": [
            "https://storage.example.com/sarah-side.jpg",
            "https://storage.example.com/sarah-closeup.jpg"
        ],
        "tag_list": [{ "tag_id": "o_102" }]
    }
}
```

#### 2. Image Reference — Animal

```json
{
    "model": "kling-create-element",
    "payload": {
        "element_name": "Pixel the Cat",
        "element_description": "Orange tabby cat with green eyes and a red collar",
        "reference_type": "image_refer",
        "frontal_image": "https://storage.example.com/pixel-front.jpg",
        "refer_images": [
            "https://storage.example.com/pixel-sitting.jpg",
            "https://storage.example.com/pixel-playing.jpg",
            "https://storage.example.com/pixel-sleeping.jpg"
        ],
        "tag_list": [{ "tag_id": "o_103" }]
    }
}
```

#### 3. Video Reference — Character with Voice

```json
{
    "model": "kling-create-element",
    "payload": {
        "element_name": "Actor James",
        "element_description": "Male actor in his 30s with beard and glasses, casual style",
        "reference_type": "video_refer",
        "refer_video": "https://storage.example.com/james-clip.mp4",
        "tag_list": [{ "tag_id": "o_102" }]
    }
}
```

---

## End-to-End Workflow

### Step 1: Create a character element

```json
POST /requests

{
    "model": "kling-create-element",
    "payload": {
        "element_name": "Chef Maria",
        "element_description": "Female chef with a white hat and apron, warm smile",
        "reference_type": "image_refer",
        "frontal_image": "https://storage.example.com/maria-front.jpg",
        "refer_images": [
            "https://storage.example.com/maria-cooking.jpg",
            "https://storage.example.com/maria-profile.jpg"
        ],
        "tag_list": [{ "tag_id": "o_102" }]
    }
}
```

### Step 2: Poll until element is created

Poll `GET /requests/{request_id}` until `status` is `"success"`. The `outcome` contains the `element_id`.

### Step 3: Generate video with the element

```json
POST /requests

{
    "model": "kling-v3-omni",
    "payload": {
        "prompt": "<<<element_1>>> cooking pasta in a rustic Italian kitchen, steam rising from the pot, warm lighting",
        "mode": "pro",
        "duration": "8",
        "aspect_ratio": "16:9",
        "sound": "on",
        "element_list": [
            { "element_id": "987654" }
        ]
    }
}
```

### Step 4: Retrieve the generated video

Poll `GET /requests/{request_id}` until `status` is `"success"`. The outcome contains:

```json
{
    "media_urls": [
        { "id": "0", "url": "https://..." }
    ],
    "thumbnail_image_url": "https://..."
}
```
