# 224 张复杂滤镜迁移：首批 26 张独立 Metal 实现

日期：2026-09-06。承接 [667 张本地 LUT 接入](independent-lut-batch-2026-09-06.zh.md)。

## 结论与范围

**本轮完成 26 张，不是 224 张全部完成。** 独立后端从 668 增至 **694 张**，尚余 **198 张**。
原有剪映二进制后端、旧 CLI 和项目数据保持兼容。新实现通过 `qcut-metal-graph-v1` 单独保存和派发。

| 新增拓扑 | 数量 | 卡片 |
| --- | ---: | --- |
| 锐化 + LUT，2 Pass | 6 | 清透美食、食色、味蕾、贝果、暗曛、西冷 |
| LUT + 双边柔化 + 纹理暗角，3 Pass | 4 | 暗角旧影、旧时来信、蓝调舞曲、古早记忆 |
| LUT + 自适应尺寸双边柔化，2 Pass | 3 | 富士CC I、佳能G7X II、富士CC II |
| 直接 3D LUT 采样，1 Pass | 13 | 摩登、嬉皮士、黑冰、铅绿、冰茶、富士NC III、富士NC I、富士NC II、GR正片、GR绿、日和、倾森、都卡 |

新目录包含：迷雾 1 + 原有纯 LUT 667 + 本轮 26 = 694。
界面中迷雾有独立卡片，下面的“本地滤镜”显示 693，两个数字没有冲突。
这些数字来自本机 892 张缓存目录快照，不是剪映在线商店总量。

## 真实实现

- `electron/qcut-independent-filter/graph-profiles.ts`：26 张准确的资源 ID、版本、控制文件 SHA-256、实际使用的 LUT/纹理 SHA-256，以及拓扑参数。未知版本、资源变更、AI 依赖不允许自动套用。
- `graph-data.ts`：从 QCut 私有缓存读取并校验资源；限制文件大小、尺寸，拒绝符号链接；不加载原始 Lua/Shader 作为执行代码。原始控制文件只参与完整性校验。
- `adobe-three-dl.ts`：Adobe 10-bit 输入/12-bit 输出，以及显式 `3DMESH` 格式。按声明位深归一化，不按文件内观察到的最大值拉伸；将 B 最快的数据重排为 Metal 的 R 最快纹理布局。
- `graph.metal`：自有锐化、双边柔化、暗角叠加和 3D 纹理采样代码。LUT 图集走半 texel 中心采样，原生 3DL 路径保留其直接归一化坐标语义。
- `host.mm`：增加独立 `--graph` 模式；每层独立 RGBA8 目标纹理，LUT 为 RGBA32Float；输入/输出同尺寸，零强度字节透传。
- `session.ts` / `lut-provider.ts`：启动前快照资源参数；沿用最多 8 个排队请求、4 个驻留宿主、30 秒空闲释放，不驱逐正在处理的帧。
- UI 预览、媒体/调节层/filter stack 导出、新 CLI 均识别 graph provider。加载失败会报错，不回退成原图或旧二进制滤镜。

`otool -L electron/resources/bin/qcut-independent-filter-host` 仅列出 Apple Foundation/Metal/CoreFoundation、libobjc、libc++、libSystem，**没有剪映 dylib**。
对照测试的 oracle 使用私有剪映二进制，但产品独立渲染路径不使用它。
LUT/纹理继续保留在用户本地；自有实现不自动授予这些资源的再分发许可。

## 本轮发现并修复

