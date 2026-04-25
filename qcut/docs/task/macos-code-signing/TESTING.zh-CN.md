# macOS 代码签名 — 测试方案

测试只覆盖**我们自己拥有的**部分 — 校验脚本、`package.json` 形态、
`release.yml` 形态。我们故意**不**单元测试 `codesign`、`spctl`、
`xcrun stapler` 或 Apple 的公证服务 — 这些是集成层面的事，由
[`IMPLEMENTATION.zh-CN.md §4`](IMPLEMENTATION.zh-CN.md#4-在干净-macos-vm-上做发布演练)
里的发布演练步骤覆盖。

## 测试清单

| # | 类型 | 文件路径 | 覆盖内容 |
|---|------|----------|----------|
| 1 | 单元 | `qcut/scripts/__tests__/verify-macos-signature.test.ts` | 校验脚本：输出正常时通过，缺公证时失败，team ID 不匹配时失败，非 macOS 上 no-op。 |
| 2 | 单元 | `qcut/scripts/__tests__/package-json-mac-signing.test.ts` | `build.mac.identity` 已设、`build.mac.notarize.teamId` 已设、`hardenedRuntime: true` 保留。 |
| 3 | 守门 | `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts` | `build-macos` "Build Electron application" 步骤暴露了 5 个 Apple env，且 build 之后存在 verify 步骤。 |
| 4 | 人工 / E2E | [`IMPLEMENTATION.zh-CN.md §4`](IMPLEMENTATION.zh-CN.md#4-在干净-macos-vm-上做发布演练) | 干净 macOS VM 上签名 + 公证的 app 启动时不弹 Gatekeeper 警告。 |

## 测试 1 — 校验脚本单元测试

**路径：** `qcut/scripts/__tests__/verify-macos-signature.test.ts`

**框架：** Vitest，跟现有 `qcut/scripts/__tests__/check-boundaries.test.ts`
一致。Mock `child_process.execFileSync`。

### 用例

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("verify-macos-signature", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("非 macOS 主机上 no-op", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("../verify-macos-signature");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("dist-electron 为空时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock fs.readdirSync 返回 []
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /找不到 QCut.*\.dmg/,
    );
  });

  it("codesign 退出非零时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock execFileSync 在 codesign 时抛
    await expect(import("../verify-macos-signature")).rejects.toThrow();
  });

  it("已签名但未公证时抛错", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "ABCDE12345");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock spctl 输出包含 "accepted" 但不含 "Notarized Developer ID"
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /未公证/,
    );
  });

  it("stapler 报失败时抛错", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock stapler 输出不含 "worked"
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /stapler 校验失败/,
    );
  });

  it("team ID 不匹配时抛错", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "WRONGT3AM1");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock codesign -dvv 输出不含 (WRONGT3AM1)
    await expect(import("../verify-macos-signature")).rejects.toThrow(
      /team 不匹配/,
    );
  });

  it("全部正常时通过", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "ABCDE12345");
    Object.defineProperty(process, "platform", { value: "darwin" });
    // mock 四个工具输出都正常
    await expect(import("../verify-macos-signature")).resolves.not.toThrow();
  });
});
```

> **重构提示：** 生产脚本是模块顶层立即执行（与 `verify-packaged-*.ts`
> 风格一致）。为了让测试更干净，考虑把主体包进 `main()`，文件底部
> 调用 — 跟 Windows 校验脚本同款。两种风格都行，重点是两个校验脚本
> 保持一致。

### 运行方式

```bash
cd qcut && bun run test scripts/__tests__/verify-macos-signature.test.ts
```

## 测试 2 — `package.json` 形态

**路径：** `qcut/scripts/__tests__/package-json-mac-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import pkg from "../../package.json";

describe("package.json macOS 签名配置", () => {
  it("identity 是 Developer ID Application", () => {
    expect(pkg.build.mac.identity).toMatch(/^Developer ID Application: /);
  });

  it("notarize.teamId 已设", () => {
    expect(pkg.build.mac.notarize?.teamId).toBeTruthy();
  });

  it("hardenedRuntime 保持 true", () => {
    expect(pkg.build.mac.hardenedRuntime).toBe(true);
  });

  it("entitlements 仍指向原 plist", () => {
    expect(pkg.build.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(pkg.build.mac.entitlementsInherit).toBe("build/entitlements.mac.plist");
  });
});
```

## 测试 3 — 工作流 YAML 守门

**路径：** `qcut/scripts/__tests__/release-workflow-mac-signing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const workflowPath = join(
  import.meta.dir, "..", "..", "..", ".github", "workflows", "release.yml",
);
const wf = yaml.load(readFileSync(workflowPath, "utf8")) as any;

describe("release.yml build-macos 签名", () => {
  const macJob = wf.jobs["build-macos"];
  const buildStep = macJob.steps.find(
    (s: any) => s.name === "Build Electron application",
  );

  for (const k of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ]) {
    it(`Build 步骤暴露了 ${k}`, () => {
      expect(buildStep.env[k]).toBeDefined();
    });
  }

  it("Build 之后存在 'Verify macOS signature and notarization' 步骤", () => {
    const names = macJob.steps.map((s: any) => s.name);
    const buildIdx = names.indexOf("Build Electron application");
    const verifyIdx = names.indexOf("Verify macOS signature and notarization");
    expect(verifyIdx).toBeGreaterThan(buildIdx);
  });
});
```

> 如果还没装 `js-yaml` 和 `@types/js-yaml`，需要加到 dev dependency
> （Windows 那边的 TESTING 也需要这个）。

## 测试 4 — 人工 VM E2E

详见 [`IMPLEMENTATION.zh-CN.md §4`](IMPLEMENTATION.zh-CN.md#4-在干净-macos-vm-上做发布演练)。
在 PR 描述里把结果作为 checklist 留底：

- [ ] `.dmg` 打开时**不**弹"无法验证开发者"。
- [ ] App 从 `/Applications` 启动时**不**需要右键 → 打开。
- [ ] `codesign --verify --deep --strict --verbose=2` 退出 0。
- [ ] `spctl -a -t exec -vv` 报告 `accepted` 且 `source=Notarized Developer ID`。
- [ ] `xcrun stapler validate` 报告 `The validate action worked!`。
- [ ] 安全弹窗里显示的开发者名是 "Quriosity Pty Ltd"。

## 我们故意不测的部分

- **`codesign`、`spctl`、`xcrun stapler` 自身的正确性** — Apple 提供的
  工具。
- **Apple 公证服务可用性** — Apple 端故障不在我们控制范围。公证服务
  挂掉时构建会明确报错；不要盲目重试。
- **App-Specific Password 过期** — 没有测试能在发布前抓到这个；构建
  本身会因为 notary 认证失败明确报错。处理方式见
  [`DOCUMENTATION.zh-CN.md`](DOCUMENTATION.zh-CN.md)。
- **证书过期** — Apple 的 Developer ID Application 证书有效期 5 年；
  到期前会主动轮换。
