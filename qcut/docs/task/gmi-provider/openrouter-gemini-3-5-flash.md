# OpenRouter Gemini 3.5 Flash

Date: 2026-05-20

## Model

OpenRouter lists Gemini 3.5 Flash as:

```text
google/gemini-3.5-flash
```

QCut now keeps the existing GMI default alias:

```bash
--llm-model gemini-3.5-flash
```

and adds explicit OpenRouter aliases:

```bash
--llm-model openrouter-gemini-3.5-flash
--llm-model or-gemini-3.5-flash
```

This keeps provider selection unambiguous. Use the OpenRouter aliases when
Supabase/license-server has `OPENROUTER_API_KEY` configured or when
`OPENROUTER_API_KEY` is available locally.

## Smoke Command

```bash
qcut flow scene \
  --novel /tmp/qcut-input/story.txt \
  --llm-model openrouter-gemini-3.5-flash \
  -o /tmp/qcut-output/openrouter-gemini-3-5-flash-smoke \
  --json
```

Expected routing:

```text
provider: openrouter
model: google/gemini-3.5-flash
```

## Local Verification

Adapter smoke with the local test key from `~/.qcut/.env`:

```text
model: google/gemini-3.5-flash
content: qcut-openrouter-gemini-3-5-flash-ok
total_tokens: 48
```

CLI smoke:

```bash
set -a
source ~/.qcut/.env
set +a

bun run qcut flow scene \
  --novel /tmp/qcut-input/openrouter-story.txt \
  --llm-model openrouter-gemini-3.5-flash \
  -o /tmp/qcut-output/openrouter-gemini-3-5-flash-smoke \
  --json
```

Result:

```text
status: ok
title: The Hidden Platform
scenes: 1
shots: 3
output: /tmp/qcut-output/openrouter-gemini-3-5-flash-smoke/scenes.json
```

The log first attempted the license-server proxy and received:

```text
API key not configured for provider: openrouter
```

Then it fell back to the local `OPENROUTER_API_KEY` and completed. This confirms
the OpenRouter alias works, while Supabase/license-server still needs an
OpenRouter key for proxy-mode Daytona runs.
