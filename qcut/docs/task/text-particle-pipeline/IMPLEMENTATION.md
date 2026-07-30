# 文字粒子管线 — 施工文档

对标剪映的三个粒子类文字动画:粒子碎落(出场)、彩带喷射(入场)、福袋炸开(循环)。
本文档记录逆向证据、架构决策、分期计划与验收标准。证据采集日期 2026-07-30。

## 0. 结论先行

- 粒子碎落**不做碎片精灵系统**,做 **raster tile 位移**:把字的烘焙位图切小块,
  每块按剪映 shader 的原公式(noise 偏移 + 旋转重力 + 溶解前沿释放)位移绘制。
  碎片就是字自己的像素,比程序化碎片更忠实,且纯 2D 闭式。
- 彩带/福袋走**精灵粒子**:泛化现有 heart 装饰(它已打通 引擎→canvas→DOM 预览→导出烘焙 全链路)。
- 一切运动为 progress 的纯函数(闭式弹道),无累积仿真状态 → 拖动安全、导出平价免费。

## 1. 证据档案

### 1.1 粒子碎落包(shader 级白盒)

- 包:`~/Movies/JianyingPro/User Data/Cache/effect/7532474130986241331/`
- 存档:`scratchpad/jy-particles/particle-shatter/`(会话临时目录,关键内容已转写至本文档)
- 结构:`textAnim.lsproj`(加密驱动)+ `res/` 三节点 —— **节点图 = LinearWipe → Dust → DeepGlowSimple**
- 关键发现:`.ausl` 源加密,但 **`shaderLib/shaderMetal/*.vert` 编译产物是明文**。

`res/Dust/AmazingFeature/effects/LumiDust/xshader/shaderLib/shaderMetal/f878b2e9…vert`
(131 行)转写的核心数学:

```
uniforms: u_ScreenParams, mask_line_rot, distorIns, gravity, gravityRot,
          maskType, noiseFeather, progress, mask_line_feather

每粒子(gl_InstanceID 索引):
  uv        = 由 instanceID 折算的网格坐标(floor(id/H)/W, mod(id,H)/H)
  noise     = noiseTex.sample(uv)                    // 确定性随机源
  offset    = (noise - 0.5)/screen · min(W,H) · distorIns
  gravityV  = rotate((0, -gravity), gravityRot)
  offset   += gravityV

maskType == 0(noise 溶解):
  front  = progress · (1 + noiseFeather)
  d      = smoothstep(front - noiseFeather, front, maskNoise.x)
  release = 1 - d
  offset.x *= release^0.9        // 各向异性:横向先动
  offset.y *= release^1.1
  alpha   = d^0.3                // 残留字形的衰减曲线

maskType == 1(线性扫线):
  扫线 = 以 mask_line_rot 旋转的直线,宽度 1.414·cos(45°折算),feather 由
  mask_line_feather 控制;释放权重/残留 alpha 用同款双 smoothstep。
```

要点:**溶解前沿 = 粒子释放前沿**。未释放像素原位显示;已释放像素按 noise+重力
位移并加速衰减。DeepGlowSimple 只是后置发光,LinearWipe 提供线性前沿变体。

### 1.2 精灵粒子参数名(prefab strings 可读)

`LumiDust.prefab` 二进制 strings 暴露完整发射器参数 schema(数值在二进制段,
用帧标定获取):

```
particleTotalNum, pSize, pSizeRandom, pSizeRatio, pSizeOverLife,
pOpacityOverLife, pLifeRandom, gravity, gravityRot,
emitterScaleX/Y/Z, emitterTranslationX/Y/Z, sliderSpeed, sliderNumber
```

QCut 侧参数命名照抄此表,便于后续对照。

### 1.3 已验证的假线索(避坑)

- 缓存里 `AmazingFeature_particle` 目录(86008235 等 3 包)是**噪点 grain shader**,
  与粒子发射无关,名字是陷阱。
- 彩带喷射/福袋炸开尚未下载采集(入场/循环深列表),开工时按 mtime 标记法收包,
  预期同样有 prefab 参数名 + 贴图素材(sprite PNG)可挖。

### 1.4 QCut 侧可复用资产

