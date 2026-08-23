# 41 个锁定算法特效：模型开关 E2E 最终结果

日期：2026-08-23

状态：模型缓存、原生桥、CLI 和精确白名单均已收尾；41 个候选中只剩 6 个继续锁定

范围：仅验证本机私有剪映运行时的互操作能力，不提交或分发剪映包、模型、运行时或参考视频

## 最终结论

原先锁定的 41 个精确包版本已经全部完成分类：

| 分类 | 数量 | 处理结果 |
| --- | ---: | --- |
| 模型开关隔离通过 | 33 | 已加入 `effectId:packageHash` 精确白名单 |
| 本地普通运行时通过 | 2 | `ext_texture_producer` 包不再误判为 CV 锁定 |
| 模型未产生可证明贡献 | 6 | 继续锁定，不能仅凭画面变化放行 |
| 缺少声明模型 | 0 | 原先缺少的 14 个本地模型文件已补齐 |
| 原生桥崩溃 | 0 | OpenGL 上下文、模型解析和帧内存问题已修复 |
| 合计 | 41 | 每个包都有最终 verdict |

代码中的已验证算法精确包由 365 个增至 398 个。最终 CLI doctor：

```text
availableCount: 1004
totalCount: 1010
installedCount: 1010
supportedCount: 1004
lockedCount: 6
categoryCount: 37
state: ready
```

目录存在、模型存在、原生进程未崩溃或画面相对原片有变化，都不能单独作为解锁
依据。白名单仍要求同一输入、同一参数下模型开启输出与模型关闭输出存在稳定差异。

## 本机模型缓存

原先 19 个预检失败包所需的 14 个物理模型文件已经从用户本机合法安装缓存同步到：

```text
~/Library/Application Support/QCut/PrivateRuntimes/
  JianyingTransition/current/Models/user-cache/
```

文件按字节和哈希与本机来源核对一致：

```text
tt_matting_relighting
nh_depth_for_light_scanning
nh_normal_estimation_online
tupo_cartoon_F_packed
tupo_cartoon_packed
tt_aged
tt_aged_script
js_cv_trackmotion
js_cv_trackmotion2
lens_smart_color3
tt_baoman_tk
tt_avatar3dsticker
tt_lm_3d
tt_lm_3d_mean_face
```

`idream/tt_goodlike` 是 IDream 逻辑键，不是文件系统模型名。预检现在只收集
`model_name` 和包级 `model_names`，不会再把 `idream_model_key` 误报为缺失模型。

模型、剪映包和本地运行时均不进入 Git，也不随 QCut 安装包上传或分发。

## 桥接修复

### 模型声明和解析

`electron/jianying-effect/catalog-parsing.ts` 与
`electron/jianying-effect/algorithm-support.ts` 会合并目录元数据、
`algorithmConfig`、节点 `stringParam.model_name` 以及包内 `config.json` 的模型声明。

`research/jianying-runtime-probe/filter-host-support.mm` 保留 QCut 私有缓存优先级，
只在单个根目录内部排序；特效桥先匹配精确文件名，再做受控 stem 回退。

### 运行时原生 GL 上下文

`research/jianying-runtime-probe/effect-probe.mm` 不再使用普通 `NSOpenGLContext`
或额外创建一个无宿主的 GLES device。加载 `libcccreator` 后，它取得并持有剪映运行时
自己的 `HTSGLContext`，在创建 Swing manager 和每次 seek 前绑定。

该修复消除了两个剩余人脸包中的：

```text
current thread is missing GLContext
BachAlgorithmFace input is null
AlgorithmExpressionDetect image input is null
```

“卡通脸”随后成功加载 `tupo_cartoon_F_packed` 并触发 `model change`；“变老-美颜”
成功加载 `tt_aged` 和 `tt_aged_script`。Metal 仍是主渲染输出，GL 只服务于算法链路。

### 帧生命周期、预热和隔离

`research/jianying-runtime-probe/graphics-probe.mm` 持有 BGRA backing buffer，保证
`CVPixelBuffer` 使用期间内存不被提前释放。

算法包在可见输出前执行 200 ms、6 帧隐藏预热，避免 Lua 在第一帧把尚未准备好的
检测结果永久锁定。模型开启和关闭对照都会使用相同的原生输入、HTSGLContext、
预热时间线、尺寸、帧率和参数，唯一差异是是否提供模型目录。

## 首批通过的 14 个包

