# Self-Correction / 重说纠正

## Pattern / 模式

Speaker makes an error and immediately corrects. Delete the earlier incorrect part.

### 1. Partial Repeat / 部分重复

Words overlap but aren't identical:

| Original | Delete |
|----------|--------|
| "you should cl- you close it" | "you should cl-" |
| "I was gon- I went there" | "I was gon-" |

### 2. Negation Correction / 否定纠正

Using negation to correct what was just said:

| Original | Delete |
|----------|--------|
| "it is- it's not" | "it is-" |
| "you can- you can't" | "you can-" |

### 3. Interrupted Word / 词被打断

Word said halfway + silence + complete re-say:

| Original | Delete |
|----------|--------|
| "depen[silence]dependency graph" | "depen[silence]" |

## Detection Logic / 检测逻辑

```javascript
// Find common prefix in adjacent words
if (word[i].text.startsWith(prefix) && word[i+n].text.startsWith(prefix)) {
  // If later one is more complete → delete earlier
}
```
