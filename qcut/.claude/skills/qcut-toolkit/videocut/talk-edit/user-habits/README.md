# User Habits / 用户习惯

User preferences for AI review reference.

## Files

| File | Type | Content |
|------|------|---------|
| 1-core-principles.md | Principle | Delete earlier, keep later |
| 2-filler-words.md | Preference | um, uh, er + deletion boundaries |
| 3-silence-handling.md | Threshold | <=0.5s ignore, 0.5-1s optional, >1s suggest delete |
| 4-repeated-sentences.md | Preference | Adjacent sentences with >=5 char shared prefix, delete shorter |
| 5-stutter-words.md | Preference | Repeated phrases like "that that", "so so" |
| 6-in-sentence-repeat.md | Preference | A + filler + A pattern |
| 7-consecutive-fillers.md | Preference | Consecutive filler words |
| 8-self-correction.md | Preference | Partial repeat, negation correction, interrupted words |
| 9-incomplete-sentences.md | Preference | Sentence cut off mid-way |

## AI Review Priority

1. **Silence >1s** → Suggest delete (split by 1s chunks)
2. **Incomplete sentence** → Delete (cut off mid-way + silence)
3. **Repeated sentence** → Delete shorter (>=5 char shared prefix)
4. **In-sentence repeat** → Delete A + filler (A + filler + A pattern)
5. **Stutter words** → Delete earlier ("that that" → keep last)
6. **Self-correction** → Delete earlier (partial repeat, negation correction)
7. **Filler words** → Mark for manual review (um, uh, er)

## Core Principle

**Delete earlier, keep later**: The later version is usually more complete. Delete the earlier attempt, keep the later one.
