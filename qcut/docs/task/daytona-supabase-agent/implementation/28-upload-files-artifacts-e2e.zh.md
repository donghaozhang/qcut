# 上传文件到 Artifacts E2E

日期：2026-05-21

目标：验证上传的图片、文本和视频文件能够出现在 Chat Agent 的 `Sandbox files` / artifacts 面板里。

## 结果

在生产页面上通过：

```text
https://quriosity.com.au/chat-agent.html
```

页面成功连接到一个真实的 Daytona 终端 session，并通过网页上传 UI 上传了三个本地测试文件。

## 测试文件

Run id：

```text
1779389330
```

本地输入文件：

```text
output/playwright/upload-artifacts-e2e-1779389330/input/upload-text-1779389330.txt
output/playwright/upload-artifacts-e2e-1779389330/input/upload-image-1779389330.png
output/playwright/upload-artifacts-e2e-1779389330/input/upload-video-1779389330.mp4
```

## 真实 UI 步骤

1. 打开 `https://quriosity.com.au/chat-agent.html`。
2. 确认终端初始状态为 `disconnected`。
3. 点击 `Connect`。
4. 等到 Daytona 终端状态变为 `connected`。
5. 在页面 upload 输入里选择：
   - `upload-text-1779389330.txt`
   - `upload-image-1779389330.png`
   - `upload-video-1779389330.mp4`
6. 点击 `Upload selected files`。
7. 等待 `Sandbox files` 面板显示这三个上传后的文件名。
8. 校验每个 tile 的 DOM kind 和 path。

## 证据

页面上的上传状态：

```text
Uploaded to /tmp/qcut-output: upload-text-1779389330.txt, upload-image-1779389330.png, upload-video-1779389330.mp4
```

Artifacts 面板文字：

```text
upload-image-1779389330.png
76 bytes
upload-text-1779389330.txt
42 bytes
upload-video-1779389330.mp4
5.7 KB
```

DOM 校验：

```json
[
  {
    "name": "upload-text-1779389330.txt",
    "kind": "log",
    "path": "/tmp/qcut-output/upload-text-1779389330.txt"
  },
  {
    "name": "upload-image-1779389330.png",
    "kind": "image",
    "path": "/tmp/qcut-output/upload-image-1779389330.png"
  },
  {
    "name": "upload-video-1779389330.mp4",
    "kind": "video",
    "path": "/tmp/qcut-output/upload-video-1779389330.mp4"
  }
]
```

截图证据：

```text
output/playwright/upload-artifacts-e2e-1779389330/06-uploaded-artifacts.png
```

机器可读结果：

```text
output/playwright/upload-artifacts-e2e-1779389330/result.json
```

## 备注

- 上传目标是当前 sandbox path，默认是 `/tmp/qcut-output`。
- 上传的文本文件被分类为 `log`；这是预期行为，因为 artifact kind 枚举对文本类文件使用 `log`。
- 上传的图片被分类为 `image`。
- 上传的视频被分类为 `video`。
- 完成这个目标不需要修改代码。
