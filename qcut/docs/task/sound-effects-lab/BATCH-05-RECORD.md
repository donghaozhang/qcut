# Sound Effects Lab Batch-05 / 音效实验室 Batch-05

Date / 日期: 2026-08-22

Branch / 分支: `codex/sound-effects-offline-pack`

PR: [#424](https://github.com/Quriosity-agent/qcut/pull/424)

## 中文

### 本批结果

本批重新浏览剪映音效目录的 20 个分类，并继续滚动有分页的分类。刷新后找到
484 个签名有效且未进入原 938 项目录的候选，平衡选出 60 个 resource ID:

- 下载并保留 57 个唯一 MP3;
- 3 个内容重复项按 MD5 跳过;
- 下载、解码和校验失败为 0;
- 合并目录从 938 增加到 995;
- 995 个本地文件全部通过存在性、MD5、FFprobe MP3 和 manifest 校验;
- 995 个 resource ID、对象键和 SHA-256 均唯一;
- 全库总字节数为 220,527,448 bytes（约 210.3 MiB）。

### 分类增量

“可选”是刷新后签名有效且尚未收录的卡片数。“新增”按卡片真实分类统计，
因此带多个分类的一个文件会在多个分类中计数，但 Supabase 只存一份。

| 分类 | 可选 | 新增 |
|---|---:|---:|
| 热门 | 42 | 9 |
| 最新 | 88 | 5 |
| 转场 | 4 | 4 |
| 网感口播🔥 | 41 | 5 |
| 热梗语录 | 9 | 5 |
| 笑声 | 81 | 5 |
| 尴尬 | 0 | 0 |
| 震惊 | 0 | 0 |
| 提示音 | 9 | 5 |
| 抽象 | 35 | 5 |
| 综艺感 | 138 | 7 |
| 知识科普 | 0 | 0 |
| 机械 | 6 | 3 |
| BGM | 0 | 0 |
| 魔法 | 34 | 5 |
| 打斗 | 0 | 0 |
| 美食 | 3 | 3 |
| 动物 | 4 | 4 |
| 环境音 | 39 | 5 |
| 悬疑 | 21 | 5 |

`尴尬`、`震惊`、`知识科普`、`BGM` 和 `打斗` 均已浏览到
`has_more=false`，当前剪映目录没有尚未收录的新卡。这里保留真实的 0，
没有复制旧文件、混入其他来源或错误改分类。

### Supabase 发布

- 私有 bucket: `sound-effects-lab`;
- 仅上传 57 个新增对象，上传总量 10,204,832 bytes;
- 57 个对象全部从私有 bucket 回读，大小和 SHA-256 全部匹配;
- bucket 当前为 995 个 MP3 / 220,527,448 bytes;
- 生产 manifest: `jianying/2026-08-22/manifest.json`;
- 生产 manifest SHA-256:
  `b69188eee868e075f684cbd9c6270cf17e76f897809f000b2ee2d355e5ea779f`;
- Worker version: `90f245d4-be1b-47d4-9172-92bfb5de8326`;
- 白名单 API 返回 20 分类 / 995 项，未认证请求返回 401;
- 新增“时钟滴答”经签名接口下载 8,255 bytes，SHA-256 与 manifest 匹配。

Supabase 凭据和 QCut session token 只从本机忽略的环境文件读取，未写入脚本、
报告、文档或 Git。

### 本地 QCut 备份

原始文件和 manifest 的独立本地备份位于:

- `/Users/peter/Documents/QCut/Exports/jianying-sfx-batch-05-2026-08-22`;
- `/Users/peter/Documents/QCut/Exports/jianying-sfx-lab-2026-08-22`;
- 切换生产前的 938 项 manifest:
  `production-manifest-before-938.json`。

QCut 自己的完整离线包也已安装:

- `qcut-sound-effects-lab-offline/packs`:995 项账号绑定完成记录;
- `qcut-asset-resources/files`:当前 manifest 对应 995 个 Blob;
- 当前 Blob 总量 220,527,448 bytes，995 个唯一 SHA-256，缺失 0;
- `persistentStorage: true`;
- 主动阻断所有音效实验室 API 后，QCut 仍显示 995 项和“离线目录”;
- 断网搜索并播放本批新增“时钟滴答”，播放器到 `0:01 / 0:04`，远端音效
  请求为 0。
- 6 个离线链路聚焦测试文件、36 个测试通过;license server 路由 10 个测试和
  TypeScript 检查通过;启用音效实验室的 Web production build 通过。

证据截图见 [`evidence/`](./evidence/06-production-995-offline-download.jpg)。

### 下一子任务

1. 为 995 项运行响度、峰值、静音头尾、损坏帧和主观重复 QA。
2. 将真实账号生产 smoke test 做成显式 opt-in E2E，默认 CI 不下载 210.3 MiB。
3. 在正式安装包中再做一次冷下载、退出重开和断网试听。
4. 对五个已耗尽的剪映分类决定是否维持现状，或另建明确标注来源的 QCut
   自有 / CC0 / AI 音效层;不能把其他来源伪装成剪映参照。

## English

Batch-05 re-enumerated all 20 Jianying sound-effect categories and selected 60
previously uncollected resource IDs. It retained 57 unique MP3 files, skipped
three content duplicates, and had zero download or decode failures. The
catalog grew from 938 to 995 items and now totals 220,527,448 bytes.

Fifteen categories gained 3–9 real items. Five categories were fully paged to
`has_more=false` with no uncollected cards, so they were not padded with
duplicates, relabelled items, or sounds from another source.

Only the 57 new objects were uploaded to the private `sound-effects-lab`
bucket. Every object was downloaded back and passed size and SHA-256 checks.
The production Worker now serves the unique
`jianying/2026-08-22/manifest.json` key and returns 20 categories / 995 items
to the allowlisted account while unauthenticated access returns 401.

QCut also owns a complete local copy. Its account-bound offline record contains
995 items, and the current manifest maps exactly to 995 local Blobs, 995 unique
SHA-256 values, zero missing files, and 220,527,448 bytes. With every Sound
Effects Lab API request blocked, QCut restored the full catalog and played the
new four-second `时钟滴答` item without an asset request.

Next work is full audio-quality QA, an opt-in production smoke test, packaged
app cold-download verification, and an explicit source decision for the five
exhausted Jianying categories.
