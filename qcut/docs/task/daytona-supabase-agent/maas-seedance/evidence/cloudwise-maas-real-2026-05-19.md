# Cloudwise MaaS Seedance Real Test - 2026-05-19

## Result

Status: blocked by provider authentication.

The MaaS Seedance smoke script was executed against the real Cloudwise endpoint from the PDF:

```text
POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance
```

The local shell did not have `MAAS_API_KEY`. A legacy BytePlus hackathon `SEEDANCE_2_0_API` value was tried explicitly as a best-effort key compatibility check. Cloudwise rejected it with HTTP `401`, confirming this provider needs a separate Cloudwise MaaS credential.

## Run

- Run id: `cloudwise-maas-real-20260519T182240Z`
- Script: `docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-smoke.sh`
- Model: `dreamina-seedance-2-0-260128`
- Duration: `11`
- Ratio: `16:9`
- Generate audio: `false`
- Watermark: `false`

Evidence files are ignored from git because they can contain generated media on successful runs:

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-real-20260519T182240Z/request-payload.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-real-20260519T182240Z/submit-response.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-real-20260519T182240Z/result.json
```

## Provider Response

```json
{
  "path": "/api/v1/aiproducts/video/seedance",
  "success": false,
  "message": "Unauthorized access",
  "error": "Full authentication is required to access this resource"
}
```

## Re-run Command

After a real Cloudwise MaaS key is available:

```bash
MAAS_API_KEY="$MAAS_API_KEY" \
RUN_ID="cloudwise-maas-real-$(date -u +%Y%m%dT%H%M%SZ)" \
docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-smoke.sh
```

Expected success artifacts:

- `result.json` with `status: "passed"`
- `submit-response.json` with a non-empty `id`
- `status-response.json` with `status: "succeeded"`
- `maas-seedance.mp4`
- `ffprobe.json`
