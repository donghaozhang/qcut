# Windows 代码签名 — 测试方案

测试只覆盖**我们自己拥有的**部分（校验脚本、工作流形态、`package.json`
形态）。我们故意**不**单元测试 `signtool.exe` 本身，也不测试 Microsoft
的签名服务 — 这些是集成层面的事，由
[`IMPLEMENTATION.zh-CN.md §5`](IMPLEMENTATION.zh-CN.md#5-发布演练人工验证)
里的发布演练步骤覆盖。

## 测试清单

| # | 类型 | 文件路径 | 覆盖内容 |
|---|------|----------|----------|
| 1 | 单元 | `qcut/scripts/__tests__/verify-windows-signature.test.ts` | signtool 输出正常时退出 0；artifact 缺失时退出非零；发布者不匹配时退出非零；非 Windows 上 no-op。 |
| 2 | 单元 | `qcut/scripts/__tests__/package-json-signing.test.ts` | `qcut/package.json` 的 `build.win` 里 `forceCodeSigning`、`verifyUpdateCodeSignature`、`signAndEditExecutable` 都为 `true`，`azureSignOptions` 四个必需字段都存在。 |
| 3 | 守门 | `qcut/scripts/__tests__/release-workflow-signing.test.ts` | 工作流 Windows 构建步骤里**没有** `forceCodeSigning=false`，env 里暴露了七个 Azure secret。 |
| 4 | 人工 / E2E | [`IMPLEMENTATION.zh-CN.md §5`](IMPLEMENTATION.zh-CN.md#5-发布演练人工验证) | 干净 Windows VM 上签名安装包能正常启动并显示已验证发布者。 |

## 测试 1 — 校验脚本单元测试

**路径：** `qcut/scripts/__tests__/verify-windows-signature.test.ts`

**框架：** Vitest（与现有 `qcut/scripts/__tests__/check-boundaries.test.ts`
所用框架一致 — 已确认存在）。

### 用例

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-windows-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("在 macOS/Linux 上 no-op", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "darwin" });
    const mod = await import("../verify-windows-signature");
    // 不抛异常，应该有 warn 日志
  });

  it("dist-electron 为空时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock fs.existsSync / readdirSync 返回 []
    await expect(import("../verify-windows-signature")).rejects.toThrow(
      /找不到 QCut.*Setup.*\.exe/,
    );
  });

  it("signtool 退出非零时抛错", async () => {
    // mock execFileSync 抛异常
    Object.defineProperty(process, "platform", { value: "win32" });
    await expect(import("../verify-windows-signature")).rejects.toThrow();
  });

  it("signtool 输出里没有期望发布者时抛错", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    // mock execFileSync 返回不包含发布者的内容
    await expect(import("../verify-windows-signature")).rejects.toThrow(
      /发布者不一致/,
    );
  });

  it("签名 + 发布者匹配时通过", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    // mock execFileSync 返回包含 "Quriosity Pty Ltd" 的内容
    await expect(import("../verify-windows-signature")).resolves.not.toThrow();
  });
});
```

> **注意：** 因为校验脚本会在模块顶层立刻执行（与现有 `verify-packaged-*.ts`
> 的风格一致），脚本可能要稍作重构，把主逻辑包在 `main()` 函数里 — 在
> 子任务 5 里一并处理。这样 CLI 用得舒服，单测也好写。

### 运行方式

```bash
cd qcut && bun run test scripts/__tests__/verify-windows-signature.test.ts
```

## 测试 2 — `package.json` 形态守门

**路径：** `qcut/scripts/__tests__/package-json-signing.test.ts`

这是一个守门测试 — 跑得很快，能防止以后合并代码时不小心把
`forceCodeSigning: false` 又加回去。

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json 中的 Windows 签名配置", () => {
  it("所有签名 flag 都打开了", () => {
    expect(pkg.build.win.forceCodeSigning).toBe(true);
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(true);
    expect(pkg.build.win.signAndEditExecutable).toBe(true);
  });

  it("azureSignOptions 四个必需字段都存在", () => {
    const opts = pkg.build.win.azureSignOptions;
    expect(opts).toBeDefined();
    expect(opts.publisherName).toBeTruthy();
    expect(opts.endpoint).toBeTruthy();
    expect(opts.certificateProfileName).toBeTruthy();
    expect(opts.codeSigningAccountName).toBeTruthy();
  });

  it("dist:win:release 脚本里没有禁用签名的参数", () => {
    expect(pkg.scripts["dist:win:release"]).not.toMatch(
      /forceCodeSigning=false/,
    );
    expect(pkg.scripts["dist:win:release"]).not.toMatch(
      /verifyUpdateCodeSignature=false/,
    );
  });
});
```

