---
name: videocut-talk-edit
description: Talking-head video transcription and speech error detection. Generates review page and deletion task list. Triggers: edit talking head, process video, detect speech errors, 剪口播, 处理视频, 识别口误
---

<!--
input: Video file (*.mp4)
output: subtitles_words.json, auto_selected.json, review.html
pos: Transcription + detection, up to user web review

Architecture guardian: If modified, sync:
1. ../README.md skill list
2. /CLAUDE.md route table
-->

# Talk Edit v2

> Volcengine transcription + AI speech error detection + web review

## Quick Start

```
User: Help me edit this talking head video
User: Process this video
User: 帮我剪这个口播视频
User: 处理一下这个视频
```

## Output Directory Structure

```
output/
└── YYYY-MM-DD_video-name/
    ├── talk-edit/
    │   ├── 1_transcription/
    │   │   ├── audio.mp3
    │   │   ├── volcengine_result.json
    │   │   └── subtitles_words.json
    │   ├── 2_analysis/
    │   │   ├── readable.txt
    │   │   ├── auto_selected.json
    │   │   └── error_analysis.md
    │   └── 3_review/
    │       └── review.html
    └── subtitles/
        └── ...
```

**Rule**: Reuse existing folders; create new ones only if needed.

## Workflow

```
0. Create output directory
    ↓
1. Extract audio (ffmpeg)
    ↓
2. Upload for public URL (uguu.se)
    ↓
3. Volcengine API transcription
    ↓
4. Generate word-level subtitles (subtitles_words.json)
    ↓
5. AI analyzes errors/silence, generates pre-selection list (auto_selected.json)
    ↓
6. Generate review webpage (review.html)
    ↓
7. Start review server, user confirms on webpage
    ↓
[Await user confirmation] → Click "Execute Cut" on webpage or manually /cut
```

## Execution Steps

### Step 0: Create Output Directory

```bash
# Variable setup (adjust for actual video)
VIDEO_PATH="/path/to/video.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}/talk-edit"

# Create subdirectories
mkdir -p "$BASE_DIR/1_transcription" "$BASE_DIR/2_analysis" "$BASE_DIR/3_review"
cd "$BASE_DIR"
```

### Steps 1-3: Transcription

```bash
cd 1_transcription

# 1. Extract audio (filenames with colons need file: prefix)
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# 2. Upload for public URL
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# Returns: {"success":true,"files":[{"url":"https://h.uguu.se/xxx.mp3"}]}

# 3. Call Volcengine API
SKILL_DIR="<project>/.claude/skills/qcut-toolkit/videocut/talk-edit"
"$SKILL_DIR/scripts/volcengine_transcribe.sh" "https://h.uguu.se/xxx.mp3"
# Output: volcengine_result.json
```

### Step 4: Generate Subtitles

```bash
node "$SKILL_DIR/scripts/generate_subtitles.js" volcengine_result.json
# Output: subtitles_words.json

cd ..
```

### Step 5: Analyze Errors (Script + AI)

#### 5.1 Generate Readable Format

```bash
cd 2_analysis

node -e "
const data = require('../1_transcription/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[silence' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\\n'));
"
```

#### 5.2 Read User Habits

Read all rule files under `user-habits/` directory first.

#### 5.3 Generate Sentence List (Key Step)

**Must segment into sentences first, then analyze**. Split by silence gaps:

```bash
node -e "
const data = require('../1_transcription/subtitles_words.json');
let sentences = [];
let curr = { text: '', startIdx: -1, endIdx: -1 };

data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);

sentences.forEach((s, i) => {
  console.log(i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text);
});
" > sentences.txt
```

#### 5.4 Script Auto-Mark Silence (Must Run First)

```bash
node -e "
const words = require('../1_transcription/subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('auto_selected.json', JSON.stringify(selected, null, 2));
console.log('Silence segments >=0.5s:', selected.length);
"
```

→ Output: `auto_selected.json` (contains only silence indices)

#### 5.5 AI Error Analysis (Append to auto_selected.json)

**Detection Rules (by priority)**:

| # | Type | Detection Method | Deletion Scope |
|---|------|-----------------|----------------|
| 1 | Repeated sentence | Adjacent sentences share >=5 char prefix | Shorter **entire sentence** |
| 2 | Skip-one repeat | Middle is fragment, compare before/after | Previous sentence + fragment |
| 3 | Incomplete sentence | Sentence cut off mid-way + silence | **Entire fragment** |
| 4 | In-sentence repeat | A + filler + A pattern | Earlier part |
| 5 | Stutter words | Repeated phrases (e.g., "that that", "so so") | Earlier part |
| 6 | Self-correction | Partial repeat / negation correction | Earlier part |
| 7 | Filler words | "um", "uh", "er", "like" | Mark but don't auto-delete |

**Core Principle**:
- **Segment first, then compare**: Use sentences.txt to compare adjacent sentences
- **Delete entire sentences**: Fragments and repeats should delete full sentences, not just anomalous words

**Chunked Analysis (loop)**:

```
1. Read readable.txt offset=N limit=300
2. Analyze these 300 lines using sentences.txt
3. Append error indices to auto_selected.json
4. Record in error_analysis.md
5. N += 300, go to step 1
```

**Critical Warning: Line number != idx**

```
readable.txt format: idx|content|time
                     ^ use THIS value

Line 1500 → "1568|[silence1.02s]|..."  ← idx is 1568, NOT 1500!
```

**error_analysis.md format:**

```markdown
## Chunk N (line range)

| idx | Time | Type | Content | Action |
|-----|------|------|---------|--------|
| 65-75 | 15.80-17.66 | Repeated sentence | "This is an example I cut" | Delete |
```

### Steps 6-7: Review

```bash
cd ../3_review

# 6. Generate review webpage
node "$SKILL_DIR/scripts/generate_review.js" ../1_transcription/subtitles_words.json ../2_analysis/auto_selected.json ../1_transcription/audio.mp3
# Output: review.html

# 7. Start review server
node "$SKILL_DIR/scripts/review_server.js" 8899 "$VIDEO_PATH"
# Open http://localhost:8899
```

User actions on the webpage:
- Play video segments to confirm
- Check/uncheck deletion items
- Click "Execute Cut"

---

## Data Formats

### subtitles_words.json

```json
[
  {"text": "Hello", "start": 0.12, "end": 0.2, "isGap": false},
  {"text": "", "start": 6.78, "end": 7.48, "isGap": true}
]
```

### auto_selected.json

```json
[72, 85, 120]  // AI-generated pre-selected indices
```

---

## Configuration

### Volcengine API Key

```bash
cd <project>/.claude/skills
cp .env.example .env
# Edit .env and add VOLCENGINE_API_KEY=xxx
```
