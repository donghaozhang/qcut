# Bach algorithm 的 model-clip 参数边界

记录时间：2026-08-11

## 本轮唯一问题

本轮只验证奥林巴斯滤镜进入 `TESwingEffectManager::updateBachAlgorithmParam` 前，真实 model clip
携带的三个值：

```text
amazing effect algorithm type
amazing effect algorithm result directory
clip_res_path
```

不修改这些值，不调整模型、AB、update-mode、纹理、强度、时间戳或生命周期。判据预先固定：若
algorithm type 为 `1` 且 result directory 非空，下一轮才在独立 V2 宿主重放其中一个值；若 type 不是
`1` 或目录为空，则该预计算结果路径对奥林巴斯没有启用，应从当前人像差距来源中排除。

## 静态调用链

两版 arm64 `libcccreator.dylib` 的地址不同，但控制流一致：

```text
TESwingEffectManager::updateBachAlgorithmParam
  -> 判断 CC-model 全局开关
  -> legacy: TEClipUtil::getInt("amazing effect algorithm type", 0)
     CC model: ITEModelClip vtable + 0x4d8 -> CCFilter
               dynamic_cast<CCAmazingFilter>
               CCAmazingFilter + 0x110
  -> 仅 algorithm type == 1 时继续
  -> legacy: TEClipUtil::getString("amazing effect algorithm result directory")
     CC model: 从 CCAmazingFilter + 0xf8 线程安全复制 string
  -> 目录非空时读取 clip_res_path 并绑定给 FeatureSegment
```

已核对的二进制布局：

| 二进制 | SHA-256 | update offset | CC flag | result getter |
| --- | --- | ---: | ---: | ---: |
| 私有独立宿主运行库 | `d383946d322b9326adde930e01b61a54035b6307c7b5f3f4bd89e945510be265` | `0x21f3f68` | `0x3877828` | `0x1f27c44` |
| 当前安装版 `11.2.13024`（bundle `11.3.0-beta2`） | `6437ac74bc4647df91e9d360111d1e06b872babff3a933b77dce302511b785cf` | `0x21fd274` | `0x3884da8` | `0x1f31684` |

当前版本的 getter 仍在对象 `+0x8` 上加锁，并从 `+0xf8` 复制 `std::string`；algorithm type 仍位于
`+0x110`，CCFilter getter 的 vtable offset 仍为 `+0x4d8`。因此版本变化只要求选择正确的二进制布局，
没有改变本轮参数语义。

## 只读观察器

观察器源码为 [probes/bach-algorithm-params-capture.cpp](probes/bach-algorithm-params-capture.cpp)。它对以下
三个入口做进程内 copy-on-write remap，并原样调用原函数：

- `TEClipUtil::getInt`；
- `TEClipUtil::getString`；
- `TESwingEffectManager::updateBachAlgorithmParam`。

观察器按 `updateBachAlgorithmParam` 的符号偏移选择上述两套已验证布局；未知布局只记录
`cc_model_enabled=-1`，不会猜测字段地址。真实渲染发生在 hardened `--lvve-service`，该子进程不会继承
观察器，所以主进程在读取匹配的 `clip_res_path` 时，对同一个 `ITEModelClip` 做一次只读 accessor 检查。
这取得的是发送给渲染服务前的原始 clip 值，不是子服务执行后的状态。

编译与签名：

```bash
xcrun clang++ -std=c++17 -dynamiclib -arch arm64 -O2 -Wall -Wextra -Werror \
  -o /private/tmp/libjy-bach-algorithm-params-capture.dylib \
  docs/task/jianying-filter-runtime-research/probes/bach-algorithm-params-capture.cpp
codesign --force --sign - /private/tmp/libjy-bach-algorithm-params-capture.dylib
```

在旧版私有运行库上先执行 Clear Food 三帧回归：`rendered 3/3 frames`，三个 hook 均为 `patched`，
布局被识别为 `private-runtime-d383946d`。这证明双版本支持没有破坏既有 Swing V2 宿主。

