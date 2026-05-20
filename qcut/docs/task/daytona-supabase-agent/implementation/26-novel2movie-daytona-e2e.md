# Novel2Movie Daytona E2E

Date: 2026-05-20

## Scope

Real production page / Daytona sandbox E2E for:

```bash
qcut flow novel2movie --novel story.txt --scripts-only
qcut flow novel2movie --novel story.txt --storyboard-only
qcut flow novel2movie --novel story.txt --max-images 5
```

The commands were executed in a production Daytona PTY session, with output
forced under `/tmp/qcut-output` so the website file browser can download it.

## Result

Status: failed before script/storyboard generation.

All three modes reached the `novel2movie` pipeline but failed during LLM-backed
novel segmentation:

```text
LLM call failed: API error 503: {"error":"API key not configured for provider: openrouter"}
```

Even when the command included `--llm-model gemini-3.5-flash`, the Daytona image
still routed the LLM call through `openrouter`. This indicates the online image
is either older than the GMI LLM routing changes or `novel2movie` in that image
does not correctly apply the `--llm-model` override.

## Evidence

Daytona session:

```text
6e5c9efc-0dc0-49b6-8d2e-78cba39320a2
```

Remote evidence folder:

```text
/tmp/qcut-output/novel2movie-e2e-N2M_PTY_1779248464287
```

Local downloaded archive:

```text
output/playwright/novel2movie-daytona-pty-evidence-download/novel2movie-e2e-N2M_PTY_1779248464287.tar
```

Downloaded archive contains:

```text
scripts-only/stdout.log
scripts-only/stderr.log
scripts-only/exit_code.txt
scripts-only/.../summary.json
storyboard-only/stdout.log
storyboard-only/stderr.log
storyboard-only/exit_code.txt
storyboard-only/.../summary.json
max-images-5/stdout.log
max-images-5/stderr.log
max-images-5/exit_code.txt
max-images-5/.../summary.json
```

Exit codes:

```text
scripts-only: 1
storyboard-only: 1
max-images-5: 1
```

Counts from the internal summaries:

```text
scripts-only: script_count=0, total_shots=0, character_count=0
storyboard-only: script_count=0, total_shots=0, character_count=0
max-images-5: script_count=0, total_shots=0, character_count=0
```

## Download Check

The website filesystem download endpoint successfully downloaded the complete
remote evidence folder as a tar archive to local disk. So file/folder download
works for this E2E evidence folder.

## Follow-Up

Fix the deployed Daytona image or `novel2movie` LLM model override so
`--llm-model gemini-3.5-flash` routes to GMI, or use the explicit OpenRouter
alias `--llm-model openrouter-gemini-3.5-flash` after adding
`OPENROUTER_API_KEY` to Supabase/license-server. Then rerun the same three
commands. Once LLM segmentation succeeds, verify:

```text
scripts-only creates scripts/chunk_*.json and zero images
storyboard-only creates storyboard images and zero videos
max-images 5 creates between 1 and 5 images and zero videos
```
