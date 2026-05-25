# Silence Handling / 静音段处理

## Threshold Rules / 阈值规则

| Silence Duration | Action | 处理 |
|-----------------|--------|------|
| <= 0.5s | **Ignore** - Natural pause | **忽略** - 自然停顿 |
| 0.5-1s | **Optional** - Sentence gap | **可选删除** - 句间停顿 |
| > 1s | **Suggest delete** - Obvious stutter or display shot | **建议删除** - 明显卡顿 |

## Output Format / 输出格式

**Mark entire segment, don't split / 整段标记，不拆分**

Example: 3.2s silence → Output 1 entry
```
| 64-66 | 12.86-15.80 | Silence 3.2s | | Delete |
```

User can uncheck items they want to keep in the review webpage.

## Special Cases / 特殊情况

### Long Silence / 长静音
5s+ continuous silence: mark entire segment, pre-select for deletion.

### Opening Silence / 开头静音
Silence at the beginning of the video must be deleted.
