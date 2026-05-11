"""Qwen / DashScope chat example via the OpenAI-compatible endpoint.

Docs: https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api
API key precedence: $DASHSCOPE_API_KEY (set in shell or ~/.qcut/.env).
"""

import os
from openai import APIError, OpenAI


def main() -> None:
    """Send a single chat request to Qwen via DashScope and print the reply."""
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise SystemExit(
            "DASHSCOPE_API_KEY is not set. Export it or add it to ~/.qcut/.env."
        )

    client = OpenAI(
        api_key=api_key,
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    )

    try:
        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Who are you?"},
            ],
        )
        print(completion.choices[0].message.content)
    except APIError as e:
        # Narrow handler: lets unexpected local errors (typos, attr errors)
        # surface instead of being swallowed by a blanket `except Exception`.
        print(f"Error message: {e}")
        print(
            "See: https://www.alibabacloud.com/help/model-studio/"
            "developer-reference/error-code"
        )


if __name__ == "__main__":
    main()
