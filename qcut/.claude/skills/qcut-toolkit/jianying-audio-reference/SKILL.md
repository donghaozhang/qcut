---
name: jianying-audio-reference
description: Trace Jianying (剪映专业版) sound-effect cards from the local resource database to cached audio, inspect categories and licensing metadata, and prove mappings with content hashes and FFprobe. Use for 剪映音效, 音效库对标, audio cache inspection, Cache/music, downLoadcfg, sound-effect resource IDs, locating downloaded Jianying SFX, or building a reference-only QCut sound taxonomy.
---

# Jianying Audio Reference

Treat Jianying sound effects as a catalog record plus an audio payload, not as
an `artistEffect` package. Recover metadata and cache relationships without
copying Jianying audio into QCut or another distributable product.

## Inspect the catalog first

Jianying stores sound-effect metadata and payloads separately:

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
~/Movies/JianyingPro/User Data/Cache/music/downLoadcfg
~/Movies/JianyingPro/User Data/Cache/music/<content-md5>.mp3
```

Read [cache-formats.md](references/cache-formats.md) before interpreting raw
database or cache fields.

Run the inspector with the exact visible card title:

```bash
SKILL_DIR="/absolute/path/to/jianying-audio-reference"
bun "$SKILL_DIR/scripts/inspect-audio-cache.ts" inspect \
  --title "砰，拳击声"
```

The JSON report includes resource IDs, category names, duration, source,
author, VIP/paid state, copyright metadata, download host, and local-cache
verification. It omits signed download URLs by default. Add
`--include-download-url` only when a user explicitly needs the current URL.

An exact title can return multiple resource IDs or versions. Disambiguate with
category, author, card order, duration, or a one-card cache probe. Never select
the first title match silently. Keep 64-bit resource IDs as strings.

Inspect the complete cached taxonomy or summarize the current inventory:

```bash
bun "$SKILL_DIR/scripts/inspect-audio-cache.ts" categories
bun "$SKILL_DIR/scripts/inspect-audio-cache.ts" inventory
```

Use `--cache-root` when Jianying uses a non-default `User Data/Cache` path. Use
repeatable `--database` arguments to inspect copied databases; copy the SQLite
WAL and SHM files with a live database or query the original read-only path.

## Resolve the payload

There are two resource forms:

- A legacy record has `common_attr.md5`. Check
  `Cache/music/<md5>.mp3`, compute the file MD5, and require an exact match.
- A newer VOD record can have an empty MD5. Its signed URL is not a stable
  identifier, so map it with a one-card cache probe.

For the newer form, create a baseline before touching the card:

```bash
PROBE_DIR="$(mktemp -d /tmp/jy-audio-probe.XXXXXX)"
python3 "$SKILL_DIR/scripts/cache_probe.py" mark \
  --output "$PROBE_DIR/before.json"
```

In Jianying, preview or download exactly one sound-effect card and wait for the
operation to finish. Then compare the cache:

```bash
python3 "$SKILL_DIR/scripts/cache_probe.py" diff \
  --snapshot "$PROBE_DIR/before.json" \
  --title "老年男性大笑30"
```

Accept a mapping only when one new or modified audio file and its corresponding
`downLoadcfg` entry appear. Repeat from a fresh baseline when multiple files
change. The probe reports MD5 and FFprobe metadata but does not copy media.

## Record evidence

For each card, retain:

- visible title, selected category, and card order;
- resource ID, effect ID, source, author, and category IDs/names;
- metadata duration and probed container duration;
- VIP/paid type, business scope, and copyright fields;
- database path and response timestamp;
- local path, content MD5, and mapping strategy;
- ambiguity, confidence, and unresolved fields.

Store reports in a scratch directory. Do not commit signed URLs, cached audio,
database copies, security bookmarks, or decrypted/project data.

## Reproduce in QCut

Use Jianying metadata to study taxonomy, search language, duration ranges, and
interaction design. Use QCut-owned, CC0, generated, or separately licensed
audio for the shipped catalog. A Jianying `free` or `VIP` flag describes access
inside Jianying; it is not a redistribution license.

Current Jianying drafts may store `draft_info.json` as encrypted base64. Do not
attempt to decrypt a draft for normal sound-library work: the resource database,
download index, and payload cache already provide the required evidence.
