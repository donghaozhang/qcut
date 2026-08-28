# 滤镜长尾逐卡对标与证据分层

<!-- markdownlint-disable MD013 -->

记录时间：2026-08-26  
执行分支：`lutv6`  
证据目录：`~/Library/Application Support/QCut/Research/JianyingFilter/`

后续缓存更新：同日 `lutv7` 已补齐 162 张缺包并修复 1 张版本不匹配，当前 887 张全部 `cached`；788 张 `available=true`，99 张已缓存但仍不可用。下文 coverage 保留补包前的历史快照，`offline-resource-missing=166` 当时归并了所有不可用卡，并非 166 张都缺包。详见 [缺包补齐与严格离线复查](cache-gap-162-2026-08-26.zh.md)；本轮补包没有增加 UI parity 证据。

## 结论

本轮把“滤镜能加载”和“滤镜已与剪映一致”彻底拆开，并完成了第一轮可重复的逐卡流水线：

- 887 张目录卡都能输出逐卡 gap 清单；
- 596 张本机可用 single-LUT 卡在严格离线条件下完成 native oracle 对照；
- 596 / 596 执行成功，18 verified、559 close、19 unverified；
- 595 / 596 的连续两帧逐字节一致，唯一非确定项是“古罗马”；
- 重新执行 8 张有明确剪映 UI 来源的卡，最终为 2 verified、3 close、3 unverified；
- UI reference 现在必须绑定具体 `resourceId`，共享算法图不再允许跨卡冒充逐卡证据。

这里的 596 张结果属于 `native-oracle` 层，只证明 QCut LUT 路径相对本机原始效果二进制的像素差距；它们不等于 596 张剪映 UI parity。真正的 `jianying-ui` 层目前只有 8 张有合格来源的卡。

## 为什么需要证据分层

旧验证记录只有卡片、版本和像素指标，没有记录 reference 来自哪里。于是本机二进制 oracle、剪映 UI 导出和历史未知结果可能被同一个 coverage 数字混在一起。

现在每条记录显式使用以下来源之一：

| `referenceKind` | 含义 | 可以证明什么 |
| --- | --- | --- |
| `jianying-ui` | 剪映 UI 的无损帧、视频或由逐卡 UI 输出校准得到的 mask | 可以进入 UI parity 统计 |
| `native-oracle` | QCut 私有快照中的本机效果二进制输出 | 可以衡量 QCut 实现与 oracle 的差距 |
| `unknown` | 旧 schema 或无法确认来源的历史结果 | 保留历史，但不能冒充 UI parity |

`qcut filter-lab coverage --reference-kind ...` 会分别统计三层证据。旧记录不会被删除，但在明确来源查询中不会被计入。

## 逐卡 gap 清单

`filter-lab coverage` 新增 `--details`。默认输出仍是汇总；加该参数后会为 887 张卡各输出一行，并给出下一步 gap：

| gap | 含义 |
| --- | --- |
| `verified` | 当前证据通过 verified 门禁 |
| `close` | 已对照，但只达到 close |
| `unverified-result` | 已对照且未达到 close |
| `missing-reference` | 本机可执行，但该证据层没有逐卡 reference |
| `missing-mask-evidence` | 双 LUT 有 RGB 结果，但缺少 mask 边缘证据 |
| `offline-resource-missing` | 私有快照中没有当前卡所需资源 |
| `implementation-unknown` | 包已存在但实现类型仍未分类 |

```bash
qcut filter-lab coverage \
  --reference-kind native-oracle \
  --details \
  --json

qcut filter-lab coverage \
  --reference-kind jianying-ui \
  --details \
  --json
```

## 严格离线 single-LUT 全量结果

运行时明确设置：

```bash
QCUT_JIANYING_DISABLE_APP_BUNDLE=1
QCUT_JIANYING_DISABLE_USER_CACHE=1
```

