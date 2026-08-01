---
name: readme-showcase
description: Add or swap feature-showcase blocks (GIF + full-video links) in the repo-root README. Use when the user wants a new feature demo on the README, wants to replace the text-animation/sticker showcase video, or asks to "把视频/动图放到 README 上".
argument-hint: <feature-slug> [source.mp4]
---

# README Showcase

The repo-root `README.md` (NOT `qcut/README.md` — it lives one level above the
`qcut/` package dir) carries feature showcases inside marker-delimited blocks:

```
<!-- showcase:<slug>:start -->
...swappable content...
<!-- showcase:<slug>:end -->
```

Existing slugs: `text-animations`, `stickers` (reserved). **Only ever edit
between a block's markers** — everything outside (Product Tour screenshots,
Why/Features, Quick Start) must survive swaps untouched.

## Adding or swapping a showcase

1. **Pick the source video** — a verified 2K60 final (e.g. from
   `~/Documents/QCut/e2e/<project>/`). Never use an unverified cut; run the
   frame-by-frame QA from `qcut-shot/references/promo-iteration-lessons.md`
   first if in doubt.

2. **Generate the hero GIF** (autoplays on GitHub; videos in `<img>`/`<video>`
   tags do not). Budget: **≤5 MB committed**. Recipe that hit 2.9 MB for a
   10 s, 960 px, 3-excerpt montage:

   ```bash
   ffmpeg -y -i FINAL.mp4 -filter_complex \
     "[0:v]trim=A1:A2,setpts=PTS-STARTPTS[a];\
      [0:v]trim=B1:B2,setpts=PTS-STARTPTS[b];\
      [0:v]trim=C1:C2,setpts=PTS-STARTPTS[c];\
      [a][b][c]concat=n=3:v=1:a=0,fps=14,scale=960:-1:flags=lanczos,split[x][y];\
      [x]palettegen=max_colors=128[p];[y][p]paletteuse=dither=bayer:bayer_scale=4" \
     qcut-<slug>.gif
   ```

   Pick excerpts that show: the feature happening (not UI navigation), one
   "wow" beat, and the branded outro. Verify content by extracting tiles
   (`select='eq(n\,..)',tile`) before committing — never ship a GIF unseen.

3. **Place assets**
   - GIF → commit at `qcut/docs/assets/readme/qcut-<slug>.gif`
     (README references it as `qcut/docs/assets/readme/...` because the README
     sits at the repo root).
   - Full MP4s (ZH + EN) → upload to a **published GitHub release** for a
     stable hotlink, e.g.
     `gh release upload v20XX.XX.XX.X EN.mp4 ZH.mp4 --clobber`.
     Release-asset URLs
     (`https://github.com/Quriosity-agent/qcut/releases/download/<tag>/<file>`)
     are permanent; the tag does not need to match the feature's version.

4. **Edit the block** between the slug's markers only: `<img>` for the GIF +
   one "▶ Full promo" line linking both language MP4s. For a brand-new
   feature, add a new `### <Feature>` heading + fresh marker pair at the TOP
   of Product Tour and demote the previous "✨ new" badge.

5. **Verify** — `git diff` must show changes only inside the markers (plus
   the new binary asset); check the GIF file size; view the rendered README
   on the PR's Files tab before merging.

## Gotchas

- GitHub only autoplays GIF/animated-WebP in READMEs. `<video>` tags and
  release-asset mp4 links render as plain links, which is why the GIF + link
  combo exists.
- The `readme/` screenshots convention (PNGs ~600 KB) predates this skill;
  don't replace those static shots when swapping showcase blocks.
- Keep one "✨ new" badge at most — it's a spotlight, not a label.
