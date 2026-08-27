# Sound Effects Lab Finalization / 音效实验室收尾

Date / 日期: 2026-08-26

Branch / 分支: `codex/sound-effects-lab-finalize`

Production Worker / 生产 Worker:
`https://qcut-license-server.zdhpeter.workers.dev`

Worker version / Worker 版本:
`4ed16f18-7827-4b21-97fd-70984259e5de`

## 中文

### 结论

本轮把音效实验室此前记录的五项产品与验证缺口全部落地:

1. 功能开启时入口始终显示，并有加载中、无权限、不可用和离线目录状态;
2. 交互按单条许可证决定:314 个 Freesound CC0 音效可收藏、加入收藏夹和拖拽，
   1108 个剪映内部参照继续禁用这些可复用动作;
3. 剪映条目保留并显示作者、发布来源、VIP、付费类型和业务范围元数据;
4. 提交了真实生产 opt-in Electron E2E，覆盖加入时间线、保存、退出重开、
   收藏恢复、收藏夹恢复和最终导出;
5. 对本地 1422 个音频执行完整解码、哈希、时长、声道、采样率和峰值 QA。

产品链路已经可用，但这不等于公开发行内容已经与剪映完全对齐。当前私有目录
仍包含 1108 个不可公开再分发的剪映参照，并仍缺 314 个与当前剪映 resource ID
一对一相同的原始载荷。

### 当前目录与剪映差距

| 指标 | 结果 |
|---|---:|
| QCut 总音效 / 分类 | 1422 / 20 |
| Freesound CC0 可复用 | 314 |
| 剪映内部参照 | 1108 |
| 当前剪映唯一 resource ID | 1411 |
| QCut 与当前剪映精确重合 | 1097 |
| QCut 历史剪映条目 | 11 |
| 当前剪映一对一原始载荷缺口 | 314 |

因此有两个不同答案:

- **数量和分类容量:** 已有 1422 条，容量缺口为 0;
- **剪映当前原始内容一对一对标:** 仍差 314 条，且 11 条 QCut 参照已不在
  当前剪映目录中。

314 个 CC0 条目是合法来源的分类容量替代，不是缺失剪映条目的逐项复刻。

### 元数据结果

本轮从当前剪映本地资源数据库解析 1108 个 QCut 剪映参照:

| 指标 | 结果 |
|---|---:|
| 当前数据库精确匹配 | 1097 |
| 历史未匹配 | 11 |
| VIP | 554 |
| 免费或未标记 | 543 |
| 有作者信息 | 1085 |
| 有 copyright 文本 | 0 |

新版生产清单位于私有 bucket 的版本化对象:

`qcut/2026-08-26/manifest.metadata-candidate.json`

该对象已经上传并回读，远端与本地 SHA-256 均为:

`d3ae32457c40d93300626c8f4824020a3daf771a0564b6bb8afb6a51e4984cd1`

服务端使用双端点发布:

```text
新版客户端
  -> GET /api/sound-effects-lab/private-manifest/enriched
  -> 200: 使用带 VIP/作者元数据的新清单
  -> 404: 仅此情况回退 /api/sound-effects-lab/private-manifest
  -> 401/403: 不回退，撤销当前账号离线完成记录并 fail closed

旧版客户端
  -> GET /api/sound-effects-lab/private-manifest
  -> 继续读取 2026-08-22 Batch-08 清单
```

这样不会用新可选字段破坏旧版严格解析，同时新版已经在线显示 554 个 VIP。

### 许可证与交互

| 条目 | 试听/授权账号加入时间线 | 收藏 | 收藏夹 | 拖拽 | 公开再分发 |
|---|---:|---:|---:|---:|---:|
| Freesound CC0 | 是 | 是 | 是 | 是 | 按 CC0 可用 |
| 剪映内部参照 | 私有白名单内可用 | 否 | 否 | 否 | 否 |

收藏与收藏夹保存的是稳定的私有资源定位信息，不保存短期 signed URL 或临时
`blob:` URL。重新打开项目时会重新授权并解析资源。

### 全库音频 QA

报告:

`/Users/peter/Documents/QCut/Exports/qcut-sfx-lab-finalize-2026-08-26/audio-qa-report.json`

| 检查 | 结果 |
|---|---:|
| Manifest 项 / 唯一本地文件 | 1422 / 1422 |
| 完整验证 / 失败 | 1422 / 0 |
| 唯一内容 SHA-256 / 重复组 | 1422 / 0 |
| MP3 | 1422 |
| 单声道 / 双声道 | 150 / 1272 |
| 警告条目 | 199 |
| near-clipping | 197 |
| low-sample-rate | 3 |

3 个低采样率文件分别为 8 kHz、11.025 kHz 和 12 kHz。警告中有一个条目同时
命中两个规则，所以 197 + 3 对应 199 个唯一警告条目。所有文件均可解码，
manifest 时长差为 0。本轮没有重编码原始参照，以免改变哈希与来源证据。

### 真实生产 E2E

命令:

```bash
QCUT_RUN_PRIVATE_SFX_E2E=1 bunx playwright test \
  apps/web/src/test/e2e/sound-effects-lab-private.e2e.ts \
  --project=electron --reporter=line
```

结果: `1/1` 通过，23.3 秒。E2E 还直接验证旧生产端点返回 1422 项、新端点
返回 1422 项且包含 554 个 VIP。

