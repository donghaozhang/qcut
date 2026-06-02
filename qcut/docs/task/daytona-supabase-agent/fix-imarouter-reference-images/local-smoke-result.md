# Local Smoke Result

Date: 2026-05-26

## Result

IMA Router Ref2V `--reference-images` smoke passed with a public HTTPS reference URL.

Output:

```text
/tmp/qcut-output/imarouter_seedance_2_0_ref2v_5-second-video-using-the-reference-image_1779828346048.mp4
```

Sidecar:

```text
/tmp/qcut-output/imarouter_seedance_2_0_ref2v_5-second-video-using-the-reference-image_1779828346048.json
```

Observed output media:

```text
1280x720, 24 fps, 5.041667 s, 3.1 MB
```

CLI result:

```text
status=ok
model=imarouter_seedance_2_0_ref2v
endpoint=v1/videos
cost=0.3
duration=135.615s
```

## Local File Attempt

The exact local-file command reached the local upload step but failed before IMA Router:

```text
FAL upload error: Upload URL request failed (401): Invalid token
```

Supabase `agent_secrets` currently has `IMAROUTER_API_KEY` but no `FAL_KEY`, so the full local-file path cannot be proven until a valid FAL key is available or local IMA references use a different public staging backend.

## What This Proves

- The CLI now stages IMA Ref2V `--reference-images`.
- The executor accepts `image_urls` for IMA Ref2V and submits a successful IMA Router `v1/videos` job.
- The generated video downloaded successfully to the local output directory.

## Remaining Gap

The full chain `local file -> FAL storage URL -> IMA asset -> asset:// -> IMA video` is still blocked by the invalid/missing FAL key.
