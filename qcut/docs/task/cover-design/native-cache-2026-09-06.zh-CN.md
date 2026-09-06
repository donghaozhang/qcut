# 剪映封面：原生资源缓存与分类更正

日期：2026-09-06。分支：`codex/cover-design`。这是本机原生 UI 和磁盘文件实测，不是全量在线目录导出。

## 为什么之前没有一一对应

上一阶段交付的是五款 QCut 原创文字预设，使用自己的分类，尚未接入剪映资源目录。旧参考脚本只抽取了 4 张校准 JPEG 和 74 个 CEF 图片载荷；预览图片不能代表模板定义、字体和效果依赖已经保存。这一阶段的分类与缓存确实不满足剪映对照要求。

更早研究把 Web 图文编辑器证据推广到了全部封面入口，并把 `Cache/template` 归为普通视频模板。该判断不成立：当前原生 Qt“封面设计”确实使用此目录。Web/CEF 和原生路径必须分别记录。

## 原生实测

应用 `/Applications/VideoFusion-macOS.app`，项目“8月30日 (3)”。从封面入口浏览八个分类，在原生编辑器应用生活、游戏、知识、时尚、影视、美食中的样本，观察文字和布局，并核对新增模板文件及对应预览。试用结束点击“取消”，没有设为项目封面或导出。

原生缓存位置，相对于 `~/Movies/JianyingPro/User Data/Cache`：

| 内容 | 路径 | 实际作用 |
| --- | --- | --- |
| 定义 | `template/<32位hash>/template.json` | 含 `cover.cover_draft` 的原生设计 |
| 卡片预览 | `image/<32位hash>` | 本批为 250×141 WebP，已经栅格化 |
| 字体与效果包 | `effect/`、`artistEffect/` 下对应 hash 目录 | 与定义分开下载，必须保留完整包内容 |

美食样本下载的模板 ZIP 只有 25,304 字节的 `template.json`，不包含所有依赖。原生模板可引用旧版本资源 ID 和逻辑路径。模板中的作者视频/相册路径是可替换背景槽位，不是需要复制作者原图的证明。

格式观察：`cover.cover_draft.materials.texts` 保存文字；文字轨道在样本中标为 `sticker`，按材料 ID 关联。`clip.transform` 是以中心为原点的归一化坐标，`render_index` 决定层叠；原生 `font_size` 不能直接当浏览器像素。根画布可能为 1280×720，而封面子草稿画布为 0×0，需要原生画布适配规则。当前没有把这些字段草率转换成 QCut 文字样式。

## 分类及首批映射

QCut“剪映缓存”按原生顺序显示 **默认、推荐、生活、游戏、知识、时尚、影视、美食**。“QCut 原创”独立保留，不再混充剪映模板。默认提供无模板入口和本批缓存总览；推荐/生活按已观察关系重复收录，不是互斥目录。尚未复刻原生默认页的全部推荐分组。

| 原生标题 | 观察分类 | 模板目录 hash |
| --- | --- | --- |
| 周末的仪式感 | 推荐、生活 | `252d7f45012403c9057adf0ec424c190` |
| Jessica's Travel Vlog | 推荐、生活 | `9d5a6d5d8fd792ba03e526c5b60b87be` |
| Iceland Vlog 冰岛旅行 | 推荐、生活 | `814ffb9c88f94377add6086eddd23366` |
| 新赛季必备攻略 S23 | 游戏 | `693cce8292c983e489b29a4064cabb9f` |
| Day 1 七天吉他速成教学 | 知识 | `3a968d702f5e4c3dfa5a50be411076c9` |
| 爱用物 购物车 | 时尚 | `a0993f286b672cd8d029555ca27f6589` |
| HERO | 影视 | `a9b51a7e209a8b1ca8160d495684c8ac` |
| Tacos Cheese Omelette 鸡蛋芝士墨西哥饼 | 美食 | `554f82dcf87a9a0b27476f6dc76ee978` |

精确预览 hash 和分类观察保存在本地主库的 `observations.json`，导入后进入 `catalog.json`。未把名字相似或任意 CEF 图片自动配给模板。

## QCut 自有存储副本

