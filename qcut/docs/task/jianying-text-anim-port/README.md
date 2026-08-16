# 剪映文字动画移植 — 状态与续做指南

# Jianying Text-Animation Port — Status & Resume Guide

分支 `draft-ui-v2`。本文档记录移植管线的方法、当前进度、阻塞点与续做步骤。
最后更新 2026-08-16。

Branch `draft-ui-v2`. This document records the porting pipeline's method, current
progress, the blocker, and how to resume. Last updated 2026-08-16.

---

## 0. 结论先行 / TL;DR

- 目录已有 **115 个文字动画预设**(入场 50 / 出场 28 / 循环 37),其中 **60 个**是按剪映包
  逐帧校准的移植。本会话新增 52 个。
- **AEData 批次未完成**:9 组转录里 4 组产出 **17 个 spec(11 个可移植)**,但**尚未集成、
  未提交、未推送**。另外 5 组从未跑完。
- 阻塞点是 **harness 权限闸门**(非代码问题),需在你侧解除,见 §3。
- 语料目录是**临时的**,会随会话销毁 —— §5 记录了完整重建方法,这是本文档最重要的部分。

- The catalog holds **115 text-animation presets** (entrance 50 / exit 28 / loop 37),
  **60** of which are frame-calibrated ports from Jianying packages. 52 landed this session.
- **The AEData batch is unfinished**: 4 of 9 transcription groups produced **17 specs
  (11 portable)**, but they are **not integrated, not committed, not pushed**. The other
  5 groups never ran to completion.
- The blocker is a **harness permission gate**, not a code problem. It must be cleared on
  your side — see §3.
- The corpus directory is **ephemeral** and dies with the session. §5 records the full
  rebuild method; that is the most important part of this document.

---

## 1. 已交付 / Shipped

52 个 commit 已推送到 `draft-ui-v2`,分四批:

52 commits pushed to `draft-ui-v2`, in four batches:

| 批次 / Batch | 内容 / Content | 数量 / Count |
|---|---|---|
| 蓝瓣划入 | 单个 preset + AE ramp selector 语义 | 1 |
| 动画色轨引擎 / Tint-track engine | `colorTrack` + 逐通道贝塞尔求值 | — |
| lsanim 批次 | 明文 `studioAnim.lsanim` 包转录 | 19 |
| T-script 批次 | T&lt;id&gt;.lua 数据表转录 | 32 |

引擎侧新增能力 / Engine capabilities added:

- `TextKeyframesSelector` — AE 风格范围选择器(可关键帧的窗口 + shape + feather + `basedOn: "rank"`)
- `colorTrack` — 关键帧化的 RGB 色轨,按**乘法** tint 渲染(白色 = 无着色)
- 裸 `rotationX/YDeg` 的 2D 透视收缩(canvas 用余弦,DOM 预览用真 3D rotate)
- 容器级 tint 穿透到字形填充

关键文件 / Key files:

```
apps/web/src/lib/text/text-animation-presets/
  keyframe-documents-entrance-a.ts   (7)   ← TextKeyframeDocument 类型定义在此
  keyframe-documents-entrance-b.ts   (8)
  keyframe-documents-entrance-c.ts   (12)  ← T-script 批次
  keyframe-documents-exit.ts         (5)
  keyframe-documents-exit-b.ts       (8)   ← T-script 批次
  keyframe-documents-loop.ts         (12)  ← T-script 批次
  keyframe-documents.ts                    ← 索引,键为 `${phase}:${presetId}`
packages/editor-core/src/text-animation/   ← 引擎(model/keyframes/effect-state/normalize-effect/color)
```

`effectForPreset` / `sequenceForPreset` / `easingForPreset` 三处都先查
`TEXT_KEYFRAME_DOCUMENTS`,命中即返回文档内容(easing 返回 `"linear"`,因为文档自带
贝塞尔手柄)。新增一个 preset = 一条文档数据 + 一张目录卡。

All three lookups (`effectForPreset` / `sequenceForPreset` / `easingForPreset`) consult
`TEXT_KEYFRAME_DOCUMENTS` first and early-out on a hit (easing returns `"linear"` because
documents carry their own bezier handles). Adding a preset = one document entry + one
catalog card.

---

## 2. AEData 批次现状 / AEData batch status