因此 Framework、模型和滤镜包均来自 QCut 私有快照，不读取剪映 App bundle，也不读取剪映用户缓存。运行时报告为：

| 项目 | 结果 |
| --- | ---: |
| `runtimeSource` | `qcut-private` |
| `modelSource` | `qcut-private` |
| `snapshotReady` / `offlineReady` | `true` / `true` |
| 私有快照大小 | 1.4 GB |
| 私有包 / 运行库 / 模型 | 761 / 23 / 53 |
| 并发上限 | 6 |
| 实际卡数 | 596 |
| 成功 / 执行错误 | 596 / 0 |
| verified / close / unverified | 18 / 559 / 19 |
| 确定性两帧一致 | 595 / 596 |
| 全量耗时 | 257 秒（约 4 分 17 秒） |

第一次 6 卡 smoke 暴露了输入契约问题：native host 只接受无注释的 8-bit P6 PPM，脚本当时直接传入 PNG，6 / 6 都被拒绝。修复后脚本先生成统一的 `rgb24 source.ppm`，native 与 QCut 两边都使用这份像素源；第二次 smoke 6 / 6 成功，随后才扩大到全量。

全量命令：

```bash
env \
  QCUT_JIANYING_DISABLE_APP_BUNDLE=1 \
  QCUT_JIANYING_DISABLE_USER_CACHE=1 \
  bun scripts/jianying-filter-parity/run-native-single-lut.ts \
  --source ".../fixture/source.png" \
  --run-dir ".../native-single-lut-long-tail/2026-08-26-full-v1" \
  --concurrency 6
```

### 19 张 native-oracle 未过 close 门禁的卡

| 滤镜 | Resource ID | RGB RMSE | SSIM |
| --- | --- | ---: | ---: |
| 古罗马 | `7242212640498568503` | 6.635713 | 0.715726 |
| 阿尔菲 | `7299130097632627979` | 4.312596 | 0.994077 |
| 落日粉 | `7368141858603666698` | 4.041982 | 0.992211 |
| 奶油白 | `7398438142321134898` | 4.248112 | 0.995682 |
| INS亮肤 | `7438279481191599411` | 4.293772 | 0.992964 |
| INS晴肤 | `7438279661588581669` | 4.026755 | 0.992547 |
| 鲜亮食光 | `7441227246326582537` | 4.577395 | 0.991903 |
| 高清漫晴 | `7442344329114422565` | 4.177558 | 0.989079 |
| 治愈萌宠 | `7454497262480231718` | 4.598222 | 0.993123 |
| 高清亮粉 | `7474611627338239282` | 4.488633 | 0.994182 |
| 高清春日 | `7476104906924100915` | 4.816154 | 0.985708 |
| 食光II | `7478181967532543259` | 4.310165 | 0.995701 |
| 青橙电影感 | `7478335987777572137` | 4.329137 | 0.990960 |
| 春日美食III | `7486868815364492554` | 4.092382 | 0.994666 |
| 宫崎漫夏 | `7500223670678228262` | 4.476594 | 0.993993 |
| 清新夏颜 | `7503936728286252323` | 4.775398 | 0.993080 |
| 夏日物语 | `7503950769758948620` | 4.346702 | 0.992074 |
| 冷调微曝 | `7528075579602554150` | 4.043719 | 0.995152 |
| 暖食增色 | `7533181577170373934` | 4.239558 | 0.993674 |

“古罗马”还是唯一两次 native 输出不一致的卡，应先检查它是否含有时变状态、随机纹理或被错误分类成纯 single-LUT。其余 18 张更像强度映射、插值、颜色路径或隐藏 Pass 的差异。

## 剪映 UI 真值层

本轮重新执行了已有且来源明确的 8 张卡：

