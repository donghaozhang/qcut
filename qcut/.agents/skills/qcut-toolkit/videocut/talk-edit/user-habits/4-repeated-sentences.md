# Repeated Sentence Detection / 重复句检测

## Definition / 定义

Adjacent sentences (separated by silence) share >= 5 characters at the start. Usually means the speaker made an error and restarted.

相邻句子（被静音分隔）开头相同 ≥5字，通常是说错后重说。

## Core Principle / 核心原则

**Segment first, then compare / 先分句，再比对**

```
Correct: Split by silence → Compare adjacent sentences → Delete entire sentence
Wrong:   Scan word by word → Find repeated fragments → Only delete fragments

✓ 正确：按静音切分句子 → 比对相邻句子开头 → 整句删除
✗ 错误：逐字扫描 → 发现重复片段 → 只删片段
```

### Steps

1. **Split by silence** (silence >= 0.5s as separator)
2. **Compare adjacent sentences** (>= 5 char shared prefix → delete shorter entire sentence)
3. **Compare skip-one sentences** (if middle is a fragment, also check before/after)

## Detection Logic

```javascript
// Adjacent sentence comparison
if (curr.text.slice(0, 5) === next.text.slice(0, 5)) {
  const shorter = curr.text.length <= next.text.length ? curr : next;
  markAsError(shorter);  // Delete entire sentence, not just the repeated part
}

// Skip-one comparison (middle is short fragment)
if (mid.text.length <= 5) {
  if (curr.text.slice(0, 5) === next.text.slice(0, 5)) {
    markAsError(curr);   // Delete earlier sentence
    markAsError(mid);    // Delete fragment
  }
}
```

## Multiple Repeats / 多次重复

3+ consecutive attempts: delete all incomplete versions, keep the last complete one.

## Common Mistakes / 易错点

```
Bad:  Scan word by word, only find local repetition fragments
Good: Segment first, compare entire sentence prefixes, delete entire sentence

Bad:  Only compare adjacent sentences
Good: Also compare skip-one (middle may be a fragment)
```