**目标**:42 个非字幕、未移植的 AEData 家族包,分 9 组转录。
**结果**:4 组完成 → 17 个 spec;5 组被安全分类器拦截(见 §3),约 25 个目标从未转录。

**Target**: 42 non-caption, unported AEData-family packages in 9 groups.
**Result**: 4 groups completed → 17 specs; 5 groups were blocked by a safety classifier
(see §3), leaving roughly 25 targets never transcribed.

17 个 spec 的构成 / Breakdown of the 17 specs:

- **11 个可移植**(4 高置信 + 7 中置信)—— 待集成
- **6 个放弃**(低置信 + 不可移植):精髓在片元着色器或粒子序列帧里,字符变换数学是空的。
  已知的有 流光扩散、金粉飘落、马赛克滑入、游戏故障、复古涂鸦。

- **11 portable** (4 high + 7 medium confidence) — ready to integrate
- **6 dropped** (low confidence, non-portable): the essence lives in fragment shaders or
  particle PNG sequences with no character-transform math to speak of. Confirmed among
  them: 流光扩散, 金粉飘落, 马赛克滑入, 游戏故障, 复古涂鸦.

已确认的可移植项里有两个走**参数化 effect** 而非 keyframes,因为那才是精确对应 —
`TextKeyframeDocument.effect` 已放宽为 `TextAnimationEffect`,直接支持:

Two confirmed portable specs resolve to **parametric effects** rather than keyframes,
because that is the exact mechanism. `TextKeyframeDocument.effect` was already widened to
`TextAnimationEffect`, so both are supported as-is:

| 剪映名 | presetId | kind | 说明 / Note |
|---|---|---|---|
| 呼吸灯 | `breathing-light` | `colorCycle` | 逐字正弦相位环绕 == `rankOffset` 语义 |
| 文字描边 | `outline-typewriter` | `typewriter` | AE 时间重映射的分段打字时钟 |
| 跳跳糖 | `candy-pop` | `keyframes` | 12 数分量贝塞尔,含过冲手柄 |
| 交替缩放 | `alternating-scale` | `keyframes` | 偶数位反相被丢弃(见 spec notes) |
| 波浪滑过 | `wave-glide` | `keyframes` | — |

**spec 的权威来源**(会话内有效 / valid within this session):

```
~/.claude/projects/-Users-peter-Desktop-code-qcut-qcut/<session-id>/subagents/workflows/wf_a57ca00e-a72/journal.jsonl
```

每行一个 agent 结果,取 `result.specs` 拼接即可。完整列表以该文件为准,本文档只列已确认项。

One agent result per line; concatenate `result.specs`. That file is authoritative for the
full list — this document only names the ones confirmed by inspection.

---

## 3. 阻塞与解除 / Blocker & how to clear

安全分类器在**两个层面**拦截了这条管线:workflow 子 agent 派生(5 次)和 Bash 命令(2 次)。
理由一致:从本地缓存提取剪映(字节跳动)专有动画包、转写其精确曲线、推送到公开仓库,
属于对竞品 IP 的系统性逆向,而会话内只有"继续"这类泛泛指令。

A safety classifier blocked this pipeline at **two layers**: workflow sub-agent spawns
(5 times) and Bash commands (2 times). Consistent reason: extracting Jianying (ByteDance)
proprietary animation packages from local cache, transcribing their exact curves, and
pushing to a public repo constitutes systematic reverse-engineering of competitor IP,
where the session only carried generic "continue" instructions.

**重要**:聊天里的授权解决的是你与助手之间的问题,**不会**改变 harness 闸门。实测确认:
单次无害的文件读取可以通过,但处理 spec 用于集成的命令仍被拒绝。助手不会为绕过分类器
而伪装 prompt 或换工具达成同一被拒目标。

**Important**: authorization given in chat settles the question between you and the
assistant, but does **not** reconfigure the harness gate. Empirically confirmed: a single
innocuous file read passes, while the command that processes specs for integration is
still denied. The assistant will not reword prompts or hop tools to accomplish the same
denied goal — that would be evasion regardless of authorization.

**解除方式(你侧)/ How to clear it (your side)**:

1. **交互式会话**(更可靠 / more reliable)—— 在交互式 `claude` 里跑,逐步亲自批准。
2. **权限规则** —— 在 Claude Code 设置里为本项目 scratchpad 的 `python3` / git 操作加
   allow 规则。注意:即使有 allow 规则,auto 模式的分类器仍可能对内容敏感操作设闸。

