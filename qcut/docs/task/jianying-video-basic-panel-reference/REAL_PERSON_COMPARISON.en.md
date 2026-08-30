# QCut Ten-Feature Local Video Lab: Real-Person E2E vs Jianying

> Validation date: 2026-08-30  
> Scope: QCut CLI, visible QCut UI, real Jianying UI, and actual exports from both editors  
> Media: two three-second tracks derived from the same real-person footage

## Result

All ten features were exercised on real video. This is not a control-only or unit-test result. QCut's seven pixel-processing features were written through the CLI, read back in the UI, and exported. Its three smart tools ran local MediaPipe person tracking before producing keyframes and exports. Every Jianying case used a separate timeline, real UI actions, and a real export.

The outcome has three levels:

1. **The workflow is connected**: all ten QCut outputs have hashes distinct from their matching baselines; preview, persistence, and export work.
2. **The effect direction is measurable**: denoise, deflicker, motion blur, motion, crop, and tracking produce the expected metric changes.
3. **Model equivalence is not established**: four QCut features are local substitutes for Jianying's named models. Interpolation duration is fixed, but the implementation is still not UMVFI.

The machine probe covers `26` sources, baselines, and effect exports. The darkest frame still has a mean luma of `14.775417`; there are no zero-frame files or full black frames. Every 30 fps QCut and Jianying effect export is now `90` frames / `3.000s`.

## Test Media

| Track | Specification | Features |
| --- | --- | --- |
| `02-real-person-challenge-noisy-3s.mp4` | 360 x 640, 24 fps, 72 frames, 3 s, real person, shake + flicker + temporal noise | stabilization, denoise, deflicker, motion blur, eye correction, super resolution, interpolation |
| `04-real-person-small-clean-3s.mp4` | 360 x 640, 24 fps, 72 frames, 3 s, real person small and left of center | smart motion, smart crop, camera tracking |

The pixel track deliberately retains a `171:176` sample aspect ratio to expose non-square-pixel handling. The smart track uses `1:1` SAR so tracking conclusions are not confounded by geometry.

## Ten-Feature Matrix

Every SSIM value compares an editor's effect export with that editor's own same-source baseline. It is not a direct QCut-to-Jianying pixel score. Lower SSIM means a larger change, not necessarily higher quality.

| Feature | QCut local implementation and result | Jianying run | Assessment |
| --- | --- | --- | --- |
| Stabilization | FFmpeg `deshake`; estimated translation `-5.95%`, SSIM `0.680675` | Real stabilization export, SSIM `0.991019`, subtle change | Workflow passes; not Jianying's stabilizer |
| ByteNN denoise | Actually `hqdn3d`; spatial detail `-1.64%` | UI model explicitly set to Local; detail `-7.73%` | Workflow passes; not ByteNN |
| Deflicker | FFmpeg `deflicker`; frame-luma variation `-59.71%` | Frame-luma variation `-1.17%` | Both act; strengths are not calibrated |
| Optical-flow motion blur | `minterpolate -> tmix -> fps`; detail/temporal difference `-44.84% / -32.61%` | `-61.37% / -52.33%` | Both have a clearly visible blur result |
| Lab eye correction | Local bright-eye and eye-bag reduction, SSIM `0.828571` | Jianying eye correction, SSIM `0.993849` | Similar label, different semantics; QCut does not redirect gaze |
| Lab AI super resolution | Lanczos 2x + unsharp; normalized detail `+0.48%` | Real asynchronous task; detail `+0.08%` | Both export; AI-model and clarity parity are unproven |
| Lab UMVFI interpolation | Actually FFmpeg `minterpolate`; SSIM `0.818902`, `90` frames / `3.000s` | SSIM `0.822099`, `90` frames / `3.000s` | Both preserve duration; QCut is still not the UMVFI model |
| Lab smart motion | MediaPipe 12-sample transform keyframes, SSIM `0.902837` | Enabled switch plus motion preset, SSIM `0.861345` | Both produce obvious camera motion |
| Lab smart crop | MediaPipe subject keyframes, scale `1.138x-1.608x`, SSIM `0.799535` | Explicit `16:9` target, SSIM `0.742241` | Both act; QCut lacks the target-ratio workflow |
| Lab camera tracking | MediaPipe position keyframes, SSIM `0.857374` | Real head tracking with face box and timeline result, SSIM `0.898793` | Both act; Jianying tracks a head while QCut tracks a person box |

