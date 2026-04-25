# Windows 代码签名 — 任务目录

针对 [issue #289](https://github.com/Quriosity-agent/qcut/issues/289) 的方案：
为 QCut 的 Windows 安装包加 Authenticode 签名，让 SmartScreen 不再显示
"发布者：未知发布者"。

## 本目录文件说明

| 文件 | 内容 |
|------|------|
| [PLAN.zh-CN.md](PLAN.zh-CN.md) | 总体方案、子任务拆分、验收标准、风险。**先看这个。** |
| [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md) | "License" 决策 — 各家证书供应商对比 + Azure Trusted Signing 采购流程。 |
| [IMPLEMENTATION.zh-CN.md](IMPLEMENTATION.zh-CN.md) | 每个子任务的具体实现，含确切文件路径和 diff。 |
| [TESTING.zh-CN.md](TESTING.zh-CN.md) | 单元测试 + 工作流测试 + 人工 E2E，含目标测试文件路径。 |
| [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) | 维护者文档，需随代码一起更新。 |

英文原版位于同目录的 `README.md` / `PLAN.md` / 等等。

## 进度

- [x] 方案已草拟
- [ ] 子任务 1：购买证书（人工，Azure 控制台操作）
- [ ] 子任务 2：`electron-builder` Windows 配置
- [ ] 子任务 3：`dist:win*` npm 脚本
- [ ] 子任务 4：GitHub Actions 工作流
- [ ] 子任务 5：构建后签名校验脚本
- [ ] 子任务 6：维护者文档
- [ ] 子任务 7：测试
- [ ] 子任务 8：在干净 Windows 虚拟机上做发布演练
