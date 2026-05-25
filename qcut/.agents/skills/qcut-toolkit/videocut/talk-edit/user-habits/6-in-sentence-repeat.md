# In-Sentence Repeat Detection / 句内重复检测

## Definition / 定义

Within the same sentence, phrase A appears twice with 1-3 words in between.
同一句内，短语 A 重复出现，中间夹杂 1-3 个字。

## Pattern / 模式

```
A + filler words + A
A + 中间字 + A
```

## Examples / 案例

| Original | Pattern | Delete |
|----------|---------|--------|
| so then so | so + then + so | "so then" |
| and then will and then | and then + will + and then | "and then will" |
| task 3 task 3 | task 3 + task 3 | first one |

## Not Errors / 不是口误

| Original | Reason |
|----------|--------|
| task 1, task 2, task 3 | Enumeration / 列举 |
| one by one | Emphasis / 强调 |
