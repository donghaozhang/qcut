# BytePlus Seedance 2.0 — Hackathon Notes

## TL;DR

| Question | Answer |
|---|---|
| Does it support real-person photo upload? | **Not directly — verified.** Submit-time refusal `HTTP 400 InputImageSensitiveContentDetected.PrivacyInformation`. Even GAN-synthesized faces are blocked. Three official workarounds exist (see below). |
| Does it support image-to-video? | ✅ Verified 2026-05-02. Non-face first-frame JPEG → 1.5 MB MP4 in ~110s. |
| Does it support audio/video references? | Yes (Seedance 2.0 only) — up to 3 reference videos and 3 reference audios per task. |
| Text-to-video smoke test? | ✅ Verified 2026-05-02 — ~110s, 5s 16:9 1080p, ~2.2 MB. |

## The face-restriction workarounds (per official docs)

> "Seedance 2.0 series models do not support direct upload of reference images or videos containing real human faces. The following solutions are provided to make it easier for creatives to use portraits."

All three resolve to passing an `asset://<asset_id>` URI in `content.image_url.url` (or `video_url.url`):

1. **Reuse a Seedance 2.0 output that already contains a face** — outputs from your account within the last 30 days are trusted as input assets.
2. **Virtual Character Library** — pre-built virtual avatars from the [Model Playground](https://console.byteplus.com/ark/region:ark+ap-southeast-1/experience/vision?modelId=seedance-2-0-260128&tab=GenVideo) (beta — needs ticket activation). See [04-avatar-library.md](./04-avatar-library.md).
3. **Real-Human Asset Library** — onboard a real person via QR-code / face verification consent flow; assets become private to your account. See [04-avatar-library.md](./04-avatar-library.md).

## Files in this folder

| File | Purpose | Committed? |
|---|---|---|
| [README.md](./README.md) | This index | yes |
| [01-quickstart.md](./01-quickstart.md) | How to run the smoke test | yes |
| [02-capabilities.md](./02-capabilities.md) | Modes, limits, language/format/size constraints | yes |
| [03-api-reference.md](./03-api-reference.md) | Verified `tasks.create` request body reference + payload examples per mode | yes |
| [04-avatar-library.md](./04-avatar-library.md) | Avatar / character libraries (virtual + real-human) and `asset://` URI usage | yes |
| [seedance-2-0-quickstart.sh](./seedance-2-0-quickstart.sh) | Original gist (text-to-video) | yes |
| [test-seedance.sh](./test-seedance.sh) | Text-to-video smoke test (venv, deps fixed) | yes |
| [test-seedance-i2v.sh](./test-seedance-i2v.sh) | Image-to-video first-frame smoke test (synthetic moon scene) | yes |
| [test-seedance-i2v-face.sh](./test-seedance-i2v-face.sh) | Face-filter probe (expects refusal) | yes |
| `api-keys.md` | The four hackathon API keys | **no — gitignored** |
| `.venv/`, `*.mp4` etc. | Test artifacts | **no — gitignored** |

## Sources

- [Create video generation task — official API reference](https://docs.byteplus.com/en/docs/ModelArk/1520757) (primary; field tables, role values, and limits below are extracted verbatim from this page)
- [BytePlus Seedance product page](https://www.byteplus.com/en/product/seedance)
- [Seedance 2.0 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- [BytePlus pricing](https://docs.byteplus.com/en/docs/ModelArk/1544106)