“自有”指 QCut 管理的独立文件副本，不代表获得模板版权或再分发许可。专有资源留在用户本机，不加入仓库和发布包，不提取登录令牌、请求头或加密项目正文。

- 主库：`~/Library/Application Support/QCut/PrivateAssets/JianyingCover`
- 备份：`$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingCover`
- 可用 `QCUT_JIANYING_COVER_CACHE_ROOT` 指定另一份库，需重启读取它的 Electron/Vite 进程。
- `catalog.json` 保存定义、预览、依赖、逻辑路径和 SHA-256；文件按 `objects/<sha256>` 去重。
- 首次采集为 8 套、69 个去重文件、33,938,996 字节。依赖恢复后为 **8 套、119 个去重文件、46,579,803 字节**，不包含清单本身或未引用对象。
- 当前 **3 套的显式依赖已有文件副本，5 套仍各缺一个旧滤镜**；含目录版本映射和内置资源绑定，不代表旧版逐字节相同。全部标记 `native-renderer-required`，不能称为离线可套用。

导入器顺序复制并验证每个文件，最后原子更新目录。重复导入按内容去重；下一批合并已有条目。失败不会发布部分目录，但可能留下未引用的内容对象。拒绝越界、符号链接文件、无效模板、错误预览类型和读写期间变化的文件。当前未提供跨进程导入锁，勿同时运行多个写入进程。

UI 的 Electron IPC 与本地 Vite 开发接口只读取这份独立库，不回退到剪映源目录；校验失败显示错误。Electron 限定主窗口主 frame；开发接口拒绝跨站请求、非 localhost Host 和非 GET 方法。生产浏览器版不开放本机文件接口。

## 依赖恢复与实验室复用

封面恢复器复用现有文字实验室的 `resource-catalog`、`local-package-index`、`resource-recovery-installer`，以及滤镜实验室的下载器。没有另建一套花字下载协议。按精确 hash 优先，再按资源 ID 或目录中明确的 `third_resource_id_str` 别名解析；不按标题猜替代资源。下载沿用包 MD5、归档安全检查和受限 CDN。恢复后的包仍逐文件复制进封面自己的 SHA-256 对象库，不依赖实验室源路径长期存在。

| 已恢复依赖 | 证据与处理 |
| --- | --- |
| 周末：中秀体 | `6917512631515353607`，恢复原 hash `9561161c74ae03658e101577ec5cfae6`，2 个文件 |
| 游戏：花字 002 | 旧 ID `6724177156223537672` 明确映射目录 ID `6896137661153578248`；新版 hash `77c43f3eca3e0979c3c5972ec6fe4822`，22 个文件。包为 **InfoSticker**，不能只用 TextStyle 校验器判定下载失败 |
| 美食：德古拉 | 旧 ID `6830373641172029966` 映射目录 ID `7127678346472819982`，从滤镜实验室复制新版 `46a045d4b8ed3d6058a4d2141efba43a`，15 个文件 |
| 知识：系统字体 | 仅对明确标记“系统”且没有资源 ID 的字体绑定应用 `Font/SystemFont/zh-hans.ttf`，复制实际字体；不宣称等同历史字体 hash |
| 游戏：亮度 | 仅识别已知 iOS 内置路径和 brightness 类型，并保留模板 `v1` 选择，复制 `DefaultAdjustBundle/brightness_v1` 的 13 个文件；未知版本拒绝猜测 |

原始 `template.json` 不改写。每项新增 `resolution` 保存来源、解析方法、资源 ID 和新版 hash；UI 展示花字/字体/滤镜实验室来源及版本映射。内置绑定和目录版本映射只是资源解析结果，**不是渲染对齐证明**。只有原始 ZIP、没有可解析配置的花字归档不会被当成已恢复依赖。

## 仍缺什么

仍缺的都是实际被封面轨道引用的旧滤镜，不能作为无用材料删除：

| 滤镜 | 旧资源 ID | 模板 |
| --- | --- | --- |
| A-log | `6867493201318515207` | 周末的仪式感 |
| 午后 | `6709359425695519240` | Jessica's Travel Vlog |
| 小镇 | `6877828523751379470` | Iceland Vlog |
| 自然 | `6864084600281371150` | S23 |
| 赛博朋克 | `6746808141544952323` | HERO |