## 真实 UI 捕获

剪映草稿 `8月10日 (1)` 使用奥林巴斯资源 `7361792068475325735`，滤镜轨道强度为 `100`，素材为
`olympus-ui-baseline-480-prores-hq.mov`。观察器只匹配该资源 ID。当前安装版被识别为
`installed-app-6437ac74`，捕获值为：

```text
cc_model_enabled = 0
amazing effect algorithm type = 0
amazing effect algorithm result directory = ""
clip_res_path = /Users/peter/Library/Containers/com.lemon.lvpro/Data/Movies/
  JianyingPro/User Data/Cache/artistEffect/7361792068475325735/
  3db90437187dd911b234766ef7297fe9
```

`cc_model_enabled=0` 证明 UI 使用 legacy accessor；因此 type `0` 和空目录不是未知布局下的 fallback
猜测。`clip_res_path` 多次稳定指向奥林巴斯的准确效果包，另一次读取则正确指向时间线媒体文件，说明匹配
没有把素材 clip 误认为滤镜 clip。`updateBachAlgorithmParam` 本身没有在主进程触发，符合渲染调用位于
hardened 子服务的既有观察。

本机证据保存在 git 外：

```text
~/Library/Application Support/QCut/Research/JianyingFilter/
  bach-algorithm-params/ui-capture-2026-08-11/
    bach-algorithm-params-capture.log
    ui-olympus-bach-params.jpg
```

| 文件 | SHA-256 |
| --- | --- |
| `bach-algorithm-params-capture.log` | `ddad711bcd8632d48bf541bb6176fe2c60a922481606976e916c197af1c04d8a` |
| `ui-olympus-bach-params.jpg` | `1be2ce8f2569fa83a5c94d00e4e97c358713f172d30d0103554718d63652a955` |
| 临时签名观察器 | `b14017d2f621b8e3e9baa559daba70f7c498aef1b4a2e12b81da9295b6dfd2f0` |
| 观察器源码 | `9d13c5aa72714acbbad3bbbf7f7b94618553c83f089832d97ca5296c78bc5b6a` |

测试结束后已正常退出注入进程，并从无 `DYLD_INSERT_LIBRARIES` 的普通入口重启剪映。新主进程的
`vmmap` 中没有观察器映射。

## 结论

本轮问题已经回答：**奥林巴斯没有启用 `updateBachAlgorithmParam` 的预计算算法结果目录路径。**

- algorithm type 为默认值 `0`，而函数只在值为 `1` 时继续；
- result directory 为空，即使绕过前一条件也没有可绑定的算法结果；
- `clip_res_path` 正确，排除了“独立宿主加载了错误效果包”这一解释。

因此不能把当前人像差距归因于漏传这三个 model-clip 值，也不应在独立 V2 宿主中把 type 强改成 `1`；
那会构造 UI 从未使用的路径，而不是复刻 UI。

## 后续验证

`support_external_model_name` 的真实 UI / 独立 V2 对照已经完成，两边均为 `3`，因此该 AB 已排除。
两边请求相同逻辑模型名，但 UI 的缓存 resolver 会映射到更新的 face-extra 与 skin-seg 文件，独立宿主的
exact-first finder 则返回旧文件。下一轮只比较 UI 实际 skin-seg 文件，不同时改变 SIMD 或其他 AB。
完整证据见 [support-external-model-name.zh.md](support-external-model-name.zh.md)。

该后续比较与 SIMD 单变量均已完成。Physical v5.1 会改变 mask/RGBA，但旧模型增益混入了 CoreML ready
时序；ready 受控后 SIMD 0/1 的 71 张 RGBA 与 72 张 mask 逐字节一致。当前下一变量是首次结果与模型
ready/cache 生命周期。见 [ui-physical-skin-model.zh.md](ui-physical-skin-model.zh.md) 与
[skin-seg-simd-ab.zh.md](skin-seg-simd-ab.zh.md)。