- `heart` 装饰(`effect-state.ts` 心形粒子):seededValue(seed, unitIndex,
  particleIndex, channel) 确定性粒子 → decoration state → canvas `drawHeart` →
  DOM `TextAnimationPreviewDecoration` → 导出烘焙同路径。**全链路模板**。
- `TextAnimationMaskState`(direction + progress + featherPx):现成溶解前沿载体。
- 文字 raster 烘焙(`text-raster-sources.ts`):OffscreenCanvas 逐帧渲染已存在。
- `MAX_DECORATIONS_PER_FRAME` 装饰数量护栏已存在。

## 2. 架构

### 2.A 碎落:raster tile 位移(renderer 级)

```
引擎侧:新 effect kind "shatter"
  { kind: "shatter";
    tilePx: number;          // tile 边长,默认 6
    distortion: number;      // distorIns 等价,em 系数
    gravity: TextAnimationDistance;
    gravityRotDeg: number;
    front: "noise" | "wipe"; // maskType 0/1
    frontRotDeg: number;     // wipe 扫线角
    feather: number;         // noiseFeather / mask_line_feather
  }
  evaluate 输出:container.visual 携带 shatter 参数透传(新 optional 字段
  `shatter?: TextAnimationShatterState`,类比已删的 projection 的透传方式,
  但保持纯 2D 语义)。

渲染侧:text-animation-canvas-renderer 检测 shatter state:
  1) 将该元素文字绘制到 offscreen(现成 drawGlyph 循环)
  2) 按 tilePx 网格遍历 offscreen,每 tile:
     release = 前沿公式(tile 中心 uv, progress, feather)
     offset  = seededNoise(tileIndex) · distortion · release^{0.9,1.1}
               + rotate((0,-gravity), gravityRot) · release
     alpha   = release 完成后按 d^0.3 衰减
     drawImage(offscreen, tileRect → tileRect + offset, alpha)
  纯 drawImage 循环,1080p 单字幕量级 tile 数 < 2k,性能可接受;
  预览若卡,可将 tilePx 随字号自适应放大。

导出:烘焙走同一 canvas 渲染器 → 自动平价,零额外工作。
```

设计取舍记录:
- 不引入 per-tile 精灵对象/生命周期——release 权重本身就是"出生",无状态。
- noise 源用 seededValue(tileX, tileY, channel) 哈希而非贴图,保证跨端确定性。
- `shatter` 只在 exit/entrance 相位使用(碎落/汇聚 = 时间反演同一效果)。

### 2.B 彩带/福袋:精灵粒子(decoration 级)

```
引擎侧:新 decoration kind "particles"
  { kind: "particles"; shape: "ribbon" | "coin" | "rect";
    items: Array<{ x, y, rotationDeg, scale, opacity, colorIndex }> }
  由新 effect kind "burst" 生成:
  { kind: "burst";
    shape: "ribbon" | "coin" | "rect";
    count: number;                  // particleTotalNum
    speed: TextAnimationDistance;   // 初速
    spreadDeg: number;              // 喷射扇角(福袋≈360,彩带≈80 向上)
    gravity: TextAnimationDistance;
    lifeRandom: number;             // pLifeRandom
    sizeEm: number; sizeRandom: number;
    palette: string[];              // 彩带调色板
    flutter: number;                // 彩带正弦摆动强度
    seed: number }
  每粒子闭式:p = p0 + v(seed)·t + ½g·t²;寿命窗口 = [birth(seed), birth+life(seed)];
  opacity/size over life 按 pOpacityOverLife/pSizeOverLife 曲线(先用
  smoothstep 进出,采集后标定)。

渲染侧:
  ribbon → 细长圆角 rect + flutter 旋转;coin → 双圆(外金内亮)程序化;
  rect → 通用碎屑。canvas 与 DOM 预览各加一个分支(照 heart 抄)。
```

## 3. 分期与验收

### P0 引擎 shatter + tile 渲染(碎落主体)
- [ ] model/normalize/effect-state:`shatter` kind + 透传 state
- [ ] canvas renderer tile 位移 pass(offscreen + drawImage 循环)
- [ ] DOM 预览降级方案:预设卡缩略图用 canvas 渲染帧(卡片已有 canvas 能力)或
      静态 mask 近似——决策留到实现时,验收只要求缩略图非黑卡
