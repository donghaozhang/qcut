# 剪映特效参照生产线(Gen-2 → Gen-1 规模化路线)

日期:2026-08-16 · 状态:管线已跑通,全量批渲进行中

## 背景与路线决策

特效实验室(PR #414,`electron/jianying-effect/`)能在本机通过剪映原生运行时
渲染剪映原版特效,但**作为终端用户功能无法规模化**:

1. **分发天花板**:QCut 不分发任何剪映资产;覆盖面 = macOS ∩ 装了剪映
   ∩ 在剪映里用过该特效,三者相乘极小。把特效包放自有 CDN 是侵权。
2. **平台天花板**:桥接层是 Objective-C++/macOS 图形栈,Windows 需重写。
3. **能力天花板**:只支持 `blit`/`texture_blit`;需 CV 模型(抠像/人脸)的
   特效全部锁定。

选定路线:**把 Gen-2 当参照生产线**——批量渲染剪映特效的参考视频作为
ground truth,驱动 Gen-1 自研特效(`apps/web/src/lib/effects/`)的批量复刻。
产出的特效是 QCut 自有资产,全平台可分发。先例:滤镜 LUT 拟合(PR #347)、
音效实验室(382 条参照,私有 bucket)。

## 关键发现(2026-08-16 探测)

- 本机剪映 sqlite 缓存(`Cache/ressdk_db/*/rp*.db` 的 `http_cache` 表)登记
  **1024 个特效**(画面 707 + 人物 317),远超已下载的 10 个包。
- 其中 **618 个是 blit-only**(当前运行时即可渲染,无需 CV 模型)。
- 每个条目的 `common_attr.item_urls[0]` 是**带签名的包下载地址**
  (byteimg CDN,观测到的签名有效期约 1 年);`download_info.url` 为空。
- 包为 zip,**md5 = 目录名 = zip 整体 md5**,下载后可校验完整性;解包结构
  与剪映缓存包一致(`amazingfeature/ + config.json + extra.json`)。
- 渲染不需要把包放回剪映缓存:`renderJianyingEffectClip` 的 definition 直接
  接受任意 `packagePath`,我们解到自己的 `_packages/` 下即可,不污染剪映。
- 滑杆参数以包内 `extra.json` 为准(`readAdjustParameters`),回退目录的
  `sdk_extra`。

## 管线

脚本:`scripts/jianying-effect-reference-batch.cjs`(**必须用 node 跑**,
catalog 依赖 node:sqlite,bun 会炸;需先 `bun run build` 产出 dist/electron)。

```bash
node scripts/jianying-effect-reference-batch.cjs            # 全量
node scripts/jianying-effect-reference-batch.cjs --limit 5  # 小批
node scripts/jianying-effect-reference-batch.cjs --panel effects2
node scripts/jianying-effect-reference-batch.cjs --only <effectId,...>
```

流程:sqlite 读全量目录 → 复用剪映已缓存包,缺的从签名地址下载
(md5 校验,500ms 节流)→ 桥接 `effect-video` 渲染 6s/1280x720/30fps 参照
(默认滑杆值,特效窗覆盖全片)→ 与基线算 SSIM → 追加 `manifest.jsonl`
(断点续跑按 `ok:true` 跳过)。

参照片:`_assets/ref-clip-1280x720.mp4` = 实拍滑板素材(真实颜色,吸取
LUT 拟合"只在真实颜色上拟合"的教训)+ 底部 SMPTE 色条(40px)+ 灰阶带
(40px)。基线 = 同片过一遍相同的 full→limited bt709 转换,用于恒等对比。

## 存储与红线

全部输出在 `.local/jianying-effect-references/`(已 gitignore):

```
_assets/     参照片与基线
_packages/   下载的特效包(<effectId>/<md5>/)
refs/        参照视频(<panel>/<effectId>-<名称>.mp4)
manifest.jsonl  每特效一行:md5/耗时/帧数/SSIM/滑杆参数/失败原因
```

**红线:包和参照视频是剪映衍生内容,只作本机复刻参照,绝不进 Git、
绝不上传公开渠道、绝不进产品分发。**(若需团队共享,走音效实验室同款
私有 bucket + 白名单方案。)

## 验证记录

- 试渲染:已缓存 7 特效 7/7 成功(卷动/怀旧边框II/抖动/泡泡变焦/磨砂纹理/
  竖线屏闪/胶片框),单个 6s 参照约 5-6s,SSIM 0.82-0.95,抽帧目检特效
  真实生效。
- 下载链路:星火(781KB,md5 校验一致)下载→解包→渲染成功。
- 冒烟:批量脚本 3/3(丁达尔旋焦/撕拉片/多屏球形),含全新下载分支。

## 坑

- **SSIM 高 ≠ 恒等**:稀疏粒子特效(星火 0.990)天然高分;脚本仅在
  >0.997 时标 `flaggedIdentity`,结论前必须抽帧扫时间(备忘录同款教训)。
- 渲染在特效窗内仍可能大部分时间接近恒等(如一次性开幕类),参照要看全片。
- `zsh` 下别用未引号的 `=xxx`;脚本内下载用 fetch + UA 伪装为剪映客户端。
- 桥接/ffmpeg 走 `dist/electron` 编译产物,改 electron 源码后要 `bun run build`。

## 特效实验室 UI 补全(2026-08-17,同批改动)

发现签名下载地址后,实验室不再局限于"剪映里用过的那几个":

- **全量目录**:`discoverJianyingEffects` 现在返回未安装但可下载的条目
  (`installed`/`downloadable` 字段;未安装且需 CV 的条目不列,避免几百个
  锁定 tile 噪音);已安装排前。availableCount = 已安装且可渲的数量,
  ready 状态只要目录非空。
- **按需下载**:新 IPC `jianying-effect:download`(渲染进程只传 effectId;
  URL/校验/落盘全在主进程):https-only、200MB 上限、md5 必须等于目录条目、
  `unzip -Z1` 先列条目拒绝路径逃逸、staging 目录原子 rename、in-flight
  去重。解包到 `userData/JianyingEffectPackages/<effectId>/<md5>/`
  (`packageCacheRoots` 新增该根;懒加载 electron,纯 node 下仍可用)。
- **面板**:未安装 tile 显示"点击下载"→ 下载中 spinner → 失败可重试
  (toast 报错);表头"本机剪映特效 X 个 · 可下载 Y 个"。
- **调节滑杆**:EffectInstance 新增 `adjustParameters`(schema)与
  `adjustValues`;应用时取包默认值;属性面板对 jianying-local 实例渲染
  滑杆(常见 `effects_adjust_*` 中文标签);导出收集器把 adjustValues
  贯通到 render IPC。
- 测试:目录解析(itemUrls 过滤、zip 安全条目)、面板下载流、导出
  adjustValues 贯通;`bun check-types`、biome 全绿。

## 全量批渲结果(2026-08-17)

- **最终:618 个 blit-only 特效 618/618 全部拿到参照**(画面特效 591 +
  人物特效 27)。渲染总时长约 2 小时(均值 12.6s/个,含下载),下载
  611 个包。参照库 2.4GB + 包 1.2GB。
- 首轮为 517 成功(84%),失败 101 个;定位并修掉一个假失败后补齐(见
  下节)。
- 首轮失败 101 个,全部落在 **Lumi 家族**(90 个 JS 版:根目录
  `LumiManager.js` + `config.json.js_path`,内嵌 ThreeJS;其余 Lua 版
  `LumiFamily/`)。**当时误判为"该家族无 SeekModeScript、墙钟驱动,
  需原生步进支持"——是错的**,真实根因见下节。
- SSIM 分布 min 0.048 / p50 0.844 / max 0.988,0 个疑似恒等——所有成功
  参照都有真实画面变化。
- 20 个下载网络抖动经重跑全部转为成功。

## Lumi 假失败与 8KB 尾窗(2026-08-17 复核)

直接跑桥接复核后推翻了上面的判断:**Lumi 包在现有 seek 式驱动下渲染
完全正常**,失败的是我们读回执的方式。

- 证据(单包直跑「重影震荡」):退出码 0;raw 输出 13,824,000 字节 =
  60 帧一帧不少;回执 `[effect] frames:` **就在 stdout 里**;像素比对
  60/60 帧都与输入不同(均值 6.47、峰值 121、逐帧起伏)。
- 根因:`render.ts` 的 `MAX_CAPTURED_PROCESS_OUTPUT = 8192` 只保留输出
  尾部 8KB,而回执距 EOF **10,268 字节**——**差 2KB 被挤掉**。挤掉它的
  是 Lumi 特有的收尾日志(`[AE_JSRUNTIME_TAG]'Scene: 开始清理场景资源'`
  + dispose/destroy/onDestroy 的 JS 调用栈,合计约 90KB)。普通包没有
  JS 引擎、收尾几乎不打日志,所以回执稳稳留在窗口内——失败**恰好**全
  落在 Lumi 家族,才造成"驱动模型不兼容"的错觉。
- 修法:`runJianyingEffectProcess` 增加 `retainPattern`,边收边扫锁存
  匹配行并前置到返回值,不再依赖尾窗(测试覆盖:回执后刷 20KB 日志、
  回执被 chunk 边界切开两种情况)。
- 修复后重跑这 101 个全部通过,参照库补齐到 **618/618**。
- **教训**:桥接"跑完没报数"要先看**原始完整 stdout**,别从家族特征
  倒推驱动模型;进程输出的尾窗截断是隐蔽的假失败源。
- 附带坑:失败的 pass 仍会 mux 出 mp4(第三步 ffmpeg 在解析回执之前就
  跑完了),脚本已改为失败即删输出。

## 下一步(复刻阶段)

1. 全量批渲完成后按 SSIM/类别聚类,挑高价值批次(热门分类优先)。
2. 每个特效:参照视频 → 判定所属 Gen-1 原语(filter/motion/particle/
   distortion/decoration/composite)→ 写 catalog 条目 → 与参照做像素级/
   感知对比测试锁 parity。
3. 拟合类(调色/光效)可复用滤镜 LUT 拟合管线;几何类用 remap 图拟合。
