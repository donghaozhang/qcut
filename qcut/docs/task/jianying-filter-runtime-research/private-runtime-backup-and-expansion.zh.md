# 滤镜实验室私有运行时备份与分类扩充

记录时间：2026-08-22

## 目标与结论

本轮先解决运行时独立性，再扩充滤镜目录：

1. QCut 能把本机已有的滤镜 Framework、模型、效果包和目录数据库复制到仓库外的版本化私有快照。
2. 快照创建后，滤镜实验室优先使用该快照；严格测试会同时禁用剪映 App Bundle 和剪映用户缓存。
3. 在严格离线模式下，真实 Electron 产品完成真人视频导入、本机二进制渲染、skin mask 返回和双 LUT 应用。
4. 首批通过通用结构识别新增 5 张双 LUT 人像滤镜，随后七轮分类扩充分别新增 19、20、65、139、150、144、85 张，并补齐 9 张此前已缓存但被结构检查误拒绝的双 LUT 卡。
5. 当前目录可用数由最初的 `85` 增至 `721`；七轮分类扩充累计新增 622 张，连同首批和本轮补齐共新增 636 张。

这里的“脱离剪映运行”指执行阶段不启动剪映，也不读取剪映安装目录或用户缓存。首次创建或刷新快照仍要求用户本机已有且有权使用对应资源。本机互操作性验证不构成重新分发第三方二进制、模型或效果包的许可。

## 私有快照

当前机器的私有快照位于仓库之外：

```text
~/Library/Application Support/QCut/PrivateRuntimes/JianyingFilter/current
```

`current` 是指向内容寻址版本目录的原子软链接。当前版本：

```text
D6342ECD-5432-33F0-A2AD-0C28F5699994-fed5410f9e513544
```

清单数据：

| 项目 | 数量 |
| --- | ---: |
| ABI UUID | `D6342ECD-5432-33F0-A2AD-0C28F5699994` |
| Framework 文件 | 23 |
| 模型文件 | 53 |
| 效果包版本 | 728 |
| 目录数据库文件 | 5 |
| 总文件 | 26,273 |
| 清单字节数 | 1,350,023,872 |
| 本机占用 | 约 1.3 GiB |
| QCut 自管包缓存 | 约 588 MiB |

`manifest.json` 对每个普通文件记录相对路径、字节数和 SHA-256。清单固定声明 `localOnly: true` 与 `cloudUpload: false`，不保存来源绝对路径。创建流程使用临时目录、并发上限 3、完整哈希校验和原子 `current` 切换；已有相同内容时复用已验证快照。

SQLite 的 `rp.db-shm` 是查询时自动创建并持续变化的共享内存 sidecar，不属于可分发的持久数据库内容。备份阶段会从暂存目录删除它，清单与后续完整性校验也只在 `Cache/ressdk_db` 下忽略 `*-shm`；包含实际目录数据的 `rp.db` 与 `rp.db-wal` 仍保留并逐文件校验。第八批两套真实 E2E 后，测试关闭并删除自动创建的 sidecar，再对清单中的 26,273 个不可变文件重新计算大小和 SHA-256，校验全部通过。

安全边界：

- 清单拒绝绝对路径、`..`、重复路径和非法哈希。
- 文件枚举拒绝软链接及其他非普通文件，避免快照把读取范围带回外部目录。
- 运行时只接受已验证架构与 UUID 的 `libcccreator.dylib`。
- 动态依赖检查未发现指向 `VideoFusion-macOS.app` 或 `JianyingPro` 用户目录的绝对依赖。
- 私有二进制、模型、LUT、Shader、数据库和效果包均不进入 Git。

产品入口在滤镜实验室状态行。用户可以看到“QCut 离线运行已就绪”，并用备份按钮创建或刷新快照。维护脚本为 `scripts/jianying-filter-parity/backup-private-filter-runtime.ts`。

## 运行时选择

执行时的优先级是：

1. 显式测试或开发环境覆盖路径。
2. QCut `JianyingFilter/current` 私有快照。
3. 旧的 QCut `JianyingTransition/current` 私有 Framework 兼容回退。
4. 本机剪映安装目录与用户模型缓存。

