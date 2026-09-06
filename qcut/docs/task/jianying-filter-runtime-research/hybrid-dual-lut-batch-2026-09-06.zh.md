# 双 LUT 批量迁移：保留本地模型，QCut Metal 合成

日期：2026-09-06。分支：`timeline-fixed-prfix`，推送目标：`timeline-fixed`，PR #465。

## 结论与范围

本轮新增 **57 张混合路径滤镜**，不替换人像/皮肤分割模型。当前完整目录 892 张：

| 状态 | 数量 |
| --- | ---: |
| 完全独立 QCut 渲染，无剪映模型/运行库 | 713 |
| QCut Metal 调色 + 剪映本地模型 mask | 57 |
| QCut Metal 总目录 | 770 |
| 剩余渲染迁移 | 122 |

剩余 122 张：双 LUT 74、Face AI 33、Shader 10、脸部区域 LUT 3、未知 2；其中 4 张缺包。
“待迁移”不等于旧本机后端不可用。上一轮 185 已先减少到 179，本轮再减少 57 到 122。
目录核查文件：`/Users/peter/Downloads/QCut-Hybrid-Dual-2026-09-06/backlog-full.json`。

**没有声称 57 张完全脱离剪映二进制，也没有把它们标记为 verified。**
目前没有新增逐卡剪映 UI 无损导出参考；本轮量化对手是独立启动的本机原生运行时。

## 数据通路

```text
UI / filter-lab render-independent
  -> exact resourceId + version + control/asset hashes
  -> load background LUT + skin LUT
  -> retained local portrait runtime -> skin mask
  -> QCut Metal dualFrame -> output RGBA
  -> preview / CLI / video export
```

- 自有 Metal 着色器执行两个 LUT 的采样、分支强度、mask 混合和 Alpha 处理。
- `maskProvider: jianying-local-skin-v1` 明确标出依赖，界面显示“双 LUT · 本地模型”。
- 当前 mask source **仍通过旧原生 portrait session 初始化并渲染原包**，原生 RGBA 被丢弃，只取 mask。
  因此仍需要私有运行库、模型和原效果包，不是已经完成“仅模型推理”拆分，也不能承诺提速。
- Metal 子进程本身不加载剪映 dylib；另一个原生进程负责旧模型。
- 单 session 的帧队列串行，避免同一 tracker 历史乱序；不强行跨帧并发。
- 素材、尺寸变化、时间倒退、同时间不同像素会重建模型 session。相同素材/时间/像素只改强度可复用上一帧 mask。
- 强度 0 精确原图直通，不启动模型推理。缺模型/缺 mask 直接报错，不静默使用启发式皮肤颜色或原生 RGBA 替代。
- 保留旧剪映后端和所有旧 CLI，不覆盖其实现。
- 第三方 LUT、纹理、模型、运行库以及原始图像/视频证据全部留在仓库外。

## 三种采样协议

| 配置 | 数量 | 语义 |
| --- | ---: | --- |
| tiled | 11 | 8x8 LUT，蓝轴插值，两分支独立强度，按 Alpha 限幅 |
| vf | 21 | VF 3D cube，原生归一化采样坐标，Alpha 加权 |
| tiled-floor | 25 | 旧式 8x8 LUT，蓝轴 floor，Alpha 加权 |

每张卡固定版本及资源哈希；不按显示名称猜测实现，不因两个 LUT 内容相同就绕过模型。

## 已完成验证

本机证据根目录：`/Users/peter/Downloads/QCut-Hybrid-Dual-2026-09-06/`。

