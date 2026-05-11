# Quickstart — Qwen via DashScope (OpenAI-compatible)

Calls `qwen-plus` through Alibaba Cloud's OpenAI-compatible endpoint
(`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`).

## 1. Set your API key

```bash
export DASHSCOPE_API_KEY="sk-..."
```

(Or persist it in `~/.qcut/.env` as `DASHSCOPE_API_KEY=...`.)

## 2. Install the SDK

```bash
pip install openai
```

## 3. Run

```bash
python docs/task/qwen-dashscope/qwen-chat.py
```

## Notes

- `base_url` uses the **international** DashScope endpoint. For mainland
  China accounts, swap to `https://dashscope.aliyuncs.com/compatible-mode/v1`.
- Available models: `qwen-plus`, `qwen-turbo`, `qwen-max`, etc. See the
  [model list](https://www.alibabacloud.com/help/en/model-studio/getting-started/models).
- Error codes: https://www.alibabacloud.com/help/model-studio/developer-reference/error-code
