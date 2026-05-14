# PR 01 —— `qcut system doctor`

> **Phase**：1 · **依赖**：无 · **工作量**：~80 行

## 目标

新加 CLI 命令 `qcut system doctor`，把环境健康状况以 JSON 报出来。必须支持 `--json`（机读）和 `--skip-health`（不调外部 provider）。它是后续所有 sandbox/worker 层引用的 **spawn probe**——返回 0 且 `status: "ok"`，就表示容器可用。

## 依赖

无。最先合入。

## 涉及文件

| 路径 | 动作 | 用途 |
|------|------|------|
| `electron/native-pipeline/cli/command-registry-system.ts` | 改 | 在 `system` 组下注册 `doctor` handler |
| `electron/native-pipeline/cli/handlers/system-doctor.ts` | 新 | 实现：汇总检查项、返回信封 |
| `electron/native-pipeline/cli/handlers/system-doctor.test.ts` | 新 | doctor 逻辑单元测试 |

## 实现

### Step 1 —— Doctor handler

`electron/native-pipeline/cli/handlers/system-doctor.ts`：

```ts
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadKeysFromFile } from "../../infra/key-manager.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
}

export interface DoctorReport {
  status: "ok" | "fail";
  checks: DoctorCheck[];
  keys_loaded: number;
  cli_version: string;
  bun_version: string | null;
  ffmpeg_version: string | null;
  env_file: string;
}

export async function runDoctor(opts: { skipHealth: boolean }): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  const bun = safeVersion("bun", ["--version"]);
  checks.push(bun ? ok("bun", bun) : fail("bun", "not on PATH"));

  const ffmpeg = safeVersion("ffmpeg", ["-version"]);
  checks.push(ffmpeg ? ok("ffmpeg", ffmpeg) : fail("ffmpeg", "not on PATH"));

  const envPath = join(homedir(), ".qcut", ".env");
  let keysLoaded = 0;
  if (existsSync(envPath)) {
    const mode = statSync(envPath).mode & 0o777;
    if (mode !== 0o600) {
      checks.push({ name: "env_file_mode", status: "warn",
        detail: `expected 0600, got ${mode.toString(8)}` });
    } else {
      checks.push(ok("env_file_mode", "0600"));
    }
    keysLoaded = Object.keys(await loadKeysFromFile(envPath)).length;
    checks.push(keysLoaded > 0
      ? ok("env_file_keys", `${keysLoaded} loaded`)
      : fail("env_file_keys", "no keys"));
  } else {
    checks.push(fail("env_file", `${envPath} not found`));
  }

  if (!opts.skipHealth) {
    // Provider 真 ping 留到后续 PR。
    checks.push({ name: "provider_pings", status: "warn", detail: "skipped (not yet wired)" });
  }

  const failed = checks.some((c) => c.status === "fail");
  return {
    status: failed ? "fail" : "ok",
    checks,
    keys_loaded: keysLoaded,
    cli_version: process.env.QCUT_VERSION ?? "dev",
    bun_version: bun,
    ffmpeg_version: ffmpeg,
    env_file: envPath,
  };
}

function safeVersion(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    if (r.status !== 0) return null;
    return r.stdout.split("\n")[0]?.trim() ?? null;
  } catch { return null; }
}
function ok(name: string, detail?: string): DoctorCheck { return { name, status: "ok", detail }; }
function fail(name: string, detail: string): DoctorCheck { return { name, status: "fail", detail }; }
```

### Step 2 —— 注册命令

在 `electron/native-pipeline/cli/command-registry-system.ts` 里加：

```ts
import { runDoctor } from "./handlers/system-doctor.js";
import { ExitCode } from "../output/errors.js";

registry.register({
  command: "system doctor",
  describe: "Report container/environment health as JSON",
  flags: [
    { name: "--json", type: "boolean", default: true },
    { name: "--skip-health", type: "boolean", default: false },
  ],
  handler: async (args) => {
    const report = await runDoctor({ skipHealth: Boolean(args["skip-health"]) });
    if (args.json !== false) {
      console.log(JSON.stringify(report));
    } else {
      for (const c of report.checks) {
        console.log(`${c.status === "ok" ? "✓" : c.status === "warn" ? "⚠" : "✗"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
      }
    }
    return report.status === "ok" ? ExitCode.SUCCESS : ExitCode.API_KEY_MISSING;
  },
});
```

失败时退出码 `4`（API_KEY_MISSING）——下游 worker/probe 据此判定 "容器不健康"。

### Step 3 —— 接上 help

如果有 `qcut --help` 索引（`cli/help-text.ts` 之类），加一行：`system doctor — environment health (--json | --skip-health)`。

## 测试

`electron/native-pipeline/cli/handlers/system-doctor.test.ts`（要点）：

```ts
import { describe, it, expect, vi } from "vitest";
import { runDoctor } from "./system-doctor.js";

describe("runDoctor", () => {
  it("env 文件存在、0600、有 key 时返 ok", async () => {
    const r = await runDoctor({ skipHealth: true });
    expect(r.status).toBe("ok");
    expect(r.keys_loaded).toBeGreaterThan(0);
  });

  it("env 文件不存在时返 fail", async () => { /* mock existsSync = false */ });
  it("env 文件权限不是 0600 时 warn", async () => { /* mock statSync mode = 0o644 */ });
  it("ffmpeg 不在 PATH 时整体 fail", async () => { /* mock spawnSync 返非零 */ });
});
```

跑：`bun run test electron/native-pipeline/cli/handlers/system-doctor.test.ts`。

## 验证（手工）

```bash
bun run build
bun electron/native-pipeline/cli/cli.ts system doctor --json --skip-health
```

期望 stdout 一个 JSON、退出码 0：

```json
{
  "status": "ok",
  "checks": [
    { "name": "bun", "status": "ok", "detail": "1.3.10" },
    { "name": "ffmpeg", "status": "ok", "detail": "ffmpeg version 6.1.1 ..." },
    { "name": "env_file_mode", "status": "ok", "detail": "0600" },
    { "name": "env_file_keys", "status": "ok", "detail": "8 loaded" }
  ],
  "keys_loaded": 8,
  ...
}
```

## 不在本 PR 范围

- 真的去 ping 各 provider。当前 `--skip-health` 一律生效；放开是另一 PR。
- 人类可读的 `--no-json` 模式。上面的 fallback 够了。
- 合并 `qcut system check-keys`。doctor 是其超集；以后可能弃用 check-keys，但不在本 PR。

## 相关文档

- [`../core-plan/architecture.md`](../core-plan/architecture.md) —— 退出码表（`4` = API_KEY_MISSING）
- [`../web-sandbox/verification.md`](../web-sandbox/verification.md) —— Layer 2 spawn probe 调的就是这个命令
- `electron/native-pipeline/infra/key-manager.ts` —— 复用的现成 `~/.qcut/.env` 加载器