严格离线门禁设置：

```text
QCUT_JIANYING_DISABLE_APP_BUNDLE=1
QCUT_JIANYING_DISABLE_USER_CACHE=1
QCUT_JIANYING_FILTER_CACHE_ROOT=<QCut private snapshot>/Cache
```

在这个门禁下，状态必须同时满足：

```json
{
  "state": "ready",
  "runtimeSource": "qcut-private",
  "modelSource": "qcut-private",
  "snapshotReady": true,
  "offlineReady": true
}
```

## 首批扩充

扩充没有维护 5 张卡片的硬编码白名单。包检查器会先确认：

- 包含 `Filter.material`、`Filter.xshader` 和 skin segmentation 算法节点；
- 同时具有背景与肤色 LUT；
- `filter_bg.png` 与 `filter_skin.png` 都是受支持的 512 x 512、8 x 8 tiled LUT；
- 两张纹理均可解析为 64 级 3D LUT。

满足这些条件的原生人像包会自动暴露为 `dual-lut`，继续由本机二进制生成真实 skin mask。当前新增：

| 滤镜 | 资源 ID |
| --- | --- |
| 高清暖调 | `7431187754379136266` |
| 去雾 | `7473437502787816740` |
| 高清 | `7320436048134147340` |
| 高清增强 | `7426668776491453707` |
| 高清II | `7325426821267295551` |

目录审计结果：

| 状态 | 扩充前 | 扩充后 |
| --- | ---: | ---: |
| 总目录 | 887 | 887 |
| 已缓存 | 103 | 103 |
| 可用 | 85 | 90 |
| 已缓存但不可用 | 17 | 12 |

当时剩余 12 张没有被强行开放：鲜美、黑金红、美食增色、热气腾腾、夜景增色II、蓝金、花间、银蓝、超白、佳能G12、徕卡II、聚焦。它们需要逐包确认 Shader graph、额外纹理、人脸算法或多 Pass 语义，不能仅凭文件名猜测。下文记录其中 9 张在完成逐包结构检查后的补齐结果。

## 第二批：15 类全覆盖扩充

第二批先从本机目录的 639 个可下载候选中筛选只声明基础 `blit` 能力的包，再下载到仓库外隔离目录完成 MD5、Zip 路径和包结构检查。共体检 20 张；“冰茶”的旧 `.3dl` 包没有可用渲染器，因此淘汰并改用“海上冲浪”。最终安装 19 张：

| 滤镜 | 资源 ID | 加载路径 | 覆盖分类 |
| --- | --- | --- | --- |
| 胶片微曝 | `7578191333169417523` | 33 级 LUT | 夏日、人像、最新、复古胶片 |
| 4K增质 | `7477802809971215653` | 33 级 LUT | 最新、影视级、高清 |
| 海边胶片 | `7497887075627257114` | 32 级 LUT | 夏日、人像、复古胶片 |
| 4K画质 | `7477802799862992138` | 33 级 LUT | 影视级、高清 |
| 暗曛 | `7281163501047991608` | 锐化 + LUT，2 Pass | 美食、夜景 |
| 柏林 | `7530690874699713842` | 17 级 LUT | 风景、风格化 |
| 落日电影 | `7501223866988039434` | 32 级 LUT | 夏日、风景、夜景 |
| 安塞尔灰调 | `7581301466128780569` | 32 级 LUT | 风格化 |
| 安愉 | `7190242827543022880` | 32 级 LUT | 室内 |
| 暗雅 | `7127656352410848548` | 64 级 LUT | 室内 |
| 薄绿 | `7344374695053102371` | 33 级 LUT | 户外 |
| 宝丽来SX70 | `7600301036787600667` | 32 级 LUT | 相机模拟、最新 |
| 贝果 | `7131656881805856013` | 锐化 + LUT，2 Pass | 美食 |
| 布朗 | `7127576913375153415` | 64 级平铺 PNG LUT | 黑白 |
| 大疆影片 | `7630364601254808882` | 33 级 LUT | 相机模拟、最新 |
| 古罗马 | `7242212640498568503` | 64 级 LUT | 黑白 |
| 奶杏 | `7297134192100379938` | 32 级 LUT | 基础 |
| 清晰 | `7127621434230213924` | 64 级 LUT | 基础 |
| 海上冲浪 | `7527721135824211243` | 32 级 LUT | 夏日、户外 |