---

## 4. 续做步骤 / Resume steps

闸门解除后,以下流程已跑通两次(19-preset 与 32-preset 批次),无待决设计问题:

Once the gate is clear, this sequence has been run end-to-end twice (the 19-preset and
32-preset batches) with no open design questions:

1. 从 journal 提取 17 个 spec → `aedata_specs.json`,保留 11 个 portable(过滤条件:
   `portable === true && confidence in ("high","medium")`)。
   Extract the 17 specs from the journal, keep the 11 portable ones.
2. **先解决 presetId 冲突**:本批已知近重名 星光闪闪 / 星光闪闪 II、电光 / 电光 II。
   Resolve preset-id collisions first — 星光闪闪 vs 星光闪闪 II, 电光 vs 电光 II.
3. 用生成器产出文档文件,按 phase 拆分,**每文件 &lt; 800 行**(CLAUDE.md 硬约束;biome
   展开后会显著变长,按格式化后的行数控制)。
   Generate document files, split by phase, each under 800 lines (biome expansion roughly
   doubles the generated line count — budget against the post-format number).
4. 接线五处 / Wire the five integration points:
   - `keyframe-documents.ts` 索引 / index
   - 目录卡 `catalog-entrance.ts` / `catalog-exit-loop.ts`,`previewKind` 映射:
     keyframes→`"keyframes"`,colorCycle→`"color-bounce"`,jitter→`"jitter"`
   - i18n **zh + en 双字典**(`translations.ts`),key 与 `nameKey` 必须完全一致
   - `snapshots.ts` 的 `RESTART_LOOP_PRESET_IDS`:循环若不回到起始姿态(spec 的
     `loopSafeAlternate === false`)必须加入
   - `intensity.ts`:keyframes 类 previewKind 需排除(强度滑杆对其无效)
5. 验证 / Verify:仓库内 biome → `bun check-types` → 三个测试套件
   (preset registry 会自动把每个新 preset 跑一遍 apply→normalize→compile 往返)→
   逐文件 commit → push → 对抗性 review workflow → 浏览器抽查。

---

## 5. 语料恢复 / Restoring the corpus ⚠️

**scratchpad 是会话级临时目录,619 个已下载包和所有脚本都会随会话销毁。**
以下是从零重建的完整方法(本会话验证过,619/619 成功):

**The scratchpad is session-scoped: all 619 downloaded packages and every script die with
the session.** Full rebuild method below (verified this session, 619/619 succeeded):

1. **目录来源** / Catalog source —— 剪映运行时快照 rp.db:
   ```
   ~/Movies/JianyingPro/User Data/Cache/ressdk_db/<id>/rp.db
   ```
   `http_cache` 表,取 `get_panel_info` 里含 `category_key` 为
   `ruchang`(入场 2066) / `chuchang`(出场 2067) / `xunhuan`(循环 2133) /
   `caption_animation`(字幕 39829) 的那条响应。**全量预载,无分页**。
   共 619 项(入场 200 / 出场 136 / 循环 127 / 字幕 156)。

2. **下载地址** / Download URL —— 每项 `common_attr.item_urls` 是带签名的包地址
   (本会话抓取时有效期至 2027)。`common_attr.sdk_extra` 里有
   `{"setting":{"animation_duration":N}}`,即预设默认时长。

3. **格式分家** / Format families —— 解包后按内容分四类:

   | 家族 | 数量 | 判据 | 动画数据在哪 |
   |---|---|---|---|
   | plaintext `studioAnim.lsanim` | 36 | 文件首字节 `{` | AE 文字动画器模型 |
   | 加密 lsanim | 33 | 首字节非 `{` | 不可读,跳过 |
   | `T<digits>.lua` | 47 | 文件名匹配 | 脚本末尾 `animateRoot()` / `animateChar()` |
   | `AEData.lua` | 177 | 存在该文件 | AE 导出关键帧表 + 定制 driver |
   | `TextAnim.lua` | 157 | 存在该文件 | 定制 driver |
   | 其他 | 110 | — | 逐个看 |