| 验证 | 结果 | 时间/证据 |
| --- | --- | --- |
| 单元、Metal 协议与界面回归 | 118/118，通过，0 失败 | `all-unit-final.json` |
| 57 张逐卡渲染门禁 | 57/57，共 513 组输入/强度比较 | 204.572 秒；`all-57-final/parity.json` |
| 非共享模型生命周期 | 三类代表卡，各 4 个步骤，12/12 | 34.085 秒；`lifecycle/lifecycle.json` |
| 三类代表卡 CLI 视频 | 3/3，1 秒、720p、30 帧，音轨保留且全片解码 | 9.889/9.141/9.327 秒；`cli/video-evidence.json` |
| 真实 Electron UI | 晴空海岸、宿营、Pocket3，搜索、点击、像素预览、导出 | 约 1.8 分钟；`editor/editor-evidence.json` |
| JPEG 修复后的产品回归 | 好莱坞III：CLI、真实 UI 预览、导出、项目重开全部通过 | CLI 9.514 秒，Electron 约 1.1 分钟；`cli-jpeg/`、`editor-jpeg/` |
| 项目重开 | 最后应用的 Pocket3 数据及像素预览断言通过 | `editor/lut-project-reopened.png` |
| 错误不可伪装成功 | Metal 故障提示可见、拒绝导出，不产生 MP4 | `editor/04-preview-failure-visible.png` / `05-export-failure-visible.png` |
| 故意配置不存在的模型目录 | CLI 返回失败；`model-missing.mp4` 不存在 | 错误：未找到剪映本机人像与皮肤分割模型目录 |
| 构建 | Electron、Web 构建通过，Metal 宿主编译通过 | Web 仍有已有路由/分块警告 |

全量门禁使用同一真人静帧水平平移 0/4/8 px，强度 0/37/100，逐次重复必须字节一致。
原生渲染器和 Metal **共享原生 mask**，只验证渲染数学；不能拿它证明模型预测一致。
最差单通道差 **3/255**，最差单组 RGB MAE **0.116428/255**；Alpha 差 0。
门禁没有放宽：MAE <= 0.25，单通道最大差 <= 4，重复输出一致。

单独的生命周期验证没有注入共享 mask，走产品真实 mask source：
人像 A -> 连续 A -> 灰帧 B -> 返回 A（时间倒退），三张均通过，最大通道差 1/255，
返回 A 与首次 A 字节一致。这不是两个人的换脸/跟踪测试。

CLI 和 Electron 输入是人像静帧平移合成的 1 秒短视频，**不是真实人物动作视频**。
Electron 的项目导航 helper 出现已有 network-idle 等待警告，后续导航与全部断言仍通过；`pageErrors=[]`。
好莱坞III 的目录封面没有命中私有缩略图缓存，显示占位图；中央真实输出预览、导出和重开均通过。

## 发现并修复的真实失败

首次全量只有 56/57 通过。“好莱坞III”满强度最大通道差 30，MAE 约 1.00。

其 `SkinFilter/image/filter_bg.png` 扩展名为 PNG，实际是 JPEG/JFIF；原 FFmpeg 路径的 JPEG 色度重建与
原生图像解码器不同。新增双 LUT 专用签名检查，JPEG 用现有图像解码器，真实 PNG 和旧独立单 LUT 路径保持不变。
限制文件大小和 JPEG LUT 尺寸，并补充伪装 PNG 扩展名、错误尺寸两个回归测试。

修复后该卡满强度最大通道差从 **30 降到 3**，MAE 约 **0.091**；37 强度最大差 1，
9/9 条件通过。证据：`jpeg-fix/parity.json`；最终 57 张重新全跑并通过，没有通过扩大门禁掩盖错误。

## 复现命令

需本机已具备有权使用的 QCut 私有快照，以下环境变量禁止回退到剪映安装包及用户缓存，
但不是 OS 级网络隔离证明。

```sh
QCUT_JIANYING_DISABLE_APP_BUNDLE=1 QCUT_JIANYING_DISABLE_USER_CACHE=1 \
bun scripts/verify-hybrid-dual-filters.ts \
  --source /path/to/opaque-portrait.png --output /path/out/parity

QCUT_JIANYING_DISABLE_APP_BUNDLE=1 QCUT_JIANYING_DISABLE_USER_CACHE=1 \
bun scripts/verify-hybrid-dual-lifecycle.ts \
  --source /path/to/opaque-portrait.png --output /path/out/lifecycle

QCUT_JIANYING_DISABLE_APP_BUNDLE=1 QCUT_JIANYING_DISABLE_USER_CACHE=1 \
bun electron/native-pipeline/cli/cli.ts filter-lab render-independent \
  --resource-id 7617814057051016484 \
  --filter-version 4fd60974ac9c764dce89084a739fa738 \
  -i /path/to/input.mp4 --output /path/to/output.mp4 \
  --filter-intensity 100 --json
```

UI：滤镜 -> 滤镜实验室 -> QCut Metal -> 搜索名称或资源 ID -> 应用。
旧“剪映本机”页仍保留。

## 本轮卡片

