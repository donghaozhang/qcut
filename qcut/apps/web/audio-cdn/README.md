# Audio CDN catalog source

Staging area for the QCut audio library's CDN drop (tracks beyond the 23
bundled in `public/audio/builtin/`).

## Layout

- `tracks.json` — array of track entries (see `tracks.example.json`); the
  `file` / `artworkFile` fields are paths relative to this directory.
- audio payloads (`.ogg`/`.mp3`) and artwork (`.webp`) referenced by
  `tracks.json`.
- `dist/manifest.json` — generated publish manifest (do not edit).

## Producing content

- AI tracks: `bun run pipeline generate-music -t "<style prompt>" ...`, then
  convert/normalize to ogg and add an entry to `tracks.json`.
- Artwork: reuse `bun run assets:audio:artwork` prompts, or render manually;
  256px webp.
- CC0 libraries are also acceptable — record the license per track.

IDs must be integers <= -100000 (see AUDIO_CDN_TRACK_ID_MAX) so they never
collide with bundled (-1000s) or Freesound (positive) IDs.

## Publishing

```bash
bun run assets:audio:release-cdn -- --base-url https://assets.qcut.app/audio --bucket qcut-assets
bun run assets:audio:verify-cdn -- --manifest apps/web/audio-cdn/dist/manifest.json --check-remote
```

The app picks the catalog up via `VITE_AUDIO_CDN_MANIFEST_URL`.

## Real download counts

The editor reports catalog-track usage to the license server
(`POST /api/audio-metrics/downloads`, best-effort, signed-in users only).
Pass `--downloads-url https://<license-server>/api/audio-metrics/downloads`
(auth via `--downloads-token` or `QCUT_AUDIO_METRICS_TOKEN`) to the release
script to backfill `downloads` in the manifest so the trending sort reflects
actual usage.
