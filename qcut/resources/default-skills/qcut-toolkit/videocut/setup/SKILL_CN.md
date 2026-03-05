---
name: videocut:安装
description: 环境准备。安装依赖、配置 API Key、验证环境。触发词：安装、环境准备、初始化
---

# 安装

> 首次使用前的环境准备

## 快速使用

```
用户: 安装环境
用户: 初始化
```

## 依赖清单

| 依赖 | 用途 | 安装命令 |
|------|------|----------|
| Node.js | 运行脚本 | `brew install node` |
| FFmpeg | 视频剪辑 | `brew install ffmpeg` |
| curl | API 调用 | 系统自带 |

## API 配置

### 火山引擎语音识别

控制台：https://console.volcengine.com/speech/new/experience/asr?projectName=default

1. 注册火山引擎账号
2. 开通语音识别服务
3. 获取 API Key

配置到项目目录 `.claude/skills/.env`：

```bash
VOLCENGINE_API_KEY=your_api_key_here
```

## 安装流程

```
1. 安装 Node.js + FFmpeg
       ↓
2. 配置火山引擎 API Key
       ↓
3. 验证环境
```

## 执行步骤

### 1. 安装依赖

```bash
brew install node ffmpeg
node -v
ffmpeg -version
```

### 2. 配置 API Key

```bash
echo "VOLCENGINE_API_KEY=your_key" >> .claude/skills/.env
```

### 3. 验证环境

```bash
node -v
ffmpeg -version
cat .claude/skills/.env | grep VOLCENGINE
```

## 常见问题

### Q1: API Key 在哪获取？
火山引擎控制台 → 语音技术 → 语音识别 → API Key

### Q2: ffmpeg 命令找不到
```bash
which ffmpeg
# 如果没有：brew install ffmpeg
```

### Q3: 文件名含冒号报错
FFmpeg 命令需加 `file:` 前缀：
```bash
ffmpeg -i "file:2026:01:26 task.mp4" ...
```
