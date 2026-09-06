# 封面目录分批采集与四阶段统计

日期：2026-09-06。分支：`codex/cover-design`。PR：[#463](https://github.com/Quriosity-agent/qcut/pull/463)。

## 当前进度与阻塞

**本轮新增模板为 0，尚未完成剪映在线全量目录采集。** 已实现并实跑观察目录去重、分类分批、缓存重试、独立备份和四阶段报告；这些工具不能代替目录来源本身。

当前原生剪映主窗口灰显，封面入口点击和窗口切换没有进入可操作的封面页。自动化发现多个应用共用 `com.lemon.lvpro`；主应用可读，但选择内部子应用路径两次超时。未重启或强制结束剪映，也未修改项目正式封面。已请求用户将“封面设计”窗口置于最前并停留在“模板”页，之后才能继续逐分类翻页、下载和对应卡片。

已检查现有资源数据库与 `Cache/template`：后者有 8 份含 `cover.cover_draft` 的定义，均已收录。未从现有资源 SDK 表中找到这批封面的可用目录；没有把普通字幕模板或历史 CEF 图片当作封面目录，也没有复制登录数据或尝试解密账号存储。

## 统计口径

- **已发现**：有明确包哈希、预览哈希、标题、实际观察分类的记录。当前不是在线模板总数。
- **已缓存**：定义、预览及清单中已保留的依赖字节通过完整性校验；仍允许清单明确列出缺失依赖。另列 `dependenciesComplete`，避免把缓存包存在说成依赖齐全。
- **可套用**：本轮指文字布局解析、字体和花字包准备成功，不是完整背景模板，也不是逐项实机渲染成功。
- **已验证**：实际文字布局渲染、保存与重开记录；模板和依赖指纹必须匹配，证据文件必须存在且 SHA-256 正确。它是带运行环境与时间的人工验证收据，不是截图语义自动识别或像素对齐证明。

| 分类 | 已发现 | 已缓存 | 可套用文字布局 | 已验证 |
| --- | ---: | ---: | ---: | ---: |
| 默认/去重总览 | 8 | 8 | 7 | 3 |
| 推荐 | 3 | 3 | 2 | 1 |
| 生活 | 3 | 3 | 2 | 1 |
| 游戏 | 1 | 1 | 1 | 1 |
| 知识 | 1 | 1 | 1 | 0 |
| 时尚 | 1 | 1 | 1 | 0 |
| 影视 | 1 | 1 | 1 | 1 |
| 美食 | 1 | 1 | 1 | 0 |

推荐与生活包含相同的三个包，分类不能相加当作唯一模板总数。显式依赖完整为 3 套；Iceland 因竖排尚不支持，不计入可套用。3 套已验证为周末、S23、HERO，证据来自本日此前实际操作，不声称本轮全部重新渲染。

## 本轮实际批次

对 5 套缺依赖样本使用 `--retry-missing --recover --batch-size 2`：推荐 2 套、推荐 1 套、游戏 1 套、影视 1 套，共 4 批。每批成功更新后独立校验 SSD 备份；5 个旧背景滤镜仍缺，未使用同名替代或空效果。

同时修复重试可能丢失已保留依赖的问题：只有定义 SHA-256 相同且旧依赖已缓存时才复用自有字节，最终继续校验；定义变了不能复用旧依赖。新增分类关系会合并进已有卡片，不重复下载。

## 文件与恢复

- 主库：`/Users/peter/Library/Application Support/QCut/PrivateAssets/JianyingCover`
- SSD：`/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover`
- `collection-observations.json`：累积去重后的观察目录。
- `collection-report.json`：逐分类四阶段统计、缺失引用、准备失败原因、最近运行的批次状态。不是永久追加日志；重新运行会替换最新报告。
- `collection-verifications.json`、`collection-evidence/<sha256>`：验证收据与实际证据字节，两边均保留。外部截图源消失后可以从自有副本重新校验。
- 原有 `catalog.json`、`objects/<sha256>` 仍是 UI 消费的正式资源库。专有资源及本地清单不提交 Git。

新增批次的 observations 数组仍遵守 `CoverObservation`：包哈希、预览哈希、标题、分类、`native-ui-and-template-content` 证据类型。应在原生 UI 正常下载并对应定义后录入，不能凭标题猜哈希。相同包跨分类合并；相同包的标题或预览冲突会停止等待核对。

在具备仓库依赖的应用根目录运行：

```sh
bun build scripts/collect-jianying-covers.ts --target=node --outfile /tmp/qcut-collect-jianying-covers.mjs
node /tmp/qcut-collect-jianying-covers.mjs \
  --observations /absolute/path/new-observations.json \
  --batch-size 5 --recover \
  --application-resources /Applications/VideoFusion-macOS.app/Contents/Resources \
  --backup '/Volumes/MOVE SPEED/qcut-materials/PrivateAssets/JianyingCover'
```

仅重校已有库用 `--audit-only`，不需要剪映源目录存在。已缓存包默认跳过，修复缺失依赖时显式使用 `--retry-missing --recover`。每批 1–25 套；主库与备份各保留至少 5 GB 空间。锁冲突直接停止，不删除他人的锁；异常退出留下锁时先核对记录中的进程，不能盲目清理。

录入人工验证收据时使用 `--verification /absolute/path/receipts.json --evidence-root /absolute/path/screenshots`。新增收据与已有记录累积合并，相同包与指纹去重，不覆盖其他模板的历史验证。后续无需重复传入，默认读取自有收据和证据副本；内容变化会使旧验证不再计数。

## 验证与下一步

22 个相关测试文件、178 项测试通过；包含真实子进程 CLI 的分批、断点恢复、重复条目、分类合并、来源消失、锁冲突、证据损坏与独立备份检查。Node/Electron 类型环境下 CLI TypeScript 检查、CLI 打包及 6 个变更代码文件的 Biome 检查通过。

下一步仍是解决原生封面子窗口访问，逐分类读取实际卡片和翻页边界。分类目录全量枚举、未下载模板定义的正常获取，以及新增模板逐项渲染验证均未完成；当前没有后台采集进程继续运行，也未创建定时任务。