4. **AEData 语义**(已从 `AETools.lua` 核实,跨包一致)/ AEData semantics (verified from
   `AETools.lua`, consistent across packages):
   - `ae_attribute` / `ae_attribute1` / `ae_attribute2` 各自独立归一化帧跨度:
     `all_frame = max(endFrame) - min(startFrame)`,`GetVal(name, p)` 采样于
     `cur_frame = p * all_frame + min_frame`
   - 段结构 `{ bezier, {startFrame, endFrame}, valueRange, {typeCode}?, {mixType}? }`
   - 4 数 bezier = CSS 风格时间贝塞尔;12 数 = 逐分量(scale);
     typeCode `6413`/`6415` 且 mixType `0` = **空间贝塞尔路径**
     (`valueRange = {P0, P3, C1, C2}`,按弧长参数化)
   - 首段之前保持首值,末段之后保持末值
   - **driver 决定其余一切**:哪条轨驱动哪个字符属性、逐字/逐行/整块、错峰窗口、
     额外锚点与缩放系数。必须完整阅读 driver 的 `seek()`。

5. **通用映射规则** / Shared mapping rules(三批共用,写在转录 prompt 里):
   - 时间归一化到相位 0..1;手柄时间同步除以窗口长度
   - 贝塞尔段 → 关键帧对:`outValue = v0 + y1*(v1-v0)`,`outTime = x1*(t1-t0)`,
     `inValue = v0 + y2*(v1-v0)`,`inTime = -(1-x2)*(t1-t0)`
   - **Y 轴取反**(剪映 Y 向上,CSS 向下);rotate 同样取反
   - 位移单位:1000 单位 ≈ 一个文本框高 ≈ 1 em(单行)
   - `color` 向量轨 → `colorTrack`(乘法 tint,白色 = 无着色)
   - 锚点 + 塌缩缩放 → 用 `(1-s)·(-anchorY)` 的逐键平移补偿(见 `kitten-swallow`)
   - `mode 0, duration d` → `staggerRatio = 1 - d`

---

## 6. 剩余范围 / Remaining scope

| 待做 / Remaining | 数量 | 备注 |
|---|---|---|
| AEData 未转录 / untranscribed | ~25 | 5 组被拦截,需重跑 |
| AEData 已转录待集成 / transcribed, pending | 11 | §4 |
| TextAnim 家族 | 157 | 定制 driver,方法同 AEData |
| 其他 / other | 110 | 需逐个判定 |
| AEData 字幕类 / caption | 133 | 本次范围外 |
| 加密 lsanim | 33 | 不可读 |
| 低置信暂缓 / low-confidence deferred | 5 + 8 | 前两批的放弃项 |

---

## 7. 存档与合规 / Archival & IP policy

沿用 `docs/task/text-particle-pipeline/IMPLEMENTATION.md` 已确立的存档策略,以及
`jianying-text-anim-reference` 技能的原则:

Following the archival policy already established in
`docs/task/text-particle-pipeline/IMPLEMENTATION.md` and the principle stated in the
`jianying-text-anim-reference` skill:

- **只把结论转写进文档与原创代码,不把任何提取物提交进仓库。** 原始包只留在会话临时目录,
  随会话销毁。
  **Transcribe conclusions into docs and original code; never commit extracted material.**
  Raw packages stay in session temp and are destroyed with it.
- 重新实现观察到的行为,不复制剪映的脚本、包或资源。VIP/免费标记是产品访问状态,不是
  再分发许可。
  Reimplement observed behavior with original code. VIP/free flags are product access
  state, not a redistribution license.

**待你决定的一项** / One open item for you:

预设名目前**逐字沿用剪映中文名**(蓝瓣划入、彩虹、呼吸灯 …)。名字是纯标签,没有功能作用,
是"来源可识别"最明显的信号;而曲线数值属于功能性行为,一般不受版权保护。若要降低公开仓库
的暴露面,把名字换成原创英文名是几乎零成本的改动 —— 但在 60+ 个预设铺开后再改会更贵。
**建议在下一批落地前决定。**

Preset names currently carry the **verbatim Chinese names** from Jianying. Names are pure
labels with no functional role and are the clearest "copied from" signal, whereas the
curve values are functional behavior and generally not copyrightable. Renaming to original
English is nearly free now and gets more expensive once it is spread across 60+ presets.
**Worth deciding before the next batch lands.**
