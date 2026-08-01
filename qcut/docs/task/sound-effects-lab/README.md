# QCut Sound Effects Lab / QCut 音效实验室

Date / 日期: 2026-08-01
Branch / 分支: `codex/sound-effects-lab`
PR: [#392](https://github.com/Quriosity-agent/qcut/pull/392)

## 中文

### 当前状态

音效实验室已经从“仅本机文件”扩展为与贴纸实验室相同的私有发布架构:

- 私有 Supabase bucket: `sound-effects-lab`;
- 私有 manifest 和 382 个 MP3 已上传，Git 和安装包都不包含这些音频;
- license server 提供白名单 manifest 接口和 10 分钟音效签名接口;
- `SOUND_EFFECTS_LAB_ALLOWED_USER_IDS` 是独立、fail-closed 的账号 ID
  白名单，不复用贴纸实验室白名单;
- 客户端只有在私有 manifest 请求成功后才显示入口，未登录、403、网络错误
  或无效 manifest 都不会暴露实验室;
- 仍保留 schema v1 本地 manifest，方便采集和离线开发;默认私有模式使用
  不含本机路径的 schema v2 manifest。

这些资源来自剪映参照目录，只允许内部对标。客户端统一标记
`commercialUse: "restricted"` 和“禁止分发”，不能收藏、不能写入最近使用，
也不能通过拖拽绕开受控导入。

### 完整流程

```text
VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB=true
  -> Electron 读取当前 QCut 登录 token
  -> GET /api/sound-effects-lab/private-manifest
  -> authMiddleware 验证有效 session
  -> SOUND_EFFECTS_LAB_ALLOWED_USER_IDS 检查账号 ID
  -> license server 从私有 bucket 下载 manifest
  -> 客户端执行 schema / 重复项 / 路径 / 大小 / SHA-256 约束校验
  -> 授权成功后显示“音效实验室 / 剪映参照目录”
  -> 可见卡片请求 GET /api/sound-effects-lab/assets?objectKey=...
  -> license server 再次验证 session + 白名单 + object key
  -> 302 到 600 秒 Supabase signed URL
  -> 客户端下载、校验大小和 SHA-256，并缓存到 IndexedDB
  -> File + blob URL -> 试听播放器 -> 加入时间线
```

入口不是仅靠前端 feature flag 保护。即使手动构造请求，没有有效 session 和
白名单账号也无法取得 manifest 或签名 URL。

### Supabase 与接口

| 项目 | 值 |
|---|---|
| Bucket | `sound-effects-lab` |
| 可见性 | private |
| 单文件上限 | 50 MiB |
| MIME | `audio/mpeg`, `application/json` |
| Manifest | `jianying/2026-08-01/manifest.json` |
| 音效对象 | `jianying/2026-08-01/assets/<md5>.mp3` |
| Manifest API | `GET /api/sound-effects-lab/private-manifest` |
| 音效 API | `GET /api/sound-effects-lab/assets?objectKey=...` |
| Signed URL TTL | 600 秒 |
| 当前 Worker | `e3ca8422-498e-4cd8-a6a0-807a6635e371` |

生产 Worker 显式允许 `http://localhost:5173` 和
`http://127.0.0.1:5173`，供 Vite Electron 开发版做带登录态的生产 E2E。
正式安装包继续使用默认的 `app://.` origin。

### 测试账号白名单

`SOUND_EFFECTS_LAB_ALLOWED_USER_IDS` 当前包含:

| 账号 | QCut user ID | 状态 |
|---|---|---|
| `qcutlove@qcut.app` | `79bf60b02770d2cc510da53e471590f4` | 生产 API 与 Electron E2E 通过 |
| `qcut-love2@qcut.app` | `3c81ac37cdd53e079e3ed35e96ac5fac` | 已写入生产白名单 |

Wrangler secret 只保存逗号分隔 ID;文档和 Git 不保存 session token、密码或
Supabase service-role key。普通已登录但不在白名单内的真实账号请求 manifest
返回 403。

### 库存与完整性

本地生成文件:

- `~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json`
- `~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.private.json`

| 指标 | 结果 |
|---|---:|
| 分类 | 20 |
| 音效 | 382 |
| 唯一 resource ID / numeric ID | 382 / 382 |
| 唯一 object key / MD5 / SHA-256 | 382 / 382 / 382 |
| 缺失文件 / 未声明分类引用 | 0 / 0 |
| Supabase MP3 对象 | 382 |
| 总大小 | 84,579,696 bytes (约 80.7 MiB) |
| 总时长 | 3,262.541 秒 (约 54 分 23 秒) |

20 个分类中，`尴尬` 当前确认到 16 个唯一资源，其余分类各 20 个。UI 每次
最多挂载 60 张卡，避免一次下载全部 382 个音效。

### 生成与上传

生成本地 v1 和无本机路径的私有 v2 manifest:

```bash
bun run build:sound-effects-lab-manifest -- \
  --input "$HOME/Documents/QCut/exports/jianying-sfx-batch-02-2026-08-01/combined-title-file-map.json" \
  --output "$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json" \
  --remote-output "$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.private.json" \
  --catalog-date 2026-08-01
```

上传器要求从环境读取 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`。它先
验证两份 manifest 对应关系、本地文件大小和 SHA-256，并在 382 个音效全部
成功后最后上传 manifest:

```bash
bun run upload:sound-effects-lab -- \
  --local-manifest "$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.local.json" \
  --private-manifest "$HOME/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/sound-effects-lab.private.json"
```

私有模式启动:

```bash
cd apps/web
VITE_QCUT_ENABLE_SOUND_EFFECTS_LAB=true \
VITE_LICENSE_SERVER_URL=https://qcut-license-server.zdhpeter.workers.dev \
bun run dev --host 127.0.0.1
```

如同时设置 `VITE_QCUT_SOUND_EFFECTS_LAB_MANIFEST_PATH`，客户端切换到本机
schema v1 开发模式，不访问私有 manifest。

### 验证结果

自动化:

- license server:24 个文件，194 个测试通过;
- Web 相关回归:11 个文件，110 个测试通过;
- 私有发布器:2 个测试通过，包括“同大小但 SHA-256 被替换”拒绝上传;
- Web、license server 和发布脚本 TypeScript 检查通过;
- 真实私有 schema v2 manifest 通过前端严格解析。

生产 API:

- 白名单账号 manifest:200，20 分类 / 382 项;
- 首个音效接口:302 到 Supabase signed URL;
- 下载 5,600 bytes，SHA-256 与 manifest 一致;
- 非白名单真实登录账号:403;
- bucket 回查:382 个 MP3，总计 84,579,696 bytes。

Electron 真实 E2E:

1. `qcutlove@qcut.app` 登录态从生产 Worker 获得私有 manifest;
2. 页面显示 382 个音效和 20 个分类;
3. “仙尘音效”试听按钮切换为暂停，底部播放器实时出现;
4. 点击加入时间线后，timeline element 从 0 增至 1，真实时长
   `2.742813` 秒。

截图证据不进 Git，保存在:

`~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/evidence/`

- `09-supabase-private-lab-382.png`:私有目录 382 / 20;
- `10-supabase-private-playing.png`:真实远程音效播放中;
- `11-supabase-private-added-to-timeline.png`:音频波形已加入时间线。

### 发现并修复的问题

1. 生产 Worker 原本不允许 Vite 的 localhost origin，浏览器 CORS 拦截后入口
   正确地 fail closed。已显式配置两个开发 origin 并重新部署。
2. 一条真实 BGM 为 888.792 秒，超过原 10 分钟 schema 上限。上限调整为
   30 分钟并加入回归测试。
3. bucket 在迁移落库前已经由 Storage API 创建。迁移改为 upsert，后续
   `db push` 不会因重复 bucket 失败。
4. 上传器原先只复核文件大小。现在上传前重新计算 SHA-256，避免同大小内容
   被替换。

### 下一步

1. 对 382 条音效执行响度、峰值、静音头尾、损坏帧和主观重复 QA。
2. 在每次新增 catalog date 时同步 Worker 的 manifest object key，之后可将
   当前硬编码日期改为受验证的版本配置。
3. 把生产 API 和 Electron 白名单 smoke test 固化为独立 E2E 测试账号流程。
4. 公开发布前，用 QCut 自有、CC0、AI 生成或另行授权的音效替换所有剪映
   参照资源;当前私有 bucket 不能作为公开音效 CDN。

## English

### Architecture and access

Sound Effects Lab now mirrors the private Jianying tier of Sticker Lab. The
`sound-effects-lab` Supabase bucket is private and contains a path-free
schema-v2 manifest plus 382 MP3 objects. Neither the audio nor the manifest is
committed or packaged.

The license server authenticates the QCut session and checks the independent,
fail-closed `SOUND_EFFECTS_LAB_ALLOWED_USER_IDS` secret before serving the
manifest or issuing a 600-second signed asset URL. The client keeps the entry
hidden until the manifest request succeeds. It validates the manifest, asset
size, and SHA-256, then stores downloaded resources in the existing IndexedDB
asset cache. Local schema-v1 manifests remain available for collection work.

The production allowlist contains `qcutlove@qcut.app`
(`79bf60b02770d2cc510da53e471590f4`) and `qcut-love2@qcut.app`
(`3c81ac37cdd53e079e3ed35e96ac5fac`). Credentials and tokens are not stored
in Git.

### Verification

Production contains 382 MP3 objects across 20 categories, totaling 84,579,696
bytes. A real allowlisted Electron session loaded the 382-item manifest,
streamed a signed audio object, showed the active player, and inserted a
2.742813-second waveform into the timeline. A real authenticated
non-allowlisted account received 403.

Automated verification passed 194 license-server tests, 110 related Web tests,
and two private-publisher tests, plus TypeScript checks. Evidence screenshots
are in
`~/Documents/QCut/exports/jianying-sfx-lab-2026-08-01/evidence/`.

### Release boundary

All references remain third-party, restricted, and non-redistributable. The
private bucket is an internal parity source, not a public QCut audio CDN.
Public release requires replacing every item with QCut-owned, CC0, generated,
or separately licensed audio.