- 验收:逐帧断言 ①release 前沿单调推进 ②同帧重复求值逐位相等 ③release=0 时
  tile 全部原位(与无效果渲染像素级一致)

### P1 剪映数值标定(碎落)
- [ ] 播放定格采帧(碎落已应用在演示项目,协议照旧:元素尾 + ← 步进)
- [ ] 标定:gravity 强度、distorIns、noiseFeather、alpha 衰减目测拟合
- 验收:三相位(25%/50%/75%)对比图,溶解前沿位置与残留量目测同级

### P2 burst 精灵粒子 + 彩带/福袋采集
- [ ] 剪映下载彩带喷射(入场)、福袋炸开(循环),mtime 收包:prefab 参数 +
      贴图存档到本目录 `assets/`
- [ ] `burst` effect + `particles` decoration + ribbon/coin 渲染
- [ ] 两个预设接线(catalog/effects/i18n/intensity/envelope,previewKind 各一)
- 验收:确定性断言(同 seed 同帧位置相等、不同 rank 相异)+ 对比图

### P3 预设收口
- [ ] 粒子碎落(exit)、粒子汇聚(entrance,时间反演,如剪映有对应卡)、
      彩带喷射(entrance)、福袋炸开(loop)
- [ ] 出场页 easing 全部确认 linear(踩过的坑:NATURAL_EASE 会双重弯曲驱动曲线)
- 验收:真机三页缩略图姿态帧可辨;`bun run test` 全绿;对比图交付

### P4 收尾
- [ ] jianying-reference 技能回填新经验(如有新增)
- [ ] PR + CI + 对比图入 PR 正文

## 4. 文件触点清单(预估)

```
packages/editor-core/src/text-animation/model.ts            # shatter/burst 类型
packages/editor-core/src/text-animation/normalize-effect.ts
packages/editor-core/src/text-animation/effect-state.ts     # burst 粒子生成
packages/editor-core/src/text-animation/evaluate.ts         # shatter state 透传(如需)
packages/editor-core/src/__tests__/…                        # 逐帧断言
apps/web/src/lib/text/text-animation-canvas-renderer.ts     # tile pass + 图元
apps/web/src/lib/text/text-animation-canvas-decorations.ts  # ribbon/coin 绘制
apps/web/src/components/editor/properties-panel/text-animation-preset-card.tsx  # 预览分支
apps/web/src/lib/text/text-animation-presets/{catalog-*,effects,intensity,types,snapshots}.ts
apps/web/src/lib/text/text-animation-preview-envelope.ts    # 包络(粒子飞散半径)
apps/web/src/lib/i18n/translations.ts
```

## 5. 已知风险与对策

| 风险 | 对策 |
|---|---|
| tile 循环预览性能(长文本大字号)| tilePx 随字号自适应;上限 tile 数护栏(类比 MAX_DECORATIONS)|
| DOM 预设卡无法表达 tile 位移 | 卡片走 canvas 帧或静态近似;真预览面板本来就是 canvas |
| 彩带/福袋包可能全加密 | prefab strings + 帧标定兜底(碎落已证明此路可行)|
| DeepGlow 发光缺失 | blurPx + 亮色描边近似;明确标注为已知差异 |
| 出场 easing 双重弯曲 | 新预设一律显式 linear(P3 验收项)|

## 6. 采集协议速查(引用 jianying-reference 技能)

- 循环动画:播放→暂停定格采帧(暂停步进不求值)
- 入场/出场:元素尾 `↓` + `←` 步进逐帧有效
- 收包:`touch .marker` → UI 应用一个 → `find -newer .marker`;
  已缓存效果零磁盘痕迹,只有新鲜下载可收
- 加密包:先看 `res/` 节点名(暴露效果图),再翻 `shaderLib/shaderMetal|GLES`
  明文编译产物,再 strings prefab 拿参数 schema
- 被遮挡的 Electron 窗口停止渲染:窗口截图前确保其在可见屏