| 名称 | resourceId | 采样 |
| --- | --- | --- |
| 晴空海岸 | `7617814057051016484` | `tiled` |
| 生命力 | `7617813525322403113` | `tiled` |
| 自然绿意 | `7617812952967679274` | `tiled` |
| 复古质感 | `7617813566854286655` | `tiled` |
| 高饱和胶片 | `7617811392120507690` | `tiled` |
| 复古棕调 | `7617812345930124580` | `tiled` |
| 明艳 | `7617811076125576454` | `tiled` |
| 野性 | `7617812821895662867` | `tiled` |
| 美式复古 | `7617812708397731113` | `tiled` |
| 鲜活 | `7617813008064040198` | `tiled` |
| 多彩世界 | `7617812799330307364` | `tiled` |
| Pocket3 | `7493462285889899803` | `tiled-floor` |
| 富士NN | `7447157317457513743` | `tiled-floor` |
| City Walk | `7263360572404550931` | `tiled-floor` |
| 暮色约会 | `7332396398157090089` | `tiled-floor` |
| 街头 | `7263357855678467364` | `tiled-floor` |
| 初恋 | `7195812984306814267` | `tiled-floor` |
| Ditto | `7195816046077496635` | `tiled-floor` |
| 夜拍高光 | `7462637606052941095` | `tiled-floor` |
| 冷调CCD | `7434467628422270220` | `tiled-floor` |
| 桃木 | `7252673818035064124` | `tiled-floor` |
| 山晴 | `7246723856222719269` | `tiled-floor` |
| 镜粉 | `7145390299370638600` | `tiled-floor` |
| 暗银 | `7177725752513793284` | `tiled-floor` |
| 多巴胺 | `7237441824611224889` | `tiled-floor` |
| 阳光肤 | `7234795543178775868` | `tiled-floor` |
| 明肤 | `7302334059890478347` | `tiled-floor` |
| 好莱坞III | `7312617341710372107` | `tiled-floor` |
| 雾都 | `7312646650202262820` | `tiled-floor` |
| 里昂 | `7131643870714006821` | `tiled-floor` |
| 都市 | `7312646683672825100` | `tiled-floor` |
| 邂逅 | `7271145889119440147` | `tiled-floor` |
| 爱之城 | `7131656881805741325` | `tiled-floor` |
| 象牙白 | `7234799040184012092` | `tiled-floor` |
| 陶瓷肌 | `7234793127867878712` | `tiled-floor` |
| 去黄 | `7302338306849656127` | `tiled-floor` |
| 宿营 | `7127822311708691726` | `vf` |
| 好莱坞II | `7226995248814165308` | `vf` |
| 仲夏夜 | `7281166048273943867` | `vf` |
| 冷蓝 | `7127618237117877518` | `vf` |
| 红绿 | `7127622617699290399` | `vf` |
| 青红夜 | `7281575818621455628` | `vf` |
| 海山 | `7281162426219859255` | `vf` |
| 增色 | `7283013745788357925` | `vf` |
| 岩灰 | `7221472488079904060` | `vf` |
| IG白 | `7221479156318489893` | `vf` |
| 浅茶 | `7221481120083283257` | `vf` |
| 米棕 | `7221477781043973413` | `vf` |
| 原木 | `7127675195812351239` | `vf` |
| 复古工业 | `7127608212483820837` | `vf` |
| 暮光 | `7242211155131862332` | `vf` |
| INS暗 | `7223645151820877093` | `vf` |
| 煦日 | `7297144048903556388` | `vf` |
| 富士蓝II | `7226994246471945530` | `vf` |
| 富士青 | `7226994214029184313` | `vf` |
| 不要抬头 | `7202480720843984131` | `vf` |
| 独行侠 | `7202485617026977056` | `vf` |

## 下一步

1. 在不换模型的前提下，继续分类剩余 74 张双 LUT，区分额外 Pass、不同 mask 与未验证采样。
2. 将原生 mask source 从完整效果渲染逐步拆成仅模型推理；目前重复原生调色的成本仍在。
3. 补真实人物移动、多人/遮挡、较长视频、尺寸切换的独立模型会话验证。
4. 增加逐卡剪映 UI 无损参考与 mask 边缘对照，再决定是否提升 verification。
5. Face AI、嘴唇/背景区域等不能因为模型“存在”就当作已接好，逐条确认输出协议。
