# Consecutive Filler Words / 连续语气词

## Pattern / 模式

Two filler words appearing back-to-back:

```
um uh, ah er, oh um, er ah
嗯啊、啊呃、哦嗯、呃啊
```

## Detection / 检测

```javascript
const fillerWords = ['嗯', '啊', '哎', '诶', '呃', '额', '唉', '哦', '噢', '呀', '欸',
                     'um', 'uh', 'er', 'ah', 'hmm', 'oh'];

if (fillerWords.includes(curr) && fillerWords.includes(next)) {
  markAsError(curr, next);
}
```

## Deletion Strategy / 删除策略

Delete all consecutive fillers.
全部删除。
