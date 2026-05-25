# Filler Word Detection / 语气词检测

## Filler Word List / 语气词列表

```javascript
// Chinese fillers
const chineseFillers = ['嗯', '啊', '哎', '诶', '呃', '额', '唉', '哦', '噢', '呀', '欸'];
// English fillers
const englishFillers = ['um', 'uh', 'er', 'ah', 'hmm', 'like', 'you know', 'I mean'];
```

## Deletion Boundaries / 删除边界

```
Wrong: Delete filler word timestamps (filler.start - filler.end)
       → May cut the tail of the previous word

错误：删语气词时间戳 (语气词.start - 语气词.end)
      → 可能删掉前面字的尾音

Correct: From previous word's end to next word's start
         → (prevWord.end - nextWord.start)

正确：从前一个字的 end 到后一个字的 start
      → (前字.end - 后字.start)
```

## User Preference / 用户偏好

Keep some filler words as natural transitions; don't delete all of them.
保留适量语气词作为过渡，不要全删。