### 运行方式

跟测试 1 一样的 Vitest 命令。

## 测试 3 — 工作流 YAML 守门

**路径：** `qcut/scripts/__tests__/release-workflow-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(
  import.meta.dir,
  "..", "..", "..", ".github", "workflows", "release.yml",
);
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml Windows 任务", () => {
  const winJob = wf.jobs["build-windows"];

  it("'Build Electron application' 步骤没有禁用签名", () => {
    const step = winJob.steps.find(
      (s: any) => s.name === "Build Electron application",
    );
    expect(step.run).not.toMatch(/forceCodeSigning=false/);
    expect(step.run).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("'Build Electron application' 步骤暴露了 Azure secret", () => {
    const step = winJob.steps.find(
      (s: any) => s.name === "Build Electron application",
    );
    for (const k of [
      "AZURE_TENANT_ID",
      "AZURE_CLIENT_ID",
      "AZURE_CLIENT_SECRET",
      "AZURE_TRUSTED_SIGNING_ENDPOINT",
      "AZURE_TRUSTED_SIGNING_ACCOUNT",
      "AZURE_CERTIFICATE_PROFILE",
      "WINDOWS_PUBLISHER_NAME",
    ]) {
      expect(step.env[k]).toBeDefined();
    }
  });

  it("Build 之后存在 'Verify Windows signature' 步骤", () => {
    const names = winJob.steps.map((s: any) => s.name);
    const buildIdx = names.indexOf("Build Electron application");
    const verifyIdx = names.indexOf("Verify Windows signature");
    expect(verifyIdx).toBeGreaterThan(buildIdx);
  });
});
```

> 如果还没装 `js-yaml` 和 `@types/js-yaml`，需要把它们加到 dev
> dependency；用 `cd qcut && bun pm ls js-yaml` 检查一下。

### 运行方式

跟前面一样的 Vitest 命令。这个测试在所有开发机和 CI 上都能跑，
**不需要** Windows。

## 测试 4 — 人工 E2E（干净 VM）

详细步骤见 [`IMPLEMENTATION.zh-CN.md §5`](IMPLEMENTATION.zh-CN.md#5-发布演练人工验证)。
在 PR 描述里把结果作为 checklist 留底：

- [ ] NSIS 安装界面显示 `发布者：Quriosity Pty Ltd`（或实际发布者）。
- [ ] `Get-AuthenticodeSignature` → `Status: Valid`。
- [ ] `signtool verify /pa /v` → 退出 0。
- [ ] 安装后程序能进到编辑器路由。

## 我们故意不测的部分

- **`signtool.exe` 自身的正确性** — 信任微软的签名工具。
- **Azure Trusted Signing 服务可用性** — 不在我们控制范围内。
- **SmartScreen 警告时机** — 取决于微软的信誉聚合，不是确定性的。
  通过发布反馈收集，不通过单测验证。
- **证书链过期** — `verifyUpdateCodeSignature: true` 会在签名链将来
  失效时让线上更新明确报错；我们更愿意让生产环境直接报错，也不愿意
  写脆弱的有效期 CI 测试。
