# 美颜缺口卡片的本机 oracle 首轮结论

记录时间：2026-08-24

## 背景

美颜面板缺口项（独立美白、红润、祛痘祛斑、匀肤、丰盈、清晰）在
`Cache/ressdk_db/*/rp.db` 的 `http_cache` 表中全部找到了对应资源：
`auto-beauty2` 与 `skin_management` 两个分类就是美颜面板的资源目录。
所有包与所需模型都已在本机缓存中，无需任何下载。

| UI 名称 | 缓存目录（resource/md5 前 8 位） | 强度协议 | 模型 |
| --- | --- | --- | --- |
| 美白 | `7408028287785602319/8615dc8c` | 标量 `{"intensity": t}` | `tt_face`、`tt_skin_seg` |
| 清晰 | `7598460431144963366/d8d3201f` | 标量 `{"intensity": t}` | `tt_fsnew_base_jianying` |
| 匀肤 | `7408077026705280256/74ded1bf` | 向量 `face_adjust_yunfu` | fsnew + freid + `jypc_yunfuhua_gpucpu` |
| 丰盈 | 同上（同包） | 向量 `face_adjust_fuling` | 同上 |
| 祛斑祛痘 | `7442228961163088434/e8b42491` | 向量 `face_adjust` | fsnew + freid + `newbandou`×2 |
| 祛黑眼圈 | 与眼部细节包同 md5（`a5ff2cc5`） | 既有键族 | 既有 |

「红润」在资源缓存中只出现在滤镜 LUT 名称里，没有独立美颜资源；
「通用祛皱」在两份 rp.db 中零命中（祛皱/除皱/皱纹/抗皱都没有）——
剪映本身就没有这两张独立卡，产品侧不再视为缺口。

## 已通过（Swing `filter-sequence` 宿主，同一张 1280x720 真人帧）

### 美白

| 强度 | 首帧（注参前） | 效果帧 | 重复帧 |
| ---: | ---: | ---: | --- |
| `0` | `1,915,782` | `0` | 逐字节一致 |
| `0.5` | `1,915,782` | `956,489` | 逐字节一致 |
| `1.0` | `1,915,782` | `1,915,782` | 逐字节一致 |

- 包默认强度为 `1.0`（注参前首帧即满强度）——产品适配器必须总是显式下发强度。
- `0.5` 恰好为满强度差值的一半：线性 alpha 混合（Lua 将 `intensity` 写入 `uniAlpha`）。
- 差分图严格局限于人脸皮肤区，眼唇被保护，背景零变化（`tt_skin_seg` 掩膜驱动）。
- 低层 CGL oracle：默认差值 `2,552,287`，`--skip-algorithm` 后回到 `0`——
  变化因果来自算法掩膜，不是烘焙纹理。

### 清晰

| 强度 | 效果帧差值 |
| ---: | ---: |
| `0` | `0` |
| `0.5` | `2,528,517` |
| `1.0` | `5,102,496` |

- 包默认强度为 `0`（与美白相反）。
- 单调且近似线性；重复帧有个位数至两位数的微小漂移（算法内部状态，
  与 skin-seg 首结果生命周期研究一致），不是逐字节确定。

## 未通过：GAN 家族（匀肤、丰盈、祛斑祛痘）

三张卡在 `filter-sequence` 与 `effect-video` 两个宿主中输出都与输入逐字节一致。
调试副本（打开 Lua 日志）证明链路断点非常精确：

- `SetEffectIntensity` 事件已抵达 Lua（`hitKey face_adjust_yunfu` 命中）；
- 但逐帧 `result:getFaceCount()` 恒为 `0`，`faceInfo.id` 恒为 `-1`；
- 合成门 `outputMap:get("gan"..index) == 1` 恒为 false——script 算法
  （JS runtime，`doInit` 正常解析 `yunfu` 320x320 GAN 模型配置）从未执行逐帧推理，
  init 后直接 destroy。

即：**堵点不是事件桥、不是模型解析，而是宿主没有把人脸检测/freid 结果喂进
script 算法的逐帧调度**。这与「剪映 CV 特效解锁」时的两堵墙同族但更深一层
（那次修的是模型回调与原生纹理输入；这次缺的是 face→freid→script GAN 的
requirement 调度与结果发布）。输入方向（GL/显示两种朝向）已排除。

## 下一步

1. 美白、清晰按单卡模板继续第 7-8 步（中文剪映 UI 只开单项 100 采参照 +
   固定 ROI PSNR/SSIM 邻域搜索），随后接产品适配器（新增 runtime 包身份 +
   标量强度分支，语义同 smooth）。
2. GAN 三卡单独立项：在 Swing 宿主中打通 face/freid requirement 的逐帧调度，
   验收标准沿用「有模型 vs 无模型」隔离 + `gan0==1` 发布 + 零强度回退。
3. 祛黑眼圈只需产品侧命名核对（很可能就是现有 `face_adjust_Pouch` 的 UI 名），
   不需要新包。

原始包全部未修改；调试副本、探针日志、差分图只存
`~/Library/Application Support/QCut/Research/JianyingFilter/beauty-gap-cards-2026-08-24/`，
不进 Git。
