# macOS 代码签名 — 任务目录

为 QCut 的 macOS 发布产物（`.dmg` / `.zip` / 内层 `.app`）做 Apple
Developer ID 签名 + Apple 公证服务（notarization）。

**决策背景：** QCut 之后可能闭源，所以买商用 Apple Developer Program
会员，而不是走开源免费路线。这样无论 QCut 开源或闭源，Mac 签名方案
都不变。

姊妹任务：[`docs/task/windows-code-signing/`](../windows-code-signing/)。

## 本目录文件说明

| 文件 | 内容 |
|------|------|
| [PLAN.zh-CN.md](PLAN.zh-CN.md) | 总体方案、子任务拆分、验收标准、风险。**先看这个。** |
| [PROCUREMENT.zh-CN.md](PROCUREMENT.zh-CN.md) | Apple Developer Program 注册流程 — D-U-N-S Number、证书生成、App-Specific Password、Team ID。**用户手工操作。** |
| [IMPLEMENTATION.zh-CN.md](IMPLEMENTATION.zh-CN.md) | 每个子任务的实现细节，含文件路径和 diff。 |
| [TESTING.zh-CN.md](TESTING.zh-CN.md) | 单元测试、工作流测试、人工 VM 验证。 |
| [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) | 维护者文档，需随代码一起更新。 |

英文原版位于同目录的 `README.md` / `PLAN.md` / 等等。

## 进度

- [x] 方案已草拟
- [ ] 子任务 1：查找 / 申请 Quriosity 的 D-U-N-S Number
- [ ] 子任务 2：注册 Apple Developer Program（组织席位，$99/年）
- [ ] 子任务 3：生成 Developer ID Application 证书，导出 .p12
- [ ] 子任务 4：生成 App-Specific Password，记下 Team ID
- [ ] 子任务 5：改 `electron-builder` mac 配置（`identity` + `notarize`）
- [ ] 子任务 6：改 GitHub Actions 发布工作流（mac job env 块）
- [ ] 子任务 7：加构建后签名 + 公证校验脚本
- [ ] 子任务 8：维护者文档
- [ ] 子任务 9：测试
- [ ] 子任务 10：在干净 macOS VM 上做发布演练