1. **相同 Shader 不代表相同 graph。** 富士CC/佳能三张卡虽残留暗角文件，实际 scene 只有滤镜和柔化两层；最初错误叠加暗角产生约 10/255 MAE。按实际相机输出和纹理连接改为两层后，代表卡最大差降至 3/255。
2. **模糊采样尺寸不同。** 四张暗角卡保留 720x1280 采样 uniform；三张相机卡把短边归一到 720。不能全部使用当前输出尺寸。暗角旧影最初高强度 MAE 0.519、最大差 12，修正后约 0.012、最大差 3。
3. **3DL 不是单一格式。** 五张 NC/GR 卡是 `3DMESH / Mesh 4 10`，不能按 Adobe 12-bit 解析。另三张的文件名为 `filter.3dl`，并且不采用 alpha 加权。
4. **旧 CLI 不一定是二进制 oracle。** 五张锐化卡旧 CLI 走 `ffmpeg-multi-pass / structural`，其平均差达到约 3/255。这是错误选择对照后端；改为直接调用 Swing 原生渲染后通过，未通过提高阈值来掩盖该问题。
5. **暗角旧影的 Swing 强度事件不可靠。** 37% 对照会接近满强度；使用已有、带校验的 CGL bootstrap 路径设定参数。其余 25 张用 Swing 强度事件。报告逐项标明 oracle，而不是把两条路径混为一谈。
6. **批量 LUT 回归范围需要固定。** 原来的 667 张验证脚本现明确筛选 `independentKind: lut`，避免把新增 graph 错当纯 LUT。
7. **私有缓存补齐。** 清透美食、暗角旧影两个版本包原先只有剪映用户缓存；复制到 QCut 自管 `JianyingFilterPackages/artistEffect/`，不改源目录。26 张已通过禁用剪映用户缓存后的控制文件和资产指纹校验。

## 验证结果

证据目录：`/Users/peter/Downloads/QCut-Independent-Complex-2026-09-06/`。

### 逐卡原生像素对照

脚本：`scripts/verify-independent-graph.ts`。

| 输入 | 卡数 | 强度 | 通过 | 最差一组 RGB MAE | 全部最大通道差 | 耗时 |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| 真人静帧 1280x720 | 26 | 37、100 | 52/52 | 0.095677/255 | 4/255 | 66.899 秒 |
| 颜色/边缘测试图 321x181 | 26 | 37、100 | 52/52 | 0.084267/255 | 2/255 | 25.794 秒 |

两组共 **104 次对照全部通过**。每张另检查零强度字节一致、重复渲染一致；alpha 差均为 0。
本轮门槛是 RGB MAE <= 0.25、最大通道差 <= 4、alpha 差 0。富士CC II 真人图有单通道最大差 4，不能写成逐像素完全相同。
时间包含资源加载、宿主启动、原生对照和 PNG 写盘，不是纯视频渲染吞吐。

- `portrait-verified/graph-parity.json`：最终真人结果和每张卡的输出路径、哈希。
- `pattern-final/graph-parity.json`：颜色/边缘测试图结果。
- `comparison-four-families.png`：四类代表卡三列对照：原图 / 原生二进制参考 / QCut Metal，强度 100。
- `portrait/`、`portrait-final/` 保留早期失败记录，不能当作最终结果。

**这是二进制 oracle 对照，不是本轮新做的剪映 UI 导出对照。** 26 张仍保留 `verification: unverified`，不继承旧目录的 verified 标记。
两张对照输入均为不透明图像；透明像素只覆盖基础合约测试，不代表复杂 premultiplied-alpha 素材已完成剪映 parity。

### 真实 CLI 视频

用当前源码入口执行新命令，四类各选一张，禁用剪映用户缓存：

| 滤镜 | 输出文件 | 验证耗时 |
| --- | --- | ---: |
| 清透美食 | `cli/sharpen.mp4` | 4.778 秒 |
| 暗角旧影 | `cli/vignette.mp4` | 4.702 秒 |
| 富士CC I | `cli/soften.mp4` | 4.829 秒 |
| 摩登 | `cli/direct.mp4` | 4.829 秒 |

均为 1 秒、1280x720、30 帧，保留音轨，ffprobe 检查帧数/尺寸，FFmpeg 全段解码成功。
`cli/evidence.json` 和逐视频 `.json/.log` 保留命令结果，后端为 `qcut-metal`。
素材是已有真人静帧平移测试片，不冒充真实连续人物拍摄视频。

### 真实 Electron UI

`apps/web/src/test/e2e/qcut-independent-filter.e2e.ts` 增加 `QCUT_INDEPENDENT_GRAPH_E2E=1`。

1. 真实导入视频、加入时间线、点击滤镜实验室与 QCut Metal 页签。
2. 分页、搜索、分类筛选后，分别点击上述四张新增卡；逐项读取保存的 `qcut-metal-graph-v1` 与资源 ID。
3. 四张均看到非空像素预览并导出 1 秒、30 帧 MP4，0/15/29 帧哈希不等于原图导出。
4. 返回项目列表再打开，独立 provider 和预览保留。
5. 原有迷雾 100/0 强度、导出和项目重开继续通过。
6. 注入 Metal IPC 故障后，预览显示错误，导出拒绝且不产生假成功文件。