包安装在 QCut 自己的本地目录，不写入剪映缓存：

```text
~/Library/Application Support/QCut/JianyingFilterPackages/artistEffect
```

完整包检查器现在会把当前剪映或私有快照、QCut 自管目录作为有序只读根集合。普通 LUT 直接保留精确文件路径；平铺 LUT、人像包和多 Pass 在加载时选择真实存在的完整包根。Electron 和 `qcut` CLI 使用同一默认用户目录，也可用 `QCUT_JIANYING_FILTER_PACKAGE_ROOT` 做隔离测试覆盖。

分类结果：

| 分类 | 扩充前可用 | 扩充后可用 | 增量 |
| --- | ---: | ---: | ---: |
| 夏日 | 17 | 21 | +4 |
| 美食 | 6 | 8 | +2 |
| 风景 | 15 | 17 | +2 |
| 最新 | 22 | 26 | +4 |
| 人像 | 17 | 19 | +2 |
| 影视级 | 7 | 9 | +2 |
| 夜景 | 8 | 10 | +2 |
| 户外 | 7 | 9 | +2 |
| 相机模拟 | 6 | 8 | +2 |
| 高清 | 8 | 10 | +2 |
| 室内 | 2 | 4 | +2 |
| 复古胶片 | 7 | 9 | +2 |
| 风格化 | 6 | 8 | +2 |
| 黑白 | 8 | 10 | +2 |
| 基础 | 5 | 7 | +2 |

扩充后的私有快照同时包含原有无分类 LUT 和这 19 张新增卡。把剪映 App Bundle、剪映用户缓存和 QCut 自管包目录同时屏蔽后，真实 Electron 产品仍得到 `887` 张目录卡、`122` 张完整缓存、`109` 张可用卡；19 张新增卡全部可用。

## 第三批：再次覆盖 15 类

第三批从当前 887 张目录卡中排除已有可用卡、同名卡和没有版本哈希或下载地址的卡。剩余候选中有 500 张只声明基础 `blit` 能力。先用分类覆盖算法选择 35 张四倍冗余候选，再补 6 张黑白旧卡，共下载 41 个包到仓库外隔离目录。

41 个包全部通过签名地址下载、MD5、Zip 路径和原子解包检查；包检查器识别出 38 张现有渲染路径可用卡。`富士NC I`、`黑胶唱片`、`牛皮纸` 只有尚未支持的 Shader 结构，因此不安装。最终从 38 张中选择以下 20 张，使每个分类至少再增加 2 张：

| 滤镜 | 资源 ID | 加载路径 | 覆盖分类 |
| --- | --- | --- | --- |
| 晴天明媚 | `7659676233285913862` | 33 级 LUT | 夏日、风景、最新 |
| 富士卷 | `7643803947257367851` | 32 级 LUT | 夏日、相机模拟、最新 |
| 古早高曝 | `7596354290730552622` | 32 级 LUT | 人像、最新、复古胶片 |
| 古早回忆录 | `7594878732377099556` | 32 级 LUT | 人像、最新、复古胶片 |
| 日落飞车 | `7505662247407013135` | 16 级 LUT | 夏日、风景、夜景 |
| 科幻星球 | `7501988309900528935` | 17 级 LUT | 夜景、影视级 |
| 4K画质电影 | `7478641636092775743` | 33 级 LUT | 影视级、高清 |
| 清晰增强 | `7436068361622129929` | 33 级 LUT | 高清、基础 |
| 富士影片 | `7631600978600480036` | 32 级 LUT | 夏日、相机模拟、最新 |
| 冰糖葫芦 | `7131904196428827944` | 33 级 LUT | 夏日、美食、最新 |
| 暖调烘焙 | `7633458987354049802` | 32 级 LUT | 美食、最新 |
| 松烟墨 | `7623429382014586174` | 64 级 LUT | 最新、风格化 |
| 勃艮第红 | `7622554933115555097` | 64 级 LUT | 最新、风格化 |
| 森林徒步 | `7524262165273005321` | 17 级 LUT | 夏日、户外 |
| 清透萌宠 | `7473126624322391308` | 17 级 LUT | 夏日、室内 |
| 探店博主III | `7411911267859860746` | 32 级 LUT | 人像、室内 |
| 忆山 | `7271278427309755688` | 33 级 LUT | 风景、户外 |
| 砂红 | `7300758676732677427` | 32 级 LUT | 黑白 |
| 桃粉 | `7297131749346135331` | 32 级 LUT | 基础 |
| 快照II | `7143760738765655310` | 64 级平铺 PNG LUT | 黑白 |

