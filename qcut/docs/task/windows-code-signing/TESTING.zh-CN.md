# Windows 代码签名 — 测试方案

测试只覆盖**我们自己拥有的**部分 — 校验脚本、本地签名脚本、
`package.json` 形态、`release.yml` 形态。

我们故意**不**单元测试 `signtool.exe`、Certum SimplySign 服务、或
微软 SmartScreen — 这些是集成层面的事，由
[`IMPLEMENTATION.zh-CN.md §6`](IMPLEMENTATION.zh-CN.md#6-在干净-windows-vm-上做发布演练)
里的发布演练覆盖。

## 测试清单

| # | 类型 | 文件路径 | 覆盖内容 |
|---|------|----------|----------|
| 1 | 单元 | `qcut/scripts/__tests__/verify-windows-signature.test.ts` | 校验脚本：signtool 正常输出时退出 0；artifact 缺失时退出非零；发布者不匹配时退出非零；非 Windows 上 no-op。 |
| 2 | 单元 | `qcut/scripts/__tests__/sign-windows-release.test.ts` | 签名脚本：`QCUT_WIN_CERT_THUMBPRINT` 未设时抛错；找不到安装包时抛错；调用 `signtool sign` 时参数正确；签后重新生成 `latest.yml` 的 SHA512。 |
| 3 | 单元 | `qcut/scripts/__tests__/package-json-signing.test.ts` | `qcut/package.json` 的 `build.win` 有 `verifyUpdateCodeSignature: true`、`forceCodeSigning: false`、没有 `azureSignOptions`，并且 `dist:win:release` 脚本里没有 `forceCodeSigning=false` 覆盖。 |
| 4 | 守门 | `qcut/scripts/__tests__/release-workflow-signing.test.ts` | `release.yml` Windows 任务：build 步骤命令行**没有** `forceCodeSigning=false`；artifact 名是 `windows-build-unsigned`；聚合的 release-publish 步骤**不**自动把 `windows-build-unsigned` 的 `.exe` 挂到 Release。 |
| 5 | 人工 / E2E | [`IMPLEMENTATION.zh-CN.md §6`](IMPLEMENTATION.zh-CN.md#6-在干净-windows-vm-上做发布演练) | 干净 Windows VM：签名安装包 UAC 显示 "Verified publisher: Quriosity Pty Ltd"。 |

## 测试 1 — 校验脚本单元测试

**路径：** `qcut/scripts/__tests__/verify-windows-signature.test.ts`

**框架：** Vitest，跟现有 `qcut/scripts/__tests__/check-boundaries.test.ts` 一致。Mock `child_process.execFileSync` 和 `fs`。

### 用例

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-windows-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("非 Windows 主机上 no-op", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("../verify-windows-signature");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("dist-electron 没有 QCut*Setup*.exe 时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock fs.readdirSync 返回 []
    await expect(import("../verify-windows-signature")).rejects.toThrow(/找不到 QCut.*Setup.*\.exe/);
  });

  it("signtool 退出非零时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync 抛
    await expect(import("../verify-windows-signature")).rejects.toThrow();
  });

  it("signtool 输出里没有期望发布者时抛错", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync 返回不含 "Quriosity Pty Ltd" 的内容
    await expect(import("../verify-windows-signature")).rejects.toThrow(/发布者不匹配/);
  });

  it("签名 + 发布者匹配时通过", async () => {
    vi.stubEnv("WINDOWS_PUBLISHER_NAME", "Quriosity Pty Ltd");
    Object.defineProperty(process, "platform", { value: "win32" });
    // mock execFileSync 返回包含 "Quriosity Pty Ltd" 的内容
    await expect(import("../verify-windows-signature")).resolves.not.toThrow();
  });
});
```

### 运行方式

```bash
cd qcut && bun run test scripts/__tests__/verify-windows-signature.test.ts
```

## 测试 2 — 签名脚本单元测试

**路径：** `qcut/scripts/__tests__/sign-windows-release.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("sign-windows-release", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("QCUT_WIN_CERT_THUMBPRINT 未设时抛错", async () => {
    await expect(import("../sign-windows-release")).rejects.toThrow(/QCUT_WIN_CERT_THUMBPRINT/);
  });

  it("找不到 QCut*Setup*.exe 时抛错", async () => {
    vi.stubEnv("QCUT_WIN_CERT_THUMBPRINT", "ABC123");
    // mock fs.readdirSync 返回 []
    await expect(import("../sign-windows-release")).rejects.toThrow(/找不到 QCut.*Setup.*\.exe/);
  });

  it("调用 signtool sign 时带时间戳服务和 SHA-256 算法", async () => {
    vi.stubEnv("QCUT_WIN_CERT_THUMBPRINT", "ABC123");
    // mock fs 和 child_process，让 signtool 被调用
    // 断言 execFileSync 调用参数 ["sign", "/tr", ..., "/td", "sha256", "/fd", "sha256", "/sha1", "ABC123", ...]
    expect(/* recorded args */).toContain("sha256");
  });

  it("签完重新生成 latest.yml 的 SHA512", async () => {
    // mock latest.yml 存在、signtool 成功
    // 断言 writeFileSync 用新 sha512 写入
  });
});
```

## 测试 3 — `package.json` 形态守门

**路径：** `qcut/scripts/__tests__/package-json-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json Windows 签名配置", () => {
  it("verifyUpdateCodeSignature 是 true", () => {
    expect(pkg.build.win.verifyUpdateCodeSignature).toBe(true);
  });

  it("forceCodeSigning 是 false（我们在 build 之后手工签）", () => {
    expect(pkg.build.win.forceCodeSigning).toBe(false);
  });

  it("没有配 azureSignOptions（Azure 路径已排除）", () => {
    expect((pkg.build.win as any).azureSignOptions).toBeUndefined();
  });

  it("dist:win:release 脚本里没有禁用签名的覆盖", () => {
    expect(pkg.scripts["dist:win:release"]).not.toMatch(/forceCodeSigning=false/);
    expect(pkg.scripts["dist:win:release"]).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("scripts 包含 sign:win 和 verify:win-signature", () => {
    expect(pkg.scripts["sign:win"]).toBeDefined();
    expect(pkg.scripts["verify:win-signature"]).toBeDefined();
  });
});
```

## 测试 4 — 工作流 YAML 守门

**路径：** `qcut/scripts/__tests__/release-workflow-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(import.meta.dir, "..", "..", "..", ".github", "workflows", "release.yml");
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml Windows 签名流程", () => {
  const winJob = wf.jobs["build-windows"];

  it("Build 步骤的命令行没有禁用签名", () => {
    const step = winJob.steps.find((s: any) => /Build Electron application/.test(s.name));
    expect(step.run).not.toMatch(/forceCodeSigning=false/);
    expect(step.run).not.toMatch(/verifyUpdateCodeSignature=false/);
  });

  it("artifact 上传名是 windows-build-unsigned", () => {
    const upload = winJob.steps.find((s: any) => s.uses?.startsWith("actions/upload-artifact"));
    expect(upload.with.name).toBe("windows-build-unsigned");
  });

  it("release publish 任务不会自动把未签名 Windows .exe 挂到 Release", () => {
    const releaseJob = wf.jobs["release"];
    const publishStep = releaseJob.steps.find((s: any) => s.uses?.includes("softprops/action-gh-release") || /release/i.test(s.name ?? ""));
    if (publishStep && publishStep.with?.files) {
      // 维护者按 release operator 手册手工上传签名 .exe
      expect(publishStep.with.files).not.toMatch(/windows-build-unsigned/);
    }
  });
});
```

> 如果 `js-yaml` 和 `@types/js-yaml` 还没在 dev dependency 里，加进去：`bun add -d js-yaml @types/js-yaml`。

## 测试 5 — 人工 VM E2E

详见 [`IMPLEMENTATION.zh-CN.md §6`](IMPLEMENTATION.zh-CN.md#6-在干净-windows-vm-上做发布演练)。在 PR 描述里把结果作为 checklist 留底：

- [ ] CI 成功 build 出 `windows-build-unsigned`。
- [ ] `bun run sign:win` 配合手机批准成功。
- [ ] `bun run verify:win-signature` 退出 0。
- [ ] 手工上传到 GitHub Release 成功。
- [ ] 干净 VM 上：SmartScreen "More info" 面板里显示 "Quriosity Pty Ltd"。
- [ ] 干净 VM 上：UAC 弹窗是**蓝色**，写 "Verified publisher: Quriosity Pty Ltd"。
- [ ] `Get-AuthenticodeSignature` 报告 `Status: Valid`。

## 我们故意不测的部分

- **`signtool.exe` 自身的正确性** — 微软提供的工具。
- **Certum SimplySign 服务可用性** — 厂商端故障不在控制范围。SimplySign 挂掉时手工签名会因 `signtool` 报错明确失败；不要盲目重试。
- **SmartScreen 信誉时机** — SmartScreen 是非确定性的，取决于微软信誉聚合。通过发布反馈跟踪。
- **证书链过期** — `verifyUpdateCodeSignature: true` 会在签名链将来失效时让线上更新明确报错；我们更愿意让生产环境直接报错，也不愿意写脆弱的有效期 CI 测试。