首轮 E2E 通过，约 1.4 分钟；新增资产指纹后的最终回归再次通过，约 1.7 分钟。
最终回归的项目列表导航助手出现一次 `networkidle` 10 秒等待警告；随后的项目重开、provider、像素和导出断言均通过。这不是渲染失败，但助手的页面就绪判断仍可改进。
截图、四段视频和 `editor-evidence.json` 分别在 `editor/`、`editor-final/`。
编辑器测试助手关闭音轨，带音频的验证由 CLI 覆盖。测试使用私有资源根目录和隔离项目 profile，没有移动整个剪映 App。

### 回归与构建

- 禁用剪映用户缓存后，原有 **667/667 张纯 LUT GPU 回归通过**，0 失败，耗时 111.546 秒；记录在 `lut-regression/batch.json`。
- **13 个相关单测文件、97 项测试全部通过**，覆盖解析、身份/指纹、真实 Metal、持久会话、LRU、IPC、CLI adapter、UI 搜索/应用、预览/导出 provider 派发。
- Electron 与 Web 构建通过，自有宿主 staging 通过；构建已有 chunk 大小、动态导入及测试路由告警，不冒充无告警构建。
- 未制作安装包，未执行全仓测试；透明/HDR/4K/长视频及剩余 198 张不在本轮通过范围内。

## 使用方式

UI：滤镜 -> 滤镜实验室 -> **QCut Metal** -> 本地滤镜，搜索名字或资源 ID。

```bash
# 源码验证入口；安装版本需更新后才包含本轮实现
bun electron/native-pipeline/cli/cli.ts filter-lab catalog-independent --json

bun electron/native-pipeline/cli/cli.ts filter-lab render-independent \
  --resource-id 7268561936344780086 \
  --filter-version a451da3a8e92464be1d12df9c1ac80cf \
  -i source.mp4 --output fuji-independent.mp4 \
  --filter-intensity 100 --json

bun scripts/verify-independent-graph.ts \
  --source portrait.png --output /tmp/qcut-graph-evidence
```

输出文件使用 `--output`，不是其他命令的目录参数 `-o`。默认不覆盖已有文件，需要时显式 `--force`。
旧 `filter-lab render/apply` 入口未替换，用户可以继续使用旧二进制后端。

## 剩余 198 张

逐卡名单见 [剩余迁移清单](independent-complex-backlog-2026-09-06.md)。

| 剩余类别 | 数量 | 还缺什么 |
| --- | ---: | --- |
| 双 LUT | 135 | 独立 skin mask 供应、坐标/羽化/时序语义、双 LUT 权重，部分另有人脸或 matting 依赖 |
| Face AI | 33 | 31 张缓存可用，2 张目录不可用；独立关键点/模型调用、face fitting、效果参数和状态管理 |
| Shader | 25 | 21 张不依赖人物模型的复杂 graph；4 张含 face/kira/matting/sky 等依赖 |
| 面部区域 LUT | 3 | 嘴唇/背景等区域定位、mask 和混合，不能按全帧 LUT 替代 |
| 未知且不可用 | 2 | 先补齐/识别资源包，禁止占位成功 |

下一批最具体的是 **10 张同族柔光链**：迈阿密、松果棕、贝松绿、老友记、牛皮纸、中性II、暖晨、好莱坞IV、冷透、气泡水。
应先还原多级 render target 尺寸、模糊方向、原图分支和混合顺序，再对照后批量注册。其余 11 张无人物模型 Shader 包含噪声、动态序列、纹理及更长 Bloom graph，需要单独解析。
双 LUT / Face AI 尚未迁移；继续走旧本地能力不等于“已经摆脱剪映运行库”。
本轮也没有解决原有编辑器与 CLI 色彩/编码路径差异、4K/HDR、Windows/Linux 或长视频稳定性。

第三方二进制、原始 Shader、LUT、纹理和模型均不纳入 Git；只提交自有实现、测试和研究文档。本记录证明本地验证，不代表已经发布。