| 滤镜 | 类型 | UI 状态 | 指标 |
| --- | --- | --- | ---: |
| 奥林巴斯 | dual-LUT | verified | mask edge MAE 0.013262 |
| 青灰 | dual-LUT | close | mask edge MAE 0.075152 |
| 冷月夜 | dual-LUT | close | mask edge MAE 0.059560 |
| 橙蓝 | dual-LUT | unverified | mask edge MAE 0.113760 |
| 亮肤 | dual-LUT | close | mask edge MAE 0.079349 |
| 森山 | dual-LUT | unverified | mask edge MAE 0.220857 |
| 雾野 | dual-LUT | unverified | mask edge MAE 0.096268 |
| 电影柔光 | shader / Bloom | verified | RGB RMSE 0.892718 |

七张 dual-LUT 均处理 70 帧真实人物运动视频，并验证 mask 响应、A -> B 素材切换重置和固定帧数导出。电影柔光使用剪映 UI 无损帧与 QCut native provider 帧直接比较。

### 跨卡 reference 防误用

六张人像卡的 `algorithmConfig.json` 哈希相同，旧 manifest 只按算法图找 reference，因此把青灰 reference 用在其它五张卡时不会报错。本轮门禁增加两层绑定：

1. 新 schema 的每个 UI mask group 显式保存 `resourceId`；
2. 旧 schema 从 mask 文件名恢复 resource ID，并要求与目标卡一致。

真实反例测试把青灰共享 manifest 用到冷月夜，命令以 exit code 1 失败：

```text
No UI mask evidence for resource 7281165355353951543 and algorithm graph 1006de2d...
```

因此共享算法图现在只能帮助识别实现族，不能再充当其它卡片的 UI parity reference。

## Coverage 快照

### Native oracle

| 状态 / gap | 数量 |
| --- | ---: |
| verified | 18 |
| close | 559 |
| unverified result | 19 |
| missing reference | 125 |
| offline resource missing | 166 |

### Jianying UI

| 状态 / gap | 数量 |
| --- | ---: |
| verified | 2 |
| close | 3 |
| unverified result | 3 |
| missing reference | 713 |
| offline resource missing | 166 |

UI store 中存在 13 条运行历史，因为早期共享-reference 实验仍按 append-only 证据保留；coverage 按同卡同版本最新记录决定卡片状态，所以最终卡片计数是 8 张，不是 13 张。

## 仓库外证据

- 全量报告：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/report.json`
- 人类可读表：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/report.md`
- native oracle 逐卡清单：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/coverage-native-oracle.json`
- Jianying UI 逐卡清单：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/coverage-jianying-ui.json`
- 596 张 oracle PNG：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/oracle/`
- 596 张 QCut PNG：`~/Library/Application Support/QCut/Research/JianyingFilter/native-single-lut-long-tail/2026-08-26-full-v1/qcut/`
- 逐卡 dual-LUT UI 复跑：`~/Library/Application Support/QCut/Research/JianyingFilter/native-dual-lut-real-video/2026-08-26-ui-per-card/`

全量证据目录约 1.2 GB。剪映 Framework、模型、效果包、LUT、视频与 PNG 均留在 Git 之外，不进入仓库。

## 验证

- Filter Lab、single-LUT 与 dual-LUT 聚焦测试：7 files / 45 passed；
- `bun run check-types`：Web、Electron 与全部 packages 通过；
- 真实 strict-offline single-LUT：596 / 596 执行成功；
- 真实逐卡 UI mask：7 / 7 完成；
- 共享 reference 跨卡误用：真实命令被拒绝。

## 下一批顺序

1. 先拆“古罗马”，确定非确定性来自时变 graph、随机纹理还是错误分类；
2. 对其余 18 张 unverified single-LUT 逐卡检查强度入口、插值与隐藏 Pass；
3. 从 713 张缺 UI reference 的卡按实现类型与分类分层取样，先做 30 张剪映 UI 无损导出；
4. 为 166 张离线缺资源卡补私有快照后再进入对标，不把“没包”算成渲染失败；
5. dual-LUT 的三张 unverified 优先检查逐卡 mask 后处理、羽化和宿主配置。
