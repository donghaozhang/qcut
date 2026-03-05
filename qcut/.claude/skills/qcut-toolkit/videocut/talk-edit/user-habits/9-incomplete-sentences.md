# Incomplete Sentence Detection / 残句检测

## Definition / 定义

Sentence stops mid-way, followed by silence or a restart.
话说到一半突然停住，后面接了静音或重新开始。

## Core Principle / 核心原则

**Delete entire sentence / 整句删除**: When an incomplete sentence is detected, delete from sentence start to end, not just the trailing words.

## Correct Analysis Method / 正确分析方法

```
Correct: Segment → Judge completeness → Delete entire sentence
Wrong:   Scan words → Find abnormal ending → Only delete ending

✓ 正确：先分句 → 判断完整性 → 整句删除
✗ 错误：逐字扫描 → 发现异常结尾 → 只删结尾
```

### Steps

1. **Split by silence** (silence >= 0.5s as separator)
2. **Judge each sentence's completeness** (semantics, grammar natural?)
3. **Mark entire incomplete sentence for deletion** (from startIdx to endIdx)

## Pattern / 模式

```
Incomplete sentence (entire) + [silence] + Complete sentence
    ↓
  Delete all
```

## Detection Criteria / 判断标准

1. **Sentence is incomplete**: Missing object, predicate, or unnatural ending
2. **Followed by silence**: Usually a noticeable pause after the fragment
3. **Followed by restart**: Speaker begins similar content again

## Difference from Repeated Sentences / 与重复句的区别

- **Repeated sentence**: Both are complete, just share the same beginning → delete shorter
- **Incomplete sentence**: The earlier one is clearly not finished → delete the incomplete one

## Common Mistake / 易错点

```
Bad:  Only delete "the" (abnormal ending)
Good: Delete "why would we do the" (entire incomplete sentence)

❌ 只删异常结尾
✓ 删整个残句
```

**Remember**: The problem isn't just the ending — the entire sentence was never completed, so delete it entirely.
