---
name: videocut:字幕
description: 字幕生成与烧录。火山引擎转录→词典纠错→审核→烧录。触发词：加字幕、生成字幕、字幕
---

<!--
input: 视频文件
output: 带字幕视频
pos: 后置 skill，剪辑完成后调用
-->

# 字幕

> 转录 → Agent校对 → 人工审核 → 烧录

## 核心流程（总计约 8-15 分钟，含人工审核）

```
1. 提取音频 + 上传          ~1min
    ↓
2. 火山引擎转录（带热词）    ~2min
    ↓
3. Agent 自动校对            ~3-5min
    ↓
4. 人工审核确认              取决于用户
    ↓
5. 烧录字幕                  ~1-2min
```

---

## Step 1: 提取音频并上传

```bash
ffmpeg -i "video.mp4" -vn -acodec libmp3lame -y audio.mp3
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
```

---

## Step 2: 火山引擎转录（带热词）

```bash
bash ../talk-edit/scripts/volcengine_transcribe.sh "https://o.uguu.se/xxxxx.mp3"
```

**词典格式**（每行一个词）：
```
skills
Claude
Agent
```

---

## Step 3: Agent 自动校对

### 3.2 Agent 手动校对（不用脚本）

**转录后，Agent 必须逐条阅读全部字幕，手动校对以下问题：**

#### 常见误识别规则表

| 误识别 | 正确 | 类型 |
|--------|------|------|
| 成风 | 成峰 | 同音字 |
| 正特/整特 | Agent | 误识别 |
| cloud code | Claude Code | 发音相似 |
| 剪口拨/剪口波 | 剪口播 | 同音字 |

#### 常见漏字问题

| 原文 | 修正 | 说明 |
|------|------|------|
| 步呢是配置 | 第二步呢是配置 | 漏"第二" |
| 别省时间 | 特别省时间 | 漏"特" |

---

## Step 4: 启动审核服务器

```bash
node <project>/.claude/skills/qcut-toolkit/videocut/subtitles/scripts/subtitle_server.js 8898 "video.mp4"
```

访问 http://localhost:8898

---

## Step 5: 烧录字幕

**默认样式：22号金黄粗体、黑色描边2px、底部居中**

```bash
ffmpeg -i "video.mp4" \
  -vf "subtitles='video.srt':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy \
  -y "video_字幕.mp4"
```

---

## 字幕规范

| 规则 | 说明 |
|------|------|
| 一屏一行 | 不换行，不堆叠 |
| 句尾无标点 | `你好` 不是 `你好。` |
| 句中保留标点 | `先点这里，再点那里` |
