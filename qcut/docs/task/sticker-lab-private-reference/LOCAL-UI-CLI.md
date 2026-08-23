# Sticker Lab 本地 UI 与 CLI

<!-- markdownlint-disable MD013 -->

**状态：** 已接通本地只读目录发现、桌面 UI、CLI 检索和内部时间线放置

**日期：** 2026-08-23

**权利边界：** 仅限内部参照，禁止上传和二次分发

## 1. 当前本地库存

默认目录是当前用户视频目录下的 `QCut Sticker Lab`。在 macOS 上通常为
`~/Movies/QCut Sticker Lab`；也可通过 CLI `--root` 或
`QCUT_STICKER_LAB_ROOT` 指定另一个仓库外目录。

2026-08-23 的真实目录核验结果：

| 指标 | 当前值 |
| --- | ---: |
| 批次数 | 18 |
| 分类并集 | 43 |
| 贴纸总数 | 2,924 |
| GIF | 2,275 |
| PNG | 649 |
| 素材总字节数 | 4,249,707,252 B |
| discovery warning | 0 |

第 18 批目录为 `jianying-2026-08-23-batch-18-v2`，含 39 个分类、156 个贴纸。
18 批资源 ID、SHA-256 和文件路径均全局唯一。素材、manifest、report 和绝对本机路径
仍只存在于授权开发机，不进入 Git、安装包、Supabase 或其他云存储。

## 2. 桌面 UI 行为

QCut 桌面版通过受限 Electron IPC 发现本地批次，renderer 不直接扫描文件系统：

1. 本地目录至少有一个有效批次时，贴纸实验室使用本地目录，不再并入远端冻结三批，
   避免重复；
2. 无需 Vite feature flag；本地目录存在时，桌面版自动显示贴纸实验室；
3. 本地目录不存在或没有有效批次时，原有远端冻结三批仍作为已配置构建的兼容
   fallback；
4. Web 平台不具备本地目录能力，不显示虚假的本地错误；
5. 43 个分类按稳定 category ID 合并；同 ID 素材只保留一个，本地条目优先；
6. 卡片进入可视区前不读取原文件，进入前后 160 px 才按需读取并校验；离开该区域
   750 ms 后释放 File 与 object URL，本地 File LRU 同时限制为 16 MiB、24 项；
7. 面板和侧栏固定显示“仅限内部参照 · 禁止二次分发”。

点击卡片可用于内部时间线验证。写入 MediaStore 的 metadata 为：

```json
{
  "source": "sticker-lab",
  "animatedSticker": true,
  "referenceOnly": true,
  "usage": "internal-reference-only",
  "redistribution": "prohibited",
  "batchId": "jianying-2026-08-23-batch-18-v2",
  "itemId": "7134619769205951784",
  "checksumSha256": "<64 lowercase hex>"
}
```

PNG 的 `animatedSticker` 为 `false`。metadata 不保存 `rootPath`，避免把绝对用户路径写入
项目。CLI 导入时会先把同一份严格 metadata 原子写入项目媒体 sidecar，再等待 renderer
明确确认 MediaStore 与 IndexedDB 已持久化；`project.json` 也保留这份标记。任一步失败
都会回滚项目媒体、sidecar 和 renderer 状态。此标记是后续导出拦截的依据；在所有导出
入口完成 fail-closed 检查前，不得导出含本地参照的项目。

桌面桥接使用带 `requestId` 的相关 ACK/NACK，并校验发送方与主 frame；超时、伪造回包、
项目切换或 renderer 拒绝都不会被当成成功。用户在读取或持久化过程中切换项目时，操作
会在下一处异步边界停止；已经写入的媒体、IndexedDB、overlay 和 object URL 会按阶段
回滚，避免把项目 A 的贴纸写进项目 B。

## 3. CLI 浏览与检索

以下命令只读本地目录，不请求 signed URL，也不上传文件：

