# Cloudwise MaaS User Person Asset Video - 2026-05-19

## Summary

Status: passed.

The user-provided local image at `/Users/peter/Desktop/media/person.jpg` was uploaded through the existing QCut/FAL signed upload path, registered as a Cloudwise MaaS asset, and then used as `asset://...` input for Seedance 2.0 video generation.

## Steps

1. Local file to HTTPS URL:
   - Source image: `/Users/peter/Desktop/media/person.jpg`
   - Upload path: license-server `/api/ai/upload-url` -> FAL signed `PUT`
   - Run id: `proxy-fal-person-upload-20260519T185957Z`
   - Result: passed

2. HTTPS URL to Cloudwise asset:
   - Run id: `cloudwise-maas-user-person-fal-url-asset-20260519T190027Z`
   - Group id: `group-20260520030028-6shrb`
   - Asset id: `asset-20260520030031-lnglm`
   - Asset status: `Active`

3. Asset to Seedance video:
   - Run id: `cloudwise-maas-user-person-asset-video-20260519T190046Z`
   - Reference image: `asset://asset-20260520030031-lnglm`
   - Model: `dreamina-seedance-2-0-260128`
   - Task id: `MTUwNjQ5MTg1NTg1MjcyODMyMDo6MjAyNi0wNS0yMCAwMzowMDo0Nw==`
   - Provider status: `succeeded`
   - Downloaded video: `docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-user-person-asset-video-20260519T190046Z/maas-seedance.mp4`

## Validation

`ffprobe` result:

```json
{
  "duration": "11.041667",
  "size": "7158907"
}
```

## Evidence Files

```text
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/proxy-fal-person-upload-20260519T185957Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-user-person-fal-url-asset-20260519T190027Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-user-person-asset-video-20260519T190046Z/result.json
docs/task/daytona-supabase-agent/maas-seedance/evidence/runs/cloudwise-maas-user-person-asset-video-20260519T190046Z/maas-seedance.mp4
```

## Notes

- Direct local/base64 upload to `assets/create` is not supported by Cloudwise; it requires an HTTP/HTTPS URL.
- The working route is: local file -> provider-addressable HTTPS URL -> Cloudwise asset -> `asset://...` video generation.