分类变化：

| 分类 | 第三批前可用 | 第三批后可用 | 增量 |
| --- | ---: | ---: | ---: |
| 夏日 | 21 | 28 | +7 |
| 美食 | 8 | 10 | +2 |
| 风景 | 17 | 20 | +3 |
| 最新 | 26 | 35 | +9 |
| 人像 | 19 | 22 | +3 |
| 影视级 | 9 | 11 | +2 |
| 夜景 | 10 | 12 | +2 |
| 户外 | 9 | 11 | +2 |
| 相机模拟 | 8 | 10 | +2 |
| 高清 | 10 | 12 | +2 |
| 室内 | 4 | 6 | +2 |
| 复古胶片 | 9 | 11 | +2 |
| 风格化 | 8 | 10 | +2 |
| 黑白 | 10 | 12 | +2 |
| 基础 | 7 | 9 | +2 |

第三批重建后的私有快照包含 `145` 个效果包版本。严格禁用剪映 App Bundle、剪映用户缓存和 QCut 自管包目录后，真实 Electron 产品得到 `887` 张目录卡、`142` 张完整缓存和 `129` 张可用卡；两轮累计 39 张分类扩充卡全部从私有快照真实加载。

仓库外筛选证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-2-2026-08-22/candidates.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-2-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-2-2026-08-22/selection.json
```

## 第四批：大规模扩充 65 张

第四批不再只选满足最低分类增量的少量卡，而是在同一安全门禁下扩大同构包覆盖。当前目录排除已可用、同名、缺少版本哈希或缺少下载地址的卡后，得到 739 个候选；其中 592 个只声明空能力或基础 `blit` 能力。最终下载 79 个包，79/79 通过签名地址、MD5、Zip 路径和原子解包检查。

包检查结果：

| 结果 | 数量 | 说明 |
| --- | ---: | --- |
| 可加载 | 65 | 50 张单 LUT、12 张 Shader 结构卡、3 张双 LUT |
| 拒绝 | 14 | 当前通用解析器不能完整、安全解释其结构 |

被拒绝的 14 张为：富士NC I、纸醉金迷、黑胶唱片、中性II、牛皮纸、倾森、暖晨、海鸥DC、气泡水、千玺IXU、三洋VPC、布兰卡、通透、智能光线。它们没有因为“下载成功”就被标成可用。

65 张新增卡按实现分类：

- `single-lut` 50 张：落日熔金、轻古早、加州落日、浓郁影质、日落时刻、韩式古早、高清美食、漠土、古早感胶片、夜拍闪曝、牧野、超清电影卷、高清春日、青绿电影、末世天使、柯达金200、高清电影卷、圣诞愿景、撕拉拍立得、高清雪景、质感暗调、萌宠、春游野餐、朦胧气质棕、中性、郁金香、古罗马电影、万圣、iPhone6s、科切拉、清晰提升、落日鎏金、墨林、安西娅、高清影视、雪地胶片III、落日粉、素简、原野、曼波、雪地胶片II、小麦色、暮川、涩谷、清晰质感、围炉暖食、雪地胶片、底特律、幽海、鲜萃食光。
- `shader` 12 张：味蕾、快照I、褪色、暖食、灰麻、富士蓝、赫本、轻食、棕咖、棕榈、茶墨、灯会。其中“味蕾”真实加载 renderer recipe，其余卡至少真实加载检查器抽出的 LUT；这证明结构可运行，不等于已证明 Shader 全参数与剪映逐像素一致。
- `dual-lut` 3 张：背景增色、暮光、鲜明；E2E 同时加载两张 LUT，但本批没有把它们提升为剪映 UI parity verified。

分类变化：

| 分类 | 第四批前可用 | 第四批后可用 | 增量 |
| --- | ---: | ---: | ---: |
| 夏日 | 28 | 36 | +8 |
| 人像 | 22 | 31 | +9 |
| 风景 | 20 | 28 | +8 |
| 美食 | 10 | 17 | +7 |
| 相机模拟 | 10 | 14 | +4 |
| 最新 | 35 | 42 | +7 |
| 夜景 | 12 | 20 | +8 |
| 影视级 | 11 | 19 | +8 |
| 户外 | 11 | 18 | +7 |
| 风格化 | 10 | 17 | +7 |
| 黑白 | 12 | 16 | +4 |
| 高清 | 12 | 20 | +8 |
| 复古胶片 | 11 | 18 | +7 |
| 基础 | 9 | 13 | +4 |
| 室内 | 6 | 12 | +6 |

第四批重建后的私有快照包含 210 个效果包版本。严格屏蔽剪映 App Bundle、剪映用户缓存和 QCut 自管包目录后，真实 Electron 产品得到 887 张目录卡、207 张完整缓存、194 张可用卡。三轮分类扩充累计 104 张卡都能从 QCut 私有快照被发现；本轮新 65 张全部完成真实 IPC 加载，前两轮 39 张同时完成可用性回归检查。

仓库外筛选证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-3-2026-08-22/candidates.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-3-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-3-2026-08-22/selection.json
```

