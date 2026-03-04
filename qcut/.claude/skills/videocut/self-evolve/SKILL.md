---
name: videocut-self-evolve
description: Self-evolving skills. Record user feedback, update methodology and rules. Triggers: update rules, record feedback, improve skill, 更新规则, 记录反馈, 改进skill
---

# Self-Evolve

> Let the Agent learn from mistakes and continuously improve

## Quick Start

```
User: Record the issue we just had
User: Update the speech error detection rules
User: Remember this lesson
User: 记录一下刚才的问题
User: 更新口误识别的规则
```

## Update Locations

| Content Type | Target File | Example |
|-------------|-------------|---------|
| User profile | `CLAUDE.md` | Preferences, habits |
| Methodology + feedback | `*/tips/*.md` | Rules, lessons |

## Flow

```
User triggers ("that just failed", "record this")
    ↓
[Auto] Trace back context, find the problem
    ↓
[Auto] Read target file fully, understand structure
    ↓
[Auto] Integrate into the appropriate section (not just append!)
    ↓
[Auto] Feedback log only records events, doesn't repeat rules
    ↓
Report update results
```

**Key**: Don't ask "what's the problem" — analyze from context directly!

## Update Principles

### Bad: Append to the end

```markdown
## Feedback Log
### 2026-01-14
- Lesson: Must generate deletion task list at end of review
- Lesson: Confirm errors and silence separately
```

Only adding to feedback log = rules scattered at the bottom, will repeat mistakes.

### Good: Integrate into body

1. **Read full file**, understand section structure
2. **Find the right section**, integrate the rule
3. **Feedback log only records events**: `- Review marked silence, but missed during cut`

```markdown
## IV. Review Format
(Add deletion task list template)

## V. Confirmation & Execution Flow  ← Add this section if missing
(Add separate confirmation for errors and silence)

## Feedback Log
### 2026-01-14
- Review marked silence, but missed during cut (only cut errors)
```

## Trigger Conditions

- User corrects AI mistakes
- User says "remember this", "watch out for this in the future"
- A new general pattern is discovered

## Anti-patterns

### 2026-01-13
```
Bad:
User: That just failed, update the skills
AI: What problem did you find?  ← Should NOT ask!

Good:
AI: [Auto trace back context, find failure point]
AI: [Execute update]
```

### 2026-01-14
```
Bad:
AI: Updated. Added 3 lessons to feedback log  ← Only appended!

Good:
AI: [Read full file, understand structure]
AI: [Integrate into appropriate sections]
AI: [Feedback log only records events]
AI: Updated: Added Chapter V "Confirmation Flow", updated Chapter IV template
```

**Principle**: Rules must be integrated into the body; feedback log is just an event journal.
