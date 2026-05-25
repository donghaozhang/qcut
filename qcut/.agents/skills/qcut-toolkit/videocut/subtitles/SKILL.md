---
name: videocut-subtitles
description: Subtitle generation and burn-in. Volcengine transcription → dictionary correction → review → burn-in. Triggers: add subtitles, generate subtitles, 加字幕, 生成字幕, 字幕
---

<!--
input: Video file
output: Video with burned-in subtitles
pos: Post-processing skill, called after editing is complete
-->

# Subtitles

> Transcription → Agent proofreading → Manual review → Burn-in

## Core Flow (~8-15 minutes total, including manual review)

```
1. Extract audio + upload          ~1min
    ↓
2. Volcengine transcription (with hot words)  ~2min
    ↓
3. Agent auto-proofread            ~3-5min
    ↓
4. Manual review & confirm         Depends on user
    ↓
5. Burn-in subtitles               ~1-2min
```

---

## Step 1: Extract Audio and Upload

```bash
# Extract audio
ffmpeg -i "video.mp4" -vn -acodec libmp3lame -y audio.mp3

# Upload to uguu.se (temporary file hosting)
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# Returns URL like: https://o.uguu.se/xxxxx.mp3
```

---

## Step 2: Volcengine Transcription (with Hot Words)

The transcription script **automatically reads the dictionary** as hot words to improve accuracy:

```bash
# Dictionary location: <project>/.claude/skills/qcut-toolkit/videocut/subtitles/dictionary.txt
# Script loads it automatically

bash ../talk-edit/scripts/volcengine_transcribe.sh "https://o.uguu.se/xxxxx.mp3"
```

**Dictionary format** (one word per line):
```
skills
Claude
Agent
```

---

## Step 3: Agent Auto-Proofread

### 3.1 Generate Timestamped Subtitles

```javascript
const result = JSON.parse(fs.readFileSync('volcengine_result.json'));
const subtitles = result.utterances.map((u, i) => ({
  id: i + 1,
  text: u.text,
  start: u.start_time / 1000,
  end: u.end_time / 1000
}));
fs.writeFileSync('subtitles_with_time.json', JSON.stringify(subtitles, null, 2));
```

### 3.2 Agent Manual Proofread (No Scripts)

**After transcription, Agent must read all subtitles line by line and manually proofread.**

Common misrecognition patterns vary by language. Agent should:
1. Check for homophones and similar-sounding word errors
2. Check for missing words in sentences
3. Verify proper nouns and technical terms against the dictionary
4. Fix grammar errors

### 3.3 Cross-Reference with Script (If Available)

If an original script exists, use it as reference but **do not auto-match** (text differences cause timestamp drift).

Agent should:
1. Read the script as reference
2. Manually compare line by line
3. Mark uncertain items for manual review

---

## Step 4: Start Review Server

```bash
cd subtitles-dir/
node <project>/.claude/skills/qcut-toolkit/videocut/subtitles/scripts/subtitle_server.js 8898 "video.mp4"
```

Visit http://localhost:8898

**Features:**
- Left: video playback, Right: subtitle list
- Auto-highlight current subtitle during playback
- Double-click subtitle text to edit (timestamps preserved)
- Variable playback speed (1x/1.5x/2x/3x)
- Save subtitles / Export SRT / Burn-in subtitles
- Dictionary quick-insert at bottom

---

## Step 5: Burn-in Subtitles

**Default style: Size 22, golden bold, black outline 2px, bottom center**

```bash
ffmpeg -i "video.mp4" \
  -vf "subtitles='video.srt':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy \
  -y "video_subtitled.mp4"
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| FontSize | 22 | Font size |
| FontName | PingFang SC | PingFang font |
| Bold | 1 | Bold |
| PrimaryColour | &H0000deff | Golden #ffde00 |
| OutlineColour | &H00000000 | Black outline |
| Outline | 2 | Outline width |
| Alignment | 2 | Bottom center |
| MarginV | 30 | Bottom margin |

---

## Directory Structure

```
output/YYYY-MM-DD_video-name/subtitles/
├── 1_transcription/
│   ├── audio.mp3
│   └── volcengine_result.json
├── subtitles_with_time.json    # Core file
└── 3_output/
    ├── video.srt
    └── video_subtitled.mp4
```

---

## Subtitle Rules

| Rule | Description |
|------|-------------|
| One line per screen | No line breaks, no stacking |
| No end punctuation | `Hello` not `Hello.` |
| Keep mid-sentence punctuation | `Click here, then there` |
