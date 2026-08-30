# Jianying Basic Video Local Probes

These probes classify local runtime evidence without treating UI cards, draft fields, or client symbols as algorithm success.

## Components

- `capabilities.ts`: ten-capability manifest and evidence boundaries.
- `native/runtime-probe.mm`: isolated Lens, ByteNN, tracking, and Effect runtime probes.
- `saliency-analysis.ts`: QCut-owned crop and motion analysis for real Saliency masks.
- `saliency-probe.ts`: reproducible crop and motion JSON generation.
- `super-resolution-probe.ts`: fail-closed local-provider discovery.
- `prepare-private-models.ts`: content-addressed, local-only model snapshot preparation.
- `aggregate-report.ts`: ten-capability machine-readable summary.

## Build

```bash
xcrun clang++ -std=c++20 -fobjc-arc -Wall -Wextra -Werror \
  research/jianying-basic-video-probe/native/runtime-probe.mm \
  -framework Foundation -framework Metal -framework OpenGL \
  -o /tmp/qcut-jianying-basic-runtime-probe

xcrun clang++ -std=c++20 -Wall -Wextra -Werror \
  docs/task/jianying-filter-runtime-research/probes/saliency-seg-abi-probe.cpp \
  -o /tmp/qcut-jianying-saliency-probe
```

## Private models

```bash
bun research/jianying-basic-video-probe/prepare-private-models.ts --version 11.3.0
```

The script copies only the ten model artifacts named by the manifest. The snapshot stays under QCut's local `PrivateRuntimes` directory. Evidence output belongs under `.local/jianying-basic-video-probe/`, which is ignored by Git.

Detailed results and limitations are recorded in `docs/task/jianying-video-basic-panel-reference/PROBES.zh-CN.md` and `PROBES.en.md`.
