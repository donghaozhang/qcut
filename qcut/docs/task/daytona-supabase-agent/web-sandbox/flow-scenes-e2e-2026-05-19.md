# Flow Scenes Daytona E2E - 2026-05-19

## Scope

- Page: `https://quriosity.com.au/chat-agent.html`
- Session: `651129dc-b9de-458f-8f40-241b15ca18fd`
- CLI image: `ghcr.io/quriosity-agent/qcut-cli:cli-image-v6-scenes-20260519172916`
- Command under test: `qcut flow scenes --novel /tmp/qcut-input/novel.txt --llm-model gemini-3.1-flash-lite --max-scenes 5 -o /tmp/qcut-output --json`

## Result

Passed. The online Chat Agent page connected to a real Daytona sandbox, ran the `qcut flow scenes` command through Codex, generated `/tmp/qcut-output/scenes.json`, and downloaded the output through the page-backed session file API.

Downloaded result summary:

- `scene_count`: 3
- `shot_count`: 3
- `title`: `The Impossible Train`
- Proof marker: `FLOW_SCENES_DAYTONA_2026-05-19T17-56-39-719Z`

## Evidence

- Result JSON: `output/playwright/flow-scenes-daytona-e2e-2026-05-19T17-56-39-719Z/result.json`
- Downloaded scenes: `output/playwright/flow-scenes-daytona-e2e-2026-05-19T17-56-39-719Z/downloaded-scenes.json`
- Downloaded proof: `output/playwright/flow-scenes-daytona-e2e-2026-05-19T17-56-39-719Z/downloaded-flow-scenes-e2e-proof-2026-05-19T17-56-39-719Z.md`
- Page screenshot: `output/playwright/flow-scenes-daytona-e2e-2026-05-19T17-56-39-719Z/04-files.png`

## Notes

- First harness run timed out because the test script read `file.name`, while the session file API returns filenames under `file.meta.filename`. The Daytona command itself succeeded and the files were downloadable.
- The final clean run removed `/tmp/qcut-output`, wrote a unique proof filename, verified the proof marker after download, and passed.
