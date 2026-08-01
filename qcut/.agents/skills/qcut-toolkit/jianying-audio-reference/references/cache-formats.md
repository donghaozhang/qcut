# Jianying Audio Cache Formats

## Resource database

Search every account database under:

```text
~/Movies/JianyingPro/User Data/Cache/ressdk_db/*/rp.db
```

Recent clients keep sound-effect responses in `http_cache.response_body`.
Sound-effect list responses expose items at `$.data.effect_item_list[]` with an
`audio_effect` object and usually use an HTTP-cache key containing `_audio_`.

Important fields:

| JSON path | Meaning |
|---|---|
| `common_attr.title` | Visible card title |
| `common_attr.id` | Primary resource ID; preserve as a string |
| `common_attr.effect_id` | Effect/resource ID used by older cards |
| `common_attr.third_resource_id_str` | Alternate legacy resource ID |
| `common_attr.category_ids` | Category membership |
| `common_attr.md5` | Legacy payload hash; can be empty for newer VOD cards |
| `common_attr.publish_source` | Typical values include `ies_music`, `internal`, and `internal_zip_vimo` |
| `common_attr.download_info` | Signed URL and format |
| `common_attr.business_info.json_str` | VIP, paid type, and commercial strategy JSON |
| `common_attr.business_scope` | Product access scope, not a redistribution grant |
| `common_attr.copyright` | Copyright display metadata |
| `audio_effect.duration_ms` | Millisecond duration reported by the catalog |
| `author` | Display name, source, and UID |

Open SQLite databases read-only and let SQLite apply the adjacent WAL. Copying
only `rp.db` while Jianying is running can omit recent responses.

## Category catalog

Panel responses expose `$.data.categories[]`. The observed Jianying audio panel
can be identified by keys such as `wanggan`, `regeng`, `zongyi`, and `tishi`.
One locally observed taxonomy was:

| ID | Key | Name |
|---:|---|---|
| 10892 | `10892` | 热门 |
| 5914796 | `new` | 最新 |
| 10899 | `10899` | 转场 |
| 5914402 | `wanggan` | 网感口播🔥 |
| 5914764 | `regeng` | 热梗语录 |
| 10894 | `10894` | 笑声 |
| 5914403 | `ganga` | 尴尬 |
| 5914404 | `zhenjing` | 震惊 |
| 5914405 | `tishi` | 提示音 |
| 5914365 | `抽象` | 抽象 |
| 10895 | `zongyi` | 综艺感 |
| 5914406 | `zhishi` | 知识科普 |
| 10896 | `10896` | 机械 |
| 10897 | `10897` | BGM |
| 10901 | `10901` | 魔法 |
| 10902 | `10902` | 打斗 |
| 10903 | `10903` | 美食 |
| 10904 | `10904` | 动物 |
| 10905 | `10905` | 环境音 |
| 10907 | `10907` | 悬疑 |

Treat this as observed cache evidence. Re-read the panel response instead of
hardcoding the list into QCut because Jianying can change taxonomy remotely.

## Payload cache

Downloaded music and sound effects share:

```text
~/Movies/JianyingPro/User Data/Cache/music/
```

Observed sound-effect files use `<content-md5>.mp3`. Verify rather than assume:

```bash
md5 -q "/absolute/path/to/file.mp3"
ffprobe -v error -show_streams -show_format -of json \
  "/absolute/path/to/file.mp3"
```

Some `.mp3` paths can contain an ISO Base Media audio container instead of an
MPEG layer-3 stream. Trust FFprobe codec/container output, not the extension.

`downLoadcfg` is a top-level JSON object whose `list` array contains entries
shaped like:

```json
{
  "list": [
    {
      "date": "1783053546128",
      "hex": "request-cache-key",
      "path": "content-md5.mp3"
    }
  ]
}
```

`path` names the cached payload. `hex` can track a signed request URL, but URL
signatures rotate, so a later response may not reproduce the same value. Use a
before/after probe for empty-MD5 resources instead of guessing URL canonicalization.

## Resource packages and drafts

Ordinary sound-effect cards do not need `artistEffect/<id>/<md5>` or
`effect/<id>/<md5>` packages. Their runtime behavior is normal audio playback;
volume, fades, speed, and timeline placement belong to the draft/editor state.

Current Jianying versions may encrypt timeline `draft_info.json` as base64 text.
That draft is not required to map library cards to payloads. If timeline
semantics are the research target, isolate a disposable draft and use UI and
export evidence rather than weakening the cache mapping with an unverified
decryptor.

## Ownership boundary

Cached audio and signed URLs are local interoperability evidence. Do not commit
or redistribute them. Transcribe only metadata structure, taxonomy, measured
behavior, and independently owned implementation logic.