当前剪映两个账号的目录、QCut 文字缓存目录、888 项滤镜候选及滤镜运行时的 36 份历史资源数据库中，均未取得这些旧 ID 的可用映射或下载地址。旧 hash 也未在已检查的本地包索引中找到。UI 保留 `catalog-missing`；这不是已经证明官方永久下架。需要剪映返回原包或可核验的 ID 映射后继续恢复，不能以同名滤镜或恒等 LUT 冒充。

这不是全部在线模板下载器。后续批次需要在剪映内正常下载，核对分类、卡片、定义及预览；当前脚本不绕过登录、付费或下载限制。完整渲染兼容、套用后的编辑和离线重开仍未实现。卡片点击目前只查看依赖详情，不会将预览图套到设计上。

## 运行与恢复

在有 Bun 和依赖的应用根目录运行；本机是 `$HOME/.cache/qcut-cover-validation/qcut`，源码仍以 SSD 为准：

```sh
bun build scripts/cache-jianying-cover.ts --target=node --outfile /tmp/qcut-cache-cover.mjs
node /tmp/qcut-cache-cover.mjs --recover \
  --observations "$HOME/Library/Application Support/QCut/PrivateAssets/JianyingCover/observations.json" \
  --application-resources /Applications/VideoFusion-macOS.app/Contents/Resources \
  --backup "$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingCover"

bun scripts/cache-jianying-cover.ts --verify \
  --destination "$BACKUP_ROOT/qcut-materials/PrivateAssets/JianyingCover"
```

恢复模式用 Node 22.13+ 执行，因为共享实验室目录解析器使用 `node:sqlite`。不传 `--recover` 时保持原来的仅复制剪映已下载精确包行为，不访问网络；`--verify` 不读取实验室或剪映源目录。不要在同一库上并发运行恢复命令。

新增批次使用另一个 observations JSON 数组，每项为 `packageHash`、`previewHash`、`title`、`categories`、`evidence: "native-ui-and-template-content"`；无需重建既有库。备份含全部目录引用对象，可复制整个备份到新位置后运行 `--verify`，或将环境变量指向备份。观察文件只用于下一次导入，读取和恢复不依赖它。

## 验证

- 恢复后 18 个测试文件、139 项测试通过；Web/Electron TypeScript 与变更代码 Biome 检查通过。
- 新测试覆盖实验室复用、64 位 ID、版本映射、InfoSticker 花字恢复、原始归档拒绝、内置版本选择、禁止默认下载、不可信滤镜 URL、符号链接和来源消失后的独立备份。
- 缓存测试覆盖源目录删除后读取、备份恢复、重复/分批导入、缺依赖、排除作者素材、路径与符号链接、损坏和失败不发布；组件测试覆盖八分类、多分类成员、详情而非套用、刷新错误和过期异步响应。
- 真实 SSD 备份在 macOS sandbox 禁止读取剪映用户目录、剪映应用、QCut 文字缓存和托管滤镜包目录后仍成功校验 **119 个对象**。没有移动或删除真实剪映数据。
- 浏览器恢复后显示知识、时尚、美食资源已缓存；游戏详情为 5/6，能看到花字实验室及版本映射，唯一缺项为自然滤镜。现有原创封面内容未改变。
- 本地开发接口 GET 返回 8 条；外部 Origin 返回 403，POST 返回 405。
- 浏览器实际显示 8 张解码成功的 250×141 卡片；游戏分类仅显示 S23。点击时尚模板出现 4 个文字图层及 3/3 依赖信息，现有封面设计保持不变。
- 1440×900 和 390×844 布局检查；缓存卡片使用实际预览，窄屏保持两列和区内滚动。未做原生 Electron 缓存 UI E2E 或剪映模板渲染对齐。

完整自动化命令在 README 的封面回归命令上增加 `electron/__tests__/jianying-cover-private-cache.test.ts`、`electron/__tests__/jianying-cover-handlers.test.ts` 和 `electron/__tests__/jianying-cover-dependency-recovery.test.ts`；使用非 AppleDouble 的实际测试文件。exFAT 同步必须排除 `._*` 与 `.DS_Store`，不能将磁盘元数据当源码同步到 APFS。
