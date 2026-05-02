# Seedance 2.0 — Capabilities, Limits, and the Face Restriction

> **Verification status:** the text-to-video payload (`content=[{"type": "text", ...}]`) is confirmed against the live API. The image/reference payloads below are reconstructed from third-party guides (NxCode, gamsgo) and have **not** been verified end-to-end against the official BytePlus SDK from this repo. Treat the JSON shapes as a starting point; cross-check with the official BytePlus reference before shipping.

## The face restriction (read this first)

ByteDance disabled face generation for Seedance 2.0 after privacy pushback at the late-March 2026 CapCut launch:

> Cannot generate videos from images or videos containing real faces.
> — [gamsgo writeup, April 2026](https://www.gamsgo.com/blog/how-to-use-seedance)

What this means in practice:

- **Don't** upload a real-person photo and ask for "this person doing X." It will refuse or produce a non-face output.
- **Do** use product shots, environments, illustrated/anime characters, mascots, animals, scenery.
- For real-person workflows, you need a different stack (LoRA-trained Stable Video Diffusion, Runway Gen-4, or older Seedance 1.x variants — verify their current TOS).

## Three input modes

BytePlus exposes Seedance 2.0 through three quality tiers (Fast / Standard / Pro) and three input modes:

| Mode | Inputs | Use case |
|---|---|---|
| Text-to-video | prompt | Pure generation from a description |
| Image-to-video | prompt + 1 image | Animate a still |
| Reference-to-video | prompt + ≤9 images, ≤2 video clips, ≤1 audio | Composed scene with role-tagged references |

References are tagged inline in the prompt (`@Image1`, `@Video1`, `@Audio1`).

## Input limits

| Input | Format | Per-item cap | Total cap |
|---|---|---|---|
| Image | JPEG / PNG / WebP / BMP / TIFF / GIF | 30 MB | 9 images |
| Video clip | MP4 / MOV | 50 MB, 2–15 s | (counted in total clip duration) |
| Audio | MP3 / WAV | 15 MB, ≤15 s | 1 file |

## Generation parameters

| Parameter | Range | Notes |
|---|---|---|
| `resolution` | 480p / 720p / 1080p / 2K | Picks the pricing tier |
| `duration` | 4–15 s | 5 s is the verified default |
| `aspect_ratio` | 16:9 / 9:16 / 1:1 / 4:3 | Confirmed: `ratio="16:9"` in SDK |
| `audio` | bool | Auto-generate background audio |

## Pricing (third-party estimate)

| Tier | Resolution | Per-second | 5-second clip |
|---|---|---|---|
| Fast | 720p | $0.01–$0.02 | ~$0.05–$0.10 |
| Standard | 1080p | $0.05–$0.10 | ~$0.25–$0.50 |
| Pro | 2K | $0.10–$0.15 | ~$0.50–$0.75 |

Source: NxCode 2026 guide — confirm against the official [BytePlus pricing page](https://docs.byteplus.com/en/docs/ModelArk/1544106) before committing budget.

## Image-to-video — payload sketch (UNVERIFIED)

The official BytePlus SDK uses `client.content_generation.tasks.create(content=[...])`. The text item shape we know works:

```python
content = [{"type": "text", "text": "cat walk on the moon"}]
```

For image input, third-party docs describe a `references` array on the request body with `{type, data, role}` triples. The exact field name in the official ModelArk SDK may instead be `image_url` inside the `content` array (common pattern in OpenAI-compatible BytePlus endpoints). **Test both shapes against the live API before relying on either.**

Pattern A — `content` array with image entries:

```python
content = [
    {"type": "text", "text": "the subject dances in a neon-lit alley"},
    {"type": "image_url", "image_url": {"url": "https://.../subject.jpg"}},
]
```

Pattern B — separate `references` array (third-party docs):

```python
references = [
    {"type": "image", "data": "<base64>", "role": "subject"},
    {"type": "image", "data": "<base64>", "role": "environment"},
]
```

Reference roles documented by NxCode: `subject`, `environment`, `motion`, `audio`.

## What to verify before shipping image inputs

1. The exact `content` / `references` field name on `tasks.create` for `dreamina-seedance-2-0-260128`.
2. URL vs. base64 acceptance (and any URL-host allowlist).
3. Whether the face-detection refusal returns a hard `failed` status with a specific error code, or silently substitutes a face.
4. Latency at 1080p / 2K vs. the 720p smoke test (~110s).

## Sources

- [BytePlus Seedance product page](https://www.byteplus.com/en/product/seedance)
- [BytePlus ModelArk API reference](https://docs.byteplus.com/en/docs/ModelArk/1520757)
- [Real-face restriction (gamsgo)](https://www.gamsgo.com/blog/how-to-use-seedance)
- [Tier and payload rundown (NxCode)](https://www.nxcode.io/resources/news/seedance-2-0-api-guide-pricing-setup-2026)