## 第五批：本地缓存再扩充 139 张

第五批重新扫描私有快照和 QCut 自管包根后，剩余 673 个未缓存候选，其中 529 个只声明空能力或基础 `blit`。为扩大覆盖，本轮选择 156 个包进行体检；156/156 完成签名地址下载、MD5、Zip 路径和原子解包校验。

包检查结果：

| 结果 | 数量 | 说明 |
| --- | ---: | --- |
| 可加载并安装 | 139 | 116 张单 LUT、22 张 Shader 结构卡、1 张双 LUT |
| 拒绝 | 17 | 通用解析器不能完整解释，未安装进可用集合 |

被拒绝的 17 张为：富士NC I、纸醉金迷、倾森、中性II、黑胶唱片、气泡水、暖晨、牛皮纸、海鸥DC、千玺IXU、好莱坞IV、三洋VPC、沙砾、都卡、布兰卡、通透、智能光线。

本轮新增实现分布：

- `single-lut` 116 张，包含元气夏日、自然增蓝、透亮肤、航拍增质、夜景人像增强、增质CCD、烛光晚餐、日料寿司、高清润颜、浓烈电影感等。
- `shader` 22 张，包含寂静海、深邃、松绿、椰林、龙舌兰、仲夏、梦境、西西里、PENTAX、KONICA、EOS3 等。当前门禁证明包中可抽取 LUT 能被真实加载，不代表完整 Shader 参数已与剪映逐像素一致。
- `dual-lut` 1 张：哈苏蓝。两张 LUT 均可读取，但本轮没有把它提升为剪映 UI parity verified。

完整 139 张名单、资源 ID、分类、实现和 LUT 尺寸保存在仓库外的 `selection.json`。

分类变化：

| 分类 | 第五批前可用 | 第五批后可用 | 增量 |
| --- | ---: | ---: | ---: |
| 夏日 | 36 | 52 | +16 |
| 人像 | 31 | 55 | +24 |
| 风景 | 28 | 44 | +16 |
| 美食 | 17 | 32 | +15 |
| 相机模拟 | 14 | 25 | +11 |
| 最新 | 42 | 66 | +24 |
| 夜景 | 20 | 36 | +16 |
| 影视级 | 19 | 34 | +15 |
| 户外 | 18 | 33 | +15 |
| 风格化 | 17 | 30 | +13 |
| 黑白 | 16 | 16 | 0 |
| 高清 | 20 | 32 | +12 |
| 复古胶片 | 18 | 33 | +15 |
| 基础 | 13 | 13 | 0 |
| 室内 | 12 | 26 | +14 |