| 能力 | effectId | 名称 | packageHash | 基线 SSIM |
| --- | --- | --- | --- | ---: |
| matting | `7399494164552928552` | 摇晃运镜 | `4d77c351eeea86bed84fe0f2e1b87991` | 0.805384 |
| matting | `7399494734030359808` | 扭曲变焦 | `76492abc2d1e501cc370e167f5a5169a` | 0.830219 |
| matting | `7399492066742455567` | 动感变焦 | `ab8ff76e6e3f2917167aa8b46c72d7b5` | 0.875473 |
| matting | `7399494870265580840` | 重复震闪 | `1ce9d544e68a0bb2569b6bf029ad7e71` | 0.841203 |
| matting | `7399495847752240399` | 反转片 I | `08ea65d0c66e42df005ffc079778fd7c` | 0.688457 |
| matting | `7399496452466183476` | 对焦DV | `0913b628b7ae9ce209316d866a1be8d7` | 0.898604 |
| matting | `7399492922699205940` | 低画质CCD | `1eca62ca4aa366754232b2250015c607` | 0.505242 |
| matting | `7399492832089623808` | DCR | `a801c360c14addf5d7792909311190e0` | 0.928730 |
| face | `7399497286369250612` | 彩噪画质 | `9ad61644392439ab43db04e1961031ad` | 0.851013 |
| face | `7399493519930412340` | 负片拖影 | `3ec3cd74c41f47a6e96720b8a96e17e3` | 0.689757 |
| face | `7399491817907014946` | 眩光旋移 | `4df2df27627c4d888c44a124a4d271dd` | 0.819392 |
| face | `7399493469917433103` | 隔行DV | `3429986a54fc1d15cc29f7340103540d` | 0.796481 |
| skeleton | `7399498722423508264` | 闪电炸裂 | `e8cf7ff9c724ded3e75c1330c5e141cc` | 0.970345 |
| depth | `7399495031087828239` | 电光爆闪 | `2cc42d4d6e7300bf7aa22f543efcec57` | 0.777793 |

另外两个普通本地运行时包完成 180 帧渲染：

| effectId | 名称 | 节点 | 基线 SSIM |
| --- | --- | --- | ---: |
| `7399494351249771811` | 流星雨 | ext_texture_producer | 0.954988 |
| `7399492123436928308` | 迷离 | ext_texture_producer | 0.856621 |

## 补模型后通过的 19 个包

下表全部使用最终版桥完成 6 秒、180/180 帧渲染。`对照 SSIM` 比较模型开启输出与
模型关闭输出；阈值要求小于 0.999。

| 组别 | effectId | 名称 | packageHash | 基线 SSIM | 对照 SSIM |
| --- | --- | --- | --- | ---: | ---: |
| face | `7399499040922045711` | 轮廓扫描 | `f73ba06cd32bb3354adf6008cb986515` | 0.975510 | 0.989052 |
| face | `7399498685928721664` | 脸部故障 | `5c24c94cc0557d8169c405adc0ec86d3` | 0.970332 | 0.980236 |
| face | `7399498939415760180` | 哥特 | `798ddfa08fed0c3750febd157602f92b` | 0.830253 | 0.993079 |
| face | `7395460782609173795` | 掉小珍珠啦 | `e68975c8783884a379af71d8ebf809c7` | 0.872146 | 0.985759 |
| face | `7399498109098790179` | 变老-美颜 | `7ff35a01c3718ac3470ac12807f520be` | 0.977850 | 0.992416 |
| face | `7399497918765436195` | 卡通脸 | `501b309dac3169c8b938fa785878cf3d` | 0.944408 | 0.955534 |
| skeleton | `7399497589105642752` | 音符拖尾 II | `097d27eab3b8c3c7c6477ca81cd07933` | 0.992039 | 0.990624 |
| skeleton | `7399498169383390516` | 电子屏故障 | `7e9e83271fa77c1cc2b96f3ad4296479` | 0.967332 | 0.942015 |
| skeleton | `7399497077006339343` | 机械几何 | `fce07a1e1b2dbdb8675e35c4d0d1dd10` | 0.989806 | 0.989638 |
| skeleton | `7399497885865233716` | 赛博朋克 II | `0681150b3164f45ab6340f0a7e2fda1d` | 0.938467 | 0.918507 |
| skeleton | `7399498073325473024` | 机械环绕 II | `49e8da187049ffc5a822cf76e492a47c` | 0.985931 | 0.977989 |
| tracking | `7399495834502450467` | 推拉跟随 | `755d346ad79ff4b32ba5c7a984e76340` | 0.662566 | 0.669739 |
| matting | `7399495628797021474` | Bling飘落 | `8bc7fee5267274763f6b260c36c2a35b` | 0.897457 | 0.933922 |
| tracking | `7399495261510257920` | 跟随运镜 | `fb764400bbf7df913392c701acfdd138` | 0.679960 | 0.669700 |
| tracking | `7399494738933533987` | 跟随运镜 II | `fa10d2f4b9ea524f14fc99ff8328be42` | 0.667002 | 0.557672 |
| tracking | `7399494094050823464` | 变速推镜 | `67cdf42290e1a549dddd71e9f7c04c1b` | 0.672470 | 0.656367 |
| face + matting | `7399491541821033768` | 动感扫光 | `f8e7687cd2456e389b3e9f87d10f4c6d` | 0.893831 | 0.985004 |
| depth script | `7399494846475472168` | 光线拖影 | `1cee833d647541e86d24bb2f7b7635ea` | 0.942923 | 0.918192 |
| matting script | `7399495041212779816` | 可爱涂鸦 | `3b8f6203dfedcd2ff5d17ff6ac6bef78` | 0.944700 | 0.964577 |

