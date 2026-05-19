# Cloudwise MaaS Seedance Key And Real-Person Upload Test - 2026-05-19

## Summary

Status: provider key works; text-to-video generation passed; real-person upload/reference paths are blocked by provider safety policy.

The saved `MAAS_API_KEY` successfully authenticated against Cloudwise MaaS and generated an 11 second Seedance 2.0 MP4. Real-person style reference tests were also executed:

- direct data-URI face reference to the video generation endpoint was rejected with a privacy/person error
- public-person HTTP URL asset upload was accepted for ingestion, then failed during asset processing with a policy/copyright restriction

No real-person video was generated.

## Text-To-Video Success

- Run id: `cloudwise-maas-key-smoke-20260519T183240Z`
- Script: `docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-smoke.sh`
- Endpoint: `POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`
- Model: `dreamina-seedance-2-0-260128`
- Task id: `MTUwNjQ4NDc4MjQ2MTYyODQxNjo6MjAyNi0wNS0yMCAwMjozMjo0MQ==`
- Provider status: `succeeded`
- Downloaded video: `docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-key-smoke-20260519T183240Z/maas-seedance.mp4`
- `ffprobe` duration: `11.041667`
- File size: `2526054` bytes

Evidence files:

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-key-smoke-20260519T183240Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-key-smoke-20260519T183240Z/status-response.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-key-smoke-20260519T183240Z/ffprobe.json
```

## Direct Face Reference Upload

- Run id: `cloudwise-maas-face-reference-20260519T183949Z`
- Script: `docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-smoke.sh`
- Input: local synthetic face test image from `docs/task/bytedance-hackathon/face-input.jpg`
- Transport: `image_url.url = data:image/jpeg;base64,...`
- Role: `reference_image`
- Result: blocked at submit

Provider error:

```json
{
  "code": "InputImageSensitiveContentDetected.PrivacyInformation",
  "message": "The request failed because the input image may contain real person.",
  "type": "BadRequest"
}
```

Evidence:

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-face-reference-20260519T183949Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-face-reference-20260519T183949Z/submit-response.json
```

## Public Real-Person Asset Upload

- Run id: `cloudwise-maas-real-person-url-asset-active-20260519T184257Z`
- Script: `docs/task/daytona-supabase-agent/maas-seedance/scripts/maas-seedance-asset-upload-smoke.sh`
- Endpoint sequence:
  - `POST /api/v1/assets/groups/create`
  - `POST /api/v1/assets/create`
  - `POST /api/v1/assets/get`
- Source URL: public Wikimedia portrait URL
- Group id: `group-20260520024259-68x9t`
- Asset id: `asset-20260520024300-9dkl5`
- Result: asset processing failed by provider policy

Provider error:

```json
{
  "Code": "InputImageSensitiveContentDetected.PolicyViolation",
  "Message": "The request failed because the input image may be related to copyright restrictions."
}
```

Evidence:

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-real-person-url-asset-active-20260519T184257Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-real-person-url-asset-active-20260519T184257Z/asset-get-response.json
```

## Conclusions

- `MAAS_API_KEY` is valid for Cloudwise MaaS Seedance generation.
- The base Seedance video API works with `dreamina-seedance-2-0-260128`.
- Cloudwise enforces real-person/image safety on both direct generation references and asset ingestion.
- A successful real-person asset workflow will likely require the provider's authorized-person or digital-character asset path, not arbitrary local/public face uploads.
