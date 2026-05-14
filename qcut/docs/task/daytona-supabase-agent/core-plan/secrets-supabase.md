# Secrets via Supabase

How the agent container gets API keys without baking them into the image.

## Background — how the CLI resolves keys today

The CLI's resolver order, defined in `qcut system check-keys`:

1. `process.env.<KEY>` (env vars in the current shell)
2. `~/.qcut/.env` (file tier, mode `0600` — the canonical store)
3. `~/.config/video-ai-studio/credentials.env` (legacy AICP file, beta-only mirror)
4. `none` (key absent)

Supported names: `FAL_KEY`, `GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `RUNWAY_API_KEY`, `HEYGEN_API_KEY`, `DID_API_KEY`, `SYNTHESIA_API_KEY`, `QCUT_AUTH_TOKEN`.

Container goal: load the right subset for a workspace into one of these tiers **before** any `qcut …` command runs.

## Schema

```sql
create table agent_secrets (
  workspace_id uuid not null,
  name         text not null,            -- one of the supported key names above
  value        text not null,            -- ciphertext; see "Encryption" below
  updated_at   timestamptz default now(),
  primary key (workspace_id, name)
);

alter table agent_secrets enable row level security;

-- Only the service role and the workspace owner can read.
create policy "agent_secrets read"
  on agent_secrets for select
  using (
    auth.role() = 'service_role'
    or workspace_id::text = (auth.jwt() ->> 'workspace_id')
  );

-- Inserts/updates restricted to service role + workspace owner UPSERT through PostgREST.
create policy "agent_secrets write"
  on agent_secrets for insert with check (
    auth.role() = 'service_role'
    or workspace_id::text = (auth.jwt() ->> 'workspace_id')
  );
```

### Encryption

Three viable approaches, pick one before production:

| Approach              | Where ciphertext lives                  | Decryption key location           | Notes                                                       |
|-----------------------|-----------------------------------------|-----------------------------------|-------------------------------------------------------------|
| `pgsodium` (Supabase) | `value` column, transparent decryption  | KMS inside Supabase                | Easiest; relies on Supabase RLS for access control          |
| App-level AEAD        | `value = base64(nonce \|\| ciphertext)`   | Per-workspace key in KMS or Vault | More control; ciphertext is opaque to DB ops                |
| Supabase Vault        | Vault secret, `agent_secrets.value` = secret name | Vault master key in Supabase | Cleanest separation; one extra round-trip on each fetch     |

Default for v0: **pgsodium with per-column transparent encryption**. Migrate to app-level AEAD before multi-tenant GA.

## Three loading strategies

### Option A — file tier (recommended for v0)

Entrypoint pulls secrets and writes `~/.qcut/.env` once per container start.

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

  // Forward all CLI args to qcut.
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

**Pros**: Zero CLI changes; matches existing file-tier precedence; works with every command.
**Cons**: Plaintext lives on container disk; rotation requires container restart.

### Option B — environment variables only

Daytona injects each key directly as a container env var. No file ever written.

```jsonc
// devcontainer.json fragment
{
  "containerEnv": {
    "FAL_KEY":           "${localEnv:FAL_KEY}",
    "GEMINI_API_KEY":    "${localEnv:GEMINI_API_KEY}",
    "OPENROUTER_API_KEY":"${localEnv:OPENROUTER_API_KEY}"
  }
}
```

**Pros**: Simplest; matches highest-precedence tier in the resolver; no disk plaintext.
**Cons**: Each key must be explicitly listed; rotation = container restart; Daytona templates can become unwieldy with 10+ keys.

Best for **single-tenant dev workspaces**.

### Option C — native resolver (`supabase://workspace_id`)

Extend the CLI's resolver chain to include a remote source. A small patch in `system check-keys` and the underlying credential loader:

```ts
// new tier between `env` and `envfile`:
// 1. process.env  →  2. supabase://  →  3. ~/.qcut/.env  →  4. legacy
```

Implementation sketch:

- Add `--secrets-source supabase://workspace_id` global flag (or honor `QCUT_SECRETS_URL` env var).
- In the loader, if the URL is set, fetch keys from `agent_secrets` filtered by `workspace_id`, **cache in memory only**, and short-circuit before reading any file.
- Refresh on `401`/`403` from a provider (key may have rotated) — single refetch, no retry storm.

**Pros**: No on-disk plaintext; rotation is instant (just update Supabase row); auditable in `agent_events` (log key reads).
**Cons**: CLI change; bigger blast radius if loader has a bug; needs Supabase SDK bundled.

Best for **multi-tenant GA**. Defer until Option A is proven.

## Bootstrapping & rotation

```sql
-- Insert/update a secret from a privileged context (CI, admin UI).
insert into agent_secrets (workspace_id, name, value)
values ('00000000-0000-0000-0000-000000000001', 'FAL_KEY', :encrypted_value)
on conflict (workspace_id, name) do update
  set value = excluded.value,
      updated_at = now();
```

Rotation flow:

1. Admin UI / `system set-key` writes new value to `agent_secrets`.
2. (Option A) Daytona orchestrator sends `SIGTERM` to the worker — next claim picks up the new `.env`.
3. (Option C) Worker catches first `401` from provider, re-fetches `agent_secrets`, retries once.

Never `delete` rows on rotation — `update`. History/audit tables can pick up changes via a trigger:

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

## Verification inside the container

```bash
# After entrypoint runs, before claiming any job:
qcut system check-keys --json
# Expect: { "FAL_KEY": { "configured": true, "source": "envfile" }, ... }
```

If `source: "none"` for a required key, the worker should mark the next claim attempt as `failed` with `code: secrets:missing` instead of running and burning a retry budget.

## Open questions

1. **Per-job vs per-workspace secrets** — some workflows want a one-shot API key (e.g., a customer-supplied OPENAI_API_KEY for one render). Add `agent_jobs.secret_overrides jsonb`?
2. **Audit log for reads** — should every CLI invocation log which keys it consumed, to detect over-broad permission grants?
3. **Encryption at rest in `.env`** — Option A writes plaintext. Investigate `age`-encrypted `.env` with the decrypt key in container memory only.
