# 剪映真机平价 harness(L1)

导入侧每放宽一项指纹,都要「对真剪映验证后开闸」——这条流水线就是回执生产器。
任务背景与排期见 [docs/task/jianying-draft-interop/TASKS.md](../../docs/task/jianying-draft-interop/TASKS.md)。

**这是剪映专业版(JianyingPro / VideoFusion-macOS.app)的验证线,不是 CapCut 的**——
CapCut 8.1 有独立的 `scripts/capcut-e2e/`;本目录只复用其中与应用无关的通用件
(bundled ffmpeg 解析、进程运行)。

## 流程

```bash
# 1. 生成单变量草稿对(on = 只改被测特性,off = 全默认),可选注册进剪映草稿目录
bun scripts/jianying-parity/build-case.ts --case transform-rotation --register

# 2. 副屏的剪映里打开 QCUT-PARITY-* 草稿,不做修改直接导出(勿动主屏)
#    -> cases/<case>/jianying-on.mp4 / jianying-off.mp4

# 3. QCut 侧导入同一份 draft_content.json 并导出
#    -> cases/<case>/qcut-on.mp4 / qcut-off.mp4(off 可选,作基线)

# 4. 比对并落回执
bun scripts/jianying-parity/compare.ts --case transform-rotation
```

## 判定(隔离纪律)

「画面变了」不算证据(特效参照线的 SSIM 教训):

1. **isolationRenders**:剪映 on-vs-off 必须可见地不同——特性真的渲染了;
2. **parityWithinThreshold**:QCut-on vs 剪映-on 的平均 RMSE ≤ 阈值;
3. **parityBeatsCross**:QCut-on 离剪映-on 必须显著近于离剪映-off(≤ 一半);
4. **baselineWithinThreshold**(有 qcut-off 时):无特性基线本身就要对齐。

全过 → `receipt.json`(verdict: pass),作为 capability 开闸的 `verificationEvidence`。

## 用例

`draft-case.ts` 的 `PARITY_CASES`:transform-rotation / transform-scale /
transform-alpha / transform-position / speed-scalar。加新用例 = 加一个单变量
mutator;自检测试(`scripts/__tests__/jianying-parity-draft-case.test.ts`)会
强制 off 双胞胎过 beta4 归一化为 exact、on 变体被指纹降级。

## 已知边界

- 本机剪映为 **11.3.0-beta5**,草稿已加密(draft_info.json + crypto_key_store);
  我们生成的是 beta4 明文草稿,依赖 beta5 的迁移能力打开。若无法打开,退路是
  在剪映 UI 里手工作出同参数草稿导出(证据等级降一档,回执中注明)。
- 所有产物(草稿、导出、回执)都留在 `.local/jianying-parity/`(gitignored),
  与特效参照同纪律:**绝不进 Git、绝不公开分发**。
- 副屏操作纪律:任何剪映 UI 操作只在副屏进行,不抢主屏焦点。