黑白和基础没有强行增加：本轮剩余对应候选都落在不完整 Shader、人像或抠像结构，继续开放会把“已下载”误报成“可用”。

最终状态：目录 887 张、完整缓存 346 张、可用 333 张。QCut 自管包缓存约 148 MiB；重建后的内容寻址私有快照包含 349 个效果包版本、11,841 个清单文件，执行阶段可完全屏蔽剪映 App Bundle 和用户缓存。

仓库外筛选证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-4-2026-08-22/candidates.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-4-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-4-2026-08-22/selection.json
```

## 第六批：再缓存 150 张

第六批剩余 529 个未缓存候选，其中 387 个为纯 LUT 或基础 `blit`。按分类优先后补足到 180 个低风险包，180/180 完成下载、MD5、Zip 路径和原子解包校验；结构检查最终接受 150 张、拒绝 30 张。

- 可加载实现：135 张 `single-lut`、14 张可抽取 LUT 的 `shader` 结构卡、1 张 `dual-lut`。
- 分类增量：夏日 +40、人像 +56、风景 +33、美食 +12、最新 +42、夜景 +2、影视级 +22、户外 +6、复古胶片 +14、室内 +14。
- 相机模拟、风格化、黑白、高清、基础本轮没有低风险同构包，因此没有强行开放。
- 被拒绝的 30 张包含富士NC I、纸醉金迷、黑冰、佳能G7X II、富士CC I/II、GR绿、冰茶、GR正片、老友记、冷透等不完整 Shader 或双 LUT 结构。

最终产品状态为目录 887 张、完整缓存 496 张、可用 483 张。QCut 自管包缓存约 267 MiB；私有快照包含 499 个效果包版本、17,759 个清单文件，约 1.1 GiB。

仓库外筛选证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-5-2026-08-22/candidates.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-5-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-5-2026-08-22/selection.json
```

## 第七批：再缓存 144 张

第七批重扫后得到 376 个未缓存候选，其中 235 个为空能力或基础 `blit`。本轮下载 180 个包；180/180 通过签名地址、MD5、Zip 路径和原子解包校验，结构检查接受 144 张 `single-lut`，保守拒绝 36 张当前不能完整渲染的 `shader` 卡。

- 分类增量：夏日 +18、人像 +61、风景 +38、最新 +17、影视级 +23、复古胶片 +17、室内 +4；一张卡可属于多个分类。
- 最终状态：目录 887 张、完整缓存 640 张、可用 627 张；六轮分类扩充累计 537 张。
- QCut 自管包缓存约 394 MiB；私有快照包含 643 个效果包版本、23,291 个清单文件，约 1.2 GiB。
- 大快照暴露了无界目录任务挤占运行时检查的问题；LUT 枚举和包检查分别限制为 24 与 16 路并发，结果顺序不变，真实 E2E 不再停在“检查本机运行时”。

仓库外证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-6-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-6-2026-08-22/selection.json
```

## 第八批：单 LUT 与双 LUT 再扩充 85 张

第八批剩余 229 个可下载未缓存候选，含 89 个空能力或基础 `blit` 包，以及 68 个 `blit + skin_seg` 人像包。本轮体检前 180 个：180/180 安全下载，最终接受 51 张 `single-lut` 和 34 张 `dual-lut`；其余 95 张因缺少当前可执行的完整渲染器继续关闭。

- 分类增量：夏日 +7、人像 +35、风景 +13、美食 +4、相机模拟 +2、最新 +3、夜景 +7、影视级 +4、户外 +2、风格化 +4、复古胶片 +5、室内 +7。
- “健美”通过 Electron IPC 实际加载背景与肤色两张 64 级 LUT，报告为 `lut-64+lut-64`。
- 最终状态：目录 887 张、完整缓存 725 张、可用 712 张；七轮分类扩充累计 622 张。
- QCut 自管包缓存约 588 MiB；私有快照包含 728 个效果包版本、26,273 个清单文件，约 1.3 GiB。

仓库外证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/inspection.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/selection.json
```

## 已缓存双 LUT 结构补齐：9 张