## CLI and UI Evidence

The QCut pixel run uses `editor:element:patch`, reads the persisted value back with `editor:timeline:export`, and exports with `editor:export:start --preset tiktok --fps 30 --poll`. The visible UI was also exercised and captured for every feature, then exported once with the combined state as `qcut-ui-combined.mp4`.

The smart-tool run imports the real clip into visible QCut, completes local MediaPipe tracking with `12` samples, `100%` progress, and `ready` status, then produces separate motion, crop, and tracking keyframes. All three exports differ from their same-source baseline.

Jianying results are not inferred from draft fields. Seven pixel features and three smart features were operated in the real app and exported as H.264. The first smart-motion attempt selected a preset without enabling the feature switch; metrics caught its near-baseline `0.999978` SSIM. The corrected run enables the switch first and scores `0.861345`.

## Confirmed Gaps

1. **SAR geometry**: the challenge source uses non-square pixels. QCut exports `1080 x 1920`; Jianying exports `1080 x 1980`. A shared display-dimension policy is required for strict pixel parity.
2. **Model labels**: QCut stabilization, denoise, interpolation, and super resolution are `deshake`, `hqdn3d`, `minterpolate`, and Lanczos + unsharp. They must not be presented as Jianying VAS, ByteNN, UMVFI, or an AI super-resolution model.
3. **Eye semantics**: QCut enhances eye detail but does not perform gaze-to-camera correction. The Lab label and boundary must remain explicit.
4. **Smart-crop semantics**: QCut currently builds subject-centered transform keyframes. Jianying supports a selected target ratio; QCut does not yet expose that workflow.

## Fixes Found by This Run

1. Native CLI export now consumes the full enhancement, portrait, and frame-interpolation snapshot.
2. CLI mutation acknowledgements wait for persistence, preventing exports from reading stale values.
3. Enhancement filters run before final canvas fitting.
4. Contain fitting crops rounding overflow before padding, fixing one-pixel boundary failures.
5. Dynamic transform dimensions round up to chroma-safe even values, fixing the real smart-motion YUV export failure.
6. E2E now retains same-source baselines, hashes, CLI readback JSON, and non-black-pixel gates.
7. Two cloned lookahead frames now precede `minterpolate`, preventing tail-frame loss. E2E uses `ffprobe` to require every QCut output to be `90` frames / `3.000s`.

## Evidence

- [30-second synchronized four-way comparison](./evidence/real-video-matrix/qcut-jianying-feature-comparison.mp4)
- [Ten-feature contact sheet](./evidence/real-video-matrix/qcut-jianying-feature-contact-sheet.png)
- [Machine-readable metrics and media probes](./evidence/real-video-matrix/qcut-jianying-real-video-metrics.json)
- [QCut pixel-feature CLI/UI evidence](./evidence/real-video-matrix/qcut-pixel-matrix-evidence.json)
- [QCut real-person tracking and keyframe evidence](./evidence/real-video-matrix/qcut-smart-tools-evidence.json)
- [QCut combined UI](./evidence/real-video-matrix/20-qcut-ui-combined-features.png)
- [Jianying local denoise UI](./evidence/real-video-matrix/34-jianying-denoise-local-ui.png)
- [Jianying super-resolution completion](./evidence/real-video-matrix/38-jianying-super-resolution-complete.png)
- [Jianying completed smart motion](./evidence/real-video-matrix/43-jianying-smart-motion-clean-ui.png)
- [Jianying 16:9 smart crop](./evidence/real-video-matrix/44-jianying-smart-crop-16x9-clean-ui.png)
- [Jianying real-person head tracking](./evidence/real-video-matrix/45-jianying-face-tracking-clean-ui.png)

## Reproduction

```bash
bun x playwright test apps/web/src/test/e2e/media-lab-real-video-matrix.e2e.ts
bun run research/jianying-basic-video-probe/measure-real-video-matrix.ts
bun run research/jianying-basic-video-probe/build-real-video-comparison.ts
```

The Jianying portion requires the installed real application and the same media, with one independent timeline per screenshot. The metric tool accepts actual exports only; it never treats UI screenshots as pixel-effect proof.