E2E 使用独立 Electron user-data 目录和真实生产 Worker，完成:

1. 创建项目并加入测试视频;
2. 打开 1422 项私有目录，断言 314 可复用、1108 受限、554 VIP;
3. 搜索 `Crowd laugh`，收藏并加入 `E2E 可复用` 收藏夹;
4. 将真实 CC0 音频加入时间线;
5. 退出 Electron、重新启动并打开项目;
6. 验证收藏、收藏夹和音频时间线均恢复;
7. 导出 5 秒 MP4。

导出文件:

`/Users/peter/Documents/QCut/Exports/qcut-sfx-lab-finalize-2026-08-26/sound-effects-lab-e2e-export.mp4`

导出验证:126,351 bytes，5.000 秒，H.264 视频 + AAC 48 kHz 单声道;
音频平均响度 `-25.3 dB`、峰值 `-5.9 dB`，不是静音。

结构化报告:

`/Users/peter/Documents/QCut/Exports/qcut-sfx-lab-finalize-2026-08-26/sound-effects-lab-e2e-report.json`

截图证据:

- [1422 项线上目录、混合许可证和 554 VIP](./evidence/22-live-catalog-1422.png)
- [CC0 收藏和个人资源操作](./evidence/23-cc0-personal-actions.png)
- [CC0 音效加入时间线](./evidence/24-cc0-timeline.png)
- [退出重启后收藏和时间线恢复](./evidence/25-restart-persistence.png)
- [带音频 MP4 导出成功](./evidence/26-export-complete.png)

### 自动化与构建

- 14 个相关 Web/脚本测试文件:81/81;
- Web 音效实验室 hook 双端点兼容测试:8/8（包含在上述 81 个测试内）;
- license-server 音效实验室路由测试:12/12;
- license-server TypeScript:通过;
- Web production Electron build:通过;
- Electron 主进程/preload/runtime build:通过;
- 最终相关回归矩阵和脚本测试已再次执行并通过。

### 下一子任务

1. **公开发行 P0:** 用 QCut 自有、CC0、AI 生成或另行授权的内容替换 1108 个
   剪映内部参照。在此之前继续保持 private bucket、账号白名单和 fail closed。
2. **内容 QA P1:** 人工抽听 197 个 near-clipping 和 3 个低采样率条目，决定
   是否保留原始参考、制作不改变来源记录的派生母版，或替换资源。
3. **元数据 P1:** 查找 11 个历史 resource ID 的旧数据库快照;当前数据库没有
   copyright 文本，不能把空字段解释为已获得版权。
4. **正式安装包 P1:** 在签名的 `app://.` 安装包执行空缓存 1422 项冷下载、
   断网重开、离线播放和删除离线包。源码 production build 的真实 E2E 已通过，
   但不能替代正式安装包持久化验证。
5. **产品恢复 P2:** 补取消/暂停/恢复、磁盘空间不足、浏览器配额回收和单文件
   损坏后的用户级恢复 E2E。

## English

### Result

This pass closes the five implementation and verification gaps recorded for
Sound Effects Lab. The enabled entry is always visible with loading, access,
unavailable, and offline states. Personal-library actions are decided per item:
the 314 Freesound CC0 sounds can be favorited, filed, and dragged, while the
1,108 restricted Jianying references remain locked for those reuse actions.
Jianying author, source, VIP, paid-type, and business-scope metadata now survive
manifest parsing and rendering.

The product workflow is operational, but public-content parity is not complete.
QCut has 1,422 sounds in 20 categories: 1,108 Jianying internal references and
314 Freesound CC0 substitutes. The current Jianying snapshot has 1,411 unique
resource IDs. QCut overlaps 1,097 of them, retains 11 historical references, and
still lacks 314 exact current Jianying payloads.

### Metadata and rollout

Of the 1,108 QCut Jianying references, 1,097 matched the current local Jianying
databases. The enriched catalog records 554 VIP items, 543 free or unmarked
items, and 1,085 author records. Eleven historical IDs were not found, and the
current databases supplied no copyright text.

The production Worker now exposes a backward-compatible dual-manifest contract.
New clients request `/api/sound-effects-lab/private-manifest/enriched` and fall
back to the legacy endpoint only on 404. Authentication or allowlist failures
never fall back. Existing clients continue using `/private-manifest` unchanged.

### QA and E2E

The full local QA verified all 1,422 unique MP3 files with zero failures and
zero duplicate content hashes. It reported 199 warning items:197 near-clipping
and three low-sample-rate items, with one item in both groups. These warnings are
review candidates, not decode failures.

The real production Electron E2E passed in 23.3 seconds. It directly confirmed
1,422 items from both the legacy and enriched production endpoints, plus 554 VIP
items from the enriched endpoint. It also proved CC0 favorite/folder actions,
timeline insertion, project persistence across an Electron restart, and final
MP4 export. The 5-second export contains H.264 video and non-silent 48 kHz AAC
audio. The five screenshots above are committed evidence for each stage.

### Next subtask

Public release still requires replacing all 1,108 restricted Jianying
references with QCut-owned, CC0, generated, or separately licensed sounds. The
next verification priorities are manual review of the 199 QA-warning items,
recovery of metadata for 11 historical IDs, a signed `app://.` cold-install and
offline-pack test, and user-facing recovery E2E for cancellation, quota, and
corrupt files.
