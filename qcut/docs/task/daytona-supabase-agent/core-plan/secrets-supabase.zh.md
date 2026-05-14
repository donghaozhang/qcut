# 用 Supabase 管理密钥

容器如何拿到 API key，又不把它们烤进镜像。

## 背景——CLI 现有的密钥优先级

`qcut system check-keys` 的解析顺序：

1. `process.env.<KEY>`（当前 shell 的环境变量）
2. `~/.qcut/.env`（文件层，权限 `0600`——规范化的存储位置）
3. `~/.config/video-ai-studio/credentials.env`（旧 AICP 文件，仅 beta 期镜像）
4. `none`（没有）

支持的 key 名：`FAL_KEY`、`GEMINI_API_KEY`、`GOOGLE_AI_API_KEY`、`OPENROUTER_API_KEY`、`ELEVENLABS_API_KEY`、`OPENAI_API_KEY`、`RUNWAY_API_KEY`、`HEYGEN_API_KEY`、`DID_API_KEY`、`SYNTHESIA_API_KEY`、`QCUT_AUTH_TOKEN`。

容器的目标：在跑任何 `qcut …` 之前，把该 workspace 的那部分 key 装进上面任一层。

## 表结构

```sql
create table agent_secrets (
  workspace_id uuid not null,
  name         text not null,            -- 上述支持的 key 名之一
  value        text not null,            -- 密文；见下方"加密"小节
  updated_at   timestamptz default now(),
  primary key (workspace_id, name)
);

alter table agent_secrets enable row level security;

-- 只有 service role 和 workspace 所有者能读
create policy "agent_secrets read"
  on agent_secrets for select
  using (
    auth.role() = 'service_role'
    or workspace_id::text = (auth.jwt() ->> 'workspace_id')
  );

-- 写入/更新也限制 service role + workspace 所有者
create policy "agent_secrets write"
  on agent_secrets for insert with check (
    auth.role() = 'service_role'
    or workspace_id::text = (auth.jwt() ->> 'workspace_id')
  );
```

### 加密

三种可行方案，上生产前挑一个：

| 方案                  | 密文存放                                | 解密 key 在哪                       | 备注                                                        |
|-----------------------|----------------------------------------|------------------------------------|-------------------------------------------------------------|
| `pgsodium`（Supabase） | `value` 列，透明解密                    | Supabase 内置 KMS                  | 最简单；靠 Supabase RLS 控制访问                            |
| 应用层 AEAD           | `value = base64(nonce \|\| ciphertext)`  | KMS 或 Vault 里的 per-workspace key | 更可控；DB 操作看不到明文                                   |
| Supabase Vault        | Vault 里，`agent_secrets.value` 存秘密名 | Supabase 主密钥                    | 隔离最干净；每次取要多一跳 round-trip                       |

v0 默认：**pgsodium 透明列加密**。多租户 GA 前迁到应用层 AEAD。

## 三种加载策略

### 方案 A——文件层（v0 推荐）

入口脚本一次性拉取并写到 `~/.qcut/.env`。

```ts
// infra/daytona/entrypoint.ts
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const WORKSPACE_ID = process.env.WORKSPACE_ID!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function loadSecrets() {
  const { data, error } = await sb
    .from("agent_secrets")
    .select("name, value")
    .eq("workspace_id", WORKSPACE_ID);

  if (error) throw new Error(`Supabase secret fetch failed: ${error.message}`);
  if (!data?.length) throw new Error(`No secrets for workspace ${WORKSPACE_ID}`);

  const envBody = data.map(({ name, value }) => `${name}=${value}`).join("\n") + "\n";
  const dir = `${homedir()}/.qcut`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(`${dir}/.env`, envBody, { mode: 0o600 });
  await chmod(`${dir}/.env`, 0o600);
}

async function main() {
  await loadSecrets();

  // 转发 CLI 参数
  const args = process.argv.slice(2);
  const child = spawn("node", ["/qcut/dist/electron/native-pipeline/cli/cli.js", ...args], {
    stdio: "inherit",
    env: { ...process.env, QCUT_HOME: `${homedir()}/.qcut` },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "error", error: err.message, code: "secrets:load:failed" }));
  process.exit(4);
});
```

