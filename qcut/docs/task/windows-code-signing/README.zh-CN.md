# Windows 代码签名 — 任务目录

为 QCut Windows 安装包做 Authenticode 签名的方案。路径于 2026-04-25
确定（排除掉其他选项之后）。

**决议：** Certum SimplySign Standard Code Signing（Organization 席位，
约 USD 200/年），以 Quriosity Pty Ltd 名义购买。完整淘汰理由见
[CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md)。

姊妹任务：[`docs/task/macos-code-signing/`](../macos-code-signing/)。

## 本目录文件说明

| 文件 | 内容 |
|------|------|
| [PLAN.zh-CN.md](PLAN.zh-CN.md) | 总体方案、子任务拆分、验收标准、风险。**先看这个。** |
| [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md) | 为什么选 Certum；为什么 Azure / SignPath / EV / Sectigo OV 都被排除。供应商对比 + 2026 行业现状。 |
| [IMPLEMENTATION.zh-CN.md](IMPLEMENTATION.zh-CN.md) | 每个子任务的实现细节（含文件路径和 diff）。说明 Certum SimplySign 必须手动签名这一权衡。 |
| [TESTING.zh-CN.md](TESTING.zh-CN.md) | 单元测试、工作流测试、人工 VM 验证。 |
| [DOCUMENTATION.zh-CN.md](DOCUMENTATION.zh-CN.md) | 维护者文档，需随代码一起更新。 |

英文原版位于同目录的 `README.md` / `PLAN.md` / 等等。

## 进度

- [x] 方案已草拟（2026-04-25 修订 — 排除 Azure/SignPath/EV，定为 Certum）
- [ ] 子任务 1：在 Certum 下单 SimplySign Standard Code Signing（Organization，1 年）
- [ ] 子任务 2：提交身份验证材料（Quriosity + D-U-N-S 893394655）
- [ ] 子任务 3：在 Donghao 的电脑上装 SimplySign 手机 App + 桌面签名工具
- [ ] 子任务 4：改 `electron-builder` Windows 配置（去掉禁用签名的 flag）
- [ ] 子任务 5：改 GitHub Actions 发布工作流（CI 出未签名包，本地签后再发布）
- [ ] 子任务 6：加本地签名辅助脚本
- [ ] 子任务 7：加签名后的签名校验脚本
- [ ] 子任务 8：在 Windows 下载页加 SmartScreen 现实情况说明
- [ ] 子任务 9：维护者文档
- [ ] 子任务 10：测试
- [ ] 子任务 11：在干净 Windows VM 上做发布演练

## 背景（这份方案为什么改写）

本目录的早期版本走过三条失败路径，才落到 Certum：

1. **SignPath Foundation（免费，仅开源）** — 被排除，因为 QCut 之后可能闭源。
2. **Azure Trusted Signing（$120/年）** — 被排除，因为澳洲不在微软资格名单里，加上 Quriosity 不够 3 年。
3. **SSL.com EV（$400+/年）** — 被排除，因为微软在 2024 年取消了 EV 的"立即 SmartScreen 信誉"特权。EV 不再值这个溢价。

来源见 [CERTIFICATE-OPTIONS.zh-CN.md](CERTIFICATE-OPTIONS.zh-CN.md)。
