# Video Review Agent CLI Implementation

## What Changed

The QCut CLI now has a productized video review path:

```bash
qcut analyze video \
  -i /tmp/qcut-input/sample.mp4 \
  --analysis-type review \
  --review-language zh \
  --json \
  -o /tmp/qcut-output
```

This uses the existing video analysis model path, but swaps in the review-agent prompt contract and writes user-facing artifacts under the selected output directory.

## Prompt Source

Prompt templates are tracked in the NexusAI website submodule:

```text
packages/nexusai-website/prompts/video-review-agent/
├── 00-master-video-review-agent-prompt.en.md
├── 00-master-video-review-agent-prompt.zh.md
├── 01-shot-editing-prompt.en.md
├── 01-shot-editing-prompt.zh.md
├── 02-lip-sync-audio-prompt.en.md
├── 02-lip-sync-audio-prompt.zh.md
├── 03-expression-face-prompt.en.md
├── 03-expression-face-prompt.zh.md
├── 04-body-motion-prompt.en.md
├── 04-body-motion-prompt.zh.md
├── 05-pacing-duration-prompt.en.md
├── 05-pacing-duration-prompt.zh.md
├── 06-visual-artifact-prompt.en.md
├── 06-visual-artifact-prompt.zh.md
├── 07-eyeline-prompt.en.md
├── 07-eyeline-prompt.zh.md
├── 08-lighting-color-prompt.en.md
├── 08-lighting-color-prompt.zh.md
├── 09-other-prompt.en.md
└── 09-other-prompt.zh.md
```

Runtime prompt loading checks `--review-prompt-dir`, then `QCUT_VIDEO_REVIEW_PROMPT_DIR`, then the default repository path. If prompt files are unavailable, the CLI falls back to embedded prompt text so packaged or sandboxed runs still work.

## Output Contract

For `--analysis-type review`, the CLI writes:

| File | Purpose |
| --- | --- |
| `review-comments.json` | Canonical structured review comments. |
| `review-comments.csv` | Spreadsheet-friendly export. |
| `review-feedback-browser.html` | Full comment browser. |
| `review-feedback-summary.html` | Category summary page. |
| `review-agent-report.md` | Human-readable run summary. |
| `review-agent-prompts/` | Prompt markdown files used by the run. |
| `raw-analysis.json` | Parsed and raw model output for debugging. |

Malformed model JSON no longer drops the run on the floor. The CLI keeps `raw-analysis.json`, emits empty comments, and preserves the parse error for diagnosis.

## Verification

Commands run:

```bash
bunx vitest run electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts
bun x tsc -p electron/tsconfig.json --noEmit
bunx biome check electron/native-pipeline/video-review electron/native-pipeline/cli/cli-handlers-media.ts electron/native-pipeline/cli/cli.ts electron/native-pipeline/cli/command-registry.ts electron/native-pipeline/cli/cli-runner/types.ts electron/native-pipeline/cli/__tests__/cli-handlers-media-review.test.ts packages/nexusai-website/prompts/video-review-agent
```