第八批完成后，目录仍有 9 张效果包已经完整缓存、两张 512 x 512 LUT 也都能解析，但被旧结构检查误拒绝。本轮逐包检查发现两个原因：

1. 鲜美、黑金红、美食增色、夜景增色II、蓝金使用 `AmazingFeature` 结构，但同一包内存在多个 `algorithmConfig.json`。旧逻辑只读取按路径排序后的第一份基础 `blit` 配置，漏掉根目录真实的 `skin_seg` 图。
2. 花间、银蓝、超白、佳能G12 使用 `SkinFilter` 结构，材质与 Shader 分别命名为 `SkinSeg.material` 和 `skinseg.xshader`，不符合旧逻辑只接受 `Filter.material` 与 `Filter.xshader` 的文件名限制。

检查器现在按结构而不是卡片 ID 判断：背景与肤色 LUT 必须位于同一效果目录；该目录必须同时具有 material、xshader 和 `SeekModeScript.lua`；包内任意算法图必须明确声明 `skin_seg`。没有增加 9 张卡片的硬编码白名单。

| 滤镜 | 资源 ID | 结构家族 |
| --- | --- | --- |
| 鲜美 | `7330581892510649636` | `AmazingFeature`，多算法配置 |
| 黑金红 | `7341266486536768831` | `AmazingFeature`，多算法配置 |
| 美食增色 | `7403664465390013735` | `AmazingFeature`，多算法配置 |
| 夜景增色II | `7411477748130139403` | `AmazingFeature`，多算法配置 |
| 蓝金 | `7341300292148907327` | `AmazingFeature`，多算法配置 |
| 花间 | `7211008985187487036` | `SkinFilter` |
| 银蓝 | `7145394266209127694` | `SkinFilter` |
| 超白 | `7302338645938261287` | `SkinFilter` |
| 佳能G12 | `7485292050917657906` | `SkinFilter` |

重扫结果：

| 项目 | 补齐前 | 补齐后 |
| --- | ---: | ---: |
| 总目录 | 887 | 887 |
| 已缓存 | 725 | 725 |
| 可用 | 712 | 721 |
| 双 LUT 可用 | 52/61 | 61/61 |

这 9 张已经达到“QCut 可识别、可加载、可调用本机人像 provider 真实渲染”的门槛，但尚未逐张完成剪映 UI 同素材无损帧对照，因此不能标为逐像素 `verified`。

## 真实 E2E

测试：`apps/web/src/test/e2e/jianying-filter-private-runtime.e2e.ts`

真实产品路径：

1. 严格离线环境启动 Electron QCut。
2. 创建项目并导入真人 10 秒视频。
3. 进入“滤镜 -> 滤镜实验室”。
4. 刷新目录并确认 `可用 721/887 · 缓存 725`。
5. 逐张加载首批 5 张和本轮补齐 9 张卡的背景、肤色 64 级 LUT。
6. 逐张调用私有本机 provider 渲染同一真人帧。
7. 检查每张都返回 `128 x 224` skin mask、非零 mask 和输出像素变化。
8. 在界面应用本轮补齐的“鲜美”，并检查调节层包含两张 64 级 LUT 和 `skin-segmentation-v1` 绑定。
9. 等待真实预览画布出现非黑像素后截图。

本轮私有运行时用例单跑为 `1 passed (43.2s)`；分类扩充用例单跑为 `1 passed (19.8s)`；最终两套用例以单 worker 串行复跑为 `2 passed (58.5s)`。

关键数据：

| 项目 | 结果 |
| --- | --- |
| Provider | `jianying-local-effect-v1` |
| 输入帧 | 320 x 569 |
| Skin mask | 128 x 224 |
| 14 张 Mask 最大值 | 均为 253 |
| 14 张相对输入发生变化的 RGB 通道 | 527,013 至 541,294 |
| 背景 LUT | 64 级，786,432 values |
| 肤色 LUT | 64 级，786,432 values |