## 继续锁定的 6 个包

这些包能完整渲染，但当前素材下模型开启与关闭一致，或差异不足以越过 0.001 门槛。

| effectId | 名称 | 对照 SSIM | 下一步 |
| --- | --- | ---: | --- |
| `7399490977666174248` | 翻转开幕 | 1.000000 | 检查活跃场景是否消费 matting 输出 |
| `7533162049044516105` | 虹幕穿梭 | 0.999114 | 换高运动前景复测 |
| `7399498619201654051` | 局部马赛克 | 1.000000 | 检查 face/freid 区域参数 |
| `7576927346695982361` | 人物聚焦 | 1.000000 | 检查活跃 Lua 是否读取 face 结果 |
| `7399497620072271144` | crash！ | 1.000000 | 核对主场景与包内 CV 脚本选择 |
| `7399499201958153472` | 舞者 | 1.000000 | 使用持续全身舞动素材复测 |

这 6 个不是“缺模型”或“桥不支持”，而是还没有足够证据证明模型结果参与最终画面。
在证据出现前保持锁定。

## CLI E2E

搜索和 doctor 均将“卡通脸”报告为本机已安装、`supported: true`：

```bash
qcut effect-lab doctor --json
qcut effect-lab search --query "卡通脸" --supported-only --json
```

最终用户路径也完成真实视频渲染：

```bash
qcut effect-lab render \
  --effect 7399497918765436195 \
  --input .local/jianying-effect-references/_assets/ref-clip-face-1280x720.mp4 \
  --output /tmp/qcut-effect-cli-cartoon-20260823.mp4 \
  --duration 3 \
  --json
```

结果为 6 秒、1280x720、30fps、180 帧 H.264 视频，卡通脸覆盖前 90 帧。该测试
输入本身没有音轨，因此这条样本不用于证明音频透传。CLI 与特效实验室使用相同的
运行时检查、精确白名单和 native bridge。

## 验证门槛

每个后续候选仍必须同时满足：

1. 包哈希与目录元数据一致；
2. 模型开启和关闭均完整输出 180/180 帧；
3. 两次渲染只允许模型目录不同；
4. 模型开启相对关闭存在稳定、非噪声差异；
5. 差异位于预期的人脸、骨骼、抠图边缘、跟踪或景深区域；
6. 没有黑帧、闪帧、镜像 mask、透明度错误或崩溃；
7. 只放行本次验证的 `effectId:packageHash`；
8. 通过算法支持单测、目录统计和至少一个 CLI 视频 E2E。

## 本地证据与 Git 边界

以下内容保持 Git 忽略：

```text
.local/jianying-effect-references/
  _assets/               测试输入和基线
  _packages/             本机私有参考包
  refs/                  模型开启参考输出
  manifest.jsonl         追加式 E2E 结果

~/Library/Application Support/QCut/PrivateRuntimes/
  JianyingTransition/    私有运行时、模型和包缓存
```

Git 只保留 QCut 自有桥接代码、测试、精确兼容元数据和不包含私有资产的结论文档。
