# Music Library Category Coverage

Date: 2026-07-18

## Goal

Make sure QCut's music library has the major categories visible in the editor and that each major category can show at least 2-3 tracks.

## Current Coverage

After this pass, the released catalog is:

- 16 music categories.
- 73 visible music items when bundled tracks and the CDN manifest are combined.
- Every music category has at least 3 released tracks.
- The lowest stocked category is `music-kpop` with 6 tracks; `music-mandopop` has 7 tracks.

| Category | Released tracks | Notes |
| --- | ---: | --- |
| Recommended | 73 | Uses all music tracks. |
| Popular | 73 | Uses all music tracks, sorted by downloads. |
| Latest | 73 | Uses all music tracks, sorted by created date. |
| Instrumental | 11 | Bundled + CDN. |
| Graduation | 8 | Bundled + CDN. |
| Light | 12 | Bundled + CDN. |
| K-POP | 6 | Bundled + CDN. |
| Mandopop | 7 | New category, copyright-safe Chinese-pop style tracks. |
| Travel | 7 | Bundled + CDN. |
| Social trends | 9 | Bundled + CDN. |
| Beat edits | 11 | Bundled + CDN. |
| Winter | 7 | Bundled + CDN. |
| Healing | 13 | Bundled + CDN. |
| Dynamic | 11 | Bundled + CDN. |
| VLOG | 11 | Bundled + CDN. |
| Emotional | 10 | Bundled + CDN. |

## Implemented

1. Added `music-mandopop` to `MUSIC_CATEGORIES`.
2. Added English and Chinese labels:
   - English: `Mandopop`
   - Chinese: `华语流行`
3. Added Chinese search aliases:
   - `华语`
   - `周杰伦`
   - `国风流行`
4. Tagged existing safe tracks for the new category:
   - Bundled: `Warm Window`, `Moonlit Farewell`, `Snow Lantern`
   - CDN: `Bubble Tea Crush`, `Warm Tide`, `Farewell Letter`, `Silent Embrace`
5. Updated `track-specs.json` and `tracks.json` so source metadata and release metadata stay aligned on the next CDN build.
6. Added a regression test that loads `audio-cdn/tracks.json`, combines it with bundled audio, and asserts every music category has at least 3 tracks.

## Screenshot Category Mapping

| Screenshot label | QCut category | Status |
| --- | --- | --- |
| 推荐音乐 | Recommended | Covered. |
| 会员热榜 | Popular | Covered as `热门榜`; membership gating is not part of the audio catalog. |
| 最新 | Latest | Covered. |
| 纯音乐 | Instrumental | Covered. |
| 毕业季 | Graduation | Covered. |
| 轻快 | Light | Covered. |
| K-POP 热单 | K-POP | Covered. |
| 旅行 | Travel | Covered. |
| 抖音热门 | Social trends | Covered as `短视频热门` to avoid platform-specific naming. |
| 卡点 | Beat edits | Covered. |
| 周杰伦 | Mandopop | Covered as `华语流行`; search aliases include `周杰伦`, but shipped content is copyright-safe style music rather than original songs. |
| 冬天 | Winter | Covered. |

## Copyright Policy

Do not download commercial tracks from YouTube to fill the built-in library. If YouTube is used, use only clearly licensed royalty-free / CC0 / creator-owned sources and record the license metadata. For named artist-style categories, use descriptive style tags such as `mandopop`, `chinese-pop`, or `piano` rather than shipping the artist's original songs.

## Verification

Passed:

```bash
bunx vitest run apps/web/src/lib/audio/__tests__/audio-library-catalog.test.ts apps/web/src/lib/audio/__tests__/audio-cdn-catalog.test.ts
bun apps/web/scripts/verify-audio-cdn-manifest.ts --manifest apps/web/audio-cdn/dist/manifest.json
bunx tsc --noEmit --pretty false -p apps/web/tsconfig.json
```

Results:

- 2 test files passed.
- 13 tests passed.
- Audio CDN manifest verified: 88 total tracks, 64 music, 24 sound effects.
- TypeScript check passed.

## Next Subtasks

1. Run the editor UI and confirm `华语流行` appears in the Music Library sidebar.
2. If the category needs more distinct songs, generate 2-3 new FAL tracks with prompts like:
   - `Mandopop piano ballad instrumental, warm vocal-like lead, no vocals`
   - `Chinese pop R&B instrumental, soft groove, nostalgic city night`
   - `Modern guofeng pop instrumental, guzheng textures, soft drums`
3. Convert/normalize generated audio to OGG, add artwork, update `tracks.json`, run `assets:audio:release-cdn --dry-run`, then upload to Supabase Storage.
4. Add license/source metadata for any non-generated audio before release.
