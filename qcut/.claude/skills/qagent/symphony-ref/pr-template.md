# PR Template

Use this structure for all QCut pull requests.

```markdown
#### Context

<!-- Why is this change needed? Length <= 240 chars -->

#### TL;DR

*<!-- A short description of what we are changing. Use simple language. Assume reader is not familiar with this code. Length <= 120 chars -->*

#### Summary

- <!-- Details of the changes in bullet points -->
- <!-- Keep them high level -->
- <!-- Each item <= 120 chars -->

#### Alternatives

- <!-- What alternatives have been considered? Why not? -->

#### Test Plan

- [ ] `bun run biome:check`
- [ ] `bun run typecheck`
- [ ] <!-- Additional targeted checks -->

#### Related Issues

Closes #<issue-number>
```

## Why This Format

- **Context**: forces you to articulate WHY before WHAT
- **TL;DR**: one-line summary for quick scanning
- **Summary**: bullet points keep it scannable (no walls of text)
- **Alternatives**: shows you thought about other approaches
- **Test Plan**: checklist format makes validation explicit

## Rules

- Context <= 240 chars (be concise)
- TL;DR <= 120 chars (one sentence)
- Summary items <= 120 chars each (high level only)
- Always include Test Plan with at least lint + typecheck
- Always link related issues

*Adapted from [OpenAI Symphony](https://github.com/openai/symphony) PR template*
