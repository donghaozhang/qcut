# Local IMA Router Env

Local key file:

```text
/Users/peter/.qcut/.env
```

Stored key:

```text
IMAROUTER_API_KEY
```

Notes:

- The key value is intentionally not recorded in this document.
- The file permission is `0600`.
- The value was pulled from Supabase project `kbrtxitvavpuimuihppz`, table `public.agent_secrets`, where `key = 'IMAROUTER_API_KEY'`.
- QCut CLI resolves this file through the normal local env-file tier.

Safe verification:

```bash
grep -c '^IMAROUTER_API_KEY=' /Users/peter/.qcut/.env
stat -f '%Sp %N' /Users/peter/.qcut/.env
```