```bash
bun run qcut sticker-lab catalogs --json
bun run qcut sticker-lab categories --batch-id jianying-2026-08-23-batch-18-v2 --json
bun run qcut sticker-lab items --category "热门" --limit 20 --json
bun run qcut sticker-lab search --query "安排" --json
```

共同参数：

- `--root <path>`：显式本地根目录；
- `--batch-id <id>`：限定一个批次；
- `--category <id-or-label>`：限定分类 ID 或完整标签；
- `--query <text>`：按批次、分类、贴纸 ID、名称等检索；
- `--offset <n>`、`--limit <1..500>`：确定性分页。

根目录优先级为显式 `--root`、非空 `QCUT_STICKER_LAB_ROOT`、平台默认视频目录。JSON
输出总是包含 `referenceOnly: true`、禁止上传/再分发提示、warning 列表、库存 summary
和分页状态。CLI 输出可报告当前扫描根目录，但不会把它写进项目 metadata。

## 4. CLI 加入内部时间线

QCut 桌面编辑器正在运行且已选择项目时，可显式选择 `sticker-lab` provider：

```bash
bun run qcut editor sticker add \
  --project-id <project-id> \
  --provider sticker-lab \
  --batch-id jianying-2026-08-23-batch-18-v2 \
  --sticker-id 7134619769205951784 \
  --start-time 2 \
  --end-time 5 \
  --width 200 \
  --json
```

`--provider sticker-lab` 必须显式提供，防止数字 ID 或含冒号 ID 被误当作 Iconify
贴纸。CLI 在每次放置前重新读取文件并验证 size、SHA-256 与 PNG/GIF magic；随后用
`0600` 临时文件导入项目，并在成功或失败后删除临时目录。GIF 保留动画标记，PNG
按静态图处理。时间线 ID 格式为 `sticker-lab:<batchId>:<stickerId>`。若时间线写入
失败，CLI 会回滚刚导入的项目媒体、sidecar、MediaStore 与 IndexedDB，避免留下孤立
副本。贴纸 update 发送扁平 changes，所有单项和批量 update/delete 都验证当前打开的
项目，避免把一个项目的命令误写到另一个项目。媒体删除先预检磁盘文件，再等待 renderer
确认删除其状态，最后才删除磁盘副本；renderer NACK 或超时会保留磁盘文件，renderer
确认后若磁盘删除失败则返回可重试错误，不会伪报成功。若时间线写入失败且媒体回滚本身
也失败，CLI 会同时报告两个错误，保留足够信息供重试和人工清理。

## 5. 发现和读取安全规则

本地服务只接受根目录下一层、名称匹配 `jianying-YYYY-MM-DD[-batch-N][-vN]` 的真实
目录，并同时校验 `manifest.json` 与 `report.json`：

- 支持第一批 legacy report v1，以及第 2–18 批 report v2；
- 显式 `referenceOnly: false`、URL 字段、未知字段和 manifest/report 不一致均拒绝；
- root、批次、manifest、report 和素材的 symlink、路径越界、dot segment、非普通文件
  均拒绝；
- discovery 只校验路径、metadata 和文件大小，不在启动时重算约 4.25 GB 素材 hash；
- 实际预览或时间线放置时才读取目标文件，并核对 byte size、SHA-256、MIME magic 和
  读取前后文件 identity；
- 批次数、并发文件检查和 discovery cache 都有上限，避免任意 IPC root 放大资源占用；
- 任一无效批次生成明确 warning，不会静默伪装成较小库存。

## 6. 下一步

1. 在视频导出、静帧导出、工程交换和剪映草稿导出入口统一拒绝
   `redistribution: "prohibited"` 的 MediaItem；
2. 重开时从 durable metadata 恢复受限状态、撤权和删除受限副本仍需桌面端到端测试；
3. 用临时测试项目做一次真实 QCut 桌面卡片预览、GIF 播放、CLI 放置和重开验证；
4. 第 19 批及任何云端扩容都需要新的明确决定和权利审查，默认不执行。
