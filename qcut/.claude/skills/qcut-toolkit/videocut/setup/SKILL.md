---
name: videocut-setup
description: Environment setup. Install dependencies, configure API keys, verify environment. Triggers: install, setup, initialize, 安装, 环境准备, 初始化
---

# Setup

> First-time environment preparation

## Quick Start

```
User: Setup the environment
User: Initialize
User: 安装环境
```

## Dependencies

| Dependency | Purpose | Install Command |
|-----------|---------|-----------------|
| Node.js | Run scripts | `brew install node` |
| FFmpeg | Video editing | `brew install ffmpeg` |
| curl | API calls | Built-in |

## API Configuration

### Volcengine Speech Recognition

Console: https://console.volcengine.com/speech/new/experience/asr?projectName=default

1. Register a Volcengine account
2. Enable speech recognition service
3. Get API Key

Configure in project directory `.claude/skills/.env`:

```bash
# File path: <project>/.claude/skills/.env
VOLCENGINE_API_KEY=your_api_key_here
```

## Setup Flow

```
1. Install Node.js + FFmpeg
       ↓
2. Configure Volcengine API Key
       ↓
3. Verify environment
```

## Execution Steps

### 1. Install Dependencies

```bash
# macOS
brew install node ffmpeg

# Verify
node -v
ffmpeg -version
```

### 2. Configure API Key

```bash
echo "VOLCENGINE_API_KEY=your_key" >> .claude/skills/.env
```

### 3. Verify Environment

```bash
node -v
ffmpeg -version
cat .claude/skills/.env | grep VOLCENGINE
```

## FAQ

### Q1: Where to get the API Key?
Volcengine Console → Speech Technology → Speech Recognition → API Key

### Q2: ffmpeg command not found
```bash
which ffmpeg
# If missing: brew install ffmpeg
```

### Q3: Filename with colons causes error
Add `file:` prefix to FFmpeg commands:
```bash
ffmpeg -i "file:2026:01:26 task.mp4" ...
```
