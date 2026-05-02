# BytePlus Seedance 2.0 — Hackathon Notes

## TL;DR

| Question | Answer |
|---|---|
| Does it support real-person photo upload? | **Not directly.** Seedance 2.0 refuses raw uploads of images/videos containing real human faces. Three official workarounds exist (see below). |
| Does it support image-to-video? | Yes — first-frame, first-and-last-frame, and 1-to-9-image reference-to-video. |
| Does it support audio/video references? | Yes (Seedance 2.0 only) — up to 3 reference videos and 3 reference audios per task. |
| Smoke test working? | ✅ Verified 2026-05-02 — text-to-video round-trip in ~110s, 5s 16:9 1080p clip, ~2.2 MB. |

## The face-restriction workarounds (per official docs)

> "Seedance 2.0 series models do not support direct upload of reference images or videos containing real human faces. The following solutions are provided to make it easier for creatives to use portraits."

1. **Reuse a Seedance 2.0 output that already contains a face** — outputs from your account within the last 30 days are trusted as input assets.
2. **Use preset digital characters** — pass an asset ID from the digital character library.
3. **Use authorized real-person assets** — pre-licensed identity packs.

## Files in this folder

| File | Purpose | Committed? |
|---|---|---|
| [README.md](./README.md) | This index | yes |
| [01-quickstart.md](./01-quickstart.md) | How to run the smoke test | yes |
| [02-capabilities.md](./02-capabilities.md) | Modes, limits, language/format/size constraints | yes |
| [03-api-reference.md](./03-api-reference.md) | Verified `tasks.create` request body reference + payload examples per mode | yes |
| [seedance-2-0-quickstart.sh](./seedance-2-0-quickstart.sh) | Original gist (text-to-video) | yes |
| [test-seedance.sh](./test-seedance.sh) | Venv-based smoke test (deps fixed) | yes |
| `api-keys.md` | The four hackathon API keys | **no — gitignored** |
| `.venv/`, `*.mp4` etc. | Test artifacts | **no — gitignored** |

## Sources

- [Create video generation task — official API reference](https://docs.byteplus.com/en/docs/ModelArk/1520757) (primary; field tables, role values, and limits below are extracted verbatim from this page)
- [BytePlus Seedance product page](https://www.byteplus.com/en/product/seedance)
- [Seedance 2.0 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- [BytePlus pricing](https://docs.byteplus.com/en/docs/ModelArk/1544106)
