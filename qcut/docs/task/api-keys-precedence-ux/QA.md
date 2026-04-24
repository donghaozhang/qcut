# API Keys Precedence UX QA

- [ ] No env vars, no app store, no CLI -> every field shows `not set`, no warnings, no badge.
- [ ] Only app store set -> `app` badge, no warning.
- [ ] env + app both set -> `env` badge, `Fallback value` tag, warning row on typing.
- [ ] app + cli both set -> `app` badge; no warning, because the saved app-tier value is active and lower-priority shadows are intentionally not surfaced.
- [ ] Save with shadowed field -> toast fires once per save, not per field.
- [ ] Collapsed precedence info remains collapsed on panel reopen; no sticky expanded state yet, acceptable for v1.
- [ ] Keyboard nav: explainer toggle is reachable via Tab, Enter expands.
- [ ] All eight supported fields load, save, and keep their source badges: FAL, Freesound, Gemini, OpenRouter, Anthropic, ElevenLabs, GMI, Runway.

## Gates

- [ ] `bun lint:clean`
- [ ] `bun check-types`
- [ ] `bun run test`
- [ ] `bun run test:e2e:bg`