仓库外证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/ui/report.json
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/ui/01-private-runtime-filter-lab.png
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/ui/02-new-dual-lut-preview.png
```

另外，“高清暖调”已在同一严格离线环境完成 1280 x 720 原生帧和非空 mask 渲染：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/high-definition-warm/frame.png
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/high-definition-warm/mask.png
~/Library/Application Support/QCut/Research/JianyingFilter/private-runtime-offline/2026-08-22/high-definition-warm/report.json
```

### 15 类扩充 E2E

测试：`apps/web/src/test/e2e/jianying-filter-category-expansion.e2e.ts`

门禁比普通启动更严格：测试显式禁用剪映 App Bundle 与剪映用户缓存，并把 QCut 自管包根指向空目录，因此运行时、目录数据库、七轮累计 622 张分类扩充卡和本轮补齐的 9 张双 LUT 卡只能来自私有快照。真实 Electron 流程完成：

1. 导入真人 10 秒视频并打开“滤镜实验室”。
2. 检查状态行为“QCut 离线运行已就绪”。
3. 精确检查 15 个分类的可用数和总数。
4. 先检查此前六轮 537 张扩充卡仍为可用，并确认目录总可用数为 721，防止目录或包根回退。
5. 通过 Electron IPC 以每组最多 6 张的方式加载本轮 85 张，避免大 LUT 同时占用过多页面内存。
6. 普通 LUT、Shader 包中可抽取 LUT 和双 LUT 都检查实际 cube 数据。
7. 截取全部分类、夏日、人像、风景和室内五个真实产品画面，并搜索到本轮新增卡。

结果：旧卡 `537/537` 保持可用，新卡 `85/85` 加载成功，其中 51 张单 LUT、34 张双 LUT；9 张已缓存双 LUT 补齐后，目录总可用数为 `721/887`。分类可用数增加于夏日、美食、人像、夜景、户外、相机模拟和风格化。报告中的运行时状态为：

```json
{
  "runtimeSource": "qcut-private",
  "modelSource": "qcut-private",
  "snapshotReady": true,
  "offlineReady": true
}
```

仓库外证据：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/report.json
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/01-all-category-counts.png
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/02-summer-latest-expansion.png
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/03-portrait-latest-expansion.png
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/04-landscape-latest-expansion.png
~/Library/Application Support/QCut/Research/JianyingFilter/category-expansion-batch-7-2026-08-22/ui/05-indoor-latest-expansion.png
```

## 自动验证

- 私有清单、复制、完整性校验与复用测试。
- 运行时优先级、ABI、模型和离线状态测试。
- IPC 主窗口信任边界、并发备份合并和路径不泄漏测试。
- 原生人像包结构与 tiled LUT 识别测试。
- 目录双 LUT 构建、多个算法图、`SkinFilter` 命名家族及错误包拒绝测试。
- 包根选择、双根检查、下载安全、LUT、平铺 LUT、多 Pass、人像运行时和网页交互均有回归测试。
- 七轮累计 622 张分类扩充卡已通过目录回归；最新 85 张通过 Electron IPC 真实加载，此前六轮 537 张在同一严格离线进程中保持可用；14 张双 LUT 卡完成私有 provider 真实渲染，其中包括本轮补齐的 9 张。
- 滤镜相关 `44` 个测试文件、`480/480` 项测试通过。
- 两套 Electron E2E 后再次验证私有清单；SQLite 临时 sidecar 已清理，26,273 个不可变文件的大小和 SHA-256 全部匹配。
- Web 生产构建通过；Electron 构建在本轮滤镜改动后通过。
- 完整工作区类型检查最终通过。

## 后续扩充规则

下一批不按“看起来像滤镜”批量打开，而按实现家族推进：

1. 先跑目录审计，找出结构完全一致的包族。
2. 每个包族只实现一个解析与渲染适配器。
3. 对每张新增卡验证资源完整性、非空输出、预览和导出一致性。
4. 人像卡必须有真人连续帧、mask 边缘和素材切换门禁。
5. 多 Pass 卡必须保留 pass 顺序、纹理格式、采样语义和强度映射证据。
6. 没有剪映 UI 同素材无损对照时，只能标为可运行或 close，不能标为 verified。

这样扩充的速度取决于“新实现家族”的数量，而不是目录卡片总数；同构包可以批量开放，异构包继续逐族研究。
