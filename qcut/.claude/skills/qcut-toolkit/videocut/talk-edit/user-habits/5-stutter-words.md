# Stutter Words / 卡顿词

## Pattern / 模式

Same word repeated 2-3 times in succession:

```javascript
const stutterPatterns = [
  // Chinese
  '那个那个', '就是就是', '然后然后', '这个这个', '所以所以',
  // English
  'the the', 'I I', 'and and', 'but but', 'so so'
];
```

## Deletion Strategy / 删除策略

Delete earlier occurrences, keep the last one.

```
Original: "that that I want to say"
Delete:   "that"
Keep:     "that I want to say"

原文: "那个那个我想说"
删除: "那个"
保留: "那个我想说"
```