**优点**：CLI 零改动；契合现有文件层优先级；对所有命令都适用。
**缺点**：明文落到容器盘上；轮换得重启容器。

### 方案 B——纯环境变量

Daytona 把每个 key 直接注入容器环境变量，永不写盘。

```jsonc
// devcontainer.json 片段
{
  "containerEnv": {
    "FAL_KEY":           "${localEnv:FAL_KEY}",
    "GEMINI_API_KEY":    "${localEnv:GEMINI_API_KEY}",
    "OPENROUTER_API_KEY":"${localEnv:OPENROUTER_API_KEY}"
  }
}
```

**优点**：最简单；命中最高优先级层；磁盘无明文。
**缺点**：每个 key 都得显式列；轮换 = 重启容器；10+ key 时 Daytona 模板会很臃肿。

适合**单租户 dev workspace**。

### 方案 C——原生解析器（`supabase://workspace_id`）

把远端源加进 CLI 解析器链。`system check-keys` 和底层 loader 一处小补丁：

```ts
// 在 `env` 和 `envfile` 之间插一层：
// 1. process.env  →  2. supabase://  →  3. ~/.qcut/.env  →  4. legacy
```

实现要点：

- 加全局 flag `--secrets-source supabase://workspace_id`（或读 `QCUT_SECRETS_URL` 环境变量）。
- Loader 读到这个 URL 时，按 `workspace_id` 从 `agent_secrets` 拉取，**只缓存到内存**，短路掉文件读取。
- 收到 provider 的 `401`/`403`（可能已轮换）就刷新一次——只一次，不要重试风暴。

**优点**：磁盘无明文；轮换即时（直接改 Supabase 一行）；可在 `agent_events` 里审计（记录 key 读取）。
**缺点**：要改 CLI；loader 出 bug 影响面大；得把 Supabase SDK 打进 CLI。

适合**多租户 GA**。等方案 A 跑稳再做。

## 引导和轮换

```sql
-- 从有权限的上下文（CI、admin UI）写入/更新 secret。
insert into agent_secrets (workspace_id, name, value)
values ('00000000-0000-0000-0000-000000000001', 'FAL_KEY', :encrypted_value)
on conflict (workspace_id, name) do update
  set value = excluded.value,
      updated_at = now();
```

轮换流程：

1. Admin UI / `system set-key` 把新值写进 `agent_secrets`。
2.（方案 A）Daytona 编排器给 worker 发 `SIGTERM`——下次认领任务时读到新 `.env`。
3.（方案 C）Worker 收到第一个 provider `401` 就重抓 `agent_secrets`，重试一次。

轮换时**永不 delete**——`update`。历史/审计可以由触发器写：

```sql
create table agent_secrets_history (
  workspace_id uuid,
  name         text,
  rotated_at   timestamptz default now(),
  changed_by   uuid                       -- auth.uid()
);

create or replace function log_secret_rotation() returns trigger as $$
begin
  insert into agent_secrets_history (workspace_id, name, changed_by)
  values (NEW.workspace_id, NEW.name, auth.uid());
  return NEW;
end $$ language plpgsql security definer;

create trigger agent_secrets_rotation
  after update on agent_secrets
  for each row when (OLD.value is distinct from NEW.value)
  execute function log_secret_rotation();
```

## 容器内的自检

```bash
# entrypoint 跑完、认领任务前：
qcut system check-keys --json
# 期望：{ "FAL_KEY": { "configured": true, "source": "envfile" }, ... }
```

如果必需的 key 显示 `source: "none"`，worker 应该直接把下一次认领尝试标 `failed`、`code: secrets:missing`，而不是真去跑、白白烧重试预算。

## Open questions

1. **按任务 vs 按 workspace 的密钥**——有些工作流需要一次性 key（比如用户自带 OPENAI_API_KEY 只渲染这一次）。是否加 `agent_jobs.secret_overrides jsonb`？
2. **读取审计**——每次 CLI 调用要不要记下消费了哪些 key？方便发现过宽的权限。
3. **磁盘加密**——方案 A 写的是明文。研究 `age` 加密 `.env`，解密 key 仅留内存。
