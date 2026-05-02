# BytePlus Seedance 2.0 — Hackathon Notes

## TL;DR

| Question | Answer |
|---|---|
| Does it support real-person photo upload? | **No.** ByteDance disabled face generation in Seedance 2.0. "Cannot generate videos from images or videos containing real faces." |
| Does it support image-to-video? | Yes — for non-face content (products, scenery, characters, illustrations). |
| Does it support reference-to-video? | Yes — multi-modal references (images, video clips, audio) with role tags. |
| Smoke test working? | ✅ Verified 2026-05-02 — text-to-video round-trip in ~110s, 5s 16:9 1080p clip, ~2.2 MB. |

## Files in this folder

| File | Purpose | Committed? |
|---|---|---|
| [README.md](./README.md) | This index | yes |
| [01-quickstart.md](./01-quickstart.md) | How to run the smoke test | yes |
| [02-capabilities.md](./02-capabilities.md) | Modes, limits, face restriction, pricing | yes |
| [seedance-2-0-quickstart.sh](./seedance-2-0-quickstart.sh) | Original gist (text-to-video) | yes |
| [test-seedance.sh](./test-seedance.sh) | Venv-based smoke test (deps fixed) | yes |
| `api-keys.md` | The four hackathon API keys | **no — gitignored** |
| `.venv/`, `*.mp4` etc. | Test artifacts | **no — gitignored** |

## Sources

- [BytePlus Seedance product page](https://www.byteplus.com/en/product/seedance)
- [BytePlus ModelArk API reference](https://docs.byteplus.com/en/docs/ModelArk/1520757)
- [Seedance 2.0 series tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- [Real-face restriction (gamsgo writeup)](https://www.gamsgo.com/blog/how-to-use-seedance)
- [Pricing/tier rundown (NxCode)](https://www.nxcode.io/resources/news/seedance-2-0-api-guide-pricing-setup-2026)
